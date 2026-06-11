import {
  CAPABILITIES,
  QUALITY_RUBRIC,
  clampTargetPolycount,
  generateMeshyTextMockResult,
  makeCacheKey,
  type MeshyTextMockArgs,
  type ProviderResult,
} from '../shared/catalog';
import type { AssetSlot, Gen3DAssetManifest, GenerationMode, ProviderId } from '../shared/manifest';
import type { AssetStorage } from './asset-storage';
import { PerGameAssetStore } from './per-game-store';
import { generateCacheFirst, persistGeneration, type PersistInput } from './generate';
import * as cache from './cache';
import { getCosEnv, getHunyuanEnv, getMeshyEnv, getRodinEnv } from './env';
import { CosUploader } from './cos-uploader';
import {
  HunyuanWorkflowProvider,
  type HunyuanGenerateInput,
  type ViewSlot,
} from './providers/hunyuan-workflow';
import { MeshyProvider, type MeshyGenerateInput } from './providers/meshy';
import { RodinProvider, type RodinGenerateInput } from './providers/rodin';
import { HunyuanRestProvider } from './providers/hunyuan-rest';

// Per-game storage adapter (ADR-0002). Assets live under the active game's
// .forgeax/games/<slug>/assets/3d/{characters|meshes}/ tree; identity is the
// game-relative assetPath. Same-origin preview URLs mirror the Studio server's
// read-only /api/game-assets/:slug/* route (packages/server/src/main.ts).
const storage: AssetStorage = new PerGameAssetStore();

// Every store-touching tool needs an active game. The host iframe injects
// ?slug=<gameSlug>; the frontend threads it into each call. Reject early with a
// clear code so the UI can render an empty/disabled state instead of writing to
// a guessed path.
function requireSlug(slug: string | undefined): string {
  const s = slug?.trim();
  if (!s) {
    throw Object.assign(new Error('no active game (slug is required)'), { code: 'missing_game' });
  }
  return s;
}

function resolveSlot(slot: AssetSlot | undefined): AssetSlot {
  return slot === 'characters' ? 'characters' : 'meshes';
}

// Default base name when the caller does not name the asset: derive from the
// prompt (text) or fall back to provider+mode. The store sanitizes + de-dupes.
function defaultName(provided: string | undefined, fallback: string): string {
  const n = provided?.trim();
  return n && n.length > 0 ? n : fallback;
}

interface ProviderStatusResult {
  ok: true;
  quotaSafe: boolean;
  realProvidersEnabled: boolean;
  generatedAt: string;
  rubric: readonly string[];
  capabilities: typeof CAPABILITIES;
}

function getProviderStatus(): ProviderStatusResult {
  const anyReal = getHunyuanEnv() !== null || getMeshyEnv() !== null || getRodinEnv() !== null;
  return {
    ok: true,
    quotaSafe: !anyReal,
    realProvidersEnabled: anyReal,
    generatedAt: new Date().toISOString(),
    rubric: QUALITY_RUBRIC,
    capabilities: CAPABILITIES,
  };
}

interface ListAssetsArgs {
  slug?: string;
  assetSlot?: AssetSlot;
  provider?: ProviderId | 'all';
}

interface ListAssetsResult {
  ok: true;
  assets: Gen3DAssetManifest[];
}

async function listAssets(args: ListAssetsArgs = {}): Promise<ListAssetsResult> {
  const slug = requireSlug(args.slug);
  const provider = args.provider ?? 'all';
  const all = await storage.listAssets(slug, args.assetSlot);
  const assets = provider === 'all' ? all : all.filter((m) => m.provider === provider);
  return { ok: true, assets };
}

interface DeleteAssetArgs {
  slug?: string;
  assetPath: string;
}

interface DeleteAssetResult {
  ok: true;
  assetPath: string;
  tombstoned: boolean;
}

// Destructive: removes the main GLB + sidecar + same-basename sidefiles, then
// tombstones its cacheKey so a deliberately deleted asset never resurrects from
// a later cache hit (and never silently re-burns quota).
async function deleteAsset(args: DeleteAssetArgs): Promise<DeleteAssetResult> {
  const slug = requireSlug(args.slug);
  const assetPath = args.assetPath?.trim();
  if (!assetPath) {
    throw Object.assign(new Error('assetPath is required'), { code: 'invalid_asset_path' });
  }
  const { cacheKey } = await storage.deleteAsset(slug, assetPath);
  if (cacheKey) await cache.tombstone(slug, cacheKey);
  return { ok: true, assetPath, tombstoned: Boolean(cacheKey) };
}

interface GenerateMockArgs extends MeshyTextMockArgs {
  slug?: string;
  assetSlot?: AssetSlot;
  assetName?: string;
}

interface GenerateMockResult {
  ok: true;
  quotaSafe: true;
  cacheKey: string;
  manifest: Gen3DAssetManifest;
}

async function generateMeshyTextMock(args: GenerateMockArgs): Promise<GenerateMockResult> {
  const slug = requireSlug(args.slug);
  const assetSlot = resolveSlot(args.assetSlot);
  const { cacheKey, result } = generateMeshyTextMockResult(args);
  const ctx: PersistInput = {
    slug,
    assetSlot,
    assetName: defaultName(args.assetName, args.prompt),
    cacheKey,
  };
  const manifest = await persistGeneration(result, storage, ctx);
  return { ok: true, quotaSafe: true, cacheKey, manifest };
}

// Mode-based generation tools. Provider is a parameter; today the real
// providers are Hunyuan workflow and Meshy. When real providers are not
// configured, these fall back to the deterministic mock so the path stays
// quota-safe by default.

interface BaseGenArgs {
  slug?: string;
  assetSlot?: AssetSlot;
  assetName?: string;
  provider?: ProviderId;
  enablePbr?: boolean;
  enableFbxUrl?: boolean;
  targetPolycount?: number;
}

interface TextTo3DArgs extends BaseGenArgs {
  prompt: string;
}

interface ImageTo3DArgs extends BaseGenArgs {
  imageUrl: string;
}

interface ViewsTo3DArgs extends BaseGenArgs {
  views: Partial<Record<ViewSlot, string>>;
}

interface GenerateResult {
  ok: true;
  cacheKey: string;
  cacheHit: boolean;
  usedMock: boolean;
  manifest: Gen3DAssetManifest;
}

function mockFallback(provider: ProviderId, mode: GenerationMode, prompt: string | null): ProviderResult {
  // Reuse the deterministic mock byte payloads regardless of provider/mode so
  // the path works without quota. prompt may be null for image/views. The mock
  // is tagged with the requested provider so the manifest reflects user intent.
  const { result } = generateMeshyTextMockResult({ prompt: prompt ?? mode });
  return { ...result, provider, mode, sourceJobId: null };
}

// Providers backing the mode tools today: Hunyuan workflow, Meshy, Rodin.
// Default (and any unknown value) resolves to Hunyuan workflow for backward
// compatibility. refine is Meshy-only and handled separately.
type GenProvider = 'hunyuan_workflow' | 'meshy' | 'rodin';

function resolveProvider(provider: ProviderId | undefined): GenProvider {
  if (provider === 'meshy') return 'meshy';
  if (provider === 'rodin') return 'rodin';
  return 'hunyuan_workflow';
}

function resolvePolycount(target: number | undefined, provider: GenProvider): number {
  if (target !== undefined) return clampTargetPolycount(target);
  if (provider === 'meshy') return clampTargetPolycount(getMeshyEnv()?.defaultPolycount ?? 30000);
  return clampTargetPolycount(getHunyuanEnv()?.defaultFaceCount ?? 30000);
}

// Provider-aware cache-first generation. Picks the real provider when its env is
// configured, else falls back to the deterministic mock (quota-safe). The
// cacheKey is computed by the caller (includes provider + assetSlot, excludes
// assetName), so caches stay isolated per slot and a rename never re-burns
// quota.
async function runGeneration(
  provider: GenProvider,
  mode: GenerationMode,
  ctx: PersistInput,
  inputs: { hunyuan: HunyuanGenerateInput; meshy: MeshyGenerateInput; rodin: RodinGenerateInput },
  mockPrompt: string | null,
): Promise<GenerateResult> {
  let usedMock = false;
  const produce = async (): Promise<ProviderResult> => {
    if (provider === 'meshy') {
      const env = getMeshyEnv();
      if (env) return new MeshyProvider({ env, slug: ctx.slug }).generate(inputs.meshy);
    } else if (provider === 'rodin') {
      const env = getRodinEnv();
      if (env) return new RodinProvider({ env, slug: ctx.slug }).generate(inputs.rodin);
    } else {
      const env = getHunyuanEnv();
      if (env) return new HunyuanWorkflowProvider({ env, slug: ctx.slug }).generate(inputs.hunyuan);
    }
    usedMock = true;
    return mockFallback(provider, mode, mockPrompt);
  };
  const { manifest, cacheHit } = await generateCacheFirst(storage, ctx, produce);
  return { ok: true, cacheKey: ctx.cacheKey, cacheHit, usedMock, manifest };
}

async function textTo3D(args: TextTo3DArgs): Promise<GenerateResult> {
  const slug = requireSlug(args.slug);
  const prompt = args.prompt.trim();
  if (!prompt) throw Object.assign(new Error('prompt is required'), { code: 'invalid_prompt' });
  const assetSlot = resolveSlot(args.assetSlot);
  const provider = resolveProvider(args.provider);
  const faceCount = resolvePolycount(args.targetPolycount, provider);
  const enablePbr = args.enablePbr ?? true;
  const enableFbxUrl = args.enableFbxUrl ?? false;
  const cacheKey = makeCacheKey(provider, 'text', {
    assetSlot,
    prompt,
    faceCount,
    enablePbr,
    enableFbxUrl,
  });
  return runGeneration(
    provider,
    'text',
    { slug, assetSlot, assetName: defaultName(args.assetName, prompt), faceCount, cacheKey },
    {
      hunyuan: { mode: 'text', prompt, faceCount, enablePbr, enableFbxUrl },
      meshy: { mode: 'text', prompt, targetPolycount: faceCount, enablePbr },
      rodin: { mode: 'text', prompt, qualityOverride: faceCount },
    },
    prompt,
  );
}

async function imageTo3D(args: ImageTo3DArgs): Promise<GenerateResult> {
  const slug = requireSlug(args.slug);
  const imageUrl = args.imageUrl.trim();
  if (!imageUrl) throw Object.assign(new Error('imageUrl is required'), { code: 'invalid_image_url' });
  const assetSlot = resolveSlot(args.assetSlot);
  const provider = resolveProvider(args.provider);
  const faceCount = resolvePolycount(args.targetPolycount, provider);
  const enablePbr = args.enablePbr ?? true;
  const enableFbxUrl = args.enableFbxUrl ?? false;
  const cacheKey = makeCacheKey(provider, 'image', {
    assetSlot,
    imageUrl,
    faceCount,
    enablePbr,
    enableFbxUrl,
  });
  return runGeneration(
    provider,
    'image',
    { slug, assetSlot, assetName: defaultName(args.assetName, `image-${provider}`), faceCount, cacheKey },
    {
      hunyuan: { mode: 'image', imageUrl, faceCount, enablePbr, enableFbxUrl },
      meshy: { mode: 'image', imageUrl, targetPolycount: faceCount, enablePbr },
      rodin: { mode: 'image', imageUrl, qualityOverride: faceCount },
    },
    null,
  );
}

async function viewsTo3D(args: ViewsTo3DArgs): Promise<GenerateResult> {
  const slug = requireSlug(args.slug);
  const front = args.views?.front_image_url?.trim();
  if (!front) {
    throw Object.assign(new Error('views.front_image_url is required'), { code: 'invalid_views' });
  }
  const assetSlot = resolveSlot(args.assetSlot);
  const provider = resolveProvider(args.provider);
  const faceCount = resolvePolycount(args.targetPolycount, provider);
  const enablePbr = args.enablePbr ?? true;
  const enableFbxUrl = args.enableFbxUrl ?? false;
  const normalizedViews: Record<string, string> = {};
  for (const [slot, url] of Object.entries(args.views)) {
    if (url && url.trim()) normalizedViews[slot] = url.trim();
  }
  // Meshy multi-image takes an ordered URL array (front/back/left/right first),
  // not Hunyuan's named view slots.
  const meshyUrls = [
    normalizedViews.front_image_url,
    normalizedViews.back_image_url,
    normalizedViews.left_image_url,
    normalizedViews.right_image_url,
  ].filter((u): u is string => Boolean(u));
  const cacheKey = makeCacheKey(provider, 'views', {
    assetSlot,
    ...normalizedViews,
    faceCount,
    enablePbr,
    enableFbxUrl,
  });
  return runGeneration(
    provider,
    'views',
    { slug, assetSlot, assetName: defaultName(args.assetName, `views-${provider}`), faceCount, cacheKey },
    {
      hunyuan: {
        mode: 'views',
        views: normalizedViews as Partial<Record<ViewSlot, string>>,
        faceCount,
        enablePbr,
        enableFbxUrl,
      },
      meshy: { mode: 'views', imageUrls: meshyUrls, targetPolycount: faceCount, enablePbr },
      rodin: { mode: 'views', imageUrls: meshyUrls, qualityOverride: faceCount },
    },
    null,
  );
}

// Meshy-only second stage: add texture to a prior Meshy text `preview` task.
// previewTaskId is the sourceJobId of a prior gen3d:text-to-3d (provider=meshy)
// result. Produces a new durable manifest (mode='refine'). Quota-safe: falls
// back to mock when Meshy is not configured.
interface RefineMeshArgs {
  slug?: string;
  assetSlot?: AssetSlot;
  assetName?: string;
  previewTaskId: string;
  texturePrompt?: string;
  enablePbr?: boolean;
}

async function refineMesh(args: RefineMeshArgs): Promise<GenerateResult> {
  const slug = requireSlug(args.slug);
  const previewTaskId = args.previewTaskId?.trim();
  if (!previewTaskId) {
    throw Object.assign(new Error('previewTaskId is required'), { code: 'invalid_preview_task' });
  }
  const assetSlot = resolveSlot(args.assetSlot);
  const enablePbr = args.enablePbr ?? true;
  const texturePrompt = args.texturePrompt?.trim() || undefined;
  const cacheKey = makeCacheKey('meshy', 'refine', {
    assetSlot,
    previewTaskId,
    enablePbr,
    texturePrompt: texturePrompt ?? '',
  });
  const ctx: PersistInput = {
    slug,
    assetSlot,
    assetName: defaultName(args.assetName, `refine-${previewTaskId}`),
    cacheKey,
  };
  let usedMock = false;
  const produce = async (): Promise<ProviderResult> => {
    const env = getMeshyEnv();
    if (env) {
      return new MeshyProvider({ env, slug }).generate({ mode: 'refine', previewTaskId, texturePrompt, enablePbr });
    }
    usedMock = true;
    return mockFallback('meshy', 'refine', `refine:${previewTaskId}`);
  };
  const { manifest, cacheHit } = await generateCacheFirst(storage, ctx, produce);
  return { ok: true, cacheKey, cacheHit, usedMock, manifest };
}

// Hunyuan REST sub-capability: pose_standardization. This is an UPSTREAM
// preprocessing tool (image → standardized portrait image), not 3D generation.
// It does NOT produce a Gen3DAssetManifest. The output image is persisted as a
// scratch (transfer) artifact under the game's .gen3d/tmp/ — never the asset
// library (CONTEXT.md "临时/中转产物"). Quota-safe by default: with no real
// provider configured it falls back to a deterministic mock image.

interface PoseStandardizationArgs {
  slug?: string;
  imageUrl: string;
  footnote?: string;
}

interface PoseStandardizationResult {
  ok: true;
  usedMock: boolean;
  sourceJobId: string | null;
  // The standardized image as a scratch artifact (NOT an asset; no manifest).
  // Use storageKey as the upstream input for a subsequent gen3d:image-to-3d.
  storageKey: string;
  bytes: number;
  sha256: string;
  localUrl: string | null;
  sourceUrl: string | null;
}

async function poseStandardization(
  args: PoseStandardizationArgs,
): Promise<PoseStandardizationResult> {
  const slug = requireSlug(args.slug);
  const imageUrl = args.imageUrl?.trim();
  if (!imageUrl) {
    throw Object.assign(new Error('imageUrl is required'), { code: 'invalid_image_url' });
  }
  const footnote = args.footnote?.trim() || undefined;
  const env = getHunyuanEnv();

  let imageData: Uint8Array;
  let sourceJobId: string | null;
  let sourceUrl: string | null;
  let usedMock: boolean;

  if (env) {
    const provider = new HunyuanRestProvider({ env, slug });
    const result = await provider.poseStandardization({ imageUrl, footnote });
    imageData = result.imageData;
    sourceJobId = result.sourceJobId;
    sourceUrl = result.sourceUrl;
    usedMock = false;
  } else {
    // Deterministic no-quota fallback: reuse the mock preview image bytes so the
    // storage path runs without a network call.
    const { result } = generateMeshyTextMockResult({ prompt: `pose:${imageUrl}` });
    const preview = result.files.find((f) => f.role === 'preview_image');
    imageData = preview?.data ?? new Uint8Array();
    sourceJobId = null;
    sourceUrl = null;
    usedMock = true;
  }

  const stored = await storage.putScratch({ slug, data: imageData, format: 'png' });
  return {
    ok: true,
    usedMock,
    sourceJobId,
    storageKey: stored.storageKey,
    bytes: stored.bytes,
    sha256: stored.sha256,
    localUrl: stored.localUrl,
    sourceUrl,
  };
}

// Local image upload (transfer artifact, NOT an asset). Decodes a base64 image
// and hosts it on COS so URL-fetching providers (Hunyuan/Meshy) can reach a
// user's local file; the result URL is fed into image/views/pose tools. Rodin
// takes bytes directly and does not need this. base64 rides the existing JSON
// tools route (no extra server route); the decoded image is hard-capped at 8MB
// so an oversized upload can't exhaust server memory.

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_UPLOAD_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

interface UploadImageArgs {
  // Raw base64 (no data: prefix) of the image bytes.
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
  // Tolerate an accidental data: URL prefix the UI might pass.
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
    throw Object.assign(
      new Error('COS upload is not configured; paste an image URL instead'),
      { code: 'cos_not_configured' },
    );
  }
  const result = await new CosUploader(env).upload(data, mimetype);
  return { ok: true, ...result };
}

export const tools = {
  'gen3d:provider-status': async () => getProviderStatus(),
  'gen3d:list-assets': async (args: ListAssetsArgs = {}) => listAssets(args),
  'gen3d:delete-asset': async (args: DeleteAssetArgs) => deleteAsset(args),
  'gen3d:generate-meshy-text-mock': async (args: GenerateMockArgs) => generateMeshyTextMock(args),
  'gen3d:text-to-3d': async (args: TextTo3DArgs) => textTo3D(args),
  'gen3d:image-to-3d': async (args: ImageTo3DArgs) => imageTo3D(args),
  'gen3d:views-to-3d': async (args: ViewsTo3DArgs) => viewsTo3D(args),
  'gen3d:refine-mesh': async (args: RefineMeshArgs) => refineMesh(args),
  'gen3d:pose-standardization': async (args: PoseStandardizationArgs) =>
    poseStandardization(args),
  'gen3d:upload-image': async (args: UploadImageArgs) => uploadImage(args),
};

export default tools;
