import {
  CAPABILITIES,
  QUALITY_RUBRIC,
  clampTargetPolycount,
  generateMeshyTextMockResult,
  makeCacheKey,
  type MeshyTextMockArgs,
  type ProviderResult,
} from '../shared/catalog';
import {
  MESHY_FREE_RUN_ID,
  MESHY_FREE_WALK_ID,
  emptyQualityReport,
  motionRefFromLegacy,
  motionRefKey,
  selectFiles,
  type AssetSlot,
  type Gen3DAssetManifest,
  type GenerationMode,
  type MotionRef,
  type MotionSystem,
  type MotionType,
  type ProviderId,
  type QualityDim,
  type QualityReport,
  type RigChain,
} from '../shared/manifest';
import { DEFAULT_WEIGHTS, weightedTotal } from '../shared/quality/heuristics';
import { filterProviderParams } from '../shared/provider-params';
import { filterMotions, getMeshyCatalog, hunyuanV1Catalog, type MotionOption } from './motion-catalog';
import type { AssetStorage, DerivedFileInput } from './asset-storage';
import { PerGameAssetStore } from './per-game-store';
import { generateCacheFirst, persistGeneration, type PersistInput } from './generate';
import * as cache from './cache';
import { getCosEnv, getHunyuanEnv, getMeshyEnv, getRodinEnv } from './env';
import { CosUploader, mimeForModelFormat } from './cos-uploader';
import {
  HunyuanWorkflowProvider,
  type HunyuanGenerateInput,
  type ViewSlot,
} from './providers/hunyuan-workflow';
import { MeshyProvider, type MeshyGenerateInput } from './providers/meshy';
import { RodinProvider, type RodinGenerateInput } from './providers/rodin';
import { HunyuanRestProvider, type ModelFileOut } from './providers/hunyuan-rest';

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
  providerParams?: Record<string, unknown>;
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

function buildProviderParams(
  provider: GenProvider,
  mode: GenerationMode,
  raw: Record<string, unknown> | undefined,
): {
  filtered: Record<string, string | number | boolean>;
  cacheBits: Record<string, string | number | boolean>;
} {
  const filtered = filterProviderParams(provider, mode, raw);
  const cacheBits: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(filtered)) cacheBits[`pp:${k}`] = v;
  return { filtered, cacheBits };
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
  const { filtered, cacheBits } = buildProviderParams(provider, 'text', args.providerParams);
  const cacheKey = makeCacheKey(provider, 'text', {
    assetSlot,
    prompt,
    faceCount,
    enablePbr,
    enableFbxUrl,
    ...cacheBits,
  });
  return runGeneration(
    provider,
    'text',
    { slug, assetSlot, assetName: defaultName(args.assetName, prompt), faceCount, cacheKey },
    {
      hunyuan: { mode: 'text', prompt, faceCount, enablePbr, enableFbxUrl },
      meshy: { mode: 'text', prompt, targetPolycount: faceCount, enablePbr, params: filtered },
      rodin: { mode: 'text', prompt, qualityOverride: faceCount, params: filtered },
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
  const { filtered, cacheBits } = buildProviderParams(provider, 'image', args.providerParams);
  const cacheKey = makeCacheKey(provider, 'image', {
    assetSlot,
    imageUrl,
    faceCount,
    enablePbr,
    enableFbxUrl,
    ...cacheBits,
  });
  return runGeneration(
    provider,
    'image',
    { slug, assetSlot, assetName: defaultName(args.assetName, `image-${provider}`), faceCount, cacheKey },
    {
      hunyuan: { mode: 'image', imageUrl, faceCount, enablePbr, enableFbxUrl },
      meshy: { mode: 'image', imageUrl, targetPolycount: faceCount, enablePbr, params: filtered },
      rodin: { mode: 'image', imageUrl, qualityOverride: faceCount, params: filtered },
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
    ...buildProviderParams(provider, 'views', args.providerParams).cacheBits,
  });
  const { filtered } = buildProviderParams(provider, 'views', args.providerParams);
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
      meshy: { mode: 'views', imageUrls: meshyUrls, targetPolycount: faceCount, enablePbr, params: filtered },
      rodin: { mode: 'views', imageUrls: meshyUrls, qualityOverride: faceCount, params: filtered },
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

// ─── M13: rig / motion / low_poly (mock-first; Meshy public default) ────────
//
// Core pipeline (ADR-0003/0006): textured high-poly GLB → auto-rig → apply-motion.
// rig/motion append GLB (canonical, self-contained) + FBX (motion transport) to
// the SAME mesh asset and flip readiness; low_poly is an optional geometry/LOD
// side-branch producing a NEW derived GLB asset (textures NOT preserved).
//
// Provider dispatch (ADR-0006, public beta = public network):
//   • auto-rig / apply-motion default to MESHY public API (async submit→poll).
//   • Hunyuan REST stays a dev/internal fallback, used only when Meshy is not
//     configured but Hunyuan is (getMeshyEnv() === null && getHunyuanEnv()).
//   • With neither configured, deterministic placeholder bytes exercise the
//     storage path with zero quota (mock).
// Meshy animation MUST be driven by Meshy's own rig_task_id (not an external
// FBX), so apply-motion dispatches strictly by the asset's recorded rig system
// (manifest.rig.rigProvider) and reads rig.rigTaskId. rig_task_id + signed URLs
// expire ~3 days → rig_expired is reported unless autoReRig is set (PLAN §8-Q3).
// exposedToAI stays false until operator real-machine verification (PLAN §5 P3).

// Deterministic placeholder model bytes (GLB magic header). Stand-in so the
// rig/motion/low_poly append + persist paths run end-to-end without quota.
function mockModelBytes(seed: string): Uint8Array {
  const header = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
  const tail = new TextEncoder().encode(`mock-model:${seed}`);
  const out = new Uint8Array(header.length + tail.length);
  out.set(header, 0);
  out.set(tail, header.length);
  return out;
}

// Share an asset file (already on disk) as a public COS transfer URL so the
// URL-fetching Hunyuan REST endpoint can read it. Returns null when COS is not
// configured (caller then falls back to mock). The file is read from the store,
// never assumed to be a reachable provider URL (ADR-0001).
async function shareAssetFileUrl(
  slug: string,
  assetPath: string,
  role: 'source_mesh' | 'rigged_model',
  format: 'glb' | 'fbx',
): Promise<string | null> {
  const cosEnv = getCosEnv();
  if (!cosEnv) return null;
  const file = await storage.readAssetFile(slug, assetPath, role, format);
  if (!file) {
    throw Object.assign(
      new Error(`asset has no ${role} ${format} file: ${assetPath}`),
      { code: 'missing_input_file' },
    );
  }
  const { url } = await new CosUploader(cosEnv).upload(file.data, mimeForModelFormat(format));
  return url;
}

interface AutoRigArgs {
  slug?: string;
  assetPath: string;
}

interface RigMotionResult {
  ok: true;
  usedMock: boolean;
  assetPath: string;
  manifest: Gen3DAssetManifest;
}

// A free walk/run clip bundled in a Meshy rig result (reserved ids, isFree).
function freeMotionRef(category: 'walking' | 'running'): MotionRef {
  return category === 'walking'
    ? { system: 'meshy', id: MESHY_FREE_WALK_ID, label: '走路（免费）' }
    : { system: 'meshy', id: MESHY_FREE_RUN_ID, label: '跑步（免费）' };
}

const HUMANOID_SKELETON = {
  hasSkeleton: true,
  skeletonProfile: 'humanoid' as const,
  animationInputReady: true,
};

// Meshy auto-rig (public-beta default): share the source GLB to Meshy — prefer a
// public COS model_url (PLAN §8-Q5), else the Meshy input_task_id fast path when
// the source was itself Meshy-generated — rig it, then append the rigged GLB+FBX
// plus the free walk/run clips, recording the rig-chain (rig_task_id / rigType /
// expiry) so apply-motion can drive /animations by the asset's own rig task.
async function meshyRigAppend(
  slug: string,
  asset: Gen3DAssetManifest,
  provider: MeshyProvider,
): Promise<Gen3DAssetManifest> {
  const modelUrl = await shareAssetFileUrl(slug, asset.assetPath, 'source_mesh', 'glb');
  const inputTaskId =
    asset.provider === 'meshy' && asset.sourceJobId && !asset.sourceJobId.startsWith('mock')
      ? asset.sourceJobId
      : undefined;
  if (!modelUrl && !inputTaskId) {
    throw Object.assign(
      new Error('auto-rig needs COS configured (to share the model URL) or a Meshy-generated source'),
      { code: 'cos_not_configured' },
    );
  }
  const rig = await provider.rig(modelUrl ? { modelUrl } : { inputTaskId });
  const files: DerivedFileInput[] = [{ data: rig.glb, format: 'glb', role: 'rigged_model' }];
  if (rig.fbx) files.push({ data: rig.fbx, format: 'fbx', role: 'rigged_model' });
  for (const ba of rig.basicAnimations) {
    const ref = freeMotionRef(ba.category);
    files.push({ data: ba.glb, format: 'glb', role: 'animated_model', motionRef: ref });
    if (ba.fbx) files.push({ data: ba.fbx, format: 'fbx', role: 'animated_model', motionRef: ref });
  }
  return storage.appendDerivedFiles({
    slug,
    assetPath: asset.assetPath,
    files,
    skeleton: HUMANOID_SKELETON,
    rigChain: {
      rigProvider: 'meshy',
      rigTaskId: rig.sourceJobId,
      rigType: rig.rigType,
      rigExpiresAt: rig.expiresAt,
    },
  });
}

// gen3d:auto-rig — append a rigged_model GLB (canonical) + FBX (motion transport)
// to a textured mesh asset and set skeleton flags. Humanoid only (characters
// slot, soft-gated in the UI/schema). Idempotent: if already rigged, returns the
// existing manifest without burning quota. Dispatch: Meshy public default →
// Hunyuan REST dev fallback → mock (ADR-0006 §8-Q4).
async function autoRig(args: AutoRigArgs): Promise<RigMotionResult> {
  const slug = requireSlug(args.slug);
  const assetPath = args.assetPath?.trim();
  if (!assetPath) {
    throw Object.assign(new Error('assetPath is required'), { code: 'invalid_asset_path' });
  }
  const existing = await storage.getAsset(slug, assetPath);
  if (!existing) {
    throw Object.assign(new Error(`asset not found: ${assetPath}`), { code: 'asset_not_found' });
  }
  // Idempotent: a verified rigged_model already present → return as-is.
  if (existing.readiness.rigged) {
    return { ok: true, usedMock: existing.providerMode === 'mock', assetPath, manifest: existing };
  }

  const meshyEnv = getMeshyEnv();
  const hunyuanEnv = getHunyuanEnv();

  // Meshy public API is the public-beta default (ADR-0006 §8-Q4).
  if (meshyEnv) {
    const manifest = await meshyRigAppend(slug, existing, new MeshyProvider({ env: meshyEnv, slug }));
    return { ok: true, usedMock: false, assetPath, manifest };
  }

  // Hunyuan REST: internal/dev fallback, only when Meshy is not configured.
  if (hunyuanEnv) {
    const glbUrl = await shareAssetFileUrl(slug, assetPath, 'source_mesh', 'glb');
    if (!glbUrl) {
      throw Object.assign(new Error('auto-rig needs COS configured to share the input model URL'), {
        code: 'cos_not_configured',
      });
    }
    const files: ModelFileOut[] = (await new HunyuanRestProvider({ env: hunyuanEnv, slug }).autoRig({ glbUrl })).files;
    const derived: DerivedFileInput[] = files.map((f) => ({ data: f.data, format: f.format, role: 'rigged_model' }));
    const manifest = await storage.appendDerivedFiles({
      slug,
      assetPath,
      files: derived,
      skeleton: HUMANOID_SKELETON,
      rigChain: { rigProvider: 'hunyuan_rest', rigTaskId: null, rigType: null, rigExpiresAt: null },
    });
    return { ok: true, usedMock: false, assetPath, manifest };
  }

  // Mock: simulate a Meshy rig (rigged GLB+FBX + free walk/run) with zero quota.
  const files: DerivedFileInput[] = [
    { data: mockModelBytes(`rig-glb:${assetPath}`), format: 'glb', role: 'rigged_model' },
    { data: mockModelBytes(`rig-fbx:${assetPath}`), format: 'fbx', role: 'rigged_model' },
    { data: mockModelBytes(`walk-glb:${assetPath}`), format: 'glb', role: 'animated_model', motionRef: freeMotionRef('walking') },
    { data: mockModelBytes(`walk-fbx:${assetPath}`), format: 'fbx', role: 'animated_model', motionRef: freeMotionRef('walking') },
    { data: mockModelBytes(`run-glb:${assetPath}`), format: 'glb', role: 'animated_model', motionRef: freeMotionRef('running') },
    { data: mockModelBytes(`run-fbx:${assetPath}`), format: 'fbx', role: 'animated_model', motionRef: freeMotionRef('running') },
  ];
  const manifest = await storage.appendDerivedFiles({
    slug,
    assetPath,
    files,
    skeleton: HUMANOID_SKELETON,
    rigChain: { rigProvider: 'meshy', rigTaskId: `mock-rig:${assetPath}`, rigType: 'mock', rigExpiresAt: null },
  });
  return { ok: true, usedMock: true, assetPath, manifest };
}

interface ApplyMotionArgs {
  slug?: string;
  assetPath: string;
  // Meshy path: the action_id from gen3d:list-motions (positive integer).
  actionId?: number;
  // Hunyuan dev path: the v1 fixed motion (int 9–16).
  motionType?: number;
  // Optional display label (the UI passes the action name it showed); the
  // catalog is not re-queried here. Falls back to "动作 <id>".
  label?: string;
  // When the Meshy rig task is stale (expired ~3 days, or mock), re-rig
  // (+credits) instead of erroring with rig_expired. Default false (PLAN §8-Q3).
  autoReRig?: boolean;
}

const VALID_MOTION_TYPES: readonly MotionType[] = [9, 10, 11, 12, 13, 14, 15, 16];

function asMotionType(value: number | undefined): MotionType {
  if (value === undefined || !VALID_MOTION_TYPES.includes(value as MotionType)) {
    throw Object.assign(new Error(`motionType must be an int 9–16, got ${value}`), {
      code: 'invalid_motion_type',
    });
  }
  return value as MotionType;
}

// Real Meshy action ids are positive; reserved negatives are internal (bundled
// free clips) and must not be requested directly through apply-motion.
function asActionId(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    throw Object.assign(new Error(`actionId must be a positive integer, got ${value}`), {
      code: 'invalid_action_id',
    });
  }
  return value;
}

// Has this exact motion already been applied? (idempotency, by structural key.)
function hasMotion(asset: Gen3DAssetManifest, ref: MotionRef): boolean {
  const key = motionRefKey(ref);
  return selectFiles(asset.files, 'animated_model').some(
    (f) => f.motionRef !== undefined && motionRefKey(f.motionRef) === key,
  );
}

// A Meshy rig task is stale when it expired (~3 days) or was only mock-rigged —
// either way it cannot drive a real /animations call.
function meshyRigStale(rig: RigChain | undefined): boolean {
  if (!rig || !rig.rigTaskId) return true;
  if (rig.rigTaskId.startsWith('mock')) return true;
  return rig.rigExpiresAt !== null && Date.now() > rig.rigExpiresAt;
}

// gen3d:apply-motion — append an animated_model GLB (canonical) + FBX for one
// motion to a RIGGED asset, flipping readiness.animated. Dispatches strictly by
// the asset's recorded rig system (ADR-0006 §8-Q4): Meshy uses rig.rigTaskId +
// actionId; Hunyuan uses the rigged FBX + motionType. Multiple motions coexist;
// idempotent per motion. Requires a prior auto-rig (else not_rigged).
async function applyMotion(args: ApplyMotionArgs): Promise<RigMotionResult> {
  const slug = requireSlug(args.slug);
  const assetPath = args.assetPath?.trim();
  if (!assetPath) {
    throw Object.assign(new Error('assetPath is required'), { code: 'invalid_asset_path' });
  }
  const existing = await storage.getAsset(slug, assetPath);
  if (!existing) {
    throw Object.assign(new Error(`asset not found: ${assetPath}`), { code: 'asset_not_found' });
  }
  if (!existing.readiness.rigged) {
    throw Object.assign(new Error('asset is not rigged; run gen3d:auto-rig first'), {
      code: 'not_rigged',
    });
  }

  const rigProvider = existing.rig?.rigProvider ?? 'meshy';

  // ── Hunyuan dev path (internal): fixed motion int 9–16 via the rigged FBX. ──
  if (rigProvider === 'hunyuan_rest') {
    const motionType = asMotionType(args.motionType);
    const ref = motionRefFromLegacy(motionType);
    if (hasMotion(existing, ref)) {
      return { ok: true, usedMock: existing.providerMode === 'mock', assetPath, manifest: existing };
    }
    const env = getHunyuanEnv();
    let files: ModelFileOut[];
    let usedMock: boolean;
    if (env) {
      const fbxUrl = await shareAssetFileUrl(slug, assetPath, 'rigged_model', 'fbx');
      if (!fbxUrl) {
        throw Object.assign(new Error('apply-motion needs COS configured to share the rigged FBX URL'), {
          code: 'cos_not_configured',
        });
      }
      files = (await new HunyuanRestProvider({ env, slug }).applyMotion({ fbxUrl, motionType })).files;
      usedMock = false;
    } else {
      files = [
        { format: 'glb', data: mockModelBytes(`motion-${motionType}-glb:${assetPath}`) },
        { format: 'fbx', data: mockModelBytes(`motion-${motionType}-fbx:${assetPath}`) },
      ];
      usedMock = true;
    }
    const derived: DerivedFileInput[] = files.map((f) => ({
      data: f.data,
      format: f.format,
      role: 'animated_model',
      motionRef: ref,
    }));
    const manifest = await storage.appendDerivedFiles({ slug, assetPath, files: derived });
    return { ok: true, usedMock, assetPath, manifest };
  }

  // ── Meshy public path (default): actionId via Meshy's own rig_task_id. ──
  const actionId = asActionId(args.actionId);
  const ref: MotionRef = { system: 'meshy', id: actionId, label: args.label?.trim() || `动作 ${actionId}` };
  if (hasMotion(existing, ref)) {
    return { ok: true, usedMock: existing.providerMode === 'mock', assetPath, manifest: existing };
  }

  const env = getMeshyEnv();
  if (!env) {
    // Mock: no key → deterministic placeholder clip, zero quota.
    const files: DerivedFileInput[] = [
      { data: mockModelBytes(`motion-meshy-${actionId}-glb:${assetPath}`), format: 'glb', role: 'animated_model', motionRef: ref },
      { data: mockModelBytes(`motion-meshy-${actionId}-fbx:${assetPath}`), format: 'fbx', role: 'animated_model', motionRef: ref },
    ];
    const manifest = await storage.appendDerivedFiles({ slug, assetPath, files });
    return { ok: true, usedMock: true, assetPath, manifest };
  }

  // Real Meshy: the animation input is the rig task id, NOT a local FBX. If that
  // task is stale, re-rig only when autoReRig is set; else report rig_expired so
  // the caller decides (PLAN §8-Q3).
  const provider = new MeshyProvider({ env, slug });
  let asset = existing;
  if (meshyRigStale(asset.rig)) {
    if (!args.autoReRig) {
      throw Object.assign(
        new Error('Meshy rig task expired (~3 days); re-run gen3d:auto-rig or pass autoReRig:true'),
        { code: 'rig_expired' },
      );
    }
    asset = await meshyRigAppend(slug, asset, provider);
  }
  const rigTaskId = asset.rig?.rigTaskId;
  if (!rigTaskId) {
    throw Object.assign(new Error('asset has no Meshy rig task id; re-run gen3d:auto-rig'), {
      code: 'rig_expired',
    });
  }
  const out = await provider.animate({ rigTaskId, actionId });
  const files: DerivedFileInput[] = [{ data: out.glb, format: 'glb', role: 'animated_model', motionRef: ref }];
  if (out.fbx) files.push({ data: out.fbx, format: 'fbx', role: 'animated_model', motionRef: ref });
  const manifest = await storage.appendDerivedFiles({ slug, assetPath, files });
  return { ok: true, usedMock: false, assetPath, manifest };
}

// gen3d:list-motions — two-step motion discovery (PLAN §8-Q1b). Returns a
// filtered slice of the motion catalog for the asset's rig system (Hunyuan →
// the v1 fixed set; Meshy → its rig-compatible / public catalog). Zero credits
// (a GET); quota-safe mock sample when Meshy is not configured. The AI schema
// never enumerates the ~680 actions — callers narrow via query/category/rigType.
interface ListMotionsArgs {
  slug?: string;
  assetPath?: string;
  query?: string;
  category?: string;
  rigType?: string;
}

interface ListMotionsResult {
  ok: true;
  usedMock: boolean;
  system: MotionSystem;
  total: number;
  motions: MotionOption[];
}

async function listMotions(args: ListMotionsArgs = {}): Promise<ListMotionsResult> {
  const slug = requireSlug(args.slug);
  let system: MotionSystem = 'meshy';
  let rigTaskId: string | undefined;
  const path = args.assetPath?.trim();
  if (path) {
    const asset = await storage.getAsset(slug, path);
    if (asset?.rig?.rigProvider === 'hunyuan_rest') system = 'hunyuan_v1';
    else if (asset?.rig?.rigProvider === 'meshy') rigTaskId = asset.rig.rigTaskId ?? undefined;
  }
  const filter = { query: args.query, category: args.category, rigType: args.rigType };
  if (system === 'hunyuan_v1') {
    const motions = filterMotions(hunyuanV1Catalog(), filter);
    return { ok: true, usedMock: false, system, total: motions.length, motions };
  }
  // A mock rig task id can't list real per-rig actions → fall to public catalog.
  const taskId = rigTaskId && !rigTaskId.startsWith('mock') ? rigTaskId : undefined;
  const { usedMock, options } = await getMeshyCatalog(slug, taskId);
  const motions = filterMotions(options, filter);
  return { ok: true, usedMock, system: 'meshy', total: motions.length, motions };
}

interface RetopoLowpolyArgs {
  slug?: string;
  assetPath: string;
  assetName?: string;
  assetSlot?: AssetSlot;
  polygonType?: 'triangle' | 'quadrilateral';
  detailLevel?: 'high' | 'medium' | 'low';
}

// gen3d:retopo-lowpoly — OPTIONAL geometry/LOD side-branch (NOT a pre-rig step;
// textures are NOT preserved). Produces a NEW derived low-poly GLB asset from a
// high-poly source; the high-poly source is retained. cache-first + mock fallback.
async function retopoLowpoly(args: RetopoLowpolyArgs): Promise<GenerateResult> {
  const slug = requireSlug(args.slug);
  const assetPath = args.assetPath?.trim();
  if (!assetPath) {
    throw Object.assign(new Error('assetPath is required'), { code: 'invalid_asset_path' });
  }
  const source = await storage.getAsset(slug, assetPath);
  if (!source) {
    throw Object.assign(new Error(`asset not found: ${assetPath}`), { code: 'asset_not_found' });
  }
  const assetSlot = resolveSlot(args.assetSlot ?? source.assetSlot);
  const polygonType = args.polygonType ?? 'quadrilateral';
  const detailLevel = args.detailLevel ?? 'high';
  const sourceHash = source.files.find((f) => f.role === 'source_mesh')?.sha256 ?? assetPath;
  const cacheKey = makeCacheKey('hunyuan_rest', 'image', {
    op: 'lowpoly',
    assetSlot,
    inputHash: sourceHash,
    polygonType,
    detailLevel,
  });
  const baseName = source.assetPath
    .replace(/^assets\/3d\/[^/]+\//, '')
    .replace(/\.glb$/, '');
  const ctx: PersistInput = {
    slug,
    assetSlot,
    assetName: defaultName(args.assetName, `${baseName}-lowpoly`),
    cacheKey,
    sourceInputAssetPaths: [assetPath],
  };

  let usedMock = false;
  const produce = async (): Promise<ProviderResult> => {
    const env = getHunyuanEnv();
    if (env) {
      const glbUrl = await shareAssetFileUrl(slug, assetPath, 'source_mesh', 'glb');
      if (!glbUrl) {
        throw Object.assign(
          new Error('retopo-lowpoly needs COS configured to share the input model URL'),
          { code: 'cos_not_configured' },
        );
      }
      const out = await new HunyuanRestProvider({ env, slug }).lowPoly({
        glbUrl,
        polygonType,
        detailLevel,
      });
      const files: ProviderResult['files'] = [
        { role: 'source_mesh', format: 'glb', data: out.glb },
      ];
      if (out.previewImage) {
        files.push({ role: 'preview_image', format: 'png', data: out.previewImage });
      }
      return {
        provider: 'hunyuan_rest',
        mode: 'image',
        providerMode: 'real',
        sourceJobId: out.sourceJobId,
        prompt: source.prompt,
        files,
      };
    }
    usedMock = true;
    return {
      provider: 'hunyuan_rest',
      mode: 'image',
      providerMode: 'mock',
      sourceJobId: null,
      prompt: source.prompt,
      files: [{ role: 'source_mesh', format: 'glb', data: mockModelBytes(`lowpoly:${assetPath}`) }],
    };
  };
  const { manifest, cacheHit } = await generateCacheFirst(storage, ctx, produce);
  return { ok: true, cacheKey, cacheHit, usedMock, manifest };
}

// ─── Quality scoring (ADR-0004, P3) ─────────────────────────────────────────

type DimKey = 'geometry' | 'topology' | 'texture' | 'pbr' | 'prompt_fidelity';

interface ScoreQualityArgs {
  slug?: string;
  assetPath: string;
  objective?: Partial<Record<'geometry' | 'topology' | 'texture' | 'pbr', number | null>>;
  aiPass?: boolean;
  manual?: Partial<Record<DimKey, number | null>> & { notes?: string };
}

interface ScoreQualityResult {
  ok: true;
  usedMock: boolean;
  manifest: Gen3DAssetManifest;
}

function clampScore(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return Math.min(100, Math.max(0, Math.round(v)));
}

async function scoreQuality(args: ScoreQualityArgs): Promise<ScoreQualityResult> {
  const slug = requireSlug(args.slug);
  const assetPath = args.assetPath?.trim();
  if (!assetPath) {
    throw Object.assign(new Error('assetPath is required'), { code: 'invalid_asset_path' });
  }
  const existing = await storage.getAsset(slug, assetPath);
  if (!existing) {
    throw Object.assign(new Error(`asset not found: ${assetPath}`), { code: 'asset_not_found' });
  }

  const report: QualityReport = emptyQualityReport();
  const setDim = (key: DimKey, value: number | null, source: QualityDim['source']) => {
    report[key] = { value: clampScore(value), source };
  };

  let hasObjective = false;
  if (args.objective) {
    for (const key of ['geometry', 'topology', 'texture', 'pbr'] as const) {
      if (key in args.objective) {
        setDim(key, args.objective[key] ?? null, 'auto');
        hasObjective = true;
      }
    }
  }

  let usedMock = false;
  if (args.aiPass) usedMock = true;

  let hasManual = false;
  if (args.manual) {
    for (const key of ['geometry', 'topology', 'texture', 'pbr', 'prompt_fidelity'] as const) {
      if (key in args.manual) {
        setDim(key, args.manual[key] ?? null, 'manual');
        hasManual = true;
      }
    }
    if (typeof args.manual.notes === 'string') report.notes = args.manual.notes;
    if (hasManual) report.rater = 'local';
  }

  report.method = hasManual && hasObjective ? 'mixed' : hasManual ? 'manual' : 'auto';
  report.total = weightedTotal([
    { value: report.geometry.value, weight: DEFAULT_WEIGHTS.geometry },
    { value: report.topology.value, weight: DEFAULT_WEIGHTS.topology },
    { value: report.texture.value, weight: DEFAULT_WEIGHTS.texture },
    { value: report.pbr.value, weight: DEFAULT_WEIGHTS.pbr },
    { value: report.prompt_fidelity.value, weight: DEFAULT_WEIGHTS.prompt_fidelity },
  ]);
  report.scoredAt = new Date().toISOString();

  const manifest = await storage.updateAssetQuality(slug, assetPath, report);
  return { ok: true, usedMock, manifest };
}

interface RenameAssetArgs {
  slug?: string;
  assetPath: string;
  label: string | null;
}

async function renameAsset(args: RenameAssetArgs): Promise<{ ok: true; manifest: Gen3DAssetManifest }> {
  const slug = requireSlug(args.slug);
  const assetPath = args.assetPath?.trim();
  if (!assetPath) {
    throw Object.assign(new Error('assetPath is required'), { code: 'invalid_asset_path' });
  }
  const manifest = await storage.updateAssetLabel(slug, assetPath, args.label ?? null);
  return { ok: true, manifest };
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
  'gen3d:auto-rig': async (args: AutoRigArgs) => autoRig(args),
  'gen3d:apply-motion': async (args: ApplyMotionArgs) => applyMotion(args),
  'gen3d:list-motions': async (args: ListMotionsArgs = {}) => listMotions(args),
  'gen3d:retopo-lowpoly': async (args: RetopoLowpolyArgs) => retopoLowpoly(args),
  'gen3d:score-quality': async (args: ScoreQualityArgs) => scoreQuality(args),
  'gen3d:rename-asset': async (args: RenameAssetArgs) => renameAsset(args),
};

export default tools;
