// external-meta-cook.ts — cook an engine `external-asset-package` meta
// (`<name>.glb.meta.json`) from a generated GLB so vite-plugin-pack buildCatalog
// folds every sub-asset (mesh / material / scene / texture) into the runtime
// asset registry. Without a `kind: 'texture'` row per glTF image the importer
// never extracts image bytes and the runtime renders a flat-shaded white box
// (gltf-importer.ts §"texture handles are seeded from subAssets[] of kind
// 'texture'"; toAssetPack §"Without this loop ... renders a white box (G-2)").
//
// WHY this lives in wb-ai-asset (not a call to @forgeax/engine-gltf toAssetPack):
// marketplace is a standalone submodule OUTSIDE the main npm workspace, so it
// cannot resolve the workspace-only `@forgeax/engine-gltf` package. wb-ai-asset
// already depends on @gltf-transform/core, so we reuse the same WebIO.readBinary
// path as a Draco/corrupt guard, then enumerate sub-assets straight from the
// glTF JSON chunk (images[] is not exposed on gltf-transform's Root). The
// emitted shape matches ExternalAssetMetaJson (build-catalog.ts) so editor
// import's cookGltfMeta can reuse the GUIDs via its existingMeta path — no
// format drift.
//
// GUID stability: mesh GUIDs stay sha256(contentHash + ':' + sourceIndex) so
// re-cooking the same GLB never churns mesh identity AND existing scene-pack
// refs (which key on mesh GUIDs) keep resolving. material / scene / texture
// GUIDs fold the kind into the hash (sha256(contentHash + ':' + kind + ':' +
// sourceIndex)) so a mesh[0] and a texture[0] — both sourceIndex 0 — never
// collide. All GUIDs are deterministic; re-cooks and editor reimports keep
// stable identity. Draco-compressed GLBs (WebIO cannot decode without
// extensions) return null → the caller skips writing the engine meta and
// buildCatalog simply skips runtime ingestion (known limitation, mirrored in
// geometry-check.ts).

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

// Deterministic GUID for the mesh sub-asset: sha256(contentHash + ':' + sourceIndex)
// → first 32 hex → UUID. Kept kind-less so existing scene-pack mesh refs stay
// valid across re-cooks.
function meshGuid(contentHash: string, sourceIndex: number): string {
  const h = createHash('sha256').update(`${contentHash}:${sourceIndex}`).digest('hex');
  return hexToUuid(h);
}

// Deterministic GUID for non-mesh sub-assets: sha256(contentHash + ':' + kind +
// ':' + sourceIndex). The kind prefix prevents collisions with mesh GUIDs
// (which are kind-less) when sourceIndex happens to match.
function subGuid(contentHash: string, kind: string, sourceIndex: number): string {
  const h = createHash('sha256').update(`${contentHash}:${kind}:${sourceIndex}`).digest('hex');
  return hexToUuid(h);
}

interface GlTFJson {
  readonly meshes?: ReadonlyArray<{ readonly name?: string }>;
  readonly materials?: ReadonlyArray<{ readonly name?: string }>;
  readonly scenes?: ReadonlyArray<{ readonly name?: string }>;
  readonly images?: ReadonlyArray<{ readonly name?: string }>;
  readonly scene?: number;
}

// Extract + parse the JSON chunk of a GLB (12-byte header + 8-byte chunk header
// + JSON data). Returns null on malformed bytes so the caller falls back to the
// WebIO guard's null path.
function parseGlbJson(glbBytes: Uint8Array): GlTFJson | null {
  if (glbBytes.length < 20) return null;
  const view = new DataView(glbBytes.buffer, glbBytes.byteOffset, glbBytes.byteLength);
  // GLB magic 0x46546C67 ('glTF'), little-endian.
  if (view.getUint32(0, true) !== 0x46546c67) return null;
  const jsonLen = view.getUint32(12, true);
  if (jsonLen <= 0 || 20 + jsonLen > glbBytes.length) return null;
  const jsonText = new TextDecoder().decode(glbBytes.subarray(20, 20 + jsonLen));
  try {
    return JSON.parse(jsonText) as GlTFJson;
  } catch {
    return null;
  }
}

/**
 * Parse a GLB and produce the engine external-asset-package meta to write as
 * `<name>.glb.meta.json` (separate from the wb-ai-asset `<name>.glb.wb.json`).
 *
 * Emits one sub-asset per glTF mesh / material / scene / image, matching
 * @forgeax/engine-gltf toAssetPack's sub-asset ordering so the editor's
 * reimport-reuse-meta can re-stabilise GUIDs on a later re-import. Texture
 * sub-asset sourceIndex is the glTF `images[]` row (the importer keys texture
 * handles on image index, see gltf-importer.ts §texture handles).
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
  // WebIO.readBinary is the Draco/corrupt guard: it throws on Draco-compressed
  // accessors (no extension wired) and on structurally broken GLBs. The JSON
  // chunk parse below would otherwise happily emit sub-assets for a GLB the
  // importer can never cook.
  try {
    await new WebIO().readBinary(glbBytes);
  } catch {
    return null;
  }
  const json = parseGlbJson(glbBytes);
  if (json === null) return null;
  const meshes = json.meshes ?? [];
  if (meshes.length === 0) return null;

  const bareHash = contentHash.replace(/^sha256:/, '');
  const subAssets: ExternalAssetSubAsset[] = [];

  // Mesh sub-assets — one per glTF mesh (sourceIndex = glTF mesh index).
  // GUID stays kind-less (sha256(hash:sourceIndex)) so scene-pack refs survive.
  meshes.forEach((mesh, sourceIndex) => {
    subAssets.push({
      guid: meshGuid(bareHash, sourceIndex),
      sourceIndex,
      kind: 'mesh',
      ...(mesh.name ? { name: mesh.name } : {}),
    });
  });

  // Material sub-assets — one per glTF material (sourceIndex = material index).
  for (let i = 0; i < (json.materials ?? []).length; i++) {
    const m = json.materials![i];
    subAssets.push({
      guid: subGuid(bareHash, 'material', i),
      sourceIndex: i,
      kind: 'material',
      ...(m.name ? { name: m.name } : {}),
    });
  }

  // Scene sub-assets — one per glTF scene (sourceIndex = scene index).
  for (let i = 0; i < (json.scenes ?? []).length; i++) {
    const s = json.scenes![i];
    subAssets.push({
      guid: subGuid(bareHash, 'scene', i),
      sourceIndex: i,
      kind: 'scene',
      ...(s.name ? { name: s.name } : {}),
    });
  }

  // Texture sub-assets — one per glTF image (sourceIndex = image index). The
  // importer seeds texture handles from these rows; without them the runtime
  // renders flat-shaded (gltf-importer.ts §texture handles, toAssetPack G-2).
  for (let i = 0; i < (json.images ?? []).length; i++) {
    const img = json.images![i];
    subAssets.push({
      guid: subGuid(bareHash, 'texture', i),
      sourceIndex: i,
      kind: 'texture',
      ...(img.name ? { name: img.name } : {}),
    });
  }

  return {
    schemaVersion: 1,
    kind: 'external-asset-package',
    importer: 'gltf',
    source,
    importSettings: { defaultSceneIndex: json.scene ?? 0 },
    subAssets,
  };
}
