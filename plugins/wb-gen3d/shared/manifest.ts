// Gen3DAssetManifest — the durable handoff contract between wb-gen3d and
// downstream modules (wb-3d-pipeline, game generation). See docs/adr/0001 and
// CONTEXT.md. Asset is a global, game-agnostic record keyed by a random
// assetId; downstream modules reference assets by assetId, never by provider URL.

export type ProviderId = 'meshy' | 'hunyuan_workflow' | 'hunyuan_rest' | 'rodin';

export type GenerationMode = 'text' | 'image' | 'views' | 'refine';

// Provider mode tag. `mock` marks no-quota deterministic fixtures so a manifest
// produced without a real call is never mistaken for a real generation.
export type ProviderMode = 'mock' | 'real';

export type AssetKind = 'mesh' | 'animation';

// Durable file roles. source_mesh/preview_image/texture come from generation;
// rigged_model/animation_clip/animated_model are appended by wb-3d-pipeline.
export type FileRole =
  | 'source_mesh'
  | 'rigged_model'
  | 'preview_image'
  | 'texture'
  | 'animation_clip'
  | 'animated_model';

export type FileFormat = 'glb' | 'fbx' | 'obj' | 'mtl' | 'usdz' | 'stl' | 'png' | 'jpg' | 'mp4';

export type SkeletonProfile = 'humanoid' | 'unknown';

export interface ManifestFile {
  fileId: string;
  role: FileRole;
  format: FileFormat;
  // Opaque storage key resolved by AssetStorage; never a provider URL.
  storageKey: string;
  bytes: number;
  sha256: string;
  // Same-origin Studio URL when the blob can be streamed locally. Preview/
  // download only; not assumed reachable by external providers.
  localUrl: string | null;
  // Rigging readiness. Only meaningful for role=rigged_model FBX inputs that
  // motion_retarget consumes. Plain mesh→fbx conversions stay hasSkeleton=false.
  hasSkeleton: boolean;
  skeletonProfile: SkeletonProfile;
  animationInputReady: boolean;
}

// Five-dimension quality rubric kept as null placeholders. Scoring is manual/
// out-of-band background knowledge per ADR-0001; not produced at generation time.
export interface QualityScore {
  geometry: number | null;
  topology: number | null;
  texture: number | null;
  pbr: number | null;
  prompt_fidelity: number | null;
  total: number | null;
}

export interface Gen3DAssetManifest {
  manifestVersion: 1;
  assetId: string;
  kind: AssetKind;
  provider: ProviderId;
  providerMode: ProviderMode;
  mode: GenerationMode;
  // Original provider job/task id, for audit. Not a stored-asset reference.
  sourceJobId: string | null;
  // Upstream asset ids consumed to produce this one (e.g. image→mesh, mesh→rig).
  sourceInputAssetIds: string[];
  prompt: string | null;
  files: ManifestFile[];
  // Readiness flags answer "what can downstream do with this asset".
  readiness: {
    hasSourceMesh: boolean;
    rigged: boolean;
    animated: boolean;
  };
  quality: QualityScore;
  createdAt: string;
  updatedAt: string;
}

export const FILE_ROLES: readonly FileRole[] = [
  'source_mesh',
  'rigged_model',
  'preview_image',
  'texture',
  'animation_clip',
  'animated_model',
];

export function emptyQuality(): QualityScore {
  return {
    geometry: null,
    topology: null,
    texture: null,
    pbr: null,
    prompt_fidelity: null,
    total: null,
  };
}

export function computeReadiness(files: readonly ManifestFile[]): Gen3DAssetManifest['readiness'] {
  return {
    hasSourceMesh: files.some((file) => file.role === 'source_mesh'),
    rigged: files.some((file) => file.role === 'rigged_model' && file.hasSkeleton),
    animated: files.some(
      (file) => file.role === 'animated_model' || file.role === 'animation_clip',
    ),
  };
}

// Resolve the single file a consumer wants by role (+ optional format), instead
// of parsing file names or URLs. motion_retarget uses this to require a rigged
// FBX: selectFile(files, 'rigged_model', 'fbx') plus animationInputReady.
export function selectFile(
  files: readonly ManifestFile[],
  role: FileRole,
  format?: FileFormat,
): ManifestFile | null {
  return (
    files.find((file) => file.role === role && (format ? file.format === format : true)) ?? null
  );
}
