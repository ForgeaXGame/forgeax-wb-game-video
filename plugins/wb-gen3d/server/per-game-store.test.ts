import { test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { PerGameAssetStore } from './per-game-store';
import { emptyQualityReport } from '../shared/manifest';

let root: string;
const store = new PerGameAssetStore();
const SLUG = 'testgame';
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03]);

beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'wbgen3d-'));
  process.env.FORGEAX_PROJECT_ROOT = root;
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeOne() {
  return store.writeAsset({
    slug: SLUG,
    assetSlot: 'meshes',
    assetName: 'box',
    files: [{ data: GLB, format: 'glb', role: 'source_mesh' }],
    meta: {
      provider: 'meshy',
      providerMode: 'mock',
      mode: 'text',
      sourceJobId: null,
      prompt: 'a box',
      sourceInputAssetPaths: [],
      faceCount: 12345,
    },
  });
}

test('writeAsset surfaces targetFaceCount; quality starts empty', async () => {
  const m = await writeOne();
  expect(m.targetFaceCount).toBe(12345);
  expect(m.quality.geometry).toBeNull();
});

test('updateAssetQuality persists report + surfaces numeric quality, idempotent', async () => {
  const m = await writeOne();
  const report = {
    ...emptyQualityReport(),
    geometry: { value: 88, source: 'auto' as const },
    topology: { value: 70, source: 'auto' as const },
    total: 79,
    method: 'auto' as const,
    scoredAt: new Date().toISOString(),
  };
  const updated1 = await store.updateAssetQuality(SLUG, m.assetPath, report);
  expect(updated1.quality.geometry).toBe(88);
  expect(updated1.quality.total).toBe(79);

  // Re-read from disk: persisted.
  const reread = await store.getAsset(SLUG, m.assetPath);
  expect(reread?.quality.geometry).toBe(88);

  // Idempotent: applying the same report again yields the same numbers.
  const updated2 = await store.updateAssetQuality(SLUG, m.assetPath, report);
  expect(updated2.quality).toEqual(updated1.quality);
});

test('updateAssetQuality on a missing asset throws asset_not_found', async () => {
  await expect(
    store.updateAssetQuality(SLUG, 'assets/3d/meshes/nope.glb', emptyQualityReport()),
  ).rejects.toThrow(/not found/i);
});
