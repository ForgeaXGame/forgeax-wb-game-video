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

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type DownloadLike = (url: string) => Promise<Uint8Array>;

export interface HunyuanRestDeps {
  env: HunyuanEnv;
  slug: string;
  fetchImpl?: FetchLike;
  downloadImpl?: DownloadLike;
  rateGuard?: RateGuard;
}

export interface PoseStandardizationInput {
  imageUrl: string;
  footnote?: string;
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

  constructor(deps: HunyuanRestDeps) {
    this.env = deps.env;
    this.slug = deps.slug;
    this.fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init));
    this.downloadImpl =
      deps.downloadImpl ??
      (async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()));
    this.rateGuard = deps.rateGuard ?? new RateGuard(this.env.rateLimitPerMin);
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
