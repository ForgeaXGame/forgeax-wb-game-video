// Plugin-self-managed credentials store (Meshy + COS).
//
// Lets the UI fill the Meshy key + COS credentials (+ the master switch) without
// hand-editing .env. Writes go to the plugin-local .env (gitignored) AND are
// live-applied to process.env so server/env.ts read() picks them up immediately,
// no server restart. parseEnv/serializeEnv/maskKey mirror the host's
// PUT /api/settings/env contract (masked render, comment-preserving).
//
// SECURITY: nothing here logs, and no thrown error ever carries a plaintext key
// value — only field names / file paths.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Whitelist of keys this store may read/write. Anything outside this set (e.g.
// the slug the workbench host auto-injects into every tool call, or a hostile
// key) is dropped before it can touch the .env.
export const CRED_KEYS = [
  'AIASSET_ENABLE_REAL_PROVIDERS',
  'MESHY_API_KEY',
  'MESHY_BASE_URL',
  'COS_SECRET_ID',
  'COS_SECRET_KEY',
  'COS_BUCKET',
  'COS_REGION',
] as const;

// Keys whose value must be masked on read-back. MESHY_BASE_URL / COS_BUCKET /
// COS_REGION are addresses, not secrets (plaintext); AIASSET_ENABLE_REAL_PROVIDERS
// is a switch surfaced via the realProvidersEnabled boolean.
export const SECRET_KEYS = [
  'MESHY_API_KEY',
  'COS_SECRET_ID',
  'COS_SECRET_KEY',
] as const;

export interface CredentialsState {
  ok: true;
  realProvidersEnabled: boolean;
  credentials: {
    MESHY_API_KEY: string | null; // masked or null
    MESHY_BASE_URL: string | null; // PLAINTEXT or null
    COS_SECRET_ID: string | null; // masked or null
    COS_SECRET_KEY: string | null; // masked or null
    COS_BUCKET: string | null; // PLAINTEXT or null
    COS_REGION: string | null; // PLAINTEXT or null
  };
}

/**
 * Mask a secret for safe rendering: undefined / empty → null; len ≤ 8 → '***';
 * otherwise first-4 + ellipsis + last-4 so the user can recognise which key is
 * set without exposing enough to steal it. The UI parses these strings
 * literally, so the shape is a contract (unit-tested).
 */
export function maskKey(v?: string): string | null {
  if (!v) return null;
  if (v.length <= 8) return '***';
  return `${v.slice(0, 4)}...${v.slice(-4)}`;
}

// Minimal .env parser. Recognizes UPPER_SNAKE keys, strips matched surrounding
// quotes; ignores comments / blank / unknown lines.
function parseEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

// Serialize — preserves comments / unknown lines from the original, updates
// recognized keys in place, appends new keys at the end.
function serializeEnv(env: Record<string, string>, original?: string): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  if (original) {
    for (const line of original.split('\n')) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=/.exec(line);
      if (m && env[m[1]] !== undefined) {
        lines.push(`${m[1]}=${env[m[1]]}`);
        seen.add(m[1]);
      } else {
        lines.push(line);
      }
    }
  }
  for (const [k, v] of Object.entries(env)) {
    if (!seen.has(k)) lines.push(`${k}=${v}`);
  }
  return lines.join('\n');
}

// Plugin-local .env path — IDENTICAL resolution to server/env.ts
// loadPluginEnvOnce so both touch the same file (server/ → '..' → plugin root).
export function defaultEnvPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
}

// Resolve one key's effective value the same way env.ts does: process.env wins
// over the file, and an empty / whitespace value reads as "not set".
function effective(name: string, fileEnv: Record<string, string>): string | undefined {
  const raw = name in process.env ? process.env[name] : fileEnv[name];
  return raw && raw.trim() ? raw.trim() : undefined;
}

/**
 * Read the masked credential state. File is the persistence layer; process.env
 * is the live layer and takes precedence (matches env.ts "server env wins").
 * Secret keys are masked, addresses are plaintext, the master switch is a
 * boolean. Never returns a plaintext key.
 */
export function readCredentials(envPath: string = defaultEnvPath()): CredentialsState {
  let fileEnv: Record<string, string> = {};
  if (existsSync(envPath)) {
    try {
      fileEnv = parseEnv(readFileSync(envPath, 'utf8'));
    } catch {
      fileEnv = {};
    }
  }
  return {
    ok: true,
    realProvidersEnabled: effective('AIASSET_ENABLE_REAL_PROVIDERS', fileEnv) === '1',
    credentials: {
      MESHY_API_KEY: maskKey(effective('MESHY_API_KEY', fileEnv)),
      MESHY_BASE_URL: effective('MESHY_BASE_URL', fileEnv) ?? null,
      COS_SECRET_ID: maskKey(effective('COS_SECRET_ID', fileEnv)),
      COS_SECRET_KEY: maskKey(effective('COS_SECRET_KEY', fileEnv)),
      COS_BUCKET: effective('COS_BUCKET', fileEnv) ?? null,
      COS_REGION: effective('COS_REGION', fileEnv) ?? null,
    },
  };
}

/**
 * Write a credential patch to the plugin-local .env and live-apply to
 * process.env. Steps:
 *   1. Keep only CRED_KEYS; coerce string|number via String(); drop everything
 *      else (the injected slug, hostile keys, non-scalar values).
 *   2. Read current .env → parseEnv → apply patch (an empty string clears the
 *      field, written in place as `KEY=`) → serializeEnv → atomic write.
 *   3. Live-apply each patched key to process.env (non-empty sets, empty
 *      deletes) so env.ts read() reflects it without a restart.
 *   4. Return the fresh masked state.
 * A patch with no recognized keys is a no-op (no file is created/rewritten).
 */
export function writeCredentials(
  patch: Record<string, unknown> = {},
  envPath: string = defaultEnvPath(),
): CredentialsState {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (!(CRED_KEYS as readonly string[]).includes(k)) continue;
    if (typeof v !== 'string' && typeof v !== 'number') continue;
    clean[k] = String(v);
  }

  if (Object.keys(clean).length > 0) {
    let originalText = '';
    let env: Record<string, string> = {};
    if (existsSync(envPath)) {
      originalText = readFileSync(envPath, 'utf8');
      env = parseEnv(originalText);
    }
    for (const [k, v] of Object.entries(clean)) env[k] = v;

    const tmp = `${envPath}.tmp`;
    writeFileSync(tmp, serializeEnv(env, originalText), 'utf8');
    renameSync(tmp, envPath);

    for (const [k, v] of Object.entries(clean)) {
      if (v === '') delete process.env[k];
      else process.env[k] = v;
    }
  }

  return readCredentials(envPath);
}
