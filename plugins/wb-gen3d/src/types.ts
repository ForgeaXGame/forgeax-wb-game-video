// Shared UI-layer types for the wb-gen3d frontend. These mirror the tool result
// shapes returned by the gen3d:* tools (see server/tool-handlers.ts) and are the
// contract between App state and the split pane components. Business/manifest
// types live in @shared/manifest; these only describe the UI tool envelopes.
import type { Gen3DAssetManifest } from '@shared/manifest';

export type Mode = 'text' | 'image' | 'views';
export type GenProvider = 'hunyuan_workflow' | 'meshy' | 'rodin';

export interface ProviderStatus {
  ok: true;
  quotaSafe: boolean;
  realProvidersEnabled: boolean;
  generatedAt: string;
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

// gen3d:upload-image result. Local image hosted on COS (transfer artifact, not
// an asset). url is a time-limited presigned URL fed into image/views/pose
// inputs so URL-fetching providers can reach the file.
export interface UploadImageResult {
  ok: true;
  url: string;
  bytes: number;
  sha256: string;
  expiresInSec: number;
}
export interface PoseResult {
  ok: true;
  usedMock: boolean;
  sourceJobId: string | null;
  storageKey: string;
  bytes: number;
  sha256: string;
  localUrl: string | null;
  sourceUrl: string | null;
}
