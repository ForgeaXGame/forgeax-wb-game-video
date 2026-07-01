// MeshyProvider — real submit/poll client for the LiteLLM 3D gateway,
// scoped to wb-ai-asset's small low-poly props workflow.
//
// Decoupling: this talks to the remote gateway API and returns a pure
// ProviderResult with downloaded bytes. It knows nothing about cache, asset-store,
// or manifests. Auth is plain `Authorization: Bearer <key>`; no signing.
//
// Capabilities (all async submit→poll, status lower-case):
//   - generate(): text/image/views/refine. text/image/views default to
//     model_type=lowpoly (the plugin's purpose). text is two-stage (preview →
//     refine); refine takes a preview_task_id.
//   - remesh(): re-mesh an existing model to a target polycount + topology.
//   - retexture(): re-skin an existing model from a text/image style (+PBR).
//
// All outputs come back as gateway gateway `data[]` array (type+format tagged)
// and are flattened by extractUrls() then downloaded to bytes.
//
// LiteLLM gateway endpoint:
//   POST /v1/3d/generations  — submit (body includes `model`)
//   GET  /v1/3d/tasks/{id}   — poll (task id encodes provider/model)

import { clampTargetPolycount, type ProviderResult, type ProviderResultFile } from '../../shared/catalog';
import type { FileFormat, FileRole, GenerationMode, TextureKind } from '../../shared/manifest';
import type { MeshyEnv } from '../env';
import { audit } from '../audit';
import { RateGuard } from '../rate-guard';

const GATEWAY_SUBMIT = '/v1/3d/generations';
const GATEWAY_POLL = '/v1/3d/tasks';

// Gateway model id for each Meshy mode.
const MODE_TO_MODEL: Record<string, string> = {
  text: 'meshy-3d-text',
  image: 'meshy-3d-image',
  views: 'meshy-3d-multi-image',
  refine: 'meshy-3d-text',     // refine is second stage of text
  remesh: 'meshy-3d-remesh',
  retexture: 'meshy-3d-retexture',
};

const SUCCESS = 'succeeded';
const FAILURE = new Set(['failed', 'canceled']);

export type MeshyMode = 'text' | 'image' | 'views' | 'refine';
export type MeshyModelType = 'standard' | 'lowpoly';
export type MeshyTopology = 'triangle' | 'quad';

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
  // Defaults to 'lowpoly' for the generation modes (text/image/views). When
  // 'lowpoly', Meshy ignores ai_model/topology/target_polycount/should_remesh.
  modelType?: MeshyModelType;
  aiModel?: string;
  params?: Record<string, string | number | boolean>;
}

// Remesh = post-process an existing model into a target polycount/topology. The
// input is either a prior Meshy task id (fast path) or a public model URL (e.g.
// a COS transfer URL for a stored asset).
export interface MeshyRemeshInput {
  inputTaskId?: string;
  modelUrl?: string;
  targetPolycount?: number;
  topology?: MeshyTopology;
}

// Retexture = re-skin an existing model from a text or image style. Input is a
// prior task id or a public model URL; style is a text prompt or an image URL.
export interface MeshyRetextureInput {
  inputTaskId?: string;
  modelUrl?: string;
  textStylePrompt?: string;
  imageStyleUrl?: string;
  enablePbr?: boolean;
  aiModel?: string;
}

// Injectable transports so smokes can run without a real network call.
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type DownloadLike = (url: string) => Promise<Uint8Array>;

export interface MeshyProviderDeps {
  env: MeshyEnv;
  // Active game slug for the per-game audit trail. Smokes may pass any value.
  slug: string;
  fetchImpl?: FetchLike;
  downloadImpl?: DownloadLike;
  rateGuard?: RateGuard;
  sleep?: (ms: number) => Promise<void>;
}

// PBR maps Meshy returns inside data[] entries with type="texture".
const TEXTURE_KINDS: readonly TextureKind[] = ['base_color', 'metallic', 'roughness', 'normal', 'emission'];

// Map a gateway data[] entry (type+format) to a durable manifest file role+format.
const DATA_TYPE_TO_FILE: Record<string, { role: FileRole; format: FileFormat }> = {
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
    const result = await this.submitAndDownload(input);
    if (input.mode === 'text' && input.enablePbr !== false) {
      const previewTaskId = result.sourceJobId;
      if (!previewTaskId) {
        throw Object.assign(new Error('meshy text preview returned no task id'), { code: 'provider_no_task' });
      }
      const refined = await this.submitAndDownload({
        mode: 'refine',
        previewTaskId,
        texturePrompt: input.prompt,
        enablePbr: input.enablePbr ?? true,
        modelType: input.modelType,
        aiModel: input.aiModel,
      });
      return { ...refined, mode: 'text', prompt: input.prompt ?? null };
    }
    return result;
  }

  private async submitAndDownload(input: MeshyGenerateInput): Promise<ProviderResult> {
    const model = MODE_TO_MODEL[input.mode];
    const payload = { model, ...this.buildPayload(input) };

    // Guard BEFORE the quotaed submit.
    this.rateGuard.check();

    const submitResp = await this.post(payload);
    const sourceJobId = submitTaskId(submitResp);
    if (!sourceJobId) {
      throw Object.assign(new Error('meshy submit returned no task id'), { code: 'provider_no_task' });
    }
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'meshy', mode: input.mode, event: 'submit', sourceJobId });

    const urls = await this.poll(input.mode, sourceJobId);
    const files = await this.downloadFiles(urls);

    return {
      provider: 'meshy',
      mode: input.mode as GenerationMode,
      providerMode: 'real',
      sourceJobId,
      prompt: input.prompt ?? null,
      files,
    };
  }

  // Remesh an existing model to a target polycount + topology. Emits a NEW
  // derived GLB. target_formats is pinned to ['glb'] (GLB-only; faster + the
  // store keeps GLB anyway).
  async remesh(input: MeshyRemeshInput): Promise<ProviderResult> {
    if (!input.inputTaskId && !input.modelUrl) {
      throw Object.assign(new Error('meshy remesh needs inputTaskId or modelUrl'), {
        code: 'invalid_remesh_input',
      });
    }
    const payload: Record<string, unknown> = { model: 'meshy-3d-remesh', target_formats: ['glb'] };
    if (input.inputTaskId) payload.input_task_id = input.inputTaskId;
    else if (input.modelUrl) payload.model_url = input.modelUrl;
    if (input.topology) payload.topology = input.topology;
    if (input.targetPolycount !== undefined) {
      payload.target_polycount = clampTargetPolycount(input.targetPolycount);
    }

    this.rateGuard.check();
    const submitResp = await this.post(payload);
    const sourceJobId = submitTaskId(submitResp);
    if (!sourceJobId) {
      throw Object.assign(new Error('meshy remesh submit returned no task id'), { code: 'provider_no_task' });
    }
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'meshy', mode: 'remesh', event: 'submit', sourceJobId });

    const urls = await this.poll('remesh', sourceJobId);
    const files = await this.downloadFiles(urls);
    return { provider: 'meshy', mode: 'remesh', providerMode: 'real', sourceJobId, prompt: null, files };
  }

  // Retexture an existing model from a text or image style. Emits a NEW derived
  // GLB (+ texture). target_formats pinned to ['glb'].
  async retexture(input: MeshyRetextureInput): Promise<ProviderResult> {
    if (!input.inputTaskId && !input.modelUrl) {
      throw Object.assign(new Error('meshy retexture needs inputTaskId or modelUrl'), {
        code: 'invalid_retexture_input',
      });
    }
    if (!input.textStylePrompt && !input.imageStyleUrl) {
      throw Object.assign(new Error('meshy retexture needs textStylePrompt or imageStyleUrl'), {
        code: 'invalid_retexture_style',
      });
    }
    const payload: Record<string, unknown> = { model: 'meshy-3d-retexture', target_formats: ['glb'] };
    if (input.inputTaskId) payload.input_task_id = input.inputTaskId;
    else if (input.modelUrl) payload.model_url = input.modelUrl;
    if (input.imageStyleUrl) payload.image_style_url = input.imageStyleUrl;
    else if (input.textStylePrompt) payload.text_style_prompt = input.textStylePrompt;
    if (typeof input.enablePbr === 'boolean') payload.enable_pbr = input.enablePbr;
    if (input.aiModel) payload.ai_model = input.aiModel;

    this.rateGuard.check();
    const submitResp = await this.post(payload);
    const sourceJobId = submitTaskId(submitResp);
    if (!sourceJobId) {
      throw Object.assign(new Error('meshy retexture submit returned no task id'), { code: 'provider_no_task' });
    }
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'meshy', mode: 'retexture', event: 'submit', sourceJobId });

    const urls = await this.poll('retexture', sourceJobId);
    const files = await this.downloadFiles(urls);
    return {
      provider: 'meshy',
      mode: 'retexture',
      providerMode: 'real',
      sourceJobId,
      prompt: input.textStylePrompt ?? null,
      files,
    };
  }

  // Gateway has no balance endpoint — null means "unknown", not zero credits.
  async getBalance(): Promise<number | null> {
    return null;
  }

  // Flatten the gateway data[] array into downloaded ProviderResultFiles.
  // data[] entries have { url, type, format } — mesh files by format key,
  // preview → preview_image, texture → texture file with textureKind.
  private async downloadFiles(urls: Record<string, string>): Promise<ProviderResultFile[]> {
    const files: ProviderResultFile[] = [];
    const seenRoles = new Set<string>();
    for (const [key, mapping] of Object.entries(DATA_TYPE_TO_FILE)) {
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
    for (const kind of TEXTURE_KINDS) {
      const url = urls[`__texture_${kind}`];
      if (!url) continue;
      files.push({ role: 'texture', format: 'png', textureKind: kind, data: await this.downloadImpl(url) });
    }
    return files;
  }

  private buildPayload(input: MeshyGenerateInput): Record<string, unknown> {
    const polycount =
      input.targetPolycount !== undefined ? clampTargetPolycount(input.targetPolycount) : undefined;
    const modelType: MeshyModelType = input.modelType ?? 'lowpoly';
    const isStandard = modelType === 'standard';

    if (input.mode === 'text') {
      const payload: Record<string, unknown> = { mode: 'preview', prompt: input.prompt ?? '', model_type: modelType };
      if (isStandard) {
        if (input.aiModel) payload.ai_model = input.aiModel;
        if (polycount) {
          payload.should_remesh = true;
          payload.target_polycount = polycount;
        }
      }
      this.applyProviderParams(payload, input.params);
      return payload;
    }
    if (input.mode === 'refine') {
      const payload: Record<string, unknown> = { mode: 'refine', preview_task_id: input.previewTaskId };
      if (input.texturePrompt) payload.texture_prompt = input.texturePrompt;
      if (typeof input.enablePbr === 'boolean') payload.enable_pbr = input.enablePbr;
      return payload;
    }
    if (input.mode === 'image') {
      const payload: Record<string, unknown> = { image_url: input.imageUrl ?? '', model_type: modelType };
      this.applyMeshOptions(payload, input, isStandard ? polycount : undefined, isStandard);
      this.applyProviderParams(payload, input.params);
      return payload;
    }
    // views (multi-image)
    const payload: Record<string, unknown> = {
      image_urls: (input.imageUrls ?? []).slice(0, 4),
      model_type: modelType,
    };
    this.applyMeshOptions(payload, input, isStandard ? polycount : undefined, isStandard);
    this.applyProviderParams(payload, input.params);
    return payload;
  }

  private applyProviderParams(
    payload: Record<string, unknown>,
    params: Record<string, string | number | boolean> | undefined,
  ): void {
    if (!params) return;
    Object.assign(payload, params);
    if (payload.topology !== undefined && payload.should_remesh === undefined) {
      payload.should_remesh = true;
    }
  }

  private applyMeshOptions(
    payload: Record<string, unknown>,
    input: MeshyGenerateInput,
    polycount: number | undefined,
    isStandard: boolean,
  ): void {
    if (isStandard && input.aiModel) payload.ai_model = input.aiModel;
    if (typeof input.enablePbr === 'boolean') payload.enable_pbr = input.enablePbr;
    else payload.enable_pbr = true;
    if (typeof input.shouldTexture === 'boolean') payload.should_texture = input.shouldTexture;
    else payload.should_texture = true;
    if (polycount) payload.target_polycount = polycount;
  }

  // Poll a task by id until terminal (status is lower-case). Uses the gateway
  // task endpoint. Tolerates transient non-JSON responses (gateway may return
  // empty body for tasks not yet ready) by treating them as "still processing".
  private async poll(mode: GenerationMode, taskId: string): Promise<Record<string, string>> {
    const deadline = Date.now() + this.env.pollTimeoutMs;
    while (Date.now() < deadline) {
      let resp: Record<string, unknown>;
      try {
        resp = await this.get(`${GATEWAY_POLL}/${taskId}`);
      } catch {
        // Non-JSON / empty body from gateway — treat as still processing.
        await this.sleep(this.env.pollIntervalMs);
        continue;
      }
      const status = String(resp.status ?? '').toLowerCase();
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

// Map a non-2xx gateway status to a stable error code. 402 = insufficient
// credits, 404 = capability not enabled, 429 = rate limited; the `status` is
// attached so the handler/UI can surface the exact HTTP code.
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

// Gateway returns task id in the `id` field of the submit response.
function submitTaskId(resp: Record<string, unknown>): string | null {
  return (resp.id as string) ?? null;
}

function taskErrorMessage(resp: Record<string, unknown>): string | undefined {
  const err = resp.error as Record<string, unknown> | undefined;
  return err && typeof err.message === 'string' && err.message ? err.message : undefined;
}

// Flatten the LiteLLM gateway success response `data[]` array into a flat
// url map compatible with downloadFiles(). data[] entries carry type+format:
//   type="mesh", format="glb"   → key "glb"
//   type="preview", format="png" → key "__thumbnail"
//   type="texture", ...          → key "__texture_<texture_kind>"
// PBR textures carry texture_kind in the entry; absent kinds are simply skipped.
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
      } else if (type === 'texture') {
        const kind = String((item as Record<string, unknown>).texture_kind ?? format);
        out[`__texture_${kind}`] = url;
      }
    }
  }
  return out;
}
