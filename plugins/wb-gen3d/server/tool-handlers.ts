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
import { getHunyuanEnv } from './env';
import {
  HunyuanWorkflowProvider,
  type HunyuanGenerateInput,
  type ViewSlot,
} from './providers/hunyuan-workflow';
import { HunyuanRestProvider } from './providers/hunyuan-rest';

// Single dev-time storage adapter. Swap for a COS/S3/R2/MinIO adapter in
// production without changing the tool contracts.
const storage: AssetStorage = new LocalBlobStore();

interface ProviderStatusResult {
  ok: true;
  quotaSafe: boolean;
  realProvidersEnabled: boolean;
  generatedAt: string;
  rubric: readonly string[];
  capabilities: typeof CAPABILITIES;
}

function getProviderStatus(): ProviderStatusResult {
  const hunyuanReady = getHunyuanEnv() !== null;
  return {
    ok: true,
    quotaSafe: !hunyuanReady,
    realProvidersEnabled: hunyuanReady,
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
  enablePbr?: boolean;
  enableFbxUrl?: boolean;
  targetPolycount?: number;
}

interface ImageTo3DArgs {
  imageUrl: string;
  enablePbr?: boolean;
  enableFbxUrl?: boolean;
  targetPolycount?: number;
}

interface ViewsTo3DArgs {
  views: Partial<Record<ViewSlot, string>>;
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

function mockFallback(mode: GenerationMode, prompt: string | null): ProviderResult {
  // Reuse the deterministic mock byte payloads regardless of mode so the path
  // works without quota. prompt may be null for image/views.
  const { result } = generateMeshyTextMockResult({ prompt: prompt ?? mode });
  return { ...result, mode, provider: 'hunyuan_workflow', sourceJobId: null };
}

async function runGeneration(
  mode: GenerationMode,
  cacheKey: string,
  hunyuanInput: HunyuanGenerateInput,
  mockPrompt: string | null,
): Promise<GenerateResult> {
  const env = getHunyuanEnv();
  let usedMock = false;
  const produce = async (): Promise<ProviderResult> => {
    if (env) {
      const provider = new HunyuanWorkflowProvider({ env });
      return provider.generate(hunyuanInput);
    }
    usedMock = true;
    return mockFallback(mode, mockPrompt);
  };
  const { manifest, cacheHit } = await generateCacheFirst(cacheKey, storage, produce);
  return { ok: true, cacheKey, cacheHit, usedMock, manifest };
}

function resolveFaceCount(target: number | undefined): number {
  if (target !== undefined) return clampTargetPolycount(target);
  const env = getHunyuanEnv();
  return clampTargetPolycount(env?.defaultFaceCount ?? 30000);
}

async function textTo3D(args: TextTo3DArgs): Promise<GenerateResult> {
  const prompt = args.prompt.trim();
  if (!prompt) throw Object.assign(new Error('prompt is required'), { code: 'invalid_prompt' });
  const faceCount = resolveFaceCount(args.targetPolycount);
  const enablePbr = args.enablePbr ?? true;
  const enableFbxUrl = args.enableFbxUrl ?? false;
  const cacheKey = makeCacheKey('hunyuan_workflow', 'text', { prompt, faceCount, enablePbr, enableFbxUrl });
  return runGeneration('text', cacheKey, { mode: 'text', prompt, faceCount, enablePbr, enableFbxUrl }, prompt);
}

async function imageTo3D(args: ImageTo3DArgs): Promise<GenerateResult> {
  const imageUrl = args.imageUrl.trim();
  if (!imageUrl) throw Object.assign(new Error('imageUrl is required'), { code: 'invalid_image_url' });
  const faceCount = resolveFaceCount(args.targetPolycount);
  const enablePbr = args.enablePbr ?? true;
  const enableFbxUrl = args.enableFbxUrl ?? false;
  const cacheKey = makeCacheKey('hunyuan_workflow', 'image', { imageUrl, faceCount, enablePbr, enableFbxUrl });
  return runGeneration('image', cacheKey, { mode: 'image', imageUrl, faceCount, enablePbr, enableFbxUrl }, null);
}

async function viewsTo3D(args: ViewsTo3DArgs): Promise<GenerateResult> {
  const front = args.views?.front_image_url?.trim();
  if (!front) {
    throw Object.assign(new Error('views.front_image_url is required'), { code: 'invalid_views' });
  }
  const faceCount = resolveFaceCount(args.targetPolycount);
  const enablePbr = args.enablePbr ?? true;
  const enableFbxUrl = args.enableFbxUrl ?? false;
  const normalizedViews: Record<string, string> = {};
  for (const [slot, url] of Object.entries(args.views)) {
    if (url && url.trim()) normalizedViews[slot] = url.trim();
  }
  const cacheKey = makeCacheKey('hunyuan_workflow', 'views', {
    ...normalizedViews,
    faceCount,
    enablePbr,
    enableFbxUrl,
  });
  return runGeneration(
    'views',
    cacheKey,
    { mode: 'views', views: normalizedViews as Partial<Record<ViewSlot, string>>, faceCount, enablePbr, enableFbxUrl },
    null,
  );
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
  'gen3d:pose-standardization': async (args: PoseStandardizationArgs) =>
    poseStandardization(args),
};

export default tools;
