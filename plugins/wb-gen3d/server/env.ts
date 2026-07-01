// Env + feature-gate resolution for wb-gen3d providers.
//
// Real provider calls are OFF by default. They turn on ONLY when both:
//   1. GEN3D_ENABLE_REAL_PROVIDERS === "1", and
//   2. a LiteLLM gateway key is present in Studio global .env (LITELLM_PROXY_KEY
//      or ANTHROPIC_API_KEY — see pickLitellmFromEnv).
// Otherwise generation falls back to the deterministic no-quota mock. Secrets
// are read from process.env (server loads $FORGEAX_PROJECT_ROOT/.env) or, for
// standalone smokes, from the plugin-local .env. Nothing here is logged.
//
// All 3D providers now route through the LiteLLM gateway — see AGENTS.md
// «最优 > 兼容». The old per-provider keys (MESHY_API_KEY, HUNYUAN_API_KEY,
// RODIN_API_KEY) are removed. Rodin is disabled because the gateway has no
// Rodin/Hyper3D model. Meshy and Hunyuan map to gateway models (meshy-3d-* /
// hunyuan-3d-*).

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
  return read('GEN3D_ENABLE_REAL_PROVIDERS') === '1';
}

export interface LitellmEnv {
  apiKey: string;
  baseUrl: string;
}

const DEFAULT_LITELLM_BASE = 'https://llm-proxy.forgeax.com';

function normalizeProxyBase(raw: string): string {
  return raw.replace(/\/+$/, '').replace(/\/v1$/, '');
}

/**
 * Resolve LiteLLM gateway credentials from Studio global .env (process.env).
 * Priority matches forgeax-studio settings policy:
 *   1. LITELLM_PROXY_KEY (+ optional LITELLM_PROXY_BASE_URL)
 *   2. ANTHROPIC_API_KEY (+ optional ANTHROPIC_BASE_URL)
 * Plugin-local .env must NOT hold a separate gateway key — configure in
 * Studio Settings → API Keys.
 */
export function pickLitellmFromEnv(env: Record<string, string | undefined>): LitellmEnv | null {
  const proxyKey = env.LITELLM_PROXY_KEY?.trim();
  if (proxyKey) {
    return {
      apiKey: proxyKey,
      baseUrl: normalizeProxyBase(env.LITELLM_PROXY_BASE_URL?.trim() || DEFAULT_LITELLM_BASE),
    };
  }
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    return {
      apiKey: anthropicKey,
      baseUrl: normalizeProxyBase(env.ANTHROPIC_BASE_URL?.trim() || DEFAULT_LITELLM_BASE),
    };
  }
  return null;
}

// Returns the LiteLLM gateway credentials, or null when not configured.
// All 3D providers now route through this single gateway key.
export function getLitellmEnv(): LitellmEnv | null {
  loadPluginEnvOnce();
  return pickLitellmFromEnv(process.env);
}

export interface HunyuanEnv {
  apiKey: string;
  baseUrl: string;
  defaultFaceCount: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  rateLimitPerMin: number;
}

// Returns null when the real Hunyuan path is not fully configured. Now reads the
// LiteLLM gateway key instead of the direct HUNYUAN_API_KEY. Callers must fall
// back to mock when this is null — never throw a quota path on by accident.
export function getHunyuanEnv(): HunyuanEnv | null {
  if (!realProvidersEnabled()) return null;
  const litellm = getLitellmEnv();
  if (!litellm) return null;
  return {
    apiKey: litellm.apiKey,
    baseUrl: litellm.baseUrl,
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

// Returns null when the real Meshy path is not fully configured. Now reads the
// LiteLLM gateway key instead of the direct MESHY_API_KEY. Callers must fall
// back to mock when this is null.
export function getMeshyEnv(): MeshyEnv | null {
  if (!realProvidersEnabled()) return null;
  const litellm = getLitellmEnv();
  if (!litellm) return null;
  return {
    apiKey: litellm.apiKey,
    baseUrl: litellm.baseUrl,
    defaultPolycount: toInt(read('MESHY_DEFAULT_POLYCOUNT'), 30000),
    pollIntervalMs: toInt(read('MESHY_POLL_INTERVAL_MS'), 5000),
    pollTimeoutMs: toInt(read('MESHY_POLL_TIMEOUT_MS'), 600000),
    rateLimitPerMin: toInt(read('MESHY_RATE_LIMIT_PER_MIN'), 3),
  };
}

export interface RodinEnv {
  apiKey: string;
  baseUrl: string;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  rateLimitPerMin: number;
}

// Rodin (Hyper3D) is not available on the LiteLLM gateway. Returns null with
// a log-visible message. The UI should surface «Rodin 暂未接入网关».
export function getRodinEnv(): RodinEnv | null {
  return null;
}

function toInt(value: string | undefined, fallback: number): number {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface CosEnv {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  // Presigned URL lifetime in seconds (input images are transfer artifacts).
  signExpiresSec: number;
}

// Returns null when COS upload is not fully configured. Unlike provider envs,
// COS upload is a transport convenience and is NOT gated by
// GEN3D_ENABLE_REAL_PROVIDERS: a user can upload a local image to host it even
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
