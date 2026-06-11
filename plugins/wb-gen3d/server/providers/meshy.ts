// MeshyProvider — real submit/poll client for the Meshy.ai public OpenAPI.
//
// Decoupling (ADR-0001): like HunyuanWorkflowProvider, this talks to the remote
// API and returns a pure ProviderResult with downloaded bytes. It knows nothing
// about cache, asset-store, or manifests. Auth is plain `Authorization: Bearer
// <key>` (key prefix `msy_`/`msy-`); no signing.
//
// Differences from Hunyuan workflow (see hunyuan3d-lab docs/API_REFERENCE.md):
//   - text-to-3D uses v2 (`/openapi/v2/text-to-3d`), image/multi use v1.
//   - submit returns the task id in `result` (v2) or `id` (v1).
//   - status is UPPER-CASE: PENDING/IN_PROGRESS/SUCCEEDED/FAILED/CANCELED.
//   - outputs come back as `model_urls` (dict), `texture_urls[]`, `thumbnail_url`.
//   - text is two-stage: `preview` (white mesh) then `refine` (adds texture),
//     where refine takes a `preview_task_id` from a prior preview task.

import { clampTargetPolycount, type ProviderResult, type ProviderResultFile } from '../../shared/catalog';
import type { FileFormat, FileRole, GenerationMode } from '../../shared/manifest';
import type { MeshyEnv } from '../env';
import { audit } from '../audit';
import { RateGuard } from '../rate-guard';

const PATH_TEXT = '/openapi/v2/text-to-3d';
const PATH_IMAGE = '/openapi/v1/image-to-3d';
const PATH_MULTI = '/openapi/v1/multi-image-to-3d';

const SUCCESS = 'SUCCEEDED';
const FAILURE = new Set(['FAILED', 'CANCELED']);

export type MeshyMode = 'text' | 'image' | 'views' | 'refine';

export interface MeshyGenerateInput {
  mode: MeshyMode;
  prompt?: string;
  imageUrl?: string;
  imageUrls?: string[];
  previewTaskId?: string;
  texturePrompt?: string;
  enablePbr?: boolean;
  shouldTexture?: boolean;
  targetPolycount?: number;
  aiModel?: string;
}

// Injectable transports so smokes can run without a real network call.
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type DownloadLike = (url: string) => Promise<Uint8Array>;

export interface MeshyProviderDeps {
  env: MeshyEnv;
  // Active game slug for the per-game audit trail (ADR-0002). Smokes may pass any.
  slug: string;
  fetchImpl?: FetchLike;
  downloadImpl?: DownloadLike;
  rateGuard?: RateGuard;
  sleep?: (ms: number) => Promise<void>;
}

// Map a Meshy model_urls key to a durable manifest file role+format.
const MODEL_URL_TO_FILE: Record<string, { role: FileRole; format: FileFormat }> = {
  glb: { role: 'source_mesh', format: 'glb' },
  fbx: { role: 'source_mesh', format: 'fbx' },
  obj: { role: 'source_mesh', format: 'obj' },
  usdz: { role: 'source_mesh', format: 'usdz' },
  stl: { role: 'source_mesh', format: 'stl' },
};

export class MeshyProvider {
  private readonly env: MeshyEnv;
  private readonly slug: string;
  private readonly fetchImpl: FetchLike;
  private readonly downloadImpl: DownloadLike;
  private readonly rateGuard: RateGuard;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(deps: MeshyProviderDeps) {
    this.env = deps.env;
    this.slug = deps.slug;
    this.fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init));
    this.downloadImpl =
      deps.downloadImpl ?? (async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()));
    this.rateGuard = deps.rateGuard ?? new RateGuard(this.env.rateLimitPerMin);
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async generate(input: MeshyGenerateInput): Promise<ProviderResult> {
    const submitPath = pathForMode(input.mode);
    const payload = this.buildPayload(input);

    // Guard BEFORE the quotaed submit.
    this.rateGuard.check();

    const submitResp = await this.post(submitPath, payload);
    // v2 text/refine return `result`; v1 image/multi return `id`.
    const sourceJobId = (submitResp.result as string) ?? (submitResp.id as string) ?? null;
    if (!sourceJobId) {
      throw Object.assign(new Error('meshy submit returned no task id'), { code: 'provider_no_task' });
    }
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'meshy', mode: input.mode, event: 'submit', sourceJobId });

    const urls = await this.poll(input.mode, sourceJobId);

    const files: ProviderResultFile[] = [];
    const seenRoles = new Set<string>();
    for (const [key, mapping] of Object.entries(MODEL_URL_TO_FILE)) {
      const url = urls[key];
      if (!url) continue;
      const roleKey = `${mapping.role}:${mapping.format}`;
      if (seenRoles.has(roleKey)) continue;
      seenRoles.add(roleKey);
      files.push({ role: mapping.role, format: mapping.format, data: await this.downloadImpl(url) });
    }
    if (urls.__thumbnail) {
      files.push({ role: 'preview_image', format: 'png', data: await this.downloadImpl(urls.__thumbnail) });
    }
    if (urls.__texture_base_color) {
      files.push({ role: 'texture', format: 'png', data: await this.downloadImpl(urls.__texture_base_color) });
    }

    return {
      provider: 'meshy',
      mode: input.mode as GenerationMode,
      providerMode: 'real',
      sourceJobId,
      prompt: input.prompt ?? null,
      files,
    };
  }

  private buildPayload(input: MeshyGenerateInput): Record<string, unknown> {
    const polycount =
      input.targetPolycount !== undefined ? clampTargetPolycount(input.targetPolycount) : undefined;

    if (input.mode === 'text') {
      const payload: Record<string, unknown> = { mode: 'preview', prompt: input.prompt ?? '' };
      if (input.aiModel) payload.ai_model = input.aiModel;
      if (polycount) {
        payload.should_remesh = true;
        payload.target_polycount = polycount;
      }
      return payload;
    }
    if (input.mode === 'refine') {
      const payload: Record<string, unknown> = { mode: 'refine', preview_task_id: input.previewTaskId };
      if (input.texturePrompt) payload.texture_prompt = input.texturePrompt;
      if (typeof input.enablePbr === 'boolean') payload.enable_pbr = input.enablePbr;
      return payload;
    }
    if (input.mode === 'image') {
      const payload: Record<string, unknown> = { image_url: input.imageUrl ?? '' };
      this.applyMeshOptions(payload, input, polycount);
      return payload;
    }
    // views
    const payload: Record<string, unknown> = { image_urls: (input.imageUrls ?? []).slice(0, 4) };
    this.applyMeshOptions(payload, input, polycount);
    return payload;
  }

  private applyMeshOptions(
    payload: Record<string, unknown>,
    input: MeshyGenerateInput,
    polycount: number | undefined,
  ): void {
    if (input.aiModel) payload.ai_model = input.aiModel;
    if (typeof input.enablePbr === 'boolean') payload.enable_pbr = input.enablePbr;
    if (typeof input.shouldTexture === 'boolean') payload.should_texture = input.shouldTexture;
    if (polycount) payload.target_polycount = polycount;
  }

  private async poll(mode: MeshyMode, taskId: string): Promise<Record<string, string>> {
    const deadline = Date.now() + this.env.pollTimeoutMs;
    while (Date.now() < deadline) {
      const resp = await this.get(`${pathForMode(mode)}/${taskId}`);
      const status = String(resp.status ?? '').toUpperCase();
      if (status === SUCCESS) {
        await audit(this.slug, { ts: new Date().toISOString(), provider: 'meshy', mode, event: 'poll_succeeded', sourceJobId: taskId, detail: status });
        return extractUrls(resp);
      }
      if (FAILURE.has(status)) {
        await audit(this.slug, { ts: new Date().toISOString(), provider: 'meshy', mode, event: 'poll_failed', sourceJobId: taskId, detail: taskErrorMessage(resp) ?? status });
        throw Object.assign(new Error(`meshy task ${status}: ${taskErrorMessage(resp) ?? ''}`), { code: 'provider_failed' });
      }
      await this.sleep(this.env.pollIntervalMs);
    }
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'meshy', mode, event: 'poll_timeout', sourceJobId: taskId });
    throw Object.assign(new Error('meshy poll timed out'), { code: 'provider_timeout' });
  }

  private async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const resp = await this.fetchImpl(`${this.env.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.env.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw Object.assign(new Error(`meshy http ${resp.status}`), { code: 'provider_http_error' });
    }
    return (await resp.json()) as Record<string, unknown>;
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    const resp = await this.fetchImpl(`${this.env.baseUrl}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.env.apiKey}` },
    });
    if (!resp.ok) {
      throw Object.assign(new Error(`meshy http ${resp.status}`), { code: 'provider_http_error' });
    }
    return (await resp.json()) as Record<string, unknown>;
  }
}

function pathForMode(mode: MeshyMode): string {
  if (mode === 'text' || mode === 'refine') return PATH_TEXT;
  if (mode === 'image') return PATH_IMAGE;
  if (mode === 'views') return PATH_MULTI;
  throw Object.assign(new Error(`meshy unsupported mode: ${mode}`), { code: 'invalid_mode' });
}

function taskErrorMessage(resp: Record<string, unknown>): string | undefined {
  const err = resp.task_error as Record<string, unknown> | undefined;
  return err && typeof err.message === 'string' && err.message ? err.message : undefined;
}

// Flatten the Meshy success response into a single url map. model_urls keys map
// to mesh files; thumbnail_url + texture_urls[0].base_color are namespaced with
// a `__` prefix so they never collide with model format keys.
function extractUrls(resp: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const mu = resp.model_urls;
  if (mu && typeof mu === 'object') {
    for (const [key, value] of Object.entries(mu as Record<string, unknown>)) {
      if (typeof value === 'string' && value) out[key] = value;
    }
  }
  if (typeof resp.thumbnail_url === 'string' && resp.thumbnail_url) {
    out.__thumbnail = resp.thumbnail_url;
  }
  const tu = resp.texture_urls;
  if (Array.isArray(tu) && tu[0] && typeof tu[0] === 'object') {
    const bc = (tu[0] as Record<string, unknown>).base_color;
    if (typeof bc === 'string' && bc) out.__texture_base_color = bc;
  }
  return out;
}
