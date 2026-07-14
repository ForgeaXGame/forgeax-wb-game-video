import { test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

test('writeAsset uses .glb.gen3d-meta.json sidecar (not engine pack .meta.json)', async () => {
  const m = await store.writeAsset({
    slug: SLUG,
    assetSlot: 'meshes',
    assetName: 'sidecar-ext-check',
    files: [{ data: GLB, format: 'glb', role: 'source_mesh' }],
    meta: {
      provider: 'meshy',
      providerMode: 'mock',
      mode: 'text',
      sourceJobId: null,
      prompt: 'sidecar naming',
      sourceInputAssetPaths: [],
    },
  });
  const fileName = m.assetPath.replace(/^assets\/3d\/meshes\//, '');
  const dir = resolve(root, '.forgeax', 'games', SLUG, 'assets', '3d', 'meshes');
  const newSidecar = resolve(dir, `${fileName}.gen3d-meta.json`);
  const legacySidecar = resolve(dir, `${fileName}.meta.json`);
  const raw = await readFile(newSidecar, 'utf8');
  expect(raw).toContain('"schemaVersion"');
  await expect(readFile(legacySidecar, 'utf8')).rejects.toThrow();
});

test('listAssets migrates legacy .glb.meta.json off pack-scanner path', async () => {
  const dir = resolve(root, '.forgeax', 'games', SLUG, 'assets', '3d', 'characters');
  await mkdir(dir, { recursive: true });
  const glbName = 'legacy-hero.glb';
  await writeFile(resolve(dir, glbName), GLB);
  const legacySidecar = resolve(dir, `${glbName}.meta.json`);
  const newSidecar = resolve(dir, `${glbName}.gen3d-meta.json`);
  const sidecarBody = {
    schemaVersion: 1,
    producer: { plugin: 'wb-gen3d', pluginVersion: '0.1.0' },
    createdAt: '2026-06-01T00:00:00.000Z',
    contentHash: 'sha256:abc',
    size: GLB.byteLength,
    type: 'gen3d-character',
    dependencies: [],
    custom: {
      provider: 'meshy',
      providerMode: 'mock',
      mode: 'text',
      assetSlot: 'characters',
      sourceJobId: null,
      prompt: 'legacy',
      sourceInputAssetPaths: [],
      readiness: { hasSourceMesh: true, rigged: false, animated: false },
    },
  };
  await writeFile(legacySidecar, `${JSON.stringify(sidecarBody, null, 2)}\n`, 'utf8');

  const listed = await store.listAssets(SLUG, 'characters');
  expect(listed.some((a) => a.assetPath.endsWith(glbName))).toBe(true);

  const migrated = await readFile(newSidecar, 'utf8');
  expect(migrated).toContain('"schemaVersion"');
  await expect(readFile(legacySidecar, 'utf8')).rejects.toThrow();
});

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

test('co-located engine meta survives writeAsset / quality update', async () => {
  const m = await store.writeAsset({
    slug: SLUG,
    assetSlot: 'meshes',
    assetName: 'engine-meta-keep',
    files: [{ data: GLB, format: 'glb', role: 'source_mesh' }],
    meta: {
      provider: 'meshy',
      providerMode: 'mock',
      mode: 'text',
      sourceJobId: null,
      prompt: 'keep engine meta',
      sourceInputAssetPaths: [],
    },
  });
  const fileName = m.assetPath.replace(/^assets\/3d\/meshes\//, '');
  const dir = resolve(root, '.forgeax', 'games', SLUG, 'assets', '3d', 'meshes');
  const engineMeta = resolve(dir, `${fileName}.meta.json`);
  const engineBody = {
    schemaVersion: 1,
    kind: 'external-asset-package',
    importer: 'gltf',
    source: fileName,
    importSettings: { defaultSceneIndex: 0 },
    subAssets: [{ guid: '11111111-1111-1111-1111-111111111111', sourceIndex: 0, kind: 'mesh' }],
  };
  await writeFile(engineMeta, `${JSON.stringify(engineBody, null, 2)}\n`, 'utf8');

  // Touch sidecar again via quality update — must not delete engine meta.
  await store.updateAssetQuality(SLUG, m.assetPath, {
    ...emptyQualityReport(),
    geometry: { value: 50, source: 'auto' as const },
    total: 50,
    method: 'auto' as const,
    scoredAt: new Date().toISOString(),
  });
  const kept = JSON.parse(await readFile(engineMeta, 'utf8')) as { kind: string };
  expect(kept.kind).toBe('external-asset-package');
});

test('listAssets ignores clean engine meta without gen3d sidecar', async () => {
  const dir = resolve(root, '.forgeax', 'games', SLUG, 'assets', '3d', 'meshes');
  await mkdir(dir, { recursive: true });
  const glbName = 'engine-only.glb';
  await writeFile(resolve(dir, glbName), GLB);
  await writeFile(
    resolve(dir, `${glbName}.meta.json`),
    `${JSON.stringify({
      schemaVersion: 1,
      kind: 'external-asset-package',
      importer: 'gltf',
      source: glbName,
      importSettings: { defaultSceneIndex: 0 },
      subAssets: [],
    }, null, 2)}\n`,
    'utf8',
  );
  const listed = await store.listAssets(SLUG, 'meshes');
  expect(listed.some((a) => a.assetPath.endsWith(glbName))).toBe(false);
  // Engine meta still on disk.
  const raw = await readFile(resolve(dir, `${glbName}.meta.json`), 'utf8');
  expect(raw).toContain('external-asset-package');
});

test('suffix boundary: gen3d-meta and playable are not engine .meta.json', () => {
  expect('.glb.gen3d-meta.json'.endsWith('.meta.json')).toBe(false);
  expect('hero-merged.glb.playable.json'.endsWith('.meta.json')).toBe(false);
  expect('hero.glb.meta.json'.endsWith('.meta.json')).toBe(true);
});

test('character playable state includes the last delivery snapshot', async () => {
  const manifest = await store.writeAsset({
    slug: SLUG,
    assetSlot: 'characters',
    assetName: 'delivered-hero',
    files: [{ data: GLB, format: 'glb', role: 'source_mesh' }],
    meta: {
      provider: 'meshy',
      providerMode: 'mock',
      mode: 'text',
      sourceJobId: null,
      prompt: 'delivered hero',
      sourceInputAssetPaths: [],
    },
  });
  const snapshot = {
    modelPath: 'assets/characters/delivered-hero-merged.glb',
    playablePath: 'assets/characters/delivered-hero-merged.glb.playable.json',
    profileId: 'basic-character-v1',
    profileVersion: 1,
    slotGuidRegistry: { idle: '11111111-1111-1111-1111-111111111111' },
    mappingFingerprint: 'fingerprint',
    exportedAt: '2026-07-14T00:00:00.000Z',
  };

  await store.updatePlayableDeliverySnapshot(SLUG, manifest.assetPath, snapshot);

  const state = await store.getCharacterPlayableState(SLUG, manifest.assetPath);
  expect(state?.delivery).toEqual(snapshot);
});

