// wb-ai-asset backend tool handlers. Exported `tools` map runs in the
// forgeax-server process; the frontend calls them via POST /api/tools/call.
//
// Design (mirrors wb-gen3d, Meshy-only + low-poly default):
//   - Generation is cache-first per game: same inputs → same cacheKey → reuse
//     the existing asset, never re-burn quota. The cacheKey excludes assetName
//     (a rename never regenerates) and any signed transfer URL.
//   - Real Meshy runs ONLY when getMeshyEnv() is non-null (master switch + key);
//     otherwise a deterministic no-quota mock exercises the full persist path.
//   - refine / retexture / remesh are second stages that emit a NEW derived
//     asset; their model input may be a Meshy task id, a public URL, or a stored
//     asset (COS-shared lazily, only on a real cache miss).

import {
  CAPABILITIES,
  QUALITY_RUBRIC,
  clampTargetPolycount,
  generateMeshyTextMockResult,
  makeCacheKey,
  type ProviderResult,
} from '../shared/catalog';
import type {
  AssetSlot,
  Gen3DAssetManifest,
  GenerationMode,
  ProviderId,
} from '../shared/manifest';
import { filterProviderParams } from '../shared/provider-params';
import type { AssetStorage } from './asset-storage';
import { PerGameAssetStore } from './per-game-store';
import { generateCacheFirst, type PersistInput } from './generate';
import { getCosEnv, getMeshyEnv, realProvidersEnabled } from './env';
import { readCredentials, writeCredentials } from './credentials-store';
import { CosUploader, mimeForModelFormat } from './cos-uploader';
import { MeshyProvider } from './providers/meshy';

// Per-game storage adapter. Assets live under the active game's
// .forgeax/games/<slug>/assets/3d/meshes/ tree; identity is the game-relative
// assetPath. Same-origin preview URLs mirror the Studio server's read-only
// /api/game-assets/:slug/* route.
const storage: AssetStorage = new PerGameAssetStore();

// Every store-touching tool needs an active game. The host iframe injects
// ?slug=<gameSlug>; the frontend threads it into each call.
function requireSlug(slug: string | undefined): string {
  const s = slug?.trim();
  if (!s) {
    throw Object.assign(new Error('no active game (slug is required)'), { code: 'missing_game' });
  }
  return s;
}

// Small props default to the meshes slot; characters is allowed for parity with
// the shared asset tree.
function resolveSlot(slot: AssetSlot | undefined): AssetSlot {
  return slot === 'characters' ? 'characters' : 'meshes';
}

function defaultName(provided: string | undefined, fallback: string): string {
  const n = provided?.trim();
  return n && n.length > 0 ? n : fallback;
}

// ─── provider-status ─────────────────────────────────────────────────────────

interface ProviderStatusArgs {
  slug?: string;
  // When true AND Meshy is configured, do a best-effort balance read (network,
  // no quota cost). Defaults to false so the call stays fast + offline-safe.
  checkBalance?: boolean;
}

interface ProviderStatusResult {
  ok: true;
  realProvidersEnabled: boolean;
  meshyConfigured: boolean;
  cosConfigured: boolean;
  quotaSafe: boolean;
  balance: number | null;
  generatedAt: string;
  rubric: readonly string[];
  capabilities: typeof CAPABILITIES;
}

async function getProviderStatus(args: ProviderStatusArgs = {}): Promise<ProviderStatusResult> {
  const meshyEnv = getMeshyEnv();
  const meshyConfigured = meshyEnv !== null;
  let balance: number | null = null;
  if (args.checkBalance && meshyEnv) {
    try {
      balance = await new MeshyProvider({ env: meshyEnv, slug: args.slug?.trim() || 'preflight' }).getBalance();
    } catch {
      balance = null;
    }
  }
  return {
    ok: true,
    realProvidersEnabled: realProvidersEnabled(),
    meshyConfigured,
    cosConfigured: getCosEnv() !== null,
    quotaSafe: !meshyConfigured,
    balance,
    generatedAt: new Date().toISOString(),
    rubric: QUALITY_RUBRIC,
    capabilities: CAPABILITIES,
  };
}

// ─── generation core (cache-first + mock fallback) ───────────────────────────

interface GenerateResult {
  ok: true;
  cacheKey: string;
  cacheHit: boolean;
  usedMock: boolean;
  manifest: Gen3DAssetManifest;
}

// Deterministic mock tagged with the requested mode so a manifest produced
// without a real call is never mistaken for a real generation.
function mockFallback(mode: GenerationMode, prompt: string | null): ProviderResult {
  const { result } = generateMeshyTextMockResult({ prompt: prompt ?? mode });
  return { ...result, provider: 'meshy', mode, sourceJobId: null };
}

// Cache-first runner shared by all six Meshy capabilities. `produceReal` is
// invoked ONLY on a real-provider cache miss (so any COS transfer it does is
// lazy); otherwise the deterministic mock runs.
async function runCacheFirst(
  mode: GenerationMode,
  ctx: PersistInput,
  produceReal: (provider: MeshyProvider) => Promise<ProviderResult>,
  mockPrompt: string | null,
): Promise<GenerateResult> {
  let usedMock = false;
  const produce = async (): Promise<ProviderResult> => {
    const env = getMeshyEnv();
    if (env) return produceReal(new MeshyProvider({ env, slug: ctx.slug }));
    usedMock = true;
    return mockFallback(mode, mockPrompt);
  };
  const { manifest, cacheHit } = await generateCacheFirst(storage, ctx, produce);
  return { ok: true, cacheKey: ctx.cacheKey, cacheHit, usedMock, manifest };
}

function buildMeshyParams(mode: GenerationMode, raw: Record<string, unknown> | undefined): {
  filtered: Record<string, string | number | boolean>;
  cacheBits: Record<string, string | number | boolean>;
} {
  const filtered = filterProviderParams('meshy', mode, raw);
  const cacheBits: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(filtered)) cacheBits[`pp:${k}`] = v;
  return { filtered, cacheBits };
}

type ModelType = 'standard' | 'lowpoly';
function resolveModelType(v: string | undefined): ModelType {
  return v === 'standard' ? 'standard' : 'lowpoly';
}

// ─── text-to-3d ──────────────────────────────────────────────────────────────

interface TextTo3DArgs {
  slug?: string;
  prompt: string;
  assetSlot?: AssetSlot;
  assetName?: string;
  modelType?: ModelType;
  targetPolycount?: number;
  enablePbr?: boolean;
  providerParams?: Record<string, unknown>;
}

async function textTo3D(args: TextTo3DArgs): Promise<GenerateResult> {
  const slug = requireSlug(args.slug);
  const prompt = args.prompt?.trim();
  if (!prompt) throw Object.assign(new Error('prompt is required'), { code: 'invalid_prompt' });
  const assetSlot = resolveSlot(args.assetSlot);
  const modelType = resolveModelType(args.modelType);
  const faceCount = clampTargetPolycount(args.targetPolycount ?? getMeshyEnv()?.defaultPolycount ?? 6000);
  const enablePbr = args.enablePbr ?? true;
  const { filtered, cacheBits } = buildMeshyParams('text', args.providerParams);
  const cacheKey = makeCacheKey('meshy', 'text', {
    assetSlot,
    prompt,
    modelType,
    faceCount,
    enablePbr,
    ...cacheBits,
  });
  return runCacheFirst(
    'text',
    { slug, assetSlot, assetName: defaultName(args.assetName, prompt), faceCount, cacheKey },
    (provider) =>
      provider.generate({ mode: 'text', prompt, modelType, targetPolycount: faceCount, enablePbr, params: filtered }),
    prompt,
  );
}

// ─── image-to-3d ─────────────────────────────────────────────────────────────

interface ImageTo3DArgs {
  slug?: string;
  imageUrl: string;
  assetSlot?: AssetSlot;
  assetName?: string;
  modelType?: ModelType;
  targetPolycount?: number;
  enablePbr?: boolean;
  providerParams?: Record<string, unknown>;
}

async function imageTo3D(args: ImageTo3DArgs): Promise<GenerateResult> {
  const slug = requireSlug(args.slug);
  const imageUrl = args.imageUrl?.trim();
  if (!imageUrl) throw Object.assign(new Error('imageUrl is required'), { code: 'invalid_image_url' });
  const assetSlot = resolveSlot(args.assetSlot);
  const modelType = resolveModelType(args.modelType);
  const faceCount = clampTargetPolycount(args.targetPolycount ?? getMeshyEnv()?.defaultPolycount ?? 6000);
  const enablePbr = args.enablePbr ?? true;
  const { filtered, cacheBits } = buildMeshyParams('image', args.providerParams);
  const cacheKey = makeCacheKey('meshy', 'image', {
    assetSlot,
    imageUrl,
    modelType,
    faceCount,
    enablePbr,
    ...cacheBits,
  });
  return runCacheFirst(
    'image',
    { slug, assetSlot, assetName: defaultName(args.assetName, 'image-prop'), faceCount, cacheKey },
    (provider) =>
      provider.generate({ mode: 'image', imageUrl, modelType, targetPolycount: faceCount, enablePbr, params: filtered }),
    null,
  );
}

// ─── multi-image-to-3d ───────────────────────────────────────────────────────

interface MultiImageTo3DArgs {
  slug?: string;
  imageUrls: string[];
  assetSlot?: AssetSlot;
  assetName?: string;
  modelType?: ModelType;
  targetPolycount?: number;
  enablePbr?: boolean;
  providerParams?: Record<string, unknown>;
}

async function multiImageTo3D(args: MultiImageTo3DArgs): Promise<GenerateResult> {
  const slug = requireSlug(args.slug);
  const imageUrls = (args.imageUrls ?? []).map((u) => u.trim()).filter(Boolean).slice(0, 4);
  if (imageUrls.length === 0) {
    throw Object.assign(new Error('at least one imageUrl is required'), { code: 'invalid_image_urls' });
  }
  const assetSlot = resolveSlot(args.assetSlot);
  const modelType = resolveModelType(args.modelType);
  const faceCount = clampTargetPolycount(args.targetPolycount ?? getMeshyEnv()?.defaultPolycount ?? 6000);
  const enablePbr = args.enablePbr ?? true;
  const { filtered, cacheBits } = buildMeshyParams('views', args.providerParams);
  const cacheKey = makeCacheKey('meshy', 'views', {
    assetSlot,
    imageUrls: imageUrls.join(','),
    modelType,
    faceCount,
    enablePbr,
    ...cacheBits,
  });
  return runCacheFirst(
    'views',
    { slug, assetSlot, assetName: defaultName(args.assetName, 'multiview-prop'), faceCount, cacheKey },
    (provider) =>
      provider.generate({ mode: 'views', imageUrls, modelType, targetPolycount: faceCount, enablePbr, params: filtered }),
    null,
  );
}

// ─── refine (texture a preview) ──────────────────────────────────────────────

interface RefineArgs {
  slug?: string;
  previewTaskId: string;
  assetSlot?: AssetSlot;
  assetName?: string;
  texturePrompt?: string;
  enablePbr?: boolean;
}

async function refine(args: RefineArgs): Promise<GenerateResult> {
  const slug = requireSlug(args.slug);
  const previewTaskId = args.previewTaskId?.trim();
  if (!previewTaskId) throw Object.assign(new Error('previewTaskId is required'), { code: 'invalid_preview_task' });
  const assetSlot = resolveSlot(args.assetSlot);
  const texturePrompt = args.texturePrompt?.trim();
  const enablePbr = args.enablePbr ?? true;
  const cacheKey = makeCacheKey('meshy', 'refine', {
    assetSlot,
    previewTaskId,
    texturePrompt: texturePrompt ?? '',
    enablePbr,
  });
  return runCacheFirst(
    'refine',
    { slug, assetSlot, assetName: defaultName(args.assetName, 'refined-prop'), cacheKey },
    (provider) => provider.generate({ mode: 'refine', previewTaskId, texturePrompt, enablePbr }),
    texturePrompt ?? null,
  );
}

// ─── shared: resolve a model input for retexture / remesh ─────────────────────

interface ModelInputArgs {
  inputTaskId?: string;
  modelUrl?: string;
  // A stored asset to re-process. Requires COS so it can be shared as a public
  // URL the Meshy endpoint can fetch.
  sourceAssetPath?: string;
}

// Stable cache fragment for a model input (prefer ids/paths over signed URLs).
function modelInputCacheBit(args: ModelInputArgs): string {
  return args.inputTaskId ?? args.sourceAssetPath ?? args.modelUrl ?? '';
}

// Lazily resolve a model input to what the Meshy API accepts. Only called inside
// the real-provider produce path (cache miss), so COS sharing never runs on a
// cache hit or the mock path.
async function resolveModelInput(
  slug: string,
  args: ModelInputArgs,
): Promise<{ inputTaskId?: string; modelUrl?: string }> {
  if (args.inputTaskId) return { inputTaskId: args.inputTaskId };
  if (args.modelUrl) return { modelUrl: args.modelUrl };
  if (args.sourceAssetPath) {
    const url = await shareAssetFileUrl(slug, args.sourceAssetPath);
    if (!url) {
      throw Object.assign(
        new Error('COS is not configured; cannot share a local asset for re-processing'),
        { code: 'cos_not_configured' },
      );
    }
    return { modelUrl: url };
  }
  throw Object.assign(new Error('one of inputTaskId / modelUrl / sourceAssetPath is required'), {
    code: 'invalid_model_input',
  });
}

// Share a stored asset's main GLB as a public COS transfer URL so the Meshy
// remesh/retexture endpoint can fetch it. Returns null when COS is unconfigured.
async function shareAssetFileUrl(slug: string, assetPath: string): Promise<string | null> {
  const cosEnv = getCosEnv();
  if (!cosEnv) return null;
  const file = await storage.readAssetFile(slug, assetPath, 'source_mesh', 'glb');
  if (!file) {
    throw Object.assign(new Error(`asset has no source_mesh glb: ${assetPath}`), {
      code: 'missing_input_file',
    });
  }
  const up = await new CosUploader(cosEnv).upload(file.data, mimeForModelFormat('glb'));
  return up.url;
}

// ─── retexture ───────────────────────────────────────────────────────────────

interface RetextureArgs extends ModelInputArgs {
  slug?: string;
  assetSlot?: AssetSlot;
  assetName?: string;
  textStylePrompt?: string;
  imageStyleUrl?: string;
  enablePbr?: boolean;
  aiModel?: string;
}

async function retexture(args: RetextureArgs): Promise<GenerateResult> {
  const slug = requireSlug(args.slug);
  const textStylePrompt = args.textStylePrompt?.trim();
  const imageStyleUrl = args.imageStyleUrl?.trim();
  if (!textStylePrompt && !imageStyleUrl) {
    throw Object.assign(new Error('one of textStylePrompt / imageStyleUrl is required'), {
      code: 'invalid_retexture_style',
    });
  }
  const assetSlot = resolveSlot(args.assetSlot);
  const enablePbr = args.enablePbr ?? true;
  const cacheKey = makeCacheKey('meshy', 'retexture', {
    assetSlot,
    source: modelInputCacheBit(args),
    textStylePrompt: textStylePrompt ?? '',
    imageStyleUrl: imageStyleUrl ?? '',
    enablePbr,
    aiModel: args.aiModel ?? '',
  });
  return runCacheFirst(
    'retexture',
    { slug, assetSlot, assetName: defaultName(args.assetName, 'retextured-prop'), cacheKey,
      sourceInputAssetPaths: args.sourceAssetPath ? [args.sourceAssetPath] : [] },
    async (provider) => {
      const input = await resolveModelInput(slug, args);
      return provider.retexture({ ...input, textStylePrompt, imageStyleUrl, enablePbr, aiModel: args.aiModel });
    },
    textStylePrompt ?? null,
  );
}

// ─── remesh ──────────────────────────────────────────────────────────────────

interface RemeshArgs extends ModelInputArgs {
  slug?: string;
  assetSlot?: AssetSlot;
  assetName?: string;
  targetPolycount?: number;
  topology?: 'triangle' | 'quad';
}

async function remesh(args: RemeshArgs): Promise<GenerateResult> {
  const slug = requireSlug(args.slug);
  const assetSlot = resolveSlot(args.assetSlot);
  const targetPolycount = clampTargetPolycount(args.targetPolycount ?? 6000);
  const topology = args.topology === 'quad' ? 'quad' : 'triangle';
  const cacheKey = makeCacheKey('meshy', 'remesh', {
    assetSlot,
    source: modelInputCacheBit(args),
    targetPolycount,
    topology,
  });
  return runCacheFirst(
    'remesh',
    { slug, assetSlot, assetName: defaultName(args.assetName, 'remeshed-prop'), faceCount: targetPolycount, cacheKey,
      sourceInputAssetPaths: args.sourceAssetPath ? [args.sourceAssetPath] : [] },
    async (provider) => {
      const input = await resolveModelInput(slug, args);
      return provider.remesh({ ...input, targetPolycount, topology });
    },
    null,
  );
}

// ─── upload-image (COS transfer artifact, NOT an asset) ──────────────────────

const ALLOWED_UPLOAD_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface UploadImageArgs {
  slug?: string;
  base64: string;
  mimetype: string;
}

interface UploadImageResult {
  ok: true;
  url: string;
  bytes: number;
  sha256: string;
  expiresInSec: number;
}

function decodeBase64(raw: string): Uint8Array {
  const comma = raw.indexOf(',');
  const b64 = raw.startsWith('data:') && comma !== -1 ? raw.slice(comma + 1) : raw;
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function uploadImage(args: UploadImageArgs): Promise<UploadImageResult> {
  const mimetype = args.mimetype?.trim().toLowerCase();
  if (!mimetype || !ALLOWED_UPLOAD_MIMES.has(mimetype)) {
    throw Object.assign(new Error(`unsupported image mimetype ${JSON.stringify(args.mimetype)}`), {
      code: 'invalid_mimetype',
    });
  }
  if (!args.base64 || typeof args.base64 !== 'string') {
    throw Object.assign(new Error('base64 image data is required'), { code: 'invalid_base64' });
  }
  const data = decodeBase64(args.base64);
  if (data.byteLength === 0) {
    throw Object.assign(new Error('decoded image is empty'), { code: 'invalid_base64' });
  }
  if (data.byteLength > MAX_UPLOAD_BYTES) {
    throw Object.assign(
      new Error(`image too large: ${data.byteLength} bytes (max ${MAX_UPLOAD_BYTES})`),
      { code: 'image_too_large' },
    );
  }
  const env = getCosEnv();
  if (!env) {
    throw Object.assign(new Error('COS upload is not configured; paste an image URL instead'), {
      code: 'cos_not_configured',
    });
  }
  const result = await new CosUploader(env).upload(data, mimetype);
  return { ok: true, ...result };
}

// ─── list-assets ─────────────────────────────────────────────────────────────

interface ListAssetsArgs {
  slug?: string;
  assetSlot?: AssetSlot;
}

interface ListAssetsResult {
  ok: true;
  assets: Gen3DAssetManifest[];
}

async function listAssets(args: ListAssetsArgs = {}): Promise<ListAssetsResult> {
  const slug = requireSlug(args.slug);
  const assets = await storage.listAssets(slug, args.assetSlot);
  // This plugin authors Meshy assets; keep the view focused on them while still
  // tolerating wb-gen3d-written assets on the shared slot.
  const mine = assets.filter((m): m is Gen3DAssetManifest => (m.provider as ProviderId) === 'meshy');
  return { ok: true, assets: mine };
}

// ─── tools map (matches forgeax-plugin.json ids) ─────────────────────────────

export const tools = {
  'aiasset:provider-status': async (args: ProviderStatusArgs = {}) => getProviderStatus(args),
  'aiasset:text-to-3d': async (args: TextTo3DArgs) => textTo3D(args),
  'aiasset:image-to-3d': async (args: ImageTo3DArgs) => imageTo3D(args),
  'aiasset:multi-image-to-3d': async (args: MultiImageTo3DArgs) => multiImageTo3D(args),
  'aiasset:refine': async (args: RefineArgs) => refine(args),
  'aiasset:retexture': async (args: RetextureArgs) => retexture(args),
  'aiasset:remesh': async (args: RemeshArgs) => remesh(args),
  'aiasset:upload-image': async (args: UploadImageArgs) => uploadImage(args),
  'aiasset:list-assets': async (args: ListAssetsArgs = {}) => listAssets(args),
  'aiasset:get-credentials': async () => readCredentials(),
  'aiasset:set-credentials': async (args: Record<string, unknown> = {}) => writeCredentials(args),
};
