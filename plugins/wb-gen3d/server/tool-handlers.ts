import {
  CAPABILITIES,
  QUALITY_RUBRIC,
  generateMeshyTextMockResult,
  type MeshyTextMockArgs,
} from '../shared/catalog';
import type { Gen3DAssetManifest, ProviderId } from '../shared/manifest';
import type { AssetStorage } from './asset-storage';
import { LocalBlobStore } from './local-blob-store';
import { persistGeneration } from './generate';

// Single dev-time storage adapter. Swap for a COS/S3/R2/MinIO adapter in
// production without changing the tool contracts.
const storage: AssetStorage = new LocalBlobStore();

interface ProviderStatusResult {
  ok: true;
  quotaSafe: true;
  generatedAt: string;
  rubric: readonly string[];
  capabilities: typeof CAPABILITIES;
}

function getProviderStatus(): ProviderStatusResult {
  return {
    ok: true,
    quotaSafe: true,
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

export const tools = {
  'gen3d:provider-status': async () => getProviderStatus(),
  'gen3d:list-assets': async (args: ListAssetsArgs = {}) => listAssets(args),
  'gen3d:generate-meshy-text-mock': async (args: MeshyTextMockArgs) => generateMeshyTextMock(args),
};

export default tools;
