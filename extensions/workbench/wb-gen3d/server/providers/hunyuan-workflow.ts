// HunyuanWorkflowProvider — real submit/poll client via the LiteLLM gateway.
//
// Decoupling (ADR-0001): talks to the remote gateway and returns a pure
// ProviderResult with downloaded bytes. Auth is `Authorization: Bearer <key>`.
// Submit goes to the unified `/v1/3d/generations` endpoint with a `model` field;
// poll goes to `/v1/3d/tasks/{taskId}`. Status is lower-case.

import type { ProviderResult, ProviderResultFile } from '../../shared/catalog';
import type { FileFormat, FileRole, GenerationMode } from '../../shared/manifest';
import type { HunyuanEnv } from '../env';
import { audit } from '../audit';
import { RateGuard } from '../rate-guard';
import { extractGatewayUrls } from './gateway-data';

const GATEWAY_SUBMIT = '/v1/3d/generations';
const GATEWAY_POLL = '/v1/3d/tasks';

const WF_MODEL: Record<HunyuanWorkflowMode, string> = {
  text: 'hunyuan-3d-v3.1-text2gen-wf',
  image: 'hunyuan-3d-v3.1-image2gen-wf',
  views: 'hunyuan-3d-v3.1-views2gen-wf',
};

const SUCCESS = 'succeeded';
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

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type DownloadLike = (url: string) => Promise<Uint8Array>;

export interface HunyuanProviderDeps {
  env: HunyuanEnv;
  slug: string;
  fetchImpl?: FetchLike;
  downloadImpl?: DownloadLike;
  rateGuard?: RateGuard;
  sleep?: (ms: number) => Promise<void>;
}

// Map a gateway data[] entry format to a durable manifest file role+format.
const DATA_TYPE_TO_FILE: Record<string, { role: FileRole; format: FileFormat }> = {
  glb: { role: 'source_mesh', format: 'glb' },
  fbx: { role: 'source_mesh', format: 'fbx' },
  obj: { role: 'source_mesh', format: 'obj' },
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

    this.rateGuard.check();

    const submitResp = await this.post(payload);
    const sourceJobId = submitTaskId(submitResp);
    if (!sourceJobId) {
      throw Object.assign(new Error('hunyuan workflow submit returned no task id'), { code: 'provider_no_task' });
    }
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_workflow', mode, event: 'submit', sourceJobId });

    const urls = await this.poll(sourceJobId, mode);
    const files: ProviderResultFile[] = [];
    const seenRoles = new Set<string>();
    for (const [key, mapping] of Object.entries(DATA_TYPE_TO_FILE)) {
      const url = urls[key];
      if (!url) continue;
      const roleKey = `${mapping.role}:${mapping.format}`;
      if (seenRoles.has(roleKey)) continue;
      seenRoles.add(roleKey);
      const data = await this.downloadImpl(url);
      files.push({ role: mapping.role, format: mapping.format, data });
    }
    if (urls.__thumbnail) {
      files.push({ role: 'preview_image', format: 'png', data: await this.downloadImpl(urls.__thumbnail) });
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
    taskId: string,
    mode: HunyuanWorkflowMode,
  ): Promise<Record<string, string>> {
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
        await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_workflow', mode, event: 'poll_succeeded', sourceJobId: taskId, detail: status });
        return extractGatewayUrls(resp);
      }
      if (FAILURE.has(status)) {
        await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_workflow', mode, event: 'poll_failed', sourceJobId: taskId, detail: taskErrorMessage(resp) ?? status });
        throw Object.assign(new Error(`hunyuan workflow ${status}: ${taskErrorMessage(resp) ?? ''}`), { code: 'provider_failed' });
      }
      await this.sleep(this.env.pollIntervalMs);
    }
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'hunyuan_workflow', mode, event: 'poll_timeout', sourceJobId: taskId });
    throw Object.assign(new Error('hunyuan workflow poll timed out'), { code: 'provider_timeout' });
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

function submitTaskId(resp: Record<string, unknown>): string | null {
  return (resp.id as string) ?? null;
}

function taskErrorMessage(resp: Record<string, unknown>): string | undefined {
  const err = resp.error as Record<string, unknown> | undefined;
  return err && typeof err.message === 'string' && err.message ? err.message : undefined;
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
