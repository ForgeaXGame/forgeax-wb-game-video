// HunyuanRestProvider — real client for Hunyuan sub-capabilities via LiteLLM gateway.
//
// Unlike the workflow provider (async submit/poll), most REST sub-capabilities are
// SYNCHRONOUS on the gateway: a single POST /v1/3d/generations with the appropriate
// `model` returns immediately with `status=succeeded` and `data[]` filled.
// low_poly remains async (submit then poll). Auth is `Authorization: Bearer <key>`.
//
// Decoupling (ADR-0001): talks to the remote gateway and returns pure results with
// downloaded bytes. `fetchImpl`/`downloadImpl` are injectable for smokes.

import type { HunyuanEnv } from '../env';
import { audit } from '../audit';
import { RateGuard } from '../rate-guard';

const GATEWAY_SUBMIT = '/v1/3d/generations';
const GATEWAY_POLL = '/v1/3d/tasks';

const SUCCESS = 'succeeded';
const FAILURE = new Set(['failed', 'error', 'fail', 'cancelled']);

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type DownloadLike = (url: string) => Promise<Uint8Array>;

export interface HunyuanRestDeps {
  env: HunyuanEnv;
  slug: string;
  fetchImpl?: FetchLike;
  downloadImpl?: DownloadLike;
  rateGuard?: RateGuard;
  sleep?: (ms: number) => Promise<void>;
}

export interface PoseStandardizationInput {
  imageUrl: string;
  footnote?: string;
}

// One downloaded model file from a rig/motion/low_poly response.
export interface ModelFileOut {
  format: 'glb' | 'fbx';
  data: Uint8Array;
}

export interface AutoRigInput {
  glbUrl: string;
  footnote?: string;
}

export interface ApplyMotionInput {
  fbxUrl: string;
  motionType: number;
}

export interface LowPolyInput {
  glbUrl: string;
  polygonType?: 'triangle' | 'quadrilateral';
  detailLevel?: 'high' | 'medium' | 'low';
  footnote?: string;
}

export interface RigMotionResult {
  sourceJobId: string | null;
  files: ModelFileOut[];
}

export interface LowPolyResult {
  sourceJobId: string | null;
  glb: Uint8Array;
  previewImage: Uint8Array | null;
}

export interface PoseStandardizationResult {
  sourceJobId: string | null;
  imageData: Uint8Array;
  sourceUrl: string;
}

export class HunyuanRestProvider {
  private readonly env: HunyuanEnv;
  private readonly slug: string;
  private readonly fetchImpl: FetchLike;
  private readonly downloadImpl: DownloadLike;
  private readonly rateGuard: RateGuard;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(deps: HunyuanRestDeps) {
    this.env = deps.env;
    this.slug = deps.slug;
    this.fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init));
    this.downloadImpl =
      deps.downloadImpl ??
      (async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()));
    this.rateGuard = deps.rateGuard ?? new RateGuard(this.env.rateLimitPerMin);
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  // pose_standardization (synchronous via gateway): image URL → standardized image.
  async poseStandardization(input: PoseStandardizationInput): Promise<PoseStandardizationResult> {
    const payload: Record<string, unknown> = {
      model: 'hunyuan-3d-images-pose-standardization',
      image_url: input.imageUrl,
    };
    if (input.footnote) payload.footnote = input.footnote;

    this.rateGuard.check();
    const resp = await this.post(payload);
    const sourceJobId = resp.id as string ?? null;

    if (isGatewayFailed(resp)) {
      const msg = taskErrorMessage(resp) ?? 'unknown';
      await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_rest', mode: 'image', event: 'rest_failed', sourceJobId, detail: msg });
      throw Object.assign(new Error(`hunyuan pose_standardization failed: ${msg}`), { code: 'provider_failed' });
    }

    const url = extractSingleImageUrl(resp);
    if (!url) {
      await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_rest', mode: 'image', event: 'rest_no_output', sourceJobId });
      throw Object.assign(new Error('hunyuan pose_standardization returned no image url'), { code: 'provider_no_output' });
    }

    const imageData = await this.downloadImpl(url);
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_rest', mode: 'image', event: 'rest_succeeded', sourceJobId });
    return { sourceJobId, imageData, sourceUrl: url };
  }

  // auto_rigging (synchronous via gateway): textured high-poly GLB → rigged GLB+FBX.
  async autoRig(input: AutoRigInput): Promise<RigMotionResult> {
    const payload: Record<string, unknown> = { model: 'hunyuan-3d-auto-rigging-gamestudio', glb_url: input.glbUrl, n: 1 };
    if (input.footnote) payload.footnote = input.footnote;

    this.rateGuard.check();
    const resp = await this.post(payload);
    return this.collectModelResult(resp, 'auto_rigging');
  }

  // motion_retarget v1 (synchronous via gateway): rigged FBX + motion → animated GLB+FBX.
  async applyMotion(input: ApplyMotionInput): Promise<RigMotionResult> {
    const payload: Record<string, unknown> = { model: 'hunyuan-3d-motion-retarget', fbx_url: input.fbxUrl, motion_type: input.motionType, n: 1 };

    this.rateGuard.check();
    const resp = await this.post(payload);
    return this.collectModelResult(resp, 'motion_retarget');
  }

  // low_poly (async via gateway): submit → poll until succeeded/failed.
  async lowPoly(input: LowPolyInput): Promise<LowPolyResult> {
    const payload: Record<string, unknown> = {
      model: 'hunyuan-3d-low-poly-v1.5',
      glb_url: input.glbUrl,
      polygon_type: input.polygonType ?? 'quadrilateral',
      detail_level: input.detailLevel ?? 'high',
      n: 1,
    };
    if (input.footnote) payload.footnote = input.footnote;

    this.rateGuard.check();
    const submit = await this.post(payload);
    const taskId = (submit.id as string) ?? null;
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_rest', mode: 'image', event: 'submit', sourceJobId: taskId, detail: 'low_poly' });

    const urls = await this.pollLowPoly(taskId);
    const glbUrl = urls.glb;
    if (!glbUrl) {
      throw Object.assign(new Error('hunyuan low_poly returned no glb'), { code: 'provider_no_output' });
    }
    const glb = await this.downloadImpl(glbUrl);
    const previewImage = urls.__thumbnail ? await this.downloadImpl(urls.__thumbnail) : null;
    return { sourceJobId: taskId, glb, previewImage };
  }

  // Poll the low_poly task via the gateway task endpoint.
  private async pollLowPoly(taskId: string | null): Promise<Record<string, string>> {
    const deadline = Date.now() + this.env.pollTimeoutMs;
    while (Date.now() < deadline) {
      let resp: Record<string, unknown>;
      try {
        resp = await this.get(`${GATEWAY_POLL}/${taskId}`);
      } catch {
        await this.sleep(this.env.pollIntervalMs);
        continue;
      }
      const status = String(resp.status ?? '').toLowerCase();
      if (status === SUCCESS) {
        await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_rest', mode: 'image', event: 'poll_succeeded', sourceJobId: taskId, detail: 'low_poly' });
        return extractUrls(resp);
      }
      if (FAILURE.has(status)) {
        await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_rest', mode: 'image', event: 'poll_failed', sourceJobId: taskId, detail: `low_poly:${status}` });
        throw Object.assign(new Error(`hunyuan low_poly failed: ${status}`), { code: 'provider_failed' });
      }
      await this.sleep(this.env.pollIntervalMs);
    }
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_rest', mode: 'image', event: 'poll_timeout', sourceJobId: taskId, detail: 'low_poly' });
    throw Object.assign(new Error('hunyuan low_poly poll timed out'), { code: 'provider_timeout' });
  }

  // Shared success/failure + download for sync endpoints (auto_rig, motion).
  private async collectModelResult(
    resp: Record<string, unknown>,
    label: 'auto_rigging' | 'motion_retarget',
  ): Promise<RigMotionResult> {
    const sourceJobId = (resp.id as string) ?? null;
    if (isGatewayFailed(resp)) {
      const msg = taskErrorMessage(resp) ?? 'unknown';
      await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_rest', mode: 'image', event: 'rest_failed', sourceJobId, detail: `${label}:${msg}` });
      throw Object.assign(new Error(`hunyuan ${label} failed: ${msg}`), { code: 'provider_failed' });
    }

    const urls = extractGatewayMeshUrls(resp);
    const files: ModelFileOut[] = [];
    if (urls.glb_url) files.push({ format: 'glb', data: await this.downloadImpl(urls.glb_url) });
    if (urls.fbx_url) files.push({ format: 'fbx', data: await this.downloadImpl(urls.fbx_url) });
    if (files.length === 0) {
      await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_rest', mode: 'image', event: 'rest_no_output', sourceJobId, detail: label });
      throw Object.assign(new Error(`hunyuan ${label} returned no model url`), { code: 'provider_no_output' });
    }
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_rest', mode: 'image', event: 'rest_succeeded', sourceJobId, detail: label });
    return { sourceJobId, files };
  }

  private async post(body: unknown): Promise<Record<string, unknown>> {
    const resp = await this.fetchImpl(`${this.env.baseUrl}${GATEWAY_SUBMIT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.env.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw httpError(resp.status);
    return (await resp.json()) as Record<string, unknown>;
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    const resp = await this.fetchImpl(`${this.env.baseUrl}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.env.apiKey}` },
    });
    if (!resp.ok) throw httpError(resp.status);
    return (await resp.json()) as Record<string, unknown>;
  }
}

function httpError(status: number): Error & { code: string; status: number } {
  const code =
    status === 400 ? 'provider_bad_request'
    : status === 401 ? 'provider_unauthorized'
    : status === 402 ? 'provider_insufficient_credits'
    : status === 404 ? 'provider_not_enabled'
    : status === 429 ? 'provider_rate_limited'
    : 'provider_http_error';
  return Object.assign(new Error(`gateway http ${status}`), { code, status });
}

function isGatewayFailed(resp: Record<string, unknown>): boolean {
  const status = String(resp.status ?? '').toLowerCase();
  if (FAILURE.has(status)) return true;
  const err = resp.error as Record<string, unknown> | undefined;
  return Boolean(err && (err.code || err.message));
}

function taskErrorMessage(resp: Record<string, unknown>): string | undefined {
  const err = resp.error as Record<string, unknown> | undefined;
  return err && typeof err.message === 'string' && err.message ? err.message : undefined;
}

// Extract a single image URL from gateway data[] (for pose_std).
function extractSingleImageUrl(resp: Record<string, unknown>): string | null {
  const data = resp.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      if (typeof obj.url === 'string' && obj.url) return obj.url;
    }
  }
  // Fallback: top-level *_url keys just in case the gateway embeds them.
  for (const [key, value] of Object.entries(resp)) {
    if (key.endsWith('_url') && typeof value === 'string' && value) return value;
  }
  return null;
}

// Extract glb_url + fbx_url from gateway data[] for rig/motion results.
// Gateway data[] entries have {url, type, format}. type="mesh" with format="glb" maps
// to glb_url; format="fbx" maps to fbx_url.
function extractGatewayMeshUrls(resp: Record<string, unknown>): { glb_url?: string; fbx_url?: string } {
  const out: { glb_url?: string; fbx_url?: string } = {};
  const data = resp.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item !== 'object' || !item) continue;
      const obj = item as Record<string, unknown>;
      const url = obj.url;
      if (typeof url !== 'string' || !url) continue;
      const type = String(obj.type ?? '');
      const format = String(obj.format ?? '');
      if (type === 'mesh') {
        if (!out.glb_url && format === 'glb') out.glb_url = url;
        if (!out.fbx_url && format === 'fbx') out.fbx_url = url;
      }
    }
  }
  return out;
}

// Generic data[] extractor for low_poly / workflow tasks.
function extractUrls(resp: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const data = resp.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item !== 'object' || !item) continue;
      const url = (item as Record<string, unknown>).url;
      if (typeof url !== 'string' || !url) continue;
      const type = String((item as Record<string, unknown>).type ?? '');
      const format = String((item as Record<string, unknown>).format ?? '');
      if (type === 'mesh') {
        out[format] = url;
      } else if (type === 'preview') {
        out.__thumbnail = url;
      }
    }
  }
  return out;
}
