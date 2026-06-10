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

export const tools = {
  'gen3d:provider-status': async () => getProviderStatus(),
  'gen3d:list-assets': async (args: ListAssetsArgs = {}) => listAssets(args),
  'gen3d:generate-meshy-text-mock': async (args: MeshyTextMockArgs) => generateMeshyTextMock(args),
  'gen3d:text-to-3d': async (args: TextTo3DArgs) => textTo3D(args),
  'gen3d:image-to-3d': async (args: ImageTo3DArgs) => imageTo3D(args),
  'gen3d:views-to-3d': async (args: ViewsTo3DArgs) => viewsTo3D(args),
};

export default tools;
