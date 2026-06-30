import type { Gen3DAssetManifest } from '@shared/manifest';

// Primary entry modes (live in the setup sidebar). Secondary stages (refine /
// retexture / remesh) operate on an existing asset and live in the workspace.
export type PrimaryMode = 'text' | 'image' | 'views';

export interface ProviderCapabilityView {
  providerId: string;
  providerName: string;
  capability: string;
  sourceStatus: string;
  exposure: string;
  notes: string;
}

export interface ProviderStatus {
  ok: true;
  realProvidersEnabled: boolean;
  meshyConfigured: boolean;
  cosConfigured: boolean;
  quotaSafe: boolean;
  balance: number | null;
  generatedAt: string;
  rubric: string[];
  capabilities: ProviderCapabilityView[];
}

export interface GenerateResult {
  ok: true;
  cacheKey: string;
  cacheHit: boolean;
  usedMock: boolean;
  manifest: Gen3DAssetManifest;
}

export interface ListAssetsResult {
  ok: true;
  assets: Gen3DAssetManifest[];
}

export interface CredentialsState {
  ok: true;
  realProvidersEnabled: boolean;
  credentials: {
    MESHY_API_KEY: string | null;
    MESHY_BASE_URL: string | null;
    COS_SECRET_ID: string | null;
    COS_SECRET_KEY: string | null;
    COS_BUCKET: string | null;
    COS_REGION: string | null;
  };
}

export interface UploadImageResult {
  ok: true;
  url: string;
  bytes: number;
  sha256: string;
  expiresInSec: number;
}
