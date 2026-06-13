// HunyuanRestProvider — real client for the 司内网 OpenAPI REST sub-capabilities.
//
// Unlike the workflow provider (async submit/poll, hunyuan-workflow.ts), the
// REST sub-capabilities are SYNCHRONOUS: a single POST returns the result, with
// no task_id / poll loop. Each capability has its own underscore path under
// `/openapi/v1/3d/`. Auth is plain `Authorization: Bearer <key>`; no signing.
//
// Decoupling (ADR-0001): this provider talks to the remote API and returns a
// pure result with downloaded bytes. It knows nothing about cache, asset-store,
// or manifests. `fetchImpl`/`downloadImpl` are injectable so smokes run without
// a real network call.
//
// M5 scope: only `pose_standardization` is exposed. `motion_retarget` (v1) and
// `auto_rigging` stay out until a rigged-FBX asset path exists; `motion_retarget_v2`
// is blocked. See docs/CAPABILITY_MATRIX.md.

import type { HunyuanEnv } from '../env';
import { audit } from '../audit';
import { RateGuard } from '../rate-guard';

const PATH_POSE_STD = '/openapi/v1/3d/images/pose_standardization';
const MODEL_POSE_STD = 'hunyuan-3d-images-pose-standardization';

const PATH_AUTO_RIG = '/openapi/v1/3d/auto_rigging';
const MODEL_AUTO_RIG = 'hunyuan-3d-auto-rigging-gamestudio';

const PATH_MOTION = '/openapi/v1/3d/motion_retarget';
const MODEL_MOTION = 'hunyuan-3d-motion-retarget';

const PATH_LOWPOLY_SUBMIT = '/openapi/v1/3d/low_poly/generations/submission';
const PATH_LOWPOLY_TASK = '/openapi/v1/3d/low_poly/generations/task';
const MODEL_LOWPOLY = 'hunyuan-3d-low-poly-v1.5';

const POLL_SUCCESS = new Set(['succeeded', 'completed', 'done']);
const POLL_FAILURE = new Set(['failed', 'error', 'fail', 'cancelled']);

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

// One downloaded model file from a rig/motion/low_poly response (bytes already
// fetched from the transient provider URL; never a stored asset reference).
export interface ModelFileOut {
  format: 'glb' | 'fbx';
  data: Uint8Array;
}

// auto_rigging input: a public URL to the textured high-poly GLB (embeds its
// textures, so no separate texture_image_url is needed — that path is OBJ-only).
export interface AutoRigInput {
  glbUrl: string;
  footnote?: string;
}

// apply-motion input: a public URL to the rigged humanoid FBX + a v1 motion int.
export interface ApplyMotionInput {
  fbxUrl: string;
  motionType: number;
}

// low_poly input: a public URL to the high-poly GLB + geometry knobs (no texture).
export interface LowPolyInput {
  glbUrl: string;
  polygonType?: 'triangle' | 'quadrilateral';
  detailLevel?: 'high' | 'medium' | 'low';
  footnote?: string;
}

// Pure result of a rig/motion step: the downloaded GLB (canonical) + FBX
// (transport for the next step) plus the remote job id for audit.
export interface RigMotionResult {
  sourceJobId: string | null;
  files: ModelFileOut[];
}

// Pure result of low_poly: the downloaded low-poly GLB + optional preview image.
export interface LowPolyResult {
  sourceJobId: string | null;
  glb: Uint8Array;
  previewImage: Uint8Array | null;
}

// Pure result of the pose_standardization sub-capability: the standardized
// portrait image bytes plus the remote job id for audit. This is an upstream
// preprocessing artifact (image → image), NOT a 3D mesh, so it does not produce
// a Gen3DAssetManifest. The handler persists the bytes as a standalone blob.
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

  async poseStandardization(
    input: PoseStandardizationInput,
  ): Promise<PoseStandardizationResult> {
    const payload: Record<string, unknown> = {
      model: MODEL_POSE_STD,
      image_url: input.imageUrl,
    };
    if (input.footnote) payload.footnote = input.footnote;

    // Guard BEFORE the quotaed synchronous call.
    this.rateGuard.check();

    const resp = await this.post(PATH_POSE_STD, payload);
    const sourceJobId =
      (resp.id as string) ?? (resp.task_id as string) ?? null;

    if (isFailed(resp)) {
      const message = errorMessage(resp);
      await audit(this.slug, {
        ts: new Date().toISOString(),
        provider: 'hunyuan_rest',
        mode: 'image',
        event: 'rest_failed',
        sourceJobId,
        detail: message,
      });
      throw Object.assign(new Error(`hunyuan pose_standardization failed: ${message}`), {
        code: 'provider_failed',
      });
    }

    const url = extractResultImageUrl(resp);
    if (!url) {
      await audit(this.slug, {
        ts: new Date().toISOString(),
        provider: 'hunyuan_rest',
        mode: 'image',
        event: 'rest_no_output',
        sourceJobId,
      });
      throw Object.assign(new Error('hunyuan pose_standardization returned no image url'), {
        code: 'provider_no_output',
      });
    }

    const imageData = await this.downloadImpl(url);
    await audit(this.slug, {
      ts: new Date().toISOString(),
      provider: 'hunyuan_rest',
      mode: 'image',
      event: 'rest_succeeded',
      sourceJobId,
    });

    return { sourceJobId, imageData, sourceUrl: url };
  }

  // auto_rigging (synchronous): textured high-poly GLB URL → rigged GLB+FBX.
  // GLB is the canonical body (self-contained, textures preserved); FBX is the
  // transport input for motion_retarget. Collects every glb_url/fbx_url in data[].
  async autoRig(input: AutoRigInput): Promise<RigMotionResult> {
    const payload: Record<string, unknown> = {
      model: MODEL_AUTO_RIG,
      glb_url: input.glbUrl,
      n: 1,
    };
    if (input.footnote) payload.footnote = input.footnote;

    this.rateGuard.check();
    const resp = await this.post(PATH_AUTO_RIG, payload);
    return this.collectModelResult(resp, 'auto_rigging');
  }

  // motion_retarget v1 (synchronous): rigged humanoid FBX URL + motion int 9–16
  // → animated GLB+FBX. Both outputs are self-contained (textures preserved).
  async applyMotion(input: ApplyMotionInput): Promise<RigMotionResult> {
    const payload: Record<string, unknown> = {
      model: MODEL_MOTION,
      fbx_url: input.fbxUrl,
      motion_type: input.motionType,
      n: 1,
    };

    this.rateGuard.check();
    const resp = await this.post(PATH_MOTION, payload);
    return this.collectModelResult(resp, 'motion_retarget');
  }

  // low_poly (asynchronous, two-stage): submit → poll task until terminal. Pure
  // geometry/LOD; textures are NOT preserved (OBJ has no MTL, quad rewrites UVs),
  // so this is an optional side-branch, never a pre-rig step (ADR-0003).
  async lowPoly(input: LowPolyInput): Promise<LowPolyResult> {
    const payload: Record<string, unknown> = {
      model: MODEL_LOWPOLY,
      glb_url: input.glbUrl,
      polygon_type: input.polygonType ?? 'quadrilateral',
      detail_level: input.detailLevel ?? 'high',
      n: 1,
    };
    if (input.footnote) payload.footnote = input.footnote;

    this.rateGuard.check();
    const submit = await this.post(PATH_LOWPOLY_SUBMIT, payload);
    const taskId =
      (submit.task_id as string) ?? (submit.id as string) ?? null;
    await audit(this.slug, {
      ts: new Date().toISOString(),
      provider: 'hunyuan_rest',
      mode: 'image',
      event: 'submit',
      sourceJobId: taskId,
      detail: 'low_poly',
    });

    const data = await this.pollLowPoly(taskId);
    const item = pickDataItem(data);
    const glbUrl = item?.glb_url;
    if (typeof glbUrl !== 'string' || !glbUrl) {
      throw Object.assign(new Error('hunyuan low_poly returned no glb_url'), {
        code: 'provider_no_output',
      });
    }
    const glb = await this.downloadImpl(glbUrl);
    let previewImage: Uint8Array | null = null;
    if (typeof item?.image_url === 'string' && item.image_url) {
      previewImage = await this.downloadImpl(item.image_url);
    }
    return { sourceJobId: taskId, glb, previewImage };
  }

  // Poll the low_poly task endpoint until succeeded/failed or timeout.
  private async pollLowPoly(taskId: string | null): Promise<unknown> {
    const deadline = Date.now() + this.env.pollTimeoutMs;
    while (Date.now() < deadline) {
      const resp = await this.post(PATH_LOWPOLY_TASK, { task_id: taskId });
      const status = String(resp.status ?? '').toLowerCase();
      if (POLL_SUCCESS.has(status)) {
        await audit(this.slug, {
          ts: new Date().toISOString(),
          provider: 'hunyuan_rest',
          mode: 'image',
          event: 'poll_succeeded',
          sourceJobId: taskId,
          detail: 'low_poly',
        });
        return resp.data;
      }
      if (POLL_FAILURE.has(status)) {
        await audit(this.slug, {
          ts: new Date().toISOString(),
          provider: 'hunyuan_rest',
          mode: 'image',
          event: 'poll_failed',
          sourceJobId: taskId,
          detail: `low_poly:${status}`,
        });
        throw Object.assign(new Error(`hunyuan low_poly failed: ${status}`), {
          code: 'provider_failed',
        });
      }
      await this.sleep(this.env.pollIntervalMs);
    }
    await audit(this.slug, {
      ts: new Date().toISOString(),
      provider: 'hunyuan_rest',
      mode: 'image',
      event: 'poll_timeout',
      sourceJobId: taskId,
      detail: 'low_poly',
    });
    throw Object.assign(new Error('hunyuan low_poly poll timed out'), {
      code: 'provider_timeout',
    });
  }

  // Shared success/failure handling + GLB/FBX collection for the synchronous
  // rig/motion endpoints. Downloads every glb_url + fbx_url found in data[].
  private async collectModelResult(
    resp: Record<string, unknown>,
    label: 'auto_rigging' | 'motion_retarget',
  ): Promise<RigMotionResult> {
    const sourceJobId = (resp.id as string) ?? (resp.task_id as string) ?? null;
    if (isFailed(resp)) {
      const message = errorMessage(resp);
      await audit(this.slug, {
        ts: new Date().toISOString(),
        provider: 'hunyuan_rest',
        mode: 'image',
        event: 'rest_failed',
        sourceJobId,
        detail: `${label}:${message}`,
      });
      throw Object.assign(new Error(`hunyuan ${label} failed: ${message}`), {
        code: 'provider_failed',
      });
    }

    const urls = extractModelUrls(resp);
    const files: ModelFileOut[] = [];
    if (urls.glb_url) files.push({ format: 'glb', data: await this.downloadImpl(urls.glb_url) });
    if (urls.fbx_url) files.push({ format: 'fbx', data: await this.downloadImpl(urls.fbx_url) });
    if (files.length === 0) {
      await audit(this.slug, {
        ts: new Date().toISOString(),
        provider: 'hunyuan_rest',
        mode: 'image',
        event: 'rest_no_output',
        sourceJobId,
        detail: label,
      });
      throw Object.assign(new Error(`hunyuan ${label} returned no model url`), {
        code: 'provider_no_output',
      });
    }
    await audit(this.slug, {
      ts: new Date().toISOString(),
      provider: 'hunyuan_rest',
      mode: 'image',
      event: 'rest_succeeded',
      sourceJobId,
      detail: label,
    });
    return { sourceJobId, files };
  }

  private async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const resp = await this.fetchImpl(`${this.env.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.env.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw Object.assign(new Error(`hunyuan rest http ${resp.status}`), {
        code: 'provider_http_error',
      });
    }
    return (await resp.json()) as Record<string, unknown>;
  }
}

function isFailed(resp: Record<string, unknown>): boolean {
  const status = String(resp.status ?? '').toLowerCase();
  if (status === 'failed' || status === 'error' || status === 'fail') return true;
  const err = resp.error as Record<string, unknown> | undefined;
  return Boolean(err && (err.code || err.message));
}

function errorMessage(resp: Record<string, unknown>): string {
  const err = resp.error as Record<string, unknown> | undefined;
  if (err && typeof err.message === 'string') return err.message;
  const status = resp.status;
  return typeof status === 'string' ? status : 'unknown_error';
}

// pose_standardization returns its image under data[].url (a bare `url`, not a
// `*_url` key); fall back to any data[].*_url and top-level *_url.
function extractResultImageUrl(resp: Record<string, unknown>): string | null {
  const data = resp.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      if (typeof obj.url === 'string' && obj.url) return obj.url;
      for (const [key, value] of Object.entries(obj)) {
        if (key.endsWith('_url') && typeof value === 'string' && value) return value;
      }
    }
  }
  for (const [key, value] of Object.entries(resp)) {
    if (key.endsWith('_url') && typeof value === 'string' && value) return value;
  }
  return null;
}

// First object in data[] (or data itself), for low_poly's single result item.
function pickDataItem(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === 'object') return item as Record<string, unknown>;
    }
    return null;
  }
  if (data && typeof data === 'object') return data as Record<string, unknown>;
  return null;
}

// Collect glb_url + fbx_url from a rig/motion response. Primary shape: data is a
// list of dicts with flat *_url keys; fall back to top-level *_url keys.
function extractModelUrls(resp: Record<string, unknown>): { glb_url?: string; fbx_url?: string } {
  const out: { glb_url?: string; fbx_url?: string } = {};
  const absorb = (obj: unknown) => {
    if (!obj || typeof obj !== 'object') return;
    const o = obj as Record<string, unknown>;
    if (!out.glb_url && typeof o.glb_url === 'string' && o.glb_url) out.glb_url = o.glb_url;
    if (!out.fbx_url && typeof o.fbx_url === 'string' && o.fbx_url) out.fbx_url = o.fbx_url;
  };
  const data = resp.data;
  if (Array.isArray(data)) {
    for (const item of data) absorb(item);
  } else {
    absorb(data);
  }
  absorb(resp);
  return out;
}
