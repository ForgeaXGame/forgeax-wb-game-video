// external-meta-cook.ts — cook an engine `external-asset-package` meta
// (`<name>.glb.meta.json`) from a generated GLB so vite-plugin-pack buildCatalog
// folds the mesh into the runtime asset registry (loadByGuid<SceneAsset>).
//
// WHY this lives in wb-ai-asset (not a call to @forgeax/engine-gltf toAssetPack):
// marketplace is a standalone submodule OUTSIDE the main npm workspace, so it
// cannot resolve the workspace-only `@forgeax/engine-gltf` package. wb-ai-asset
// already depends on @gltf-transform/core (used by geometry-check.ts), so we
// reuse the same WebIO.parse path here. The emitted shape matches
// ExternalAssetMetaJson (build-catalog.ts) so editor import's cookGltfMeta can
// reuse the GUIDs via its existingMeta path — no format drift.
//
// GUID stability: deterministic sha256(contentHash + ':' + sourceIndex) formatted
// as a UUID, so re-cooking the same GLB never churns identity. Draco-compressed
// GLBs (WebIO cannot decode without extensions) return null → the caller skips
// writing the engine meta and buildCatalog simply skips runtime ingestion
// (known limitation, mirrored in geometry-check.ts).

import { WebIO } from '@gltf-transform/core';
import { createHash } from 'node:crypto';
import type { ExternalAssetMeta } from '../shared/manifest';

export interface ExternalAssetSubAsset {
  readonly guid: string;
  readonly sourceIndex: number;
  readonly kind: string;
  readonly name?: string;
}

// Format 32 hex chars as an 8-4-4-4-12 UUID. buildCatalog only requires
// sub.guid be a string; this shape matches engine convention for traceability.
function hexToUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Deterministic GUID for one mesh sub-asset: sha256(contentHash + ':' + sourceIndex)
// → first 32 hex → UUID. Re-running on the same GLB yields the same GUID, so
// re-cooks and editor reimports never churn identity.
function meshGuid(contentHash: string, sourceIndex: number): string {
  const h = createHash('sha256').update(`${contentHash}:${sourceIndex}`).digest('hex');
  return hexToUuid(h);
}

/**
 * Parse a GLB and produce the engine external-asset-package meta to write as
 * `<name>.glb.meta.json` (separate from the wb-ai-asset `<name>.glb.wb.json`).
 *
 * @param glbBytes      raw GLB bytes (the main asset file just written to disk)
 * @param contentHash   `sha256:<hex>` of the GLB (the wb sidecar's contentHash)
 * @param source        GLB file name (e.g. prop-boulder.glb) for the meta's
 *                      `source` field; the engine derives the companion path
 *                      from it when present.
 * @returns             external-asset-package meta, or null when the GLB
 *                      cannot be parsed (Draco without extensions, corrupt) —
 *                      caller skips writing the engine meta in that case.
 */
export async function cookExternalAssetFields(
  glbBytes: Uint8Array,
  contentHash: string,
  source: string,
): Promise<ExternalAssetMeta | null> {
  let doc: Awaited<ReturnType<WebIO['readBinary']>>;
  try {
    doc = await new WebIO().readBinary(glbBytes);
  } catch {
    return null;
  }
  const root = doc.getRoot();
  const meshes = root.listMeshes();
  if (meshes.length === 0) return null;

  const bareHash = contentHash.replace(/^sha256:/, '');
  const subAssets: ExternalAssetSubAsset[] = [];
  meshes.forEach((mesh, sourceIndex) => {
    const name = mesh.getName();
    subAssets.push({
      guid: meshGuid(bareHash, sourceIndex),
      sourceIndex,
      kind: 'mesh',
      ...(name ? { name } : {}),
    });
  });

  return {
    schemaVersion: 1,
    kind: 'external-asset-package',
    importer: 'gltf',
    source,
    importSettings: { colorSpace: 'srgb', mipmap: 'auto' },
    subAssets,
  };
}
