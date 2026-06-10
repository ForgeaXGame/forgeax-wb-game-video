import {
  CAPABILITIES,
  QUALITY_RUBRIC,
  clampTargetPolycount,
  generateMeshyTextMockResult,
  makeCacheKey,
  type MeshyTextMockArgs,
  type ProviderResult,
} from '../shared/catalog';
import type { Gen3DAssetManifest, GenerationMode, ProviderId } from '../shared/manifest';
import type { AssetStorage } from './asset-storage';
import { LocalBlobStore } from './local-blob-store';
import { generateCacheFirst, persistGeneration } from './generate';
import { getHunyuanEnv, getMeshyEnv } from './env';
import {
  HunyuanWorkflowProvider,
  type HunyuanGenerateInput,
  type ViewSlot,
} from './providers/hunyuan-workflow';
import { MeshyProvider, type MeshyGenerateInput } from './providers/meshy';
import { HunyuanRestProvider } from './providers/hunyuan-rest';

// Single dev-time storage adapter. Swap for a COS/S3/R2/MinIO adapter in
// production without changing the tool contracts. localUrlBase mirrors the
// Studio server's /api/gen3d-blobs/* static route (packages/server/src/main.ts)
// so persisted manifest files carry a same-origin URL the UI can render
// (<img> preview + three.js GLTFLoader). In standalone dev the plugin's vite
// /api proxy forwards this to the Studio server.
const storage: AssetStorage = new LocalBlobStore({ localUrlBase: '/api/gen3d-blobs' });

interface ProviderStatusResult {
  ok: true;
  quotaSafe: boolean;
  realProvidersEnabled: boolean;
  generatedAt: string;
  rubric: readonly string[];
  capabilities: typeof CAPABILITIES;
}

function getProviderStatus(): ProviderStatusResult {
  const anyReal = getHunyuanEnv() !== null || getMeshyEnv() !== null;
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
  provider?: ProviderId | 'all';
}

interface ListAssetsResult {
  ok: true;
  assets: Gen3DAssetManifest[];
}

async function listAssets(args: ListAssetsArgs = {}): Promise<ListAssetsResult> {
  const provider = args.provider ?? 'all';
  const all = await storage.listManifests();
  const assets = provider === 'all' ? all : all.filter((m) => m.provider === provider);
  return { ok: true, assets };
}

interface GenerateMockResult {
  ok: true;
  quotaSafe: true;
  cacheKey: string;
  manifest: Gen3DAssetManifest;
}

async function generateMeshyTextMock(args: MeshyTextMockArgs): Promise<GenerateMockResult> {
  const { cacheKey, result } = generateMeshyTextMockResult(args);
  const manifest = await persistGeneration(result, storage);
  return { ok: true, quotaSafe: true, cacheKey, manifest };
}

// Mode-based generation tools. Provider is a parameter; today the only real
// provider is Hunyuan workflow. When real providers are not configured, these
// fall back to the deterministic mock so the path stays quota-safe by default.

interface TextTo3DArgs {
  prompt: string;
  provider?: ProviderId;
  enablePbr?: boolean;
  enableFbxUrl?: boolean;
  targetPolycount?: number;
}

interface ImageTo3DArgs {
  imageUrl: string;
  provider?: ProviderId;
  enablePbr?: boolean;
  enableFbxUrl?: boolean;
  targetPolycount?: number;
}

interface ViewsTo3DArgs {
  views: Partial<Record<ViewSlot, string>>;
  provider?: ProviderId;
  enablePbr?: boolean;
  enableFbxUrl?: boolean;
  targetPolycount?: number;
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

// Only these two providers back the mode tools today. Default (and any
// non-meshy value) resolves to Hunyuan workflow for backward compatibility.
type GenProvider = 'hunyuan_workflow' | 'meshy';

function resolveProvider(provider: ProviderId | undefined): GenProvider {
  return provider === 'meshy' ? 'meshy' : 'hunyuan_workflow';
}

function resolvePolycount(target: number | undefined, provider: GenProvider): number {
  if (target !== undefined) return clampTargetPolycount(target);
  if (provider === 'meshy') return clampTargetPolycount(getMeshyEnv()?.defaultPolycount ?? 30000);
  return clampTargetPolycount(getHunyuanEnv()?.defaultFaceCount ?? 30000);
}

// Provider-aware cache-first generation. Picks the real provider when its env is
// configured, else falls back to the deterministic mock (quota-safe). cacheKey
// is computed by the caller (includes the provider), so caches stay isolated.
async function runGeneration(
  provider: GenProvider,
  mode: GenerationMode,
  cacheKey: string,
  inputs: { hunyuan: HunyuanGenerateInput; meshy: MeshyGenerateInput },
  mockPrompt: string | null,
): Promise<GenerateResult> {
  let usedMock = false;
  const produce = async (): Promise<ProviderResult> => {
    if (provider === 'meshy') {
      const env = getMeshyEnv();
      if (env) return new MeshyProvider({ env }).generate(inputs.meshy);
    } else {
      const env = getHunyuanEnv();
      if (env) return new HunyuanWorkflowProvider({ env }).generate(inputs.hunyuan);
    }
    usedMock = true;
    return mockFallback(provider, mode, mockPrompt);
  };
  const { manifest, cacheHit } = await generateCacheFirst(cacheKey, storage, produce);
  return { ok: true, cacheKey, cacheHit, usedMock, manifest };
}

async function textTo3D(args: TextTo3DArgs): Promise<GenerateResult> {
  const prompt = args.prompt.trim();
  if (!prompt) throw Object.assign(new Error('prompt is required'), { code: 'invalid_prompt' });
  const provider = resolveProvider(args.provider);
  const faceCount = resolvePolycount(args.targetPolycount, provider);
  const enablePbr = args.enablePbr ?? true;
  const enableFbxUrl = args.enableFbxUrl ?? false;
  const cacheKey = makeCacheKey(provider, 'text', { prompt, faceCount, enablePbr, enableFbxUrl });
  return runGeneration(
    provider,
    'text',
    cacheKey,
    {
      hunyuan: { mode: 'text', prompt, faceCount, enablePbr, enableFbxUrl },
      meshy: { mode: 'text', prompt, targetPolycount: faceCount, enablePbr },
    },
    prompt,
  );
}

async function imageTo3D(args: ImageTo3DArgs): Promise<GenerateResult> {
  const imageUrl = args.imageUrl.trim();
  if (!imageUrl) throw Object.assign(new Error('imageUrl is required'), { code: 'invalid_image_url' });
  const provider = resolveProvider(args.provider);
  const faceCount = resolvePolycount(args.targetPolycount, provider);
  const enablePbr = args.enablePbr ?? true;
  const enableFbxUrl = args.enableFbxUrl ?? false;
  const cacheKey = makeCacheKey(provider, 'image', { imageUrl, faceCount, enablePbr, enableFbxUrl });
  return runGeneration(
    provider,
    'image',
    cacheKey,
    {
      hunyuan: { mode: 'image', imageUrl, faceCount, enablePbr, enableFbxUrl },
      meshy: { mode: 'image', imageUrl, targetPolycount: faceCount, enablePbr },
    },
    null,
  );
}

async function viewsTo3D(args: ViewsTo3DArgs): Promise<GenerateResult> {
  const front = args.views?.front_image_url?.trim();
  if (!front) {
    throw Object.assign(new Error('views.front_image_url is required'), { code: 'invalid_views' });
  }
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
    ...normalizedViews,
    faceCount,
    enablePbr,
    enableFbxUrl,
  });
  return runGeneration(
    provider,
    'views',
    cacheKey,
    {
      hunyuan: {
        mode: 'views',
        views: normalizedViews as Partial<Record<ViewSlot, string>>,
        faceCount,
        enablePbr,
        enableFbxUrl,
      },
      meshy: { mode: 'views', imageUrls: meshyUrls, targetPolycount: faceCount, enablePbr },
    },
    null,
  );
}

// Meshy-only second stage: add texture to a prior Meshy text `preview` task.
// previewTaskId is the sourceJobId of a prior gen3d:text-to-3d (provider=meshy)
// result. Produces a new durable manifest (mode='refine'). Quota-safe: falls
// back to mock when Meshy is not configured.
interface RefineMeshArgs {
  previewTaskId: string;
  texturePrompt?: string;
  enablePbr?: boolean;
}

async function refineMesh(args: RefineMeshArgs): Promise<GenerateResult> {
  const previewTaskId = args.previewTaskId?.trim();
  if (!previewTaskId) {
    throw Object.assign(new Error('previewTaskId is required'), { code: 'invalid_preview_task' });
  }
  const enablePbr = args.enablePbr ?? true;
  const texturePrompt = args.texturePrompt?.trim() || undefined;
  const cacheKey = makeCacheKey('meshy', 'refine', {
    previewTaskId,
    enablePbr,
    texturePrompt: texturePrompt ?? '',
  });
  let usedMock = false;
  const produce = async (): Promise<ProviderResult> => {
    const env = getMeshyEnv();
    if (env) {
      return new MeshyProvider({ env }).generate({ mode: 'refine', previewTaskId, texturePrompt, enablePbr });
    }
    usedMock = true;
    return mockFallback('meshy', 'refine', `refine:${previewTaskId}`);
  };
  const { manifest, cacheHit } = await generateCacheFirst(cacheKey, storage, produce);
  return { ok: true, cacheKey, cacheHit, usedMock, manifest };
}

// Hunyuan REST sub-capability: pose_standardization. This is an UPSTREAM
// preprocessing tool (image → standardized portrait image), not 3D generation.
// It does NOT produce a Gen3DAssetManifest. The output image is persisted as a
// standalone preview_image blob; the result returns the durable storageKey so a
// later image-to-3d call can consume it. Quota-safe by default: with no real
// provider configured it falls back to a deterministic mock image blob.

interface PoseStandardizationArgs {
  imageUrl: string;
  footnote?: string;
}

interface PoseStandardizationResult {
  ok: true;
  usedMock: boolean;
  sourceJobId: string | null;
  // The standardized image as a durable blob (preview_image role). Not a mesh
  // asset; no manifest is written. Use storageKey as the upstream input for a
  // subsequent gen3d:image-to-3d call.
  storageKey: string;
  bytes: number;
  sha256: string;
  localUrl: string | null;
  sourceUrl: string | null;
}

async function poseStandardization(
  args: PoseStandardizationArgs,
): Promise<PoseStandardizationResult> {
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
    const provider = new HunyuanRestProvider({ env });
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

  const stored = await storage.putBlob({ data: imageData, format: 'png', role: 'preview_image' });
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

export const tools = {
  'gen3d:provider-status': async () => getProviderStatus(),
  'gen3d:list-assets': async (args: ListAssetsArgs = {}) => listAssets(args),
  'gen3d:generate-meshy-text-mock': async (args: MeshyTextMockArgs) => generateMeshyTextMock(args),
  'gen3d:text-to-3d': async (args: TextTo3DArgs) => textTo3D(args),
  'gen3d:image-to-3d': async (args: ImageTo3DArgs) => imageTo3D(args),
  'gen3d:views-to-3d': async (args: ViewsTo3DArgs) => viewsTo3D(args),
  'gen3d:refine-mesh': async (args: RefineMeshArgs) => refineMesh(args),
  'gen3d:pose-standardization': async (args: PoseStandardizationArgs) =>
    poseStandardization(args),
};

export default tools;
