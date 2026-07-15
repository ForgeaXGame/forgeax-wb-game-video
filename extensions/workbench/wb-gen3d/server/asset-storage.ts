// AssetStorage — adapter boundary for durable per-game 3D asset persistence.
//
// M9 (ADR-0002): an asset is a named file in the active game's runtime asset
// library, identified by its game-relative path (assetPath). The adapter owns
// all path logic (write file + sidecar, list, delete, name collision) so a
// future path change touches one place. It does NOT know which provider
// produced an asset (decoupling rule, ADR-0001). The local impl writes to
// .forgeax/games/<slug>/assets/3d/{characters|meshes}/; a future COS/S3 adapter
// could swap without changing this interface or the manifest contract.

import type { AssetSlot, FileFormat, FileRole, Gen3DAssetManifest, MotionRef, QualityReport, RigChain, SkeletonProfile } from '../shared/manifest';

// One produced file (already downloaded into bytes; never a provider URL).
export interface AssetFileInput {
  data: Uint8Array;
  format: FileFormat;
  role: FileRole;
}

export interface WriteAssetInput {
  slug: string;
  assetSlot: AssetSlot;
  // Desired base name (without extension). The store sanitizes it and, on a
  // non-cache name collision, appends a numeric suffix instead of overwriting.
  assetName: string;
  files: AssetFileInput[];
  // gen3d-private metadata persisted under the sidecar `custom` namespace.
  meta: {
    provider: Gen3DAssetManifest['provider'];
    providerMode: Gen3DAssetManifest['providerMode'];
    mode: Gen3DAssetManifest['mode'];
    sourceJobId: string | null;
    prompt: string | null;
    sourceInputAssetPaths: string[];
    faceCount?: number;
    cacheKey?: string;
  };
}

export interface AssetStorage {
  // Persist a full asset (main GLB + same-basename sidefiles + sidecar) into the
  // game's asset tree and return the resulting manifest (assetPath = main GLB).
  writeAsset(input: WriteAssetInput): Promise<Gen3DAssetManifest>;
  // Load a manifest by game-relative assetPath (reads the sidecar).
  getAsset(slug: string, assetPath: string): Promise<Gen3DAssetManifest | null>;
  // List manifests in a game, optionally filtered by slot (scans the directory).
  listAssets(slug: string, assetSlot?: AssetSlot): Promise<Gen3DAssetManifest[]>;
  // Delete the asset file + sidecar + same-basename sidefiles. Returns the
  // cacheKey recorded in the sidecar (for a cache tombstone) or null.
  deleteAsset(slug: string, assetPath: string): Promise<{ cacheKey: string | null }>;
  // Append derived files (rigged_model / animated_model GLB+FBX) to an existing
  // mesh asset as same-basename sidefiles, update the sidecar dependencies +
  // skeleton/motion metadata, recompute readiness, and return the updated
  // manifest. Serialized per asset (read-modify-write) so concurrent appends to
  // one character (e.g. multiple motions) never drop entries (ADR-0003). The
  // main GLB identity (assetPath) is unchanged.
  appendDerivedFiles(input: AppendDerivedFilesInput): Promise<Gen3DAssetManifest>;
  // Persist the five-dimension quality report into the asset sidecar
  // (custom.quality) and return the refreshed manifest.
  updateAssetQuality(
    slug: string,
    assetPath: string,
    report: QualityReport,
  ): Promise<Gen3DAssetManifest>;
  // Persist a user-defined display label into the asset sidecar
  // (custom.userLabel) and return the refreshed manifest.
  updateAssetLabel(
    slug: string,
    assetPath: string,
    label: string | null,
  ): Promise<Gen3DAssetManifest>;
  // Read the bytes of one file in an asset, selected by role (+ optional format),
  // for COS-sharing it as a provider transfer URL. Returns null when absent.
  readAssetFile(
    slug: string,
    assetPath: string,
    role: FileRole,
    format?: FileFormat,
  ): Promise<{ data: Uint8Array; format: FileFormat } | null>;
  // Persist a transfer/scratch artifact (pose-standardized image, uploaded
  // input). NOT an asset: lives under .gen3d/tmp/, no manifest, no delete UI.
  putScratch(input: PutScratchInput): Promise<PutScratchResult>;
}

// One derived file to append to an existing asset. Bytes already downloaded.
export interface DerivedFileInput {
  data: Uint8Array;
  format: FileFormat;
  // rigged_model | animated_model (the appended downstream roles).
  role: FileRole;
  // For animated_model files: which motion this clip is (any system). Stored
  // structurally + used as the on-disk file-name variant for readability. A
  // single append may carry several files with different motionRefs (e.g. a rig
  // step that also lands the free walk/run clips, ADR-0006 §8-Q6).
  motionRef?: MotionRef;
}

export interface AppendDerivedFilesInput {
  slug: string;
  // Target mesh asset to append onto (its main GLB stays the identity).
  assetPath: string;
  files: DerivedFileInput[];
  // Skeleton metadata applied to rigged_model files (a verified rig step).
  skeleton?: {
    hasSkeleton: boolean;
    skeletonProfile: SkeletonProfile;
    animationInputReady: boolean;
  };
  // Rig-chain identity (provider + Meshy rig_task_id + rigType + expiry),
  // persisted on the asset so apply-motion can dispatch by system (ADR-0006).
  rigChain?: RigChain;
}

// Scratch (transfer) artifacts — pose-standardized images, uploaded inputs. NOT
// assets: they live under .forgeax/games/<slug>/.gen3d/tmp/, never in the asset
// library, and have no delete UI (CONTEXT.md "临时/中转产物").
export interface PutScratchInput {
  slug: string;
  data: Uint8Array;
  format: FileFormat;
}

export interface PutScratchResult {
  // Scratch storage key (relative to the project root) for same-origin preview.
  storageKey: string;
  sha256: string;
  bytes: number;
  localUrl: string | null;
}
