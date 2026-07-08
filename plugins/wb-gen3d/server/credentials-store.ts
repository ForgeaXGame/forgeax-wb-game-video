// Plugin-self-managed provider credentials store.
//
// Plugin-local .env holds only the master real/mock switch and COS upload keys.
// LiteLLM gateway credentials come from Studio global .env (Settings → API Keys:
// LITELLM_PROXY_* or ANTHROPIC_*) — never written here.
//
// Writes go to the plugin-local .env (gitignored) AND are live-applied to
// process.env so server/env.ts read() — which reads process.env — picks them up
// immediately, no server restart (mirrors the host's PUT /api/settings/env
// live-apply). parseEnv/serializeEnv/maskKey are ported verbatim from
// packages/server/src/api/settings.ts so the masked-render and comment-preserving
// contracts match the rest of Studio.
//
// SECURITY: nothing here logs, and no thrown error ever carries a plaintext key
// value — only field names / file paths.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickLitellmFromEnv } from './env';

// Whitelist of keys this store is allowed to read/write. LiteLLM keys are
// excluded — they live in Studio global .env only.
export const CRED_KEYS = [
  'GEN3D_ENABLE_REAL_PROVIDERS',
  'COS_SECRET_ID',
  'COS_SECRET_KEY',
  'COS_BUCKET',
  'COS_REGION',
] as const;

export const SECRET_KEYS = ['COS_SECRET_ID', 'COS_SECRET_KEY'] as const;

export interface CredentialsState {
  ok: true;
  realProvidersEnabled: boolean;
  /** Read-only: derived from Studio global .env, never from plugin .env. */
  litellmConfigured: boolean;
  /** Masked gateway key from Studio settings, or null when unset. Read-only. */
  litellmProxyKey: string | null;
  credentials: {
    COS_SECRET_ID: string | null; // masked or null
    COS_SECRET_KEY: string | null; // masked or null
    COS_BUCKET: string | null; // PLAINTEXT or null
    COS_REGION: string | null; // PLAINTEXT or null
  };
}

/**
 * Mask a secret for safe rendering. Ported verbatim from settings.ts: undefined
 * / empty → null; len ≤ 8 → '***'; otherwise first-4 + ellipsis + last-4 so the
 * user can recognise which key is set without exposing enough to steal it. The
 * UI parses these strings literally, so the shape is a contract (unit-tested).
 */
export function maskKey(v?: string): string | null {
  if (!v) return null;
  if (v.length <= 8) return '***';
  return `${v.slice(0, 4)}...${v.slice(-4)}`;
}

// Minimal .env parser — ported from settings.ts. Recognizes UPPER_SNAKE keys,
// strips matched surrounding quotes; ignores comments / blank / unknown lines.
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

// Serialize — ported from settings.ts. Preserves comments / unknown lines from
// the original, updates recognized keys in place, appends new keys at the end.
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
// over the file (the server's env always wins), and an empty / whitespace value
// reads as "not set". Returns the trimmed value or undefined.
function effective(name: string, fileEnv: Record<string, string>): string | undefined {
  const raw = name in process.env ? process.env[name] : fileEnv[name];
  return raw && raw.trim() ? raw.trim() : undefined;
}

function readLitellmStatus(): { configured: boolean; maskedKey: string | null } {
  const litellm = pickLitellmFromEnv(process.env);
  return {
    configured: litellm !== null,
    maskedKey: litellm ? maskKey(litellm.apiKey) : null,
  };
}

/**
 * Read the masked credential state. Plugin .env holds COS + master switch only;
 * LiteLLM status is read-only from Studio global .env. Never returns a plaintext key.
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
  const litellm = readLitellmStatus();
  return {
    ok: true,
    realProvidersEnabled: effective('GEN3D_ENABLE_REAL_PROVIDERS', fileEnv) === '1',
    litellmConfigured: litellm.configured,
    litellmProxyKey: litellm.maskedKey,
    credentials: {
      COS_SECRET_ID: maskKey(effective('COS_SECRET_ID', fileEnv)),
      COS_SECRET_KEY: maskKey(effective('COS_SECRET_KEY', fileEnv)),
      COS_BUCKET: effective('COS_BUCKET', fileEnv) ?? null,
      COS_REGION: effective('COS_REGION', fileEnv) ?? null,
    },
  };
}

/**
 * Write a credential patch to the plugin-local .env and live-apply to
 * process.env. LiteLLM keys in the patch are silently dropped (managed in
 * Studio Settings only).
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
