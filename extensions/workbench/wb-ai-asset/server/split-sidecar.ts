// split-sidecar.ts — one-shot: walk a wb-ai-asset props/meshes dir and split
// each legacy <name>.glb.meta.json (wb fields + external-asset-package fields
// merged into one file) into TWO files so the engine scanner accepts it:
//
//   <name>.glb.meta.json  — engine external-asset-package meta ONLY (conforms
//                            to meta.schema.json, additionalProperties:false).
//   <name>.glb.wb.json     — wb-ai-asset private meta (producer/createdAt/
//                            contentHash/size/type/dependencies/custom).
//
// WHY: engine meta.schema.json is additionalProperties:false. The legacy merged
// sidecar (wb + external fields) makes the scanner throw pack-malformed-meta
// and fail-fast the whole game's catalog → buildCatalog never ingests the game
// → every loadByGuid fails → runtime falls back to builtin cubes. The split
// is the contract (see WbAssetMeta / ExternalAssetMeta in shared/manifest.ts).
//
// Idempotent: re-running on an already-split sidecar re-cooks the engine meta
// (deterministic GUIDs) and rewrites the wb meta from the existing wb fields.
// Engine-imported metas with no wb fields (monster/witch) are skipped — they
// are already clean external-asset-package metas, not wb-ai-asset sidecars.
//
// Run: bun plugins/wb-ai-asset/server/split-sidecar.ts <props-meshes-dir>

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { cookExternalAssetFields } from './external-meta-cook';
import type { ExternalAssetMeta, WbAssetMeta } from '../shared/manifest';

// Legacy merged sidecar shape (wb fields + external fields in one file, before
// the split). Used only to read pre-split sidecars; new sidecars are split.
interface LegacySidecar extends WbAssetMeta {
  kind?: 'external-asset-package';
  importer?: 'gltf';
  importSettings?: { colorSpace: 'srgb' | 'linear'; mipmap: 'auto' | 'none' };
  subAssets?: ReadonlyArray<{ guid: string; sourceIndex: number; kind: string; name?: string }>;
}

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: split-sidecar.ts <props-meshes-dir>');
    process.exit(1);
  }
  const absDir = resolve(dir);
  const entries = await readdir(absDir);
  const sidecars = entries.filter((f) => f.endsWith('.glb.meta.json'));
  console.log(`found ${sidecars.length} sidecars in ${absDir}`);
  let split = 0;
  let skipped = 0;
  let failed = 0;
  for (const sc of sidecars) {
    const sidecarAbs = join(absDir, sc);
    const glbAbs = sidecarAbs.replace(/\.meta\.json$/, '');
    const glbFileName = sc.replace(/\.meta\.json$/, ''); // <name>.glb
    const name = glbFileName.replace(/\.glb$/, '');
    let legacy: LegacySidecar;
    try {
      legacy = JSON.parse(await readFile(sidecarAbs, 'utf8')) as LegacySidecar;
    } catch (e) {
      console.warn(`  ✗ ${name}: cannot parse sidecar (${(e as Error).message})`);
      failed += 1;
      continue;
    }
    // Must have wb fields to be a wb-ai-asset sidecar worth splitting.
    if (!legacy.producer || !legacy.custom) {
      console.warn(`  ⊘ ${name}: no wb fields (engine-imported meta?) — skipped`);
      skipped += 1;
      continue;
    }
    let glb: Uint8Array;
    try {
      glb = await readFile(glbAbs);
    } catch (e) {
      console.warn(`  ✗ ${name}: GLB missing (${(e as Error).message})`);
      failed += 1;
      continue;
    }
    // Cook engine meta from the GLB (deterministic GUIDs). Overwrite the legacy
    // merged .glb.meta.json with a clean external-asset-package meta.
    const engineMeta: ExternalAssetMeta | null = await cookExternalAssetFields(
      glb,
      legacy.contentHash,
      glbFileName,
    );
    let guidInfo = 'no engine meta (GLB unparseable — Draco?)';
    if (engineMeta) {
      await writeFile(sidecarAbs, `${JSON.stringify(engineMeta, null, 2)}\n`, 'utf8');
      guidInfo = `${engineMeta.subAssets.length} mesh subAsset(s), guid[0]=${engineMeta.subAssets[0].guid}`;
    }
    // Write wb private meta (strip the external fields the legacy sidecar carried).
    const wbMeta: WbAssetMeta = {
      schemaVersion: 1,
      producer: legacy.producer,
      createdAt: legacy.createdAt,
      contentHash: legacy.contentHash,
      size: legacy.size,
      type: legacy.type,
      dependencies: legacy.dependencies,
      custom: legacy.custom,
    };
    const wbAbs = join(absDir, `${glbFileName}.wb.json`);
    await writeFile(wbAbs, `${JSON.stringify(wbMeta, null, 2)}\n`, 'utf8');
    console.log(`  ✓ ${name}: split → .glb.meta.json (${guidInfo}) + .glb.wb.json`);
    split += 1;
  }
  console.log(`\nsplit=${split} skipped=${skipped} failed=${failed}`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
