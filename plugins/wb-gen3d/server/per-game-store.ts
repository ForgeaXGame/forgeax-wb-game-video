// PerGameAssetStore — dev-time AssetStorage backed by the local filesystem,
// per-game (ADR-0002 / 03-WORKSPACE-LAYOUT.md).
//
// Layout (active game's runtime asset library):
//   <projectRoot>/.forgeax/games/<slug>/assets/3d/{characters|meshes}/<name>.glb
//   <projectRoot>/.forgeax/games/<slug>/assets/3d/{characters|meshes}/<name>.glb.gen3d-meta.json
//   <projectRoot>/.forgeax/games/<slug>/assets/3d/{characters|meshes}/<name>.png          (preview)
//   <projectRoot>/.forgeax/games/<slug>/assets/3d/{characters|meshes}/<name>.texture.png  (external texture)
//
// Identity is the game-relative path of the main GLB. The on-disk sidecar uses
// the v2 workspace contract (schemaVersion/producer/dependencies[]/custom{}).
// gen3d-private fields live under `custom`. The runtime mechanism (kernel
// writeAsset/_index.json/path-slots) is known debt, not built here — we align
// the disk FORMAT only (ADR-0002 §"已知债务").
//
// OBJ source_mesh is dropped by default: only the GLB main mesh is kept.

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  ASSET_SLOT_DIRS,
  MESHY_FREE_RUN_ID,
  MESHY_FREE_WALK_ID,
  computeReadiness,
  emptyQuality,
  motionRefFromLegacy,
  reportToScore,
  type AssetSidecar,
  type AssetSlot,
  type FileFormat,
  type FileRole,
  type Gen3DAssetManifest,
  type ManifestFile,
  type MotionRef,
  type MotionType,
  type QualityReport,
  type SidecarDependency,
  type SkeletonProfile,
} from '../shared/manifest';
import type {
  AppendDerivedFilesInput,
  AssetFileInput,
  AssetStorage,
  PutScratchInput,
  PutScratchResult,
  WriteAssetInput,
} from './asset-storage';

const PLUGIN_ID = 'wb-gen3d';
const PLUGIN_VERSION = '0.1.0';

/** Gen3d provenance sidecar — NOT engine pack `*.meta.json` (pack scanner collision). */
export const GEN3D_SIDECAR_SUFFIX = '.glb.gen3d-meta.json';

function sidecarAbsForGlbFile(dir: string, glbFileName: string): string {
  return resolve(dir, `${glbFileName}.gen3d-meta.json`);
}

function legacySidecarAbsForGlbFile(dir: string, glbFileName: string): string {
  return resolve(dir, `${glbFileName}.meta.json`);
}

/**
 * Resolve the on-disk sidecar, migrating legacy `*.glb.meta.json` →
 * `*.glb.gen3d-meta.json` when found. Legacy names collide with the engine
 * pack scanner (`endsWith('.meta.json')` → pack-malformed-meta → whole-pack
 * fail → demo-scene fallback), so migration must run on read/list, not only
 * on the next write.
 */
async function resolveExistingSidecarAbs(dir: string, glbFileName: string): Promise<string | null> {
  const newAbs = sidecarAbsForGlbFile(dir, glbFileName);
  const legacyAbs = legacySidecarAbsForGlbFile(dir, glbFileName);

  let hasNew = false;
  try {
    await access(newAbs);
    hasNew = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  let hasLegacy = false;
  try {
    await access(legacyAbs);
    hasLegacy = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  if (hasNew) {
    if (hasLegacy) await rm(legacyAbs, { force: true });
    return newAbs;
  }

  if (hasLegacy) {
    const raw = await readFile(legacyAbs, 'utf8');
    await writeFile(newAbs, raw.endsWith('\n') ? raw : `${raw}\n`, 'utf8');
    await rm(legacyAbs, { force: true });
    return newAbs;
  }

  return null;
}

async function writeSidecarJson(
  dir: string,
  glbFileName: string,
  sidecar: AssetSidecar,
): Promise<void> {
  const newAbs = sidecarAbsForGlbFile(dir, glbFileName);
  await writeFile(newAbs, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
  await rm(legacySidecarAbsForGlbFile(dir, glbFileName), { force: true });
}

function projectRoot(): string {
  // Match the marketplace convention (see node-editor runtime.ts).
  return process.env.FORGEAX_PROJECT_ROOT ?? resolve(process.cwd(), '.forgeax-runtime');
}

// Reject path segments that would escape their parent. Mirrors the server's
// PathManager.safeSegment so slug handling is consistent on both sides.
function safeSlug(slug: string): string {
  if (!slug || slug.includes('/') || slug.includes('\\') || slug === '..' || slug.includes('\0')) {
    throw Object.assign(new Error(`unsafe slug ${JSON.stringify(slug)}`), { code: 'invalid_slug' });
  }
  return slug;
}

function gameRoot(slug: string): string {
  return resolve(projectRoot(), '.forgeax', 'games', safeSlug(slug));
}

function slotDir(slug: string, slot: AssetSlot): string {
  return resolve(gameRoot(slug), 'assets', '3d', ASSET_SLOT_DIRS[slot]);
}

// Game-relative path of a file in a slot (forward slashes; this is the asset id).
function relPath(slot: AssetSlot, fileName: string): string {
  return `assets/3d/${ASSET_SLOT_DIRS[slot]}/${fileName}`;
}

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

// Sanitize a user/AI base name into a safe lowercase file stem. Falls back to a
// generic stem when the input has no usable characters.
function sanitizeBaseName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned || 'asset';
}

const LOCAL_URL_PREFIX = '/api/game-assets';
const SCRATCH_URL_PREFIX = '/api/gen3d-scratch';

// Process-local per-asset async lock. appendDerivedFiles / deleteAsset do a
// read-modify-write on one asset's sidecar; concurrent appends to the same
// character (e.g. several motions at once) would otherwise drop entries / leave
// orphan files (ADR-0003). Keyed by `${slug}:${assetPath}`; unrelated assets
// stay parallel.
const assetLocks = new Map<string, Promise<unknown>>();

async function withAssetLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = assetLocks.get(key) ?? Promise.resolve();
  // Serialize: run after the previous holder settles (ignore its outcome).
  const run = prev.then(fn, fn);
  // Track this run as the tail so the next caller chains after it. Swallow
  // rejection on the tracked promise so one failure can't reject the chain.
  assetLocks.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function localUrlFor(slug: string, rel: string): string {
  // rel is "assets/3d/<slot>/<file>"; the route mounts at .../assets/3d/.
  const tail = rel.replace(/^assets\/3d\//, '');
  return `${LOCAL_URL_PREFIX}/${encodeURIComponent(slug)}/3d/${tail}`;
}

function scratchUrlFor(slug: string, sha256: string, format: FileFormat): string {
  return `${SCRATCH_URL_PREFIX}/${encodeURIComponent(slug)}/${sha256}.${format}`;
}

// One generation may return several files. Keep exactly one main GLB
// (source_mesh) as identity; OBJ source_mesh is dropped. The remaining files
// become same-basename sidefiles: preview_image → <name>.<fmt> (png/jpg/webp),
// texture → <name>.texture.png, any other → <name>.<role>.<ext>.
interface PlannedFile {
  input: AssetFileInput;
  fileName: string;
  isMain: boolean;
}

function planFiles(baseName: string, files: readonly AssetFileInput[]): PlannedFile[] {
  const main = files.find((f) => f.role === 'source_mesh' && f.format === 'glb');
  if (!main) {
    throw Object.assign(new Error('no GLB source_mesh in generation result'), {
      code: 'no_main_mesh',
    });
  }
  const planned: PlannedFile[] = [{ input: main, fileName: `${baseName}.glb`, isMain: true }];
  for (const f of files) {
    if (f === main) continue;
    // Drop OBJ/MTL source_mesh sidefiles: GLB only (ADR-0002).
    if (f.role === 'source_mesh') continue;
    let fileName: string;
    if (f.role === 'preview_image') fileName = `${baseName}.${f.format}`;
    else if (f.role === 'texture') fileName = `${baseName}.texture.${f.format}`;
    else fileName = `${baseName}.${f.role}.${f.format}`;
    planned.push({ input: f, fileName, isMain: false });
  }
  return planned;
}

export class PerGameAssetStore implements AssetStorage {
  // Pick a non-colliding base name. Caller passes the desired name; on a name
  // collision (a different request produced the same name) we suffix -2, -3, …
  // rather than overwrite. Cache hits never reach here (the orchestrator returns
  // the existing asset before writing).
  private async resolveFreeName(slug: string, slot: AssetSlot, desired: string): Promise<string> {
    const base = sanitizeBaseName(desired);
    const dir = slotDir(slug, slot);
    let existing: Set<string>;
    try {
      existing = new Set(await readdir(dir));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return base;
      throw error;
    }
    if (!existing.has(`${base}.glb`)) return base;
    for (let i = 2; i < 1000; i += 1) {
      if (!existing.has(`${base}-${i}.glb`)) return `${base}-${i}`;
    }
    return `${base}-${Date.now()}`;
  }

  async writeAsset(input: WriteAssetInput): Promise<Gen3DAssetManifest> {
    const { slug, assetSlot, meta } = input;
    const baseName = await this.resolveFreeName(slug, assetSlot, input.assetName);
    const dir = slotDir(slug, assetSlot);
    await mkdir(dir, { recursive: true });

    const planned = planFiles(baseName, input.files);
    const now = new Date().toISOString();
    const manifestFiles: ManifestFile[] = [];
    const dependencies: SidecarDependency[] = [];
    let mainRel = '';
    let mainSha = '';
    let mainBytes = 0;

    for (const p of planned) {
      const abs = resolve(dir, p.fileName);
      await writeFile(abs, p.input.data);
      const sha256 = sha256Hex(p.input.data);
      const rel = relPath(assetSlot, p.fileName);
      const bytes = p.input.data.byteLength;
      const isRiggedFbx = p.input.role === 'rigged_model' && p.input.format === 'fbx';
      manifestFiles.push({
        fileId: rel,
        role: p.input.role,
        format: p.input.format,
        storageKey: rel,
        bytes,
        sha256,
        localUrl: localUrlFor(slug, rel),
        // Generation never produces a verified skeleton; only a verified rigging
        // step in wb-3d-pipeline may set these (never inferred here).
        hasSkeleton: false,
        skeletonProfile: isRiggedFbx ? 'unknown' : 'unknown',
        animationInputReady: false,
      });
      if (p.isMain) {
        mainRel = rel;
        mainSha = sha256;
        mainBytes = bytes;
      } else {
        dependencies.push({ path: p.fileName, hash: `sha256:${sha256}`, kind: p.input.role });
      }
    }

    const readiness = computeReadiness(manifestFiles);
    const sidecar: AssetSidecar = {
      schemaVersion: 1,
      producer: { plugin: PLUGIN_ID, pluginVersion: PLUGIN_VERSION },
      createdAt: now,
      contentHash: `sha256:${mainSha}`,
      size: mainBytes,
      type: assetSlot === 'characters' ? 'gen3d-character' : 'gen3d-mesh',
      dependencies,
      custom: {
        provider: meta.provider,
        providerMode: meta.providerMode,
        mode: meta.mode,
        assetSlot,
        sourceJobId: meta.sourceJobId,
        prompt: meta.prompt,
        sourceInputAssetPaths: meta.sourceInputAssetPaths,
        ...(meta.faceCount !== undefined ? { faceCount: meta.faceCount } : {}),
        readiness,
        ...(meta.cacheKey ? { cacheKey: meta.cacheKey } : {}),
      },
    };
    await writeSidecarJson(dir, `${baseName}.glb`, sidecar);

    return {
      manifestVersion: 1,
      assetPath: mainRel,
      assetSlot,
      kind: 'mesh',
      provider: meta.provider,
      providerMode: meta.providerMode,
      mode: meta.mode,
      sourceJobId: meta.sourceJobId,
      sourceInputAssetPaths: meta.sourceInputAssetPaths,
      prompt: meta.prompt,
      files: manifestFiles,
      readiness,
      quality: emptyQuality(),
      targetFaceCount: meta.faceCount ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getAsset(slug: string, assetPath: string): Promise<Gen3DAssetManifest | null> {
    const { slot, fileName } = parseAssetPath(assetPath);
    if (!slot) return null;
    const dir = slotDir(slug, slot);
    const sidecarAbs = await resolveExistingSidecarAbs(dir, fileName);
    if (!sidecarAbs) return null;
    let raw: string;
    try {
      raw = await readFile(sidecarAbs, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const sidecar = JSON.parse(raw) as AssetSidecar;
    return sidecarToManifest(slug, slot, fileName, sidecar);
  }

  async listAssets(slug: string, assetSlot?: AssetSlot): Promise<Gen3DAssetManifest[]> {
    const slots: AssetSlot[] = assetSlot ? [assetSlot] : ['characters', 'meshes'];
    const out: Gen3DAssetManifest[] = [];
    for (const slot of slots) {
      const dir = slotDir(slug, slot);
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      const seen = new Set<string>();
      for (const name of entries) {
        let fileName: string | null = null;
        if (name.endsWith('.glb.gen3d-meta.json')) {
          fileName = name.replace(/\.gen3d-meta\.json$/, '');
        } else if (name.endsWith('.glb.meta.json')) {
          fileName = name.replace(/\.meta\.json$/, '');
        } else {
          continue;
        }
        if (seen.has(fileName)) continue;
        seen.add(fileName);
        const manifest = await this.getAsset(slug, relPath(slot, fileName));
        if (manifest) out.push(manifest);
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteAsset(slug: string, assetPath: string): Promise<{ cacheKey: string | null }> {
    return withAssetLock(`${slug}:${assetPath}`, async () => {
      const { slot, fileName } = parseAssetPath(assetPath);
      if (!slot) return { cacheKey: null };
      const dir = slotDir(slug, slot);
      const sidecarAbs = await resolveExistingSidecarAbs(dir, fileName);

      let cacheKey: string | null = null;
      let deps: SidecarDependency[] = [];
      if (sidecarAbs) {
        try {
          const sidecar = JSON.parse(await readFile(sidecarAbs, 'utf8')) as AssetSidecar;
          cacheKey = sidecar.custom?.cacheKey ?? null;
          deps = sidecar.dependencies ?? [];
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }

      // Remove main GLB + sidecar(s) + every same-basename sidefile.
      await rm(resolve(dir, fileName), { force: true });
      await rm(sidecarAbsForGlbFile(dir, fileName), { force: true });
      await rm(legacySidecarAbsForGlbFile(dir, fileName), { force: true });
      for (const dep of deps) {
        await rm(resolve(dir, dep.path), { force: true });
      }
      return { cacheKey };
    });
  }

  // ─── Append derived files (rig / motion) to an existing mesh asset ─────────
  async appendDerivedFiles(input: AppendDerivedFilesInput): Promise<Gen3DAssetManifest> {
    const { slug, assetPath } = input;
    return withAssetLock(`${slug}:${assetPath}`, async () => {
      const { slot, fileName } = parseAssetPath(assetPath);
      if (!slot) {
        throw Object.assign(new Error(`unrecognized assetPath ${JSON.stringify(assetPath)}`), {
          code: 'invalid_asset_path',
        });
      }
      const dir = slotDir(slug, slot);
      const sidecarAbs = await resolveExistingSidecarAbs(dir, fileName);
      if (!sidecarAbs) {
        throw Object.assign(new Error(`asset not found: ${assetPath}`), { code: 'asset_not_found' });
      }
      let sidecar: AssetSidecar;
      try {
        sidecar = JSON.parse(await readFile(sidecarAbs, 'utf8')) as AssetSidecar;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw Object.assign(new Error(`asset not found: ${assetPath}`), { code: 'asset_not_found' });
        }
        throw error;
      }

      const baseName = fileName.replace(/\.glb$/, '');
      const deps = [...(sidecar.dependencies ?? [])];

      for (const f of input.files) {
        // <base>.<role>[.motion-<system>-<id>].<format> as a same-basename
        // sidefile. The motion variant is per-file so one append can land the
        // rigged model AND its bundled free clips together (ADR-0006 §8-Q6).
        const variant = f.motionRef ? `.motion-${motionVariantSlug(f.motionRef)}` : '';
        const depFileName = `${baseName}.${f.role}${variant}.${f.format}`;
        const abs = resolve(dir, depFileName);
        await writeFile(abs, f.data);
        const sha256 = sha256Hex(f.data);
        // Replace any existing dep with the same on-disk path (idempotent re-run).
        const idx = deps.findIndex((d) => d.path === depFileName);
        const dep: SidecarDependency = {
          path: depFileName,
          hash: `sha256:${sha256}`,
          kind: f.role,
          ...(f.role === 'rigged_model' && input.skeleton
            ? {
                hasSkeleton: input.skeleton.hasSkeleton,
                skeletonProfile: input.skeleton.skeletonProfile,
                animationInputReady: input.skeleton.animationInputReady,
              }
            : {}),
          ...(f.role === 'animated_model' && f.motionRef
            ? {
                motionRef: f.motionRef,
                // Legacy mirror so pre-motionRef readers still see hunyuan_v1.
                ...(f.motionRef.system === 'hunyuan_v1' ? { motionType: f.motionRef.id } : {}),
              }
            : {}),
        };
        if (idx >= 0) deps[idx] = dep;
        else deps.push(dep);
      }

      const now = new Date().toISOString();
      const updated: AssetSidecar = {
        ...sidecar,
        dependencies: deps,
        custom: {
          ...sidecar.custom,
          // Persist rig-chain identity so apply-motion can dispatch by system
          // and read the Meshy rig_task_id (ADR-0006 §Decision 3).
          ...(input.rigChain ? { rig: input.rigChain } : {}),
        },
      };
      // Recompute readiness from the full file set (main + deps).
      const manifest = sidecarToManifest(slug, slot, fileName, updated);
      updated.custom = { ...updated.custom, readiness: manifest.readiness };
      await writeSidecarJson(dir, fileName, updated);
      return { ...manifest, updatedAt: now };
    });
  }

  // ─── User label (display name) ────────────────────────────────────────────
  async updateAssetLabel(
    slug: string,
    assetPath: string,
    label: string | null,
  ): Promise<Gen3DAssetManifest> {
    return withAssetLock(`${slug}:${assetPath}`, async () => {
      const { slot, fileName } = parseAssetPath(assetPath);
      if (!slot) {
        throw Object.assign(new Error(`unrecognized assetPath ${JSON.stringify(assetPath)}`), {
          code: 'invalid_asset_path',
        });
      }
      const dir = slotDir(slug, slot);
      const sidecarAbs = await resolveExistingSidecarAbs(dir, fileName);
      if (!sidecarAbs) {
        throw Object.assign(new Error(`asset not found: ${assetPath}`), { code: 'asset_not_found' });
      }
      let sidecar: AssetSidecar;
      try {
        sidecar = JSON.parse(await readFile(sidecarAbs, 'utf8')) as AssetSidecar;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw Object.assign(new Error(`asset not found: ${assetPath}`), { code: 'asset_not_found' });
        }
        throw error;
      }
      const trimmed = label?.trim() || null;
      const updated: AssetSidecar = {
        ...sidecar,
        custom: { ...sidecar.custom, userLabel: trimmed },
      };
      await writeSidecarJson(dir, fileName, updated);
      return sidecarToManifest(slug, slot, fileName, updated);
    });
  }

  // ─── Lazy quality persistence (ADR-0004) ──────────────────────────────────
  async updateAssetQuality(
    slug: string,
    assetPath: string,
    report: QualityReport,
  ): Promise<Gen3DAssetManifest> {
    return withAssetLock(`${slug}:${assetPath}`, async () => {
      const { slot, fileName } = parseAssetPath(assetPath);
      if (!slot) {
        throw Object.assign(new Error(`unrecognized assetPath ${JSON.stringify(assetPath)}`), {
          code: 'invalid_asset_path',
        });
      }
      const dir = slotDir(slug, slot);
      const sidecarAbs = await resolveExistingSidecarAbs(dir, fileName);
      if (!sidecarAbs) {
        throw Object.assign(new Error(`asset not found: ${assetPath}`), { code: 'asset_not_found' });
      }
      let sidecar: AssetSidecar;
      try {
        sidecar = JSON.parse(await readFile(sidecarAbs, 'utf8')) as AssetSidecar;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw Object.assign(new Error(`asset not found: ${assetPath}`), { code: 'asset_not_found' });
        }
        throw error;
      }
      const updated: AssetSidecar = {
        ...sidecar,
        custom: { ...sidecar.custom, quality: report },
      };
      await writeSidecarJson(dir, fileName, updated);
      return sidecarToManifest(slug, slot, fileName, updated);
    });
  }

  // Read one file in an asset by role (+ optional format), for COS-sharing it as
  // a provider transfer URL. The main mesh is (source_mesh, glb); rig/anim files
  // are same-basename sidefiles recorded in the sidecar dependencies.
  async readAssetFile(
    slug: string,
    assetPath: string,
    role: FileRole,
    format?: FileFormat,
  ): Promise<{ data: Uint8Array; format: FileFormat } | null> {
    const manifest = await this.getAsset(slug, assetPath);
    if (!manifest) return null;
    const file = manifest.files.find(
      (f) => f.role === role && (format ? f.format === format : true),
    );
    if (!file) return null;
    const { slot } = parseAssetPath(file.storageKey);
    if (!slot) return null;
    // storageKey is "assets/3d/<slot>/<fileName>"; read by file name in the dir.
    const fileName = file.storageKey.replace(/^assets\/3d\/[^/]+\//, '');
    const abs = resolve(slotDir(slug, slot), fileName);
    try {
      const data = await readFile(abs);
      return { data: new Uint8Array(data), format: file.format };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  // ─── Scratch (transfer) artifacts — NOT assets ────────────────────────────
  async putScratch(input: PutScratchInput): Promise<PutScratchResult> {
    const sha256 = sha256Hex(input.data);
    const rel = `.gen3d/tmp/${sha256}.${input.format}`;
    const abs = resolve(gameRoot(input.slug), rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, input.data);
    // Scratch lives under .gen3d/tmp/ (not assets/3d/**). Preview via /api/gen3d-scratch.
    return {
      storageKey: rel,
      sha256,
      bytes: input.data.byteLength,
      localUrl: scratchUrlFor(input.slug, sha256, input.format),
    };
  }
}

// Stable, readable on-disk file-name variant for a motion clip. Free Meshy
// walk/run get named variants (their ids are reserved negatives); real Meshy
// actions use their action_id; Hunyuan uses hy1-/hy2- prefixes.
function motionVariantSlug(ref: MotionRef): string {
  if (ref.system === 'meshy') {
    if (ref.id === MESHY_FREE_WALK_ID) return 'meshy-free-walk';
    if (ref.id === MESHY_FREE_RUN_ID) return 'meshy-free-run';
    return `meshy-${ref.id}`;
  }
  if (ref.system === 'hunyuan_v1') return `hy1-${ref.id}`;
  return `hy2-${ref.id}`;
}

// "assets/3d/<slot>/<file>" → { slot, fileName }. Returns slot=null if the path
// is not a recognized 3D slot path.
function parseAssetPath(assetPath: string): { slot: AssetSlot | null; fileName: string } {
  const m = /^assets\/3d\/(characters|meshes)\/([^/]+)$/.exec(assetPath);
  if (!m) return { slot: null, fileName: '' };
  return { slot: m[1] as AssetSlot, fileName: m[2] };
}

function sidecarToManifest(
  slug: string,
  slot: AssetSlot,
  fileName: string,
  sidecar: AssetSidecar,
): Gen3DAssetManifest {
  const c = sidecar.custom;
  const mainRel = relPath(slot, fileName);
  const baseName = fileName.replace(/\.glb$/, '');
  const files: ManifestFile[] = [
    {
      fileId: mainRel,
      role: 'source_mesh',
      format: 'glb',
      storageKey: mainRel,
      bytes: sidecar.size,
      sha256: sidecar.contentHash.replace(/^sha256:/, ''),
      localUrl: localUrlFor(slug, mainRel),
      hasSkeleton: false,
      skeletonProfile: 'unknown',
      animationInputReady: false,
    },
  ];
  for (const dep of sidecar.dependencies ?? []) {
    const rel = relPath(slot, dep.path);
    const format = (dep.path.split('.').pop() ?? 'png') as FileFormat;
    const role = (dep.kind as ManifestFile['role']) ?? 'preview_image';
    // Prefer the generalized motionRef; upgrade a legacy bare motionType if
    // that's all an older sidecar carries (back-compat, ADR-0006 §3).
    const motionRef: MotionRef | undefined =
      dep.motionRef ??
      (dep.motionType !== undefined ? motionRefFromLegacy(dep.motionType as MotionType) : undefined);
    files.push({
      fileId: rel,
      role,
      format,
      storageKey: rel,
      bytes: 0,
      sha256: dep.hash.replace(/^sha256:/, ''),
      localUrl: localUrlFor(slug, rel),
      // Restore rig metadata from the sidecar dep (set only by a verified rig
      // step); plain sidefiles (preview/texture) stay hasSkeleton:false.
      hasSkeleton: dep.hasSkeleton ?? false,
      skeletonProfile: (dep.skeletonProfile as SkeletonProfile) ?? 'unknown',
      animationInputReady: dep.animationInputReady ?? false,
      ...(motionRef ? { motionRef } : {}),
      // Keep the legacy field populated for hunyuan_v1 so older UI still reads it.
      ...(motionRef?.system === 'hunyuan_v1' ? { motionType: motionRef.id } : {}),
    });
  }
  void baseName;
  return {
    manifestVersion: 1,
    assetPath: mainRel,
    assetSlot: slot,
    kind: 'mesh',
    provider: c.provider,
    providerMode: c.providerMode,
    mode: c.mode,
    sourceJobId: c.sourceJobId,
    sourceInputAssetPaths: c.sourceInputAssetPaths ?? [],
    prompt: c.prompt,
    userLabel: c.userLabel ?? null,
    files,
    // Always derive from the restored file set so appended rig/anim files are
    // reflected even when the stored custom.readiness is stale.
    readiness: computeReadiness(files),
    ...(c.rig ? { rig: c.rig } : {}),
    quality: c.quality ? reportToScore(c.quality) : emptyQuality(),
    targetFaceCount: c.faceCount ?? null,
    createdAt: sidecar.createdAt,
    updatedAt: sidecar.createdAt,
  };
}
