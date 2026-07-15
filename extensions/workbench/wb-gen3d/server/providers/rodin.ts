// RodinProvider — real submit/poll/download client for the Hyper3D Rodin API.
//
// Decoupling (ADR-0001): like the other providers, this talks to the remote API
// and returns a pure ProviderResult with downloaded bytes. It knows nothing
// about cache, asset-store, or manifests. Auth is `Authorization: Bearer <key>`.
//
// Contract (developer.hyper3d.ai, verified 2026-06-11):
//   - submit:   POST {base}/api/v2/rodin   multipart/form-data
//               → { uuid, jobs: { subscription_key } }
//   - status:   POST {base}/api/v2/status  { subscription_key }
//               → { jobs: [{ status: Waiting|Generating|Done|Failed }] }
//   - download: POST {base}/api/v2/download { task_uuid }
//               → { list: [{ url, name }] }
//
// Real-API end-to-end VERIFIED 2026-06-11 (text-to-3D, key + Business sub):
// submit/poll(6 sub-jobs all Done)/download returned `base_basic_pbr.glb` +
// `preview.webp`, persisted real per-game with providerMode='real'. Note the
// preview is a .webp (kept as preview_image; FileFormat carries 'webp').
//
// Mode selection is implicit: images present → image/views (Image-to-3D),
// none → text (Text-to-3D). We pin tier=Regular, material=PBR,
// geometry_file_format=glb, and pass quality_override for poly count. Multi-view
// uses condition_mode=concat with several image files.
//
// Image inputs arrive as URLs (the upload/pose flow hosts local files first).
// Rodin needs bytes, so the provider downloads each URL before attaching it as
// a multipart file — this also sidesteps any provider-side URL fetch.

import type { ProviderResult, ProviderResultFile } from '../../shared/catalog';
import type { FileFormat, FileRole, GenerationMode } from '../../shared/manifest';
import type { RodinEnv } from '../env';
import { audit } from '../audit';
import { RateGuard } from '../rate-guard';

const PATH_SUBMIT = '/api/v2/rodin';
const PATH_STATUS = '/api/v2/status';
const PATH_DOWNLOAD = '/api/v2/download';

const DONE = 'Done';
const FAILED = 'Failed';

export type RodinMode = 'text' | 'image' | 'views';

export interface RodinGenerateInput {
  mode: RodinMode;
  prompt?: string;
  imageUrl?: string;
  imageUrls?: string[];
  // Customize poly count (Rodin quality_override; ranges ~2000–200000).
  qualityOverride?: number;
  params?: Record<string, string | number | boolean>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type DownloadLike = (url: string) => Promise<Uint8Array>;

export interface RodinProviderDeps {
  env: RodinEnv;
  // Active game slug for the per-game audit trail (ADR-0002). Smokes may pass any.
  slug: string;
  fetchImpl?: FetchLike;
  downloadImpl?: DownloadLike;
  rateGuard?: RateGuard;
  sleep?: (ms: number) => Promise<void>;
}

// Map a downloaded result file's name to a durable role+format. The Rodin
// download list mixes the geometry file, textures, and a preview webp.
function classifyFile(name: string): { role: FileRole; format: FileFormat } | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.glb')) return { role: 'source_mesh', format: 'glb' };
  if (lower.endsWith('.fbx')) return { role: 'source_mesh', format: 'fbx' };
  if (lower.endsWith('.obj')) return { role: 'source_mesh', format: 'obj' };
  if (lower.endsWith('.usdz')) return { role: 'source_mesh', format: 'usdz' };
  if (lower.endsWith('.stl')) return { role: 'source_mesh', format: 'stl' };
  if (lower.endsWith('.png')) return { role: 'preview_image', format: 'png' };
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return { role: 'preview_image', format: 'jpg' };
  if (lower.endsWith('.webp')) return { role: 'preview_image', format: 'webp' };
  // Texture maps and any other variants are not part of our durable contract.
  return null;
}

export class RodinProvider {
  private readonly env: RodinEnv;
  private readonly slug: string;
  private readonly fetchImpl: FetchLike;
  private readonly downloadImpl: DownloadLike;
  private readonly rateGuard: RateGuard;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(deps: RodinProviderDeps) {
    this.env = deps.env;
    this.slug = deps.slug;
    this.fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init));
    this.downloadImpl =
      deps.downloadImpl ?? (async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()));
    this.rateGuard = deps.rateGuard ?? new RateGuard(this.env.rateLimitPerMin);
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async generate(input: RodinGenerateInput): Promise<ProviderResult> {
    const form = await this.buildForm(input);

    // Guard BEFORE the quotaed submit.
    this.rateGuard.check();

    const submit = await this.postForm(PATH_SUBMIT, form);
    const uuid = submit.uuid as string | undefined;
    const jobs = submit.jobs as { subscription_key?: string } | undefined;
    const subscriptionKey = jobs?.subscription_key;
    if (!uuid || !subscriptionKey) {
      throw Object.assign(new Error('rodin submit returned no task uuid/subscription_key'), {
        code: 'provider_no_task',
      });
    }
    await audit(this.slug, {
      ts: new Date().toISOString(),
      provider: 'rodin',
      mode: input.mode,
      event: 'submit',
      sourceJobId: uuid,
    });

    await this.poll(input.mode, uuid, subscriptionKey);

    const list = await this.download(uuid);
    const files: ProviderResultFile[] = [];
    let haveMesh = false;
    let havePreview = false;
    for (const item of list) {
      const cls = classifyFile(item.name);
      if (!cls) continue;
      // Keep one mesh + one preview; ignore extra texture/format variants.
      if (cls.role === 'source_mesh') {
        if (haveMesh || cls.format !== 'glb') continue;
        haveMesh = true;
      } else if (cls.role === 'preview_image') {
        if (havePreview) continue;
        havePreview = true;
      }
      files.push({ role: cls.role, format: cls.format, data: await this.downloadImpl(item.url) });
    }
    if (!haveMesh) {
      throw Object.assign(new Error('rodin download returned no GLB mesh'), {
        code: 'provider_no_output',
      });
    }

    return {
      provider: 'rodin',
      mode: input.mode as GenerationMode,
      providerMode: 'real',
      sourceJobId: uuid,
      prompt: input.prompt ?? null,
      files,
    };
  }

  private async buildForm(input: RodinGenerateInput): Promise<FormData> {
    const form = new FormData();
    form.append('tier', 'Regular');
    form.append('material', 'PBR');
    form.append('geometry_file_format', 'glb');
    if (input.qualityOverride !== undefined) {
      form.append('quality_override', String(Math.round(input.qualityOverride)));
    }
    if (input.prompt && input.prompt.trim()) form.append('prompt', input.prompt.trim());

    const urls =
      input.mode === 'image'
        ? input.imageUrl
          ? [input.imageUrl]
          : []
        : input.mode === 'views'
          ? input.imageUrls ?? []
          : [];
    if (urls.length > 1) form.append('condition_mode', 'concat');
    let i = 0;
    for (const url of urls) {
      const bytes = await this.downloadImpl(url);
      // Bun/Hono FormData accepts a Blob with a filename for multipart files.
      const blob = new Blob([bytes as BlobPart]);
      form.append('images', blob, `input-${i}.png`);
      i += 1;
    }
    if (input.mode === 'text' && (!input.prompt || !input.prompt.trim())) {
      throw Object.assign(new Error('rodin text mode requires a prompt'), { code: 'invalid_prompt' });
    }
    if (input.mode !== 'text' && urls.length === 0) {
      throw Object.assign(new Error('rodin image/views mode requires at least one image'), {
        code: 'invalid_image_url',
      });
    }
    if (input.params) {
      for (const [key, value] of Object.entries(input.params)) {
        form.set(key, String(value));
      }
    }
    return form;
  }

  private async poll(mode: RodinMode, uuid: string, subscriptionKey: string): Promise<void> {
    const deadline = Date.now() + this.env.pollTimeoutMs;
    while (Date.now() < deadline) {
      const resp = await this.postJson(PATH_STATUS, { subscription_key: subscriptionKey });
      const jobs = Array.isArray(resp.jobs) ? (resp.jobs as Array<{ status?: string }>) : [];
      const statuses = jobs.map((j) => String(j.status ?? ''));
      if (statuses.length > 0 && statuses.every((s) => s === DONE || s === FAILED)) {
        if (statuses.some((s) => s === FAILED)) {
          await audit(this.slug, { ts: new Date().toISOString(), provider: 'rodin', mode, event: 'poll_failed', sourceJobId: uuid, detail: 'Failed' });
          throw Object.assign(new Error('rodin task failed'), { code: 'provider_failed' });
        }
        await audit(this.slug, { ts: new Date().toISOString(), provider: 'rodin', mode, event: 'poll_succeeded', sourceJobId: uuid, detail: DONE });
        return;
      }
      await this.sleep(this.env.pollIntervalMs);
    }
    await audit(this.slug, { ts: new Date().toISOString(), provider: 'rodin', mode, event: 'poll_timeout', sourceJobId: uuid });
    throw Object.assign(new Error('rodin poll timed out'), { code: 'provider_timeout' });
  }

  private async download(uuid: string): Promise<Array<{ url: string; name: string }>> {
    const resp = await this.postJson(PATH_DOWNLOAD, { task_uuid: uuid });
    const list = Array.isArray(resp.list) ? (resp.list as Array<Record<string, unknown>>) : [];
    return list
      .map((e) => ({ url: String(e.url ?? ''), name: String(e.name ?? '') }))
      .filter((e) => e.url && e.name);
  }

  private async postForm(path: string, form: FormData): Promise<Record<string, unknown>> {
    const resp = await this.fetchImpl(`${this.env.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.env.apiKey}` },
      body: form,
    });
    if (!resp.ok) {
      throw Object.assign(new Error(`rodin http ${resp.status}`), { code: 'provider_http_error' });
    }
    return (await resp.json()) as Record<string, unknown>;
  }

  private async postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
    const resp = await this.fetchImpl(`${this.env.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.env.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw Object.assign(new Error(`rodin http ${resp.status}`), { code: 'provider_http_error' });
    }
    return (await resp.json()) as Record<string, unknown>;
  }
}
