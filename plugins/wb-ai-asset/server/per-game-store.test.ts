// PerGameAssetStore smoke — persists a multi-map PBR asset and asserts each map
// lands as a distinct same-basename sidefile (no overwrite), is tagged with its
// textureKind in the returned manifest, and round-trips through the sidecar
// (getAsset reconstructs every map). Filesystem-only; zero network.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PerGameAssetStore } from './per-game-store';
import type { AssetFileInput } from './asset-storage';

const SLUG = 'tex-game';
let root: string;
const enc = (s: string) => new TextEncoder().encode(s);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wbaiasset-store-'));
  process.env.FORGEAX_PROJECT_ROOT = root;
});

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const pbrFiles = (): AssetFileInput[] => [
  { role: 'source_mesh', format: 'glb', data: enc('glb-bytes') },
  { role: 'preview_image', format: 'png', data: enc('preview-bytes') },
  { role: 'texture', format: 'png', textureKind: 'base_color', data: enc('bc-bytes') },
  { role: 'texture', format: 'png', textureKind: 'metallic', data: enc('me-bytes') },
  { role: 'texture', format: 'png', textureKind: 'roughness', data: enc('ro-bytes') },
  { role: 'texture', format: 'png', textureKind: 'normal', data: enc('no-bytes') },
];

const writePbrAsset = (store: PerGameAssetStore) =>
  store.writeAsset({
    slug: SLUG,
    assetSlot: 'meshes',
    assetName: 'barrel',
    files: pbrFiles(),
    meta: {
      provider: 'meshy',
      providerMode: 'real',
      mode: 'image',
      sourceJobId: 'task-1',
      prompt: 'a barrel',
      sourceInputAssetPaths: [],
    },
  });

test('writeAsset stores each PBR map as a distinct textureKind sidefile (no overwrite)', async () => {
  const store = new PerGameAssetStore();
  const manifest = await writePbrAsset(store);

  const textures = manifest.files.filter((f) => f.role === 'texture');
  expect(textures.map((f) => f.textureKind).sort()).toEqual([
    'base_color',
    'metallic',
    'normal',
    'roughness',
  ]);
  // Distinct on-disk paths — collapsing to one <name>.texture.png would dedupe.
  const keys = textures.map((f) => f.storageKey);
  expect(new Set(keys).size).toBe(4);
  expect(keys).toContain('assets/3d/props/meshes/barrel.base_color.png');
  expect(keys).toContain('assets/3d/props/meshes/barrel.metallic.png');
  expect(keys).toContain('assets/3d/props/meshes/barrel.normal.png');

  // The bytes really hit disk under distinct names.
  const onDisk = readdirSync(join(root, '.forgeax', 'games', SLUG, 'assets', '3d', 'props', 'meshes'));
  expect(onDisk).toContain('barrel.base_color.png');
  expect(onDisk).toContain('barrel.roughness.png');
});

test('getAsset round-trips the full PBR set from the sidecar', async () => {
  const store = new PerGameAssetStore();
  const written = await writePbrAsset(store);

  const reloaded = await store.getAsset(SLUG, written.assetPath);
  expect(reloaded).not.toBeNull();
  const textures = reloaded!.files.filter((f) => f.role === 'texture');
  expect(textures.map((f) => f.textureKind).sort()).toEqual([
    'base_color',
    'metallic',
    'normal',
    'roughness',
  ]);
});
