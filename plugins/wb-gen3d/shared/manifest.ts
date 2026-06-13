// Gen3DAssetManifest — the durable handoff contract between wb-gen3d and
// downstream modules (wb-3d-pipeline, game generation). See docs/adr/0002 and
// CONTEXT.md. M9: an Asset is a per-game file, keyed by its game-relative path
// (`assetPath`, e.g. assets/3d/characters/hero.glb), NOT a random UUID. The main
// GLB is the identity; same-basename sidefiles (preview PNG, external texture)
// are dependencies. Downstream modules reference assets by assetPath, never by
// provider URL.

export type ProviderId = 'meshy' | 'hunyuan_workflow' | 'hunyuan_rest' | 'rodin';

export type GenerationMode = 'text' | 'image' | 'views' | 'refine';

// Provider mode tag. `mock` marks no-quota deterministic fixtures so a manifest
// produced without a real call is never mistaken for a real generation.
export type ProviderMode = 'mock' | 'real';

export type AssetKind = 'mesh' | 'animation';

// Where the asset lands in the game's 3D asset tree. The value maps 1:1 to a
// directory under assets/3d/ (see ADR-0002 / 03-WORKSPACE-LAYOUT.md).
export type AssetSlot = 'characters' | 'meshes';

export const ASSET_SLOT_DIRS: Record<AssetSlot, string> = {
  characters: 'characters',
  meshes: 'meshes',
};

// Durable file roles. source_mesh/preview_image/texture come from generation;
// rigged_model/animation_clip/animated_model are appended by wb-3d-pipeline.
export type FileRole =
  | 'source_mesh'
  | 'rigged_model'
  | 'preview_image'
  | 'texture'
  | 'animation_clip'
  | 'animated_model';

export type FileFormat = 'glb' | 'fbx' | 'obj' | 'mtl' | 'usdz' | 'stl' | 'png' | 'jpg' | 'webp' | 'mp4';

export type SkeletonProfile = 'humanoid' | 'unknown';

// Motion type for animated_model files. Hunyuan motion_retarget v1 fixed motions
// are ints 9–16 (跨步/摔倒/跳跃/踢腿/挥击/步行/跑步/跳舞; see ADR-0003 §③). Stored
// structurally so idempotency / enumeration / downstream selection never parse
// file names.
export type MotionType = 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

export interface ManifestFile {
  fileId: string;
  role: FileRole;
  format: FileFormat;
  // Game-relative path of the on-disk file (e.g. assets/3d/characters/hero.glb).
  // The main source_mesh GLB path equals the manifest's assetPath identity.
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
  // For role=animated_model files: which motion_retarget v1 motion this clip is.
  // Structural (not parsed from the file name) so multiple motions coexist and
  // apply-motion stays idempotent per motion. Undefined for non-animated roles.
  motionType?: MotionType;
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
  // Canonical identity: the game-relative path of the main GLB (ADR-0002).
  assetPath: string;
  // The 3D asset slot this lives in (characters | meshes).
  assetSlot: AssetSlot;
  kind: AssetKind;
  provider: ProviderId;
  providerMode: ProviderMode;
  mode: GenerationMode;
  // Original provider job/task id, for audit. Not a stored-asset reference.
  sourceJobId: string | null;
  // Upstream asset paths consumed to produce this one (e.g. image→mesh).
  sourceInputAssetPaths: string[];
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

// ─── v2 workspace-contract sidecar (03-WORKSPACE-LAYOUT.md) ──────────────────
//
// On disk every asset file gets a `<name>.glb.meta.json` sidecar in the v2
// contract shape. gen3d-private fields (provider/mode/job/cacheKey/readiness…)
// live under `custom`. Same-basename sidefiles go in `dependencies[]`.

export interface SidecarDependency {
  // Path relative to the sidecar's directory (e.g. hero.png, hero.texture.png).
  path: string;
  // sha256:<hex>.
  hash: string;
  // Role of the dependency file (preview_image, texture, rigged_model, …).
  kind: string;
  // Rigging metadata for rigged_model / animated_model attached files, so
  // sidecarToManifest can restore them instead of writing hasSkeleton:false. Only
  // set by appendDerivedFiles (a verified rig step); generation never sets these.
  hasSkeleton?: boolean;
  skeletonProfile?: SkeletonProfile;
  animationInputReady?: boolean;
  // For animated_model deps: structural motion_retarget v1 motion (int 9–16).
  motionType?: MotionType;
}

export interface AssetSidecar {
  schemaVersion: 1;
  producer: {
    plugin: string;
    pluginVersion: string;
    pipelineId?: string;
  };
  createdAt: string;
  // sha256:<hex> of the main asset file.
  contentHash: string;
  size: number;
  // Asset type label (e.g. gen3d-character, gen3d-mesh).
  type: string;
  dependencies: SidecarDependency[];
  // gen3d-private namespace. Not part of the cross-plugin contract.
  custom: {
    provider: ProviderId;
    providerMode: ProviderMode;
    mode: GenerationMode;
    assetSlot: AssetSlot;
    sourceJobId: string | null;
    prompt: string | null;
    sourceInputAssetPaths: string[];
    faceCount?: number;
    readiness: Gen3DAssetManifest['readiness'];
    // The cacheKey that produced this asset, for delete→tombstone reverse lookup.
    cacheKey?: string;
  };
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
// of parsing file names or URLs. The main mesh is selectFile(files,
// 'source_mesh', 'glb'); the preview is selectFile(files, 'preview_image').
export function selectFile(
  files: readonly ManifestFile[],
  role: FileRole,
  format?: FileFormat,
): ManifestFile | null {
  return (
    files.find((file) => file.role === role && (format ? file.format === format : true)) ?? null
  );
}

// All files of a role (e.g. every animated_model clip), for enumeration. The UI
// lists existing motions from animated_model files' structural motionType.
export function selectFiles(
  files: readonly ManifestFile[],
  role: FileRole,
  format?: FileFormat,
): ManifestFile[] {
  return files.filter((file) => file.role === role && (format ? file.format === format : true));
}
