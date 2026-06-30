// Env + feature-gate resolution for wb-ai-asset (Meshy-only).
//
// Real Meshy calls are OFF by default. They turn on ONLY when both:
//   1. AIASSET_ENABLE_REAL_PROVIDERS === "1", and
//   2. MESHY_API_KEY is present.
// Otherwise generation falls back to the deterministic no-quota mock. Secrets
// are read from process.env (server loads $FORGEAX_PROJECT_ROOT/.env) or, for
// standalone smokes, from the plugin-local .env. Nothing here is logged.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let loaded = false;

// Minimal .env parser for the plugin-local file. Does not override values
// already present in process.env (the server's .env wins).
function loadPluginEnvOnce(): void {
  if (loaded) return;
  loaded = true;
  // Stable across runtimes: import.meta.dir is bun-specific, but
  // import.meta.url + fileURLToPath works in bun, node, and tsc typecheck.
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function read(name: string): string | undefined {
  loadPluginEnvOnce();
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function realProvidersEnabled(): boolean {
  return read('AIASSET_ENABLE_REAL_PROVIDERS') === '1';
}

function toInt(value: string | undefined, fallback: number): number {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface MeshyEnv {
  apiKey: string;
  baseUrl: string;
  // Low-poly target the plugin aims for by default (small props, not characters).
  defaultPolycount: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  rateLimitPerMin: number;
}

// Returns null when the real Meshy path is not fully configured. Meshy has a
// stable public base URL default (api.meshy.ai), so only the key is required.
// Callers MUST fall back to mock when this is null — never turn on a quotaed
// path by accident.
export function getMeshyEnv(): MeshyEnv | null {
  if (!realProvidersEnabled()) return null;
  const apiKey = read('MESHY_API_KEY');
  if (!apiKey) return null;
  const baseUrl = read('MESHY_BASE_URL') ?? 'https://api.meshy.ai';
  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    defaultPolycount: toInt(read('MESHY_DEFAULT_POLYCOUNT'), 6000),
    pollIntervalMs: toInt(read('MESHY_POLL_INTERVAL_MS'), 5000),
    pollTimeoutMs: toInt(read('MESHY_POLL_TIMEOUT_MS'), 600000),
    rateLimitPerMin: toInt(read('MESHY_RATE_LIMIT_PER_MIN'), 3),
  };
}

export interface CosEnv {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  // Presigned URL lifetime in seconds (input images are transfer artifacts).
  signExpiresSec: number;
}

// Returns null when COS upload is not fully configured. Unlike the provider env,
// COS upload is a transport convenience and is NOT gated by
// AIASSET_ENABLE_REAL_PROVIDERS: a user can upload a local image to host it even
// in mock mode. Callers fall back to "URL only" when this is null.
export function getCosEnv(): CosEnv | null {
  const secretId = read('COS_SECRET_ID');
  const secretKey = read('COS_SECRET_KEY');
  const bucket = read('COS_BUCKET');
  const region = read('COS_REGION');
  if (!secretId || !secretKey || !bucket || !region) return null;
  return {
    secretId,
    secretKey,
    bucket,
    region,
    signExpiresSec: toInt(read('COS_SIGN_EXPIRES_SEC'), 24 * 3600),
  };
}
