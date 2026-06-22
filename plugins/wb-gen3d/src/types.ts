// Shared UI-layer types for the wb-gen3d frontend. These mirror the tool result
// shapes returned by the gen3d:* tools (see server/tool-handlers.ts) and are the
// contract between App state and the split pane components. Business/manifest
// types live in @shared/manifest; these only describe the UI tool envelopes.
import type { Gen3DAssetManifest, MotionSystem } from '@shared/manifest';

export type Mode = 'text' | 'image' | 'views';
export type GenProvider = 'hunyuan_workflow' | 'meshy' | 'rodin';

export interface ProviderStatus {
  ok: true;
  quotaSafe: boolean;
  realProvidersEnabled: boolean;
  generatedAt: string;
}

// gen3d:get-credentials / gen3d:set-credentials. Secret fields come back MASKED
// (e.g. "abcd...wxyz") or null when unset; HUNYUAN_BASE_URL is plaintext. The UI
// must NEVER echo a mask back as a real value (see CredentialsModal): only the
// fields the user actually edits are placed into the set-credentials patch.
export interface Gen3DCredentials {
  HUNYUAN_API_KEY: string | null;
  HUNYUAN_BASE_URL: string | null;
  MESHY_API_KEY: string | null;
  RODIN_API_KEY: string | null;
  COS_SECRET_ID: string | null;
  COS_SECRET_KEY: string | null;
  COS_BUCKET: string | null;
  COS_REGION: string | null;
}

// Shared return of both get-credentials and set-credentials (the refreshed
// masked state). Mirrors ProviderStatus's self-describing `ok: true` envelope.
export interface CredentialsState {
  ok: true;
  realProvidersEnabled: boolean;
  credentials: Gen3DCredentials;
}

// set-credentials patch: only user-touched fields are present. '' clears a
// field; GEN3D_ENABLE_REAL_PROVIDERS is sent on every save ('1' real / '0' mock).
export interface CredentialsPatch {
  GEN3D_ENABLE_REAL_PROVIDERS?: '0' | '1';
  HUNYUAN_API_KEY?: string;
  HUNYUAN_BASE_URL?: string;
  MESHY_API_KEY?: string;
  RODIN_API_KEY?: string;
  COS_SECRET_ID?: string;
  COS_SECRET_KEY?: string;
  COS_BUCKET?: string;
  COS_REGION?: string;
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

// gen3d:auto-rig / gen3d:apply-motion result. Both append derived files to an
// existing asset (the main GLB identity is unchanged) and return the updated
// manifest, so the UI re-selects it by the same assetPath.
export interface RigMotionResult {
  ok: true;
  usedMock: boolean;
  assetPath: string;
  manifest: Gen3DAssetManifest;
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

export interface ScoreQualityResult {
  ok: true;
  usedMock: boolean;
  manifest: Gen3DAssetManifest;
}

// gen3d:list-motions — one selectable motion across systems, mirroring
// server/motion-catalog.ts MotionOption. Rich metadata (category/rigType/isFree/
// preview gif) is resolved on demand by (system,id) and never persisted onto an
// asset (the manifest stores only the minimal MotionRef {system,id,label}).
export interface MotionOption {
  system: MotionSystem;
  id: number | string;
  label: string;
  category: string | null;
  rigType: string | null;
  isFree: boolean;
  previewGifUrl: string | null;
}

// gen3d:list-motions result. usedMock=true → a deterministic offline sample
// (Meshy unconfigured, the dev default). system reflects the asset's rig system:
// a Hunyuan-rigged asset returns the v1 fixed 8; a Meshy-rigged asset returns
// its catalog. The browser may also filter the motions client-side for snappy typing.
export interface ListMotionsResult {
  ok: true;
  usedMock: boolean;
  system: MotionSystem;
  total: number;
  motions: MotionOption[];
}

// Descriptor the motion browser hands back to apply-motion. App maps it to the
// right tool arg by system: hunyuan_v1 → { motionType }, meshy → { actionId, label }.
export interface ApplyMotionInput {
  system: MotionSystem;
  id: number;
  label: string;
}
