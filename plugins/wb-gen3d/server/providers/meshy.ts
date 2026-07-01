// MeshyProvider — real submit/poll client for the LiteLLM 3D gateway.
//
// Decoupling (ADR-0001): like HunyuanWorkflowProvider, this talks to the remote
// gateway and returns a pure ProviderResult with downloaded bytes. It knows
// nothing about cache, asset-store, or manifests. Auth is plain `Authorization:
// Bearer <key>`.
//
// Differences from direct Meshy API (now routed through LiteLLM gateway):
//   - All submits go to POST /v1/3d/generations with a `model` field.
//   - All polls go to GET /v1/3d/tasks/{taskId}; task id is in `id`.
//   - status is lower-case: succeeded/failed/canceled.
//   - outputs come back as `data[]` (type+format-tagged), not model_urls dict.
//   - text is two-stage: preview (white mesh) then refine (adds texture).
//   - Rig/animate also go through the gateway with model=meshy-3d-auto-rigging
//     /meshy-3d-animation (response format in data[] entries).

import { clampTargetPolycount, type ProviderResult, type ProviderResultFile } from '../../shared/catalog';
import type { FileFormat, FileRole, GenerationMode } from '../../shared/manifest';
import { MESHY_ACTIONS, MESHY_ACTION_BASE } from '../../shared/meshy-actions';
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
  refine: 'meshy-3d-text',
};

const SUCCESS = 'succeeded';
const FAILURE = new Set(['failed', 'canceled']);

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
  params?: Record<string, string | number | boolean>;
}

// ── Rig / animation I/O (ADR-0006) ──────────────────────────────────────────

export interface MeshyRigInput {
  inputTaskId?: string;
  modelUrl?: string;
  heightMeters?: number;
}

export interface MeshyAnimateInput {
  rigTaskId: string;
  actionId: number;
}

export interface MeshyBasicAnimation {
  category: 'walking' | 'running';
  glb: Uint8Array;
  fbx: Uint8Array | null;
}

export interface MeshyRigResult {
  sourceJobId: string;
  rigType: string | null;
  expiresAt: number | null;
  glb: Uint8Array;
  fbx: Uint8Array | null;
  basicAnimations: MeshyBasicAnimation[];
}

export interface MeshyAnimateResult {
  sourceJobId: string;
  expiresAt: number | null;
  glb: Uint8Array;
  fbx: Uint8Array | null;
}

export interface MeshyAction {
  id: number;
  name: string;
  category: string | null;
  rigType: string | null;
  isFree: boolean;
  previewGifUrl: string | null;
}

// Injectable transports so smokes can run without a real network call.
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type DownloadLike = (url: string) => Promise<Uint8Array>;

export interface MeshyProviderDeps {
  env: MeshyEnv;
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
    // Meshy text is two-stage: preview (white mesh) → refine (texture). Auto-chain
    // when texturing is wanted (default on; enablePbr=false keeps preview-only).
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
      });
      return { ...refined, mode: 'text', prompt: input.prompt ?? null };
    }
    return result;
  }

  private async submitAndDownload(input: MeshyGenerateInput): Promise<ProviderResult> {
    const model = MODE_TO_MODEL[input.mode];
    const payload = { model, ...this.buildPayload(input) };

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

  // Auto-rig via gateway (model=meshy-3d-auto-rigging). Response data[] carries
  // rigged mesh entries by type+format. The gateway does NOT return rig_type,
  // expires_at, or basic_animations — those were Meshy direct API fields only.
  async rig(input: MeshyRigInput): Promise<MeshyRigResult> {
    if (!input.inputTaskId && !input.modelUrl) {
      throw Object.assign(new Error('meshy rig needs inputTaskId or modelUrl'), {
        code: 'invalid_rig_input',
      });
    }
    const payload: Record<string, unknown> = { model: 'meshy-3d-auto-rigging' };
    if (input.inputTaskId) payload.input_task_id = input.inputTaskId;
    if (input.modelUrl) payload.model_url = input.modelUrl;
    if (input.heightMeters !== undefined) payload.height_meters = input.heightMeters;

    this.rateGuard.check();
    const submit = await this.post(payload);
    const taskId = submitTaskId(submit);
    if (!taskId) {
      throw Object.assign(new Error('meshy rig submit returned no task id'), { code: 'provider_no_task' });
    }
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'meshy', mode: 'image', event: 'submit', sourceJobId: taskId, detail: 'rig' });

    const resp = await this.pollTask(taskId, 'rig');
    const urls = extractUrls(resp);
    if (!urls.glb) {
      throw Object.assign(new Error('meshy rig returned no rigged glb'), { code: 'provider_no_output' });
    }
    return {
      sourceJobId: taskId,
      // Gateway does NOT return rig_type / expires_at — set null.
      rigType: null,
      expiresAt: null,
      glb: await this.downloadImpl(urls.glb),
      fbx: urls.fbx ? await this.downloadImpl(urls.fbx) : null,
      // Gateway does NOT return free bundled animations — set empty.
      basicAnimations: [],
    };
  }

  // Apply one motion via gateway (model=meshy-3d-animation).
  async animate(input: MeshyAnimateInput): Promise<MeshyAnimateResult> {
    this.rateGuard.check();
    const submit = await this.post({ model: 'meshy-3d-animation', rig_task_id: input.rigTaskId, action_id: input.actionId });
    const taskId = submitTaskId(submit);
    if (!taskId) {
      throw Object.assign(new Error('meshy animate submit returned no task id'), { code: 'provider_no_task' });
    }
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'meshy', mode: 'image', event: 'submit', sourceJobId: taskId, detail: `animate:${input.actionId}` });

    const resp = await this.pollTask(taskId, 'animate');
    const urls = extractUrls(resp);
    if (!urls.glb) {
      throw Object.assign(new Error('meshy animate returned no animation glb'), { code: 'provider_no_output' });
    }
    return {
      sourceJobId: taskId,
      // Gateway does NOT return expires_at — set null.
      expiresAt: null,
      glb: await this.downloadImpl(urls.glb),
      fbx: urls.fbx ? await this.downloadImpl(urls.fbx) : null,
    };
  }

  // Motion catalog — static, no network call.
  async listActions(): Promise<MeshyAction[]> {
    return MESHY_ACTIONS.map((row) => {
      const [id, name, category, , previewGifRel] = row;
      return {
        id,
        name,
        category,
        rigType: null,
        isFree: false,
        previewGifUrl: previewGifRel ? `${MESHY_ACTION_BASE}${previewGifRel}` : null,
      };
    });
  }

  // Gateway has no balance endpoint — null means "unknown", not zero credits.
  async getBalance(): Promise<number | null> {
    return null;
  }

  // Flatten data[] urls into downloaded ProviderResultFiles.
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
    if (urls.__texture_base_color) {
      files.push({ role: 'texture', format: 'png', data: await this.downloadImpl(urls.__texture_base_color) });
    }
    return files;
  }

  // Poll for generation tasks (returns flat url map for downloadFiles).
  private async poll(mode: MeshyMode, taskId: string): Promise<Record<string, string>> {
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

  // Poll for rig/animate tasks (returns the full response for custom extraction).
  private async pollTask(taskId: string, label: string): Promise<Record<string, unknown>> {
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
        await audit(this.slug, { ts: new Date().toISOString(), provider: 'meshy', mode: 'image', event: 'poll_succeeded', sourceJobId: taskId, detail: label });
        return resp;
      }
      if (FAILURE.has(status)) {
        await audit(this.slug, { ts: new Date().toISOString(), provider: 'meshy', mode: 'image', event: 'poll_failed', sourceJobId: taskId, detail: `${label}:${taskErrorMessage(resp) ?? status}` });
        throw Object.assign(new Error(`meshy ${label} ${status}: ${taskErrorMessage(resp) ?? ''}`), { code: 'provider_failed' });
      }
      await this.sleep(this.env.pollIntervalMs);
    }
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'meshy', mode: 'image', event: 'poll_timeout', sourceJobId: taskId, detail: label });
    throw Object.assign(new Error(`meshy ${label} poll timed out`), { code: 'provider_timeout' });
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
      const payload: Record<string, unknown> = { image_url: input.imageUrl ?? '' };
      this.applyMeshOptions(payload, input, polycount);
      this.applyProviderParams(payload, input.params);
      return payload;
    }
    // views
    const payload: Record<string, unknown> = { image_urls: (input.imageUrls ?? []).slice(0, 4) };
    this.applyMeshOptions(payload, input, polycount);
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
  ): void {
    if (input.aiModel) payload.ai_model = input.aiModel;
    if (typeof input.enablePbr === 'boolean') payload.enable_pbr = input.enablePbr;
    else payload.enable_pbr = true;
    // LiteLLM gateway does not inherit Meshy API defaults — explicit should_texture
    // avoids white-mesh-only output on image/views (character turnaround path).
    if (typeof input.shouldTexture === 'boolean') payload.should_texture = input.shouldTexture;
    else payload.should_texture = true;
    if (polycount) payload.target_polycount = polycount;
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

// Flatten the LiteLLM gateway `data[]` array into a flat url map.
// data[] entries carry type+format:
//   type="mesh", format="glb" → key "glb"
//   type="preview", format="png" → key "__thumbnail"
//   type="texture", ... → key "__texture_<kind>"
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
