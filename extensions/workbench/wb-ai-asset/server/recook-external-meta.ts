// recook-external-meta.ts — one-off / maintenance tool: regenerate every
// `<name>.glb.meta.json` in a directory from its `<name>.glb` +
// `<name>.glb.wb.json` (contentHash) using the current cookExternalAssetFields.
//
// Used to back-fill mesh-only sidecars with the full sub-asset set
// (mesh + material + scene + texture) so the importer extracts image bytes
// and the runtime stops rendering flat-shaded. Mesh GUIDs are deterministic
// (sha256(contentHash:sourceIndex)) so existing scene-pack refs keep resolving.
//
// Usage: bun run server/recook-external-meta.ts <dir-containing-glbs>

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cookExternalAssetFields } from './external-meta-cook';

interface WbMeta {
  readonly contentHash?: string;
}

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (dir === undefined) {
    console.error('usage: bun run server/recook-external-meta.ts <dir>');
    process.exit(1);
  }
  const entries = await readdir(dir);
  const glbs = entries.filter((e) => e.endsWith('.glb'));
  let recooked = 0;
  let skipped = 0;
  for (const glbName of glbs) {
    const glbPath = join(dir, glbName);
    const wbPath = join(dir, `${glbName}.wb.json`);
    const metaPath = join(dir, `${glbName}.meta.json`);
    let wbMeta: WbMeta;
    try {
      wbMeta = JSON.parse(await readFile(wbPath, 'utf8')) as WbMeta;
    } catch {
      console.warn(`  skip ${glbName}: no .wb.json sidecar`);
      skipped += 1;
      continue;
    }
    const contentHash = wbMeta.contentHash;
    if (typeof contentHash !== 'string') {
      console.warn(`  skip ${glbName}: .wb.json has no contentHash`);
      skipped += 1;
      continue;
    }
    const glbBytes = new Uint8Array(await readFile(glbPath));
    const meta = await cookExternalAssetFields(glbBytes, contentHash, glbName);
    if (meta === null) {
      console.warn(`  skip ${glbName}: cook returned null (Draco / corrupt)`);
      skipped += 1;
      continue;
    }
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
    const kinds = meta.subAssets.map((s) => s.kind);
    console.log(`  recooked ${glbName}: ${meta.subAssets.length} subAssets [${kinds.join(', ')}]`);
    recooked += 1;
  }
  console.log(`done: ${recooked} recooked, ${skipped} skipped`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
