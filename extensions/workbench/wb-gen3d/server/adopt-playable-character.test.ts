// ADOPT1 smoke: orphan merged.glb + engine meta → confirm slot maps → playable.json
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { tools } from './tool-handlers';
import { PerGameAssetStore } from './per-game-store';

const SLUG = 'adopt-playable-smoke';
let root: string;
const store = new PerGameAssetStore();

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'wbgen3d-adopt-'));
  process.env.FORGEAX_PROJECT_ROOT = root;
  process.env.GEN3D_ENABLE_REAL_PROVIDERS = '0';
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

test('adopt-playable-character binds orphan merged delivery to the source asset', async () => {
  const seeded = await tools['gen3d:generate-meshy-text-mock']({
    slug: SLUG,
    assetSlot: 'characters',
    assetName: 'orphan-hero',
    prompt: 'orphan hero',
  });
  const assetPath = seeded.manifest.assetPath;

  await tools['gen3d:set-playable-profile']({
    slug: SLUG,
    assetPath,
    slots: [
      {
        slotId: 'idle',
        displayName: '待机',
        required: true,
        playbackMode: 'loop',
        speed: 1,
        matchKeywords: ['idle'],
        rootMotion: 'preserve',
      },
      {
        slotId: 'move',
        displayName: '移动',
        required: true,
        playbackMode: 'loop',
        speed: 1,
        matchKeywords: ['move', 'walk'],
        rootMotion: 'remove_xz',
      },
    ],
  });

  const modelRel = 'assets/characters/orphan-hero-merged.glb';
  const metaRel = `${modelRel}.meta.json`;
  const glbAbs = store.resolveGameRelPath(SLUG, modelRel);
  const metaAbs = store.resolveGameRelPath(SLUG, metaRel);
  mkdirSync(dirname(glbAbs), { recursive: true });
  writeFileSync(glbAbs, new Uint8Array([0x67, 0x6c, 0x54, 0x46])); // not a real GLB; adopt only reads meta
  writeFileSync(
    metaAbs,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: 'external-asset-package',
        importer: 'gltf',
        importSettings: {},
        subAssets: [
          { guid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', sourceIndex: 0, kind: 'scene', name: 'Scene' },
          { guid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', sourceIndex: 0, kind: 'animation-clip', name: 'idle' },
          { guid: 'cccccccc-cccc-cccc-cccc-cccccccccccc', sourceIndex: 1, kind: 'animation-clip', name: 'walk' },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const before = await tools['gen3d:get-playable-profile']({ slug: SLUG, assetPath });
  expect(before.delivery).toBeNull();
  expect(before.adoptCandidate?.modelPath).toBe(modelRel);
  expect(before.adoptCandidate?.clips.map((c) => c.name)).toEqual(['idle', 'walk']);

  const adopted = await tools['gen3d:adopt-playable-character']({
    slug: SLUG,
    assetPath,
    confirmed: true,
    slotMappings: [
      { slotId: 'idle', clipName: 'idle' },
      { slotId: 'move', clipName: 'walk' },
    ],
  });
  expect(adopted.ok).toBe(true);
  if (!adopted.ok) return;
  expect(adopted.reusedGuidCount).toBe(2);
  expect(adopted.clipCount).toBe(2);

  const after = await tools['gen3d:get-playable-profile']({ slug: SLUG, assetPath });
  expect(after.adoptCandidate).toBeNull();
  expect(after.delivery?.modelPath).toBe(modelRel);
  expect(after.delivery?.slotGuidRegistry.idle).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  expect(after.delivery?.slotGuidRegistry.move).toBe('cccccccc-cccc-cccc-cccc-cccccccccccc');
  expect(after.oneClickReady).toBe(false);
});
