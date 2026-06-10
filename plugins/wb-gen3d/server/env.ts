// Env + feature-gate resolution for wb-gen3d providers.
//
// Real provider calls are OFF by default. They turn on ONLY when both:
//   1. GEN3D_ENABLE_REAL_PROVIDERS === "1", and
//   2. the provider's required credentials are present.
// Otherwise generation falls back to the deterministic no-quota mock. Secrets
// are read from process.env (server loads $FORGEAX_PROJECT_ROOT/.env) or, for
// standalone smokes, from the plugin-local .env. Nothing here is logged.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let loaded = false;

// Minimal .env parser for the plugin-local file. Does not override values
// already present in process.env (the server's .env wins).
function loadPluginEnvOnce(): void {
  if (loaded) return;
  loaded = true;
  const envPath = resolve(import.meta.dir, '..', '.env');
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
  return read('GEN3D_ENABLE_REAL_PROVIDERS') === '1';
}

export interface HunyuanEnv {
  apiKey: string;
  baseUrl: string;
  defaultFaceCount: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  rateLimitPerMin: number;
}

// Returns null when the real Hunyuan path is not fully configured. Callers must
// fall back to mock when this is null — never throw a quota path on by accident.
export function getHunyuanEnv(): HunyuanEnv | null {
  if (!realProvidersEnabled()) return null;
  const apiKey = read('HUNYUAN_API_KEY');
  const baseUrl = read('HUNYUAN_BASE_URL');
  if (!apiKey || !baseUrl) return null;
  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    defaultFaceCount: toInt(read('HUNYUAN_DEFAULT_FACE_COUNT'), 30000),
    pollIntervalMs: toInt(read('HUNYUAN_POLL_INTERVAL_MS'), 5000),
    pollTimeoutMs: toInt(read('HUNYUAN_POLL_TIMEOUT_MS'), 600000),
    rateLimitPerMin: toInt(read('HUNYUAN_RATE_LIMIT_PER_MIN'), 3),
  };
}

export interface MeshyEnv {
  apiKey: string;
  baseUrl: string;
  defaultPolycount: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  rateLimitPerMin: number;
}

// Returns null when the real Meshy path is not fully configured. Unlike Hunyuan,
// Meshy has a stable public base URL default (api.meshy.ai), so only the key is
// required. Callers must fall back to mock when this is null.
export function getMeshyEnv(): MeshyEnv | null {
  if (!realProvidersEnabled()) return null;
  const apiKey = read('MESHY_API_KEY');
  if (!apiKey) return null;
  const baseUrl = read('MESHY_BASE_URL') ?? 'https://api.meshy.ai';
  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    defaultPolycount: toInt(read('MESHY_DEFAULT_POLYCOUNT'), 30000),
    pollIntervalMs: toInt(read('MESHY_POLL_INTERVAL_MS'), 5000),
    pollTimeoutMs: toInt(read('MESHY_POLL_TIMEOUT_MS'), 600000),
    rateLimitPerMin: toInt(read('MESHY_RATE_LIMIT_PER_MIN'), 3),
  };
}

function toInt(value: string | undefined, fallback: number): number {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
