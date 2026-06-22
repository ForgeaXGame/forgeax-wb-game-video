// Dispatch + storage round-trip smoke for the rig/animation tools (ADR-0006).
// Runs entirely on the MOCK path (GEN3D_ENABLE_REAL_PROVIDERS=0) against a temp
// project root → zero network, zero credits. Asserts the cross-cut contracts:
// Meshy rig bundles free walk/run + records the rig-chain, apply-motion is
// idempotent per motion, list-motions dispatches by rig system, and the legacy
// Hunyuan v1 motions (9–16) still round-trip through motionRef.

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HUNYUAN_V1_MOTION_LABELS,
  MESHY_FREE_RUN_ID,
  MESHY_FREE_WALK_ID,
  motionRefFromLegacy,
  type Gen3DAssetManifest,
} from '../shared/manifest';
import { PerGameAssetStore } from './per-game-store';
import { filterMotions, type MotionOption } from './motion-catalog';
import { tools } from './tool-handlers';

const SLUG = 'rig-smoke';
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'wbgen3d-rig-'));
  process.env.FORGEAX_PROJECT_ROOT = root;
  // Force the mock path regardless of any local .env real keys.
  process.env.GEN3D_ENABLE_REAL_PROVIDERS = '0';
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

async function seedCharacter(name: string): Promise<string> {
  const res = await tools['gen3d:generate-meshy-text-mock']({
    slug: SLUG,
    assetSlot: 'characters',
    assetName: name,
    prompt: `a ${name}`,
  });
  return res.manifest.assetPath;
}

const animatedRefs = (m: Gen3DAssetManifest) =>
  m.files.filter((f) => f.role === 'animated_model' && f.format === 'glb').map((f) => f.motionRef);

test('auto-rig (mock) → rigged + free walk/run clips + meshy rig-chain', async () => {
  const assetPath = await seedCharacter('hero');
  const res = await tools['gen3d:auto-rig']({ slug: SLUG, assetPath });

  expect(res.usedMock).toBe(true);
  expect(res.manifest.readiness.rigged).toBe(true);
  expect(res.manifest.rig?.rigProvider).toBe('meshy');
  expect(res.manifest.rig?.rigTaskId?.startsWith('mock-rig')).toBe(true);

  // The two bundled free clips are present with their reserved ids.
  const ids = animatedRefs(res.manifest).map((r) => r?.id);
  expect(ids).toContain(MESHY_FREE_WALK_ID);
  expect(ids).toContain(MESHY_FREE_RUN_ID);
  expect(res.manifest.readiness.animated).toBe(true);
});

test('auto-rig is idempotent (already rigged → no new files, no re-burn)', async () => {
  const assetPath = await seedCharacter('golem');
  const first = await tools['gen3d:auto-rig']({ slug: SLUG, assetPath });
  const again = await tools['gen3d:auto-rig']({ slug: SLUG, assetPath });
  expect(again.manifest.files.length).toBe(first.manifest.files.length);
});

test('apply-motion (mock meshy) appends an actionId clip and is idempotent', async () => {
  const assetPath = await seedCharacter('mage');
  await tools['gen3d:auto-rig']({ slug: SLUG, assetPath });

  const applied = await tools['gen3d:apply-motion']({ slug: SLUG, assetPath, actionId: 28, label: 'Wave' });
  expect(applied.usedMock).toBe(true);
  const wave = animatedRefs(applied.manifest).find((r) => r?.system === 'meshy' && r?.id === 28);
  expect(wave?.label).toBe('Wave');

  const before = applied.manifest.files.length;
  const dup = await tools['gen3d:apply-motion']({ slug: SLUG, assetPath, actionId: 28, label: 'Wave' });
  expect(dup.manifest.files.length).toBe(before);
});

test('apply-motion rejects non-positive / reserved actionId', async () => {
  const assetPath = await seedCharacter('knight');
  await tools['gen3d:auto-rig']({ slug: SLUG, assetPath });
  await expect(tools['gen3d:apply-motion']({ slug: SLUG, assetPath, actionId: MESHY_FREE_WALK_ID })).rejects.toMatchObject({
    code: 'invalid_action_id',
  });
  await expect(tools['gen3d:apply-motion']({ slug: SLUG, assetPath })).rejects.toMatchObject({
    code: 'invalid_action_id',
  });
});

test('apply-motion before auto-rig → not_rigged', async () => {
  const assetPath = await seedCharacter('slime');
  await expect(tools['gen3d:apply-motion']({ slug: SLUG, assetPath, actionId: 28 })).rejects.toMatchObject({
    code: 'not_rigged',
  });
});

test('list-motions (no asset) → meshy sample, query filters it down', async () => {
  const all = await tools['gen3d:list-motions']({ slug: SLUG });
  expect(all.system).toBe('meshy');
  expect(all.usedMock).toBe(true);
  expect(all.motions.length).toBeGreaterThan(0);

  const q = all.motions[0].label.slice(0, 3).toLowerCase();
  const filtered = await tools['gen3d:list-motions']({ slug: SLUG, query: q });
  expect(filtered.motions.length).toBeLessThanOrEqual(all.motions.length);
  // Mirror filterMotions: a match is label-substring OR id-substring.
  expect(
    filtered.motions.every((m) => m.label.toLowerCase().includes(q) || String(m.id).includes(q)),
  ).toBe(true);
});

// ── Hunyuan v1 (9–16) non-regression. Seed a hunyuan_rest rig directly (the
// mock auto-rig path always produces a Meshy chain), then drive the legacy
// motionType path and assert it round-trips through motionRef.hunyuan_v1. ──
test('hunyuan 9–16 motions still round-trip via motionRef', async () => {
  const store = new PerGameAssetStore();
  const assetPath = await seedCharacter('ranger');
  await store.appendDerivedFiles({
    slug: SLUG,
    assetPath,
    files: [{ data: new TextEncoder().encode('rig'), format: 'fbx', role: 'rigged_model' }],
    skeleton: { hasSkeleton: true, skeletonProfile: 'humanoid', animationInputReady: true },
    rigChain: { rigProvider: 'hunyuan_rest', rigTaskId: null, rigType: null, rigExpiresAt: null },
  });

  const list = await tools['gen3d:list-motions']({ slug: SLUG, assetPath });
  expect(list.system).toBe('hunyuan_v1');
  expect(list.total).toBe(8);

  const applied = await tools['gen3d:apply-motion']({ slug: SLUG, assetPath, motionType: 12 });
  const ref = animatedRefs(applied.manifest).find((r) => r?.system === 'hunyuan_v1' && r?.id === 12);
  expect(ref?.label).toBe(HUNYUAN_V1_MOTION_LABELS[12]);
  expect(motionRefFromLegacy(12)).toEqual({ system: 'hunyuan_v1', id: 12, label: HUNYUAN_V1_MOTION_LABELS[12] });

  // Round-trips through a fresh read (persisted in the sidecar, restored on load).
  const reloaded = await store.getAsset(SLUG, assetPath);
  expect(animatedRefs(reloaded!).some((r) => r?.system === 'hunyuan_v1' && r?.id === 12)).toBe(true);

  await expect(tools['gen3d:apply-motion']({ slug: SLUG, assetPath, motionType: 99 })).rejects.toMatchObject({
    code: 'invalid_motion_type',
  });
});

// filterMotions treats a requested rigType against a null (unknown) rigType
// as a match — the vendored Meshy catalog has no rig-type column, so strict
// equality would empty the list whenever a rigType is passed (PLAN §8-Q1).
test("filterMotions: requested rigType does not empty the catalog when rigType is null", () => {
  const motions: MotionOption[] = [
    { system: "meshy", id: 0, label: "Idle", category: "DailyActions", rigType: null, isFree: false, previewGifUrl: null },
    { system: "meshy", id: 28, label: "Big_Wave_Hello", category: "DailyActions", rigType: null, isFree: false, previewGifUrl: null },
  ];
  // No rigType filter → all pass.
  expect(filterMotions(motions, {}).length).toBe(2);
  // A requested rigType against all-null rigTypes matches loosely (not empty).
  expect(filterMotions(motions, { rigType: "style_02" }).length).toBe(2);
  // A real rigType value still filters strictly.
  const mixed = [...motions, { system: "meshy" as const, id: 5, label: "Run", category: "WalkAndRun", rigType: "style_02" as string | null, isFree: false, previewGifUrl: null } satisfies MotionOption];
  expect(filterMotions(mixed, { rigType: "style_02" }).length).toBe(3);
  // category still narrows strictly.
  expect(filterMotions(motions, { category: "WalkAndRun" }).length).toBe(0);
});
