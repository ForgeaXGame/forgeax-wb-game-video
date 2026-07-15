// Manual "Import to Game" for wb-gen3d props/mesh assets (PLAN §5.3 / ROLE1).
// Character assets are explicitly rejected here — they use the (separate,
// not-yet-built) playable-character export pipeline, never this simple path.
import { createHash } from 'node:crypto';
import { access, readFile, rename, rm, writeFile } from 'node:fs/promises';
import {
  cookExternalAssetMeta,
  normalizeGlbForEngine,
  type ExternalAssetMeta,
} from '@forgeax-extension/external-asset-meta';
import type { AssetSidecar } from '../shared/manifest';
import type { PerGameAssetStore } from './per-game-store';

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

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function countReused(existing: ExternalAssetMeta | null, next: ExternalAssetMeta): number {
  if (!existing) return 0;
  const prev = new Set(existing.subAssets.map((s) => `${s.kind}\0${s.sourceIndex}\0${s.guid}`));
  let n = 0;
  for (const s of next.subAssets) {
    if (prev.has(`${s.kind}\0${s.sourceIndex}\0${s.guid}`)) n += 1;
  }
  return n;
}

export async function engineImportStatus(
  store: PerGameAssetStore,
  slug: string,
  assetPath: string,
): Promise<EngineImportStatus> {
  const resolved = store.resolveAssetFiles(slug, assetPath);
  if (!resolved) {
    return {
      ok: true, imported: false, needsManualImport: true, needsDracoNormalize: false,
      engineMetaPath: null, sourceHash: null, importedAt: null,
      message: 'Asset not found.', retryable: false,
    };
  }
  if (resolved.slot === 'characters') {
    return {
      ok: true, imported: false, needsManualImport: false, needsDracoNormalize: false,
      engineMetaPath: null, sourceHash: null, importedAt: null,
      message: 'Character assets use Export Playable Character, not Import to Game.',
      retryable: false,
    };
  }
  const { glbAbs, metaAbs, sidecarAbs } = resolved;
  if (!(await exists(glbAbs))) {
    return {
      ok: true, imported: false, needsManualImport: true, needsDracoNormalize: false,
      engineMetaPath: null, sourceHash: null, importedAt: null,
      message: 'GLB missing on disk.', retryable: false,
    };
  }
  const glbBytes = new Uint8Array(await readFile(glbAbs));
  const currentHash = `sha256:${sha256Hex(glbBytes)}`;
  const hasMeta = await exists(metaAbs);
  let sidecar: AssetSidecar | null = null;
  if (await exists(sidecarAbs)) {
    try {
      sidecar = JSON.parse(await readFile(sidecarAbs, 'utf8')) as AssetSidecar;
    } catch {
      sidecar = null;
    }
  }
  const engineImport = (sidecar?.custom as { engineImport?: { importedAt?: string; sourceHash?: string } } | undefined)
    ?.engineImport;
  const importedAt = engineImport?.importedAt ?? null;
  const recordedHash = engineImport?.sourceHash ?? null;

  if (hasMeta && recordedHash === currentHash) {
    return {
      ok: true, imported: true, needsManualImport: false, needsDracoNormalize: false,
      engineMetaPath: metaAbs, sourceHash: currentHash, importedAt,
      message: 'Already imported to game (engine meta matches current GLB).', retryable: false,
    };
  }

  const probe = await cookExternalAssetMeta(glbBytes, currentHash, assetPath.split('/').pop()!);
  const needsDraco =
    !probe.ok &&
    probe.code === 'engine_unsupported_extension' &&
    (probe.unsupportedExtensions ?? []).includes('KHR_draco_mesh_compression');

  return {
    ok: true, imported: false, needsManualImport: true, needsDracoNormalize: needsDraco,
    engineMetaPath: hasMeta ? metaAbs : null, sourceHash: currentHash, importedAt,
    message: needsDraco
      ? 'Model generated; Import to Game needs manual confirm (includes format conversion).'
      : hasMeta
        ? 'Engine meta is stale or mismatched; re-import required.'
        : 'Not imported yet. Click Import to Game.',
    retryable: true,
  };
}

export async function importToEngine(
  store: PerGameAssetStore,
  slug: string,
  assetPath: string,
): Promise<EngineImportResult> {
  const resolved = store.resolveAssetFiles(slug, assetPath);
  if (!resolved) {
    return { ok: false, code: 'asset_not_found', message: 'Asset not found.', retryable: false };
  }
  if (resolved.slot === 'characters') {
    return {
      ok: false,
      code: 'character_not_supported',
      message: 'Character assets use Export Playable Character, not Import to Game.',
      retryable: false,
    };
  }
  const { glbAbs, metaAbs, sidecarAbs, glbFileName } = resolved;
  if (!(await exists(glbAbs))) {
    return { ok: false, code: 'asset_not_found', message: 'GLB missing on disk.', retryable: false };
  }

  const originalGlb = new Uint8Array(await readFile(glbAbs));
  let glbBytes: Uint8Array = originalGlb;
  let contentHash = `sha256:${sha256Hex(glbBytes)}`;
  let normalizedDraco = false;

  let existingMeta: ExternalAssetMeta | null = null;
  if (await exists(metaAbs)) {
    try {
      existingMeta = JSON.parse(await readFile(metaAbs, 'utf8')) as ExternalAssetMeta;
      if (existingMeta.kind !== 'external-asset-package') existingMeta = null;
    } catch {
      existingMeta = null;
    }
  }
  const firstImport = existingMeta === null;

  let cooked = await cookExternalAssetMeta(glbBytes, contentHash, glbFileName, { existingMeta });

  if (
    !cooked.ok &&
    cooked.code === 'engine_unsupported_extension' &&
    (cooked.unsupportedExtensions ?? []).includes('KHR_draco_mesh_compression')
  ) {
    const normalized = await normalizeGlbForEngine(glbBytes);
    if (!normalized.ok) {
      return { ok: false, code: normalized.code, message: `Draco normalize failed: ${normalized.message}`, retryable: true };
    }
    glbBytes = normalized.bytes;
    contentHash = `sha256:${sha256Hex(glbBytes)}`;
    cooked = await cookExternalAssetMeta(glbBytes, contentHash, glbFileName, { existingMeta });
    if (!cooked.ok) {
      return { ok: false, code: cooked.code, message: cooked.message, retryable: true };
    }
    normalizedDraco = true;
  } else if (!cooked.ok) {
    return { ok: false, code: cooked.code, message: cooked.message, retryable: true };
  }

  const tmpGlb = `${glbAbs}.__import_tmp`;
  const tmpMeta = `${metaAbs}.__import_tmp`;
  try {
    if (normalizedDraco) await writeFile(tmpGlb, glbBytes);
    await writeFile(tmpMeta, `${JSON.stringify(cooked.meta, null, 2)}\n`, 'utf8');
    if (normalizedDraco) await rename(tmpGlb, glbAbs);
    await rename(tmpMeta, metaAbs);
  } catch (err) {
    await rm(tmpGlb, { force: true }).catch(() => undefined);
    await rm(tmpMeta, { force: true }).catch(() => undefined);
    return {
      ok: false, code: 'write_failed',
      message: err instanceof Error ? err.message : 'Failed to write import artifacts',
      retryable: true,
    };
  }

  if (await exists(sidecarAbs)) {
    try {
      const sidecar = JSON.parse(await readFile(sidecarAbs, 'utf8')) as AssetSidecar;
      sidecar.contentHash = contentHash;
      sidecar.size = glbBytes.byteLength;
      (sidecar.custom as Record<string, unknown>).engineImport = {
        sourceHash: contentHash,
        importedAt: new Date().toISOString(),
      };
      await writeFile(sidecarAbs, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
    } catch {
      // Non-fatal: engine meta already written.
    }
  }

  return {
    ok: true,
    firstImport,
    normalizedDraco,
    reusedGuidCount: countReused(existingMeta, cooked.meta),
    engineMetaPath: metaAbs,
    assetPath,
    message: 'Imported to game Edit asset catalog. This does not auto-replace the game protagonist or modify gameplay code.',
  };
}
