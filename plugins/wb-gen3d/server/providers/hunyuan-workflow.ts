// HunyuanWorkflowProvider — real submit/poll client for the 司内网 OpenAPI.
//
// Decoupling (ADR-0001): the provider talks to the remote API and returns a
// pure ProviderResult with downloaded bytes. It knows nothing about cache,
// asset-store, or manifests. Auth is plain `Authorization: Bearer <key>`; no
// request signing. Submit and poll share two endpoints, differentiated by the
// `model` field, which must match between submit and poll.

import type { ProviderResult, ProviderResultFile } from '../../shared/catalog';
import type { FileFormat, FileRole, GenerationMode } from '../../shared/manifest';
import type { HunyuanEnv } from '../env';
import { audit } from '../audit';
import { RateGuard } from '../rate-guard';

const PATH_SUBMIT = '/openapi/v1/workflow/invoke/async';
const PATH_QUERY = '/openapi/v1/workflow/detail';

const WF_MODEL: Record<HunyuanWorkflowMode, string> = {
  text: 'hunyuan-3d-v3.1-text2gen-wf',
  image: 'hunyuan-3d-v3.1-image2gen-wf',
  views: 'hunyuan-3d-v3.1-views2gen-wf',
};

const SUCCESS = new Set(['succeeded', 'completed', 'done']);
const FAILURE = new Set(['failed', 'error', 'fail']);

export type HunyuanWorkflowMode = 'text' | 'image' | 'views';

export type ViewSlot =
  | 'front_image_url'
  | 'back_image_url'
  | 'left_image_url'
  | 'right_image_url'
  | 'top_image_url'
  | 'bottom_image_url'
  | 'front_left_image_url'
  | 'front_right_image_url';

export interface HunyuanGenerateInput {
  mode: HunyuanWorkflowMode;
  prompt?: string;
  imageUrl?: string;
  views?: Partial<Record<ViewSlot, string>>;
  enablePbr?: boolean;
  enableFbxUrl?: boolean;
  faceCount?: number;
}

// Injectable transports so smokes can run without a real network call.
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type DownloadLike = (url: string) => Promise<Uint8Array>;

export interface HunyuanProviderDeps {
  env: HunyuanEnv;
  // Active game slug for the per-game audit trail (ADR-0002). Smokes may pass any.
  slug: string;
  fetchImpl?: FetchLike;
  downloadImpl?: DownloadLike;
  rateGuard?: RateGuard;
  sleep?: (ms: number) => Promise<void>;
}

// Map a Hunyuan output URL key to a durable manifest file role+format.
const URL_KEY_TO_FILE: Record<string, { role: FileRole; format: FileFormat }> = {
  glb_url: { role: 'source_mesh', format: 'glb' },
  fbx_url: { role: 'source_mesh', format: 'fbx' },
  obj_url: { role: 'source_mesh', format: 'obj' },
  preview_image_url: { role: 'preview_image', format: 'png' },
  image_url: { role: 'preview_image', format: 'png' },
  texture_image_url: { role: 'texture', format: 'png' },
};

export class HunyuanWorkflowProvider {
  private readonly env: HunyuanEnv;
  private readonly slug: string;
  private readonly fetchImpl: FetchLike;
  private readonly downloadImpl: DownloadLike;
  private readonly rateGuard: RateGuard;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(deps: HunyuanProviderDeps) {
    this.env = deps.env;
    this.slug = deps.slug;
    this.fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init));
    this.downloadImpl =
      deps.downloadImpl ??
      (async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()));
    this.rateGuard = deps.rateGuard ?? new RateGuard(this.env.rateLimitPerMin);
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async generate(input: HunyuanGenerateInput): Promise<ProviderResult> {
    const mode = input.mode;
    const model = WF_MODEL[mode];
    const payload = buildPayload(model, input);

    // Guard BEFORE the quotaed submit.
    this.rateGuard.check();

    const submitResp = await this.post(PATH_SUBMIT, payload);
    const sourceJobId =
      (submitResp.submit_data as string) ??
      (submitResp.task_id as string) ??
      (submitResp.id as string) ??
      null;
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_workflow', mode, event: 'submit', sourceJobId });

    const urls = await this.poll(model, sourceJobId, mode);

    const files: ProviderResultFile[] = [];
    const seenRoles = new Set<string>();
    for (const [key, mapping] of Object.entries(URL_KEY_TO_FILE)) {
      const url = urls[key];
      if (!url) continue;
      // Keep one file per role (first-wins, preferring glb over fbx/obj order).
      const roleKey = `${mapping.role}:${mapping.format}`;
      if (seenRoles.has(roleKey)) continue;
      seenRoles.add(roleKey);
      const data = await this.downloadImpl(url);
      files.push({ role: mapping.role, format: mapping.format, data });
    }

    return {
      provider: 'hunyuan_workflow',
      mode: mode as GenerationMode,
      providerMode: 'real',
      sourceJobId,
      prompt: input.prompt ?? null,
      files,
    };
  }

  private async poll(
    model: string,
    taskId: string | null,
    mode: HunyuanWorkflowMode,
  ): Promise<Record<string, string>> {
    const deadline = Date.now() + this.env.pollTimeoutMs;
    while (Date.now() < deadline) {
      const resp = await this.post(PATH_QUERY, { model, task_id: taskId });
      const status = String(resp.status ?? resp.Status ?? '').toLowerCase();
      if (SUCCESS.has(status)) {
        await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_workflow', mode, event: 'poll_succeeded', sourceJobId: taskId, detail: status });
        return extractUrls(resp);
      }
      if (FAILURE.has(status)) {
        await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_workflow', mode, event: 'poll_failed', sourceJobId: taskId, detail: status });
        throw Object.assign(new Error(`hunyuan workflow failed: ${status}`), { code: 'provider_failed' });
      }
      await this.sleep(this.env.pollIntervalMs);
    }
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_workflow', mode, event: 'poll_timeout', sourceJobId: taskId });
    throw Object.assign(new Error('hunyuan workflow poll timed out'), { code: 'provider_timeout' });
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
      throw Object.assign(new Error(`hunyuan http ${resp.status}`), { code: 'provider_http_error' });
    }
    return (await resp.json()) as Record<string, unknown>;
  }
}

function buildPayload(model: string, input: HunyuanGenerateInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { model };
  if (input.faceCount && input.faceCount > 0) payload.face_count = input.faceCount;
  if (typeof input.enablePbr === 'boolean') payload.enable_pbr = input.enablePbr;
  if (typeof input.enableFbxUrl === 'boolean') payload.enable_fbx_url = input.enableFbxUrl;

  if (input.mode === 'text') {
    payload.prompt = input.prompt ?? '';
  } else if (input.mode === 'image') {
    payload.image_url = input.imageUrl ?? '';
  } else {
    const views = input.views ?? {};
    for (const slot of [
      'front_image_url',
      'back_image_url',
      'left_image_url',
      'right_image_url',
      'top_image_url',
      'bottom_image_url',
      'front_left_image_url',
      'front_right_image_url',
    ] as ViewSlot[]) {
      payload[slot] = views[slot] ?? '';
    }
  }
  return payload;
}

// Extract flat *_url fields from the poll response. Primary shape: data is a
// list of dicts with flat *_url keys; fall back to outputs/result dicts and
// top-level *_url keys.
function extractUrls(resp: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const absorb = (obj: unknown) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key.endsWith('_url') && typeof value === 'string' && value && !(key in out)) {
        out[key] = value;
      }
    }
  };

  const data = resp.data;
  if (Array.isArray(data)) {
    for (const item of data) absorb(item);
  } else {
    absorb(data);
  }
  absorb(resp.outputs);
  absorb(resp.result);
  absorb(resp);
  return out;
}
