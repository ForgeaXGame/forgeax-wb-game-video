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

// gen3d:get-credentials / gen3d:set-credentials. COS secret fields come back MASKED
// (e.g. "abcd...wxyz") or null when unset. LiteLLM gateway key is read-only from
// Studio Settings (litellmConfigured / litellmProxyKey on CredentialsState).
export interface Gen3DCredentials {
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
  litellmConfigured: boolean;
  litellmProxyKey: string | null;
  credentials: Gen3DCredentials;
}

// set-credentials patch: only user-touched plugin-local fields. LiteLLM keys are
// managed in Studio Settings and are silently ignored if sent.
export interface CredentialsPatch {
  GEN3D_ENABLE_REAL_PROVIDERS?: '0' | '1';
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

// gen3d:engine-import-status / gen3d:import-to-engine (props/mesh only; ROLE1
// rejects character assets — see server/engine-import.ts).
export interface EngineImportStatus {
  ok: true;
  imported: boolean;
  needsManualImport: boolean;
  needsDracoNormalize: boolean;
  engineMetaPath: string | null;
  sourceHash: string | null;
  importedAt: string | null;
  message: string;
  retryable: boolean;
}

export type EngineImportResult =
  | {
      ok: true;
      firstImport: boolean;
      normalizedDraco: boolean;
      reusedGuidCount: number;
      engineMetaPath: string;
      assetPath: string;
      message: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      retryable: boolean;
    };

export type ExportPlayableResult =
  | {
      ok: true;
      firstExport: boolean;
      modelPath: string;
      metaPath: string;
      playablePath: string;
      localUrl: string;
      clipCount: number;
      reusedGuidCount: number;
      message: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      missingSlots?: string[];
      retryable: boolean;
    };

export interface PlayableMotionSlot {
  slotId: string;
  displayName: string;
  required: boolean;
  playbackMode: 'loop' | 'once' | 'freeze_frame';
  speed: number;
  matchKeywords: string[];
  rootMotion: 'preserve' | 'remove_xz' | 'remove_xyz';
}

export interface PlayableProfilePreset {
  profileId: string;
  displayName: string;
  slots: PlayableMotionSlot[];
}

export interface PlayableDeliverySnapshot {
  modelPath: string;
  playablePath: string;
  profileId: string;
  profileVersion: number;
  clipSlotIds?: string[];
  slotGuidRegistry: Record<string, string>;
  mappingFingerprint: string;
  exportedAt: string;
  localUrl: string;
}

export interface AdoptClipInfo {
  name: string;
  guid: string;
  sourceIndex: number;
}

export interface AdoptCandidate {
  modelPath: string;
  metaPath: string;
  playablePath: string;
  localUrl: string;
  clips: AdoptClipInfo[];
}

export type AdoptPlayableResult =
  | {
      ok: true;
      modelPath: string;
      playablePath: string;
      localUrl: string;
      reusedGuidCount: number;
      clipCount: number;
      message: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      retryable: boolean;
    };

export interface PlayableProfileResult {
  ok: true;
  presets: PlayableProfilePreset[];
  gameProfile: {
    profileId: string;
    profileVersion: number;
    displayName: string;
    slots: PlayableMotionSlot[];
  } | null;
  effectiveSlots: PlayableMotionSlot[];
  override: {
    slots: PlayableMotionSlot[];
    basedOnProfileId: string;
    basedOnProfileVersion: number;
  } | null;
  mapping: { schemaVersion: 1; mappings: Array<{ slotId: string; motionRefKey: string | null; autoMatched: boolean }>; confirmed: boolean; updatedAt: string } | null;
  delivery: PlayableDeliverySnapshot | null;
  oneClickReady: boolean;
  migrationNeeded: boolean;
  adoptCandidate: AdoptCandidate | null;
}
