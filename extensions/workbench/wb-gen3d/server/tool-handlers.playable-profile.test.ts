// Smoke tests for the R7 playable-profile tools (PLAN §4.1/§5.3): game default
// motion profile, character override (PROF6), and motion-mapping draft. Runs
// entirely against a temp project root → zero network, zero credits.

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tools } from './tool-handlers';

const SLUG = 'playable-profile-smoke';
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'wbgen3d-playable-'));
  process.env.FORGEAX_PROJECT_ROOT = root;
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

test('get-playable-profile with no assetPath and no saved game profile → default preset slots, null override/mapping', async () => {
  const res = await tools['gen3d:get-playable-profile']({ slug: SLUG });
  expect(res.gameProfile).toBeNull();
  expect(res.override).toBeNull();
  expect(res.mapping).toBeNull();
  expect(res.effectiveSlots.length).toBeGreaterThan(0);
  expect(res.presets.map((p) => p.profileId)).toContain('basic-character-v1');
});

test('get-playable-profile rejects a non-character asset', async () => {
  const meshRes = await tools['gen3d:generate-meshy-text-mock']({
    slug: SLUG,
    assetSlot: 'meshes',
    assetName: 'crate',
    prompt: 'a crate',
  });
  await expect(
    tools['gen3d:get-playable-profile']({ slug: SLUG, assetPath: meshRes.manifest.assetPath }),
  ).rejects.toMatchObject({ code: 'not_a_character' });
});

test('get-playable-profile returns a clone of the built-in presets, not the shared module singleton', async () => {
  const res = await tools['gen3d:get-playable-profile']({ slug: SLUG });
  const preset = res.presets.find((p) => p.profileId === 'basic-character-v1')!;
  preset.slots[0].displayName = 'mutated-by-caller';
  preset.slots[0].matchKeywords.push('leaked-by-caller');

  const reloaded = await tools['gen3d:get-playable-profile']({ slug: SLUG });
  const reloadedPreset = reloaded.presets.find((p) => p.profileId === 'basic-character-v1')!;
  expect(reloadedPreset.slots[0].displayName).not.toBe('mutated-by-caller');
  expect(reloadedPreset.slots[0].matchKeywords).not.toContain('leaked-by-caller');
});

test('set-playable-profile without saveAsGameDefault only writes a character override — the shared game default is never persisted', async () => {
  const assetPath = await seedCharacter('hero-a');
  const slots = [
    { slotId: 'idle', displayName: '待机', required: true, playbackMode: 'loop' as const, speed: 1, matchKeywords: ['idle'], rootMotion: 'preserve' as const },
  ];
  const res = await tools['gen3d:set-playable-profile']({ slug: SLUG, assetPath, slots });
  expect(res.override.slots).toEqual(slots);
  // The response still carries a version-1 "based on" anchor for the override
  // (PROF4/basedOnProfileVersion needs one) — but per PROF1/PROF6 this must be
  // a virtual, never-persisted profile, not a real save.
  expect(res.gameProfile.profileVersion).toBe(1);

  // The shared game default file itself was never written to disk.
  const direct = await tools['gen3d:get-playable-profile']({ slug: SLUG });
  expect(direct.gameProfile).toBeNull();

  // Game default was NOT auto-initialized — a second, unrelated character
  // must NOT inherit hero-a's custom slots.
  const otherCharacter = await seedCharacter('hero-b');
  const otherProfile = await tools['gen3d:get-playable-profile']({ slug: SLUG, assetPath: otherCharacter });
  expect(otherProfile.override).toBeNull();
});

test('set-playable-profile with saveAsGameDefault:true updates the shared game profile and bumps its version', async () => {
  const assetPath = await seedCharacter('hero-c');
  const first = await tools['gen3d:set-playable-profile']({
    slug: SLUG,
    assetPath,
    slots: [
      { slotId: 'idle', displayName: '待机', required: true, playbackMode: 'loop' as const, speed: 1, matchKeywords: ['idle'], rootMotion: 'preserve' as const },
    ],
    saveAsGameDefault: true,
  });
  const v1 = first.gameProfile.profileVersion;

  const second = await tools['gen3d:set-playable-profile']({
    slug: SLUG,
    assetPath,
    slots: [
      { slotId: 'idle', displayName: '待机', required: true, playbackMode: 'loop' as const, speed: 1, matchKeywords: ['idle'], rootMotion: 'preserve' as const },
      { slotId: 'move', displayName: '移动', required: true, playbackMode: 'loop' as const, speed: 1, matchKeywords: ['move'], rootMotion: 'remove_xz' as const },
    ],
    saveAsGameDefault: true,
  });
  expect(second.gameProfile.profileVersion).toBe(v1 + 1);

  // A brand-new character now sees the updated game default as its effective slots.
  const otherCharacter = await seedCharacter('hero-d');
  const otherProfile = await tools['gen3d:get-playable-profile']({ slug: SLUG, assetPath: otherCharacter });
  expect(otherProfile.gameProfile?.profileVersion).toBe(v1 + 1);
  expect(otherProfile.effectiveSlots.map((s) => s.slotId).sort()).toEqual(['idle', 'move']);
});

test('character override is scoped to one character: another character with no override still sees the game default', async () => {
  const overridden = await seedCharacter('overridden-hero');
  const untouched = await seedCharacter('untouched-hero');

  await tools['gen3d:set-playable-profile']({
    slug: SLUG,
    assetPath: overridden,
    slots: [
      { slotId: 'idle', displayName: '待机', required: true, playbackMode: 'once' as const, speed: 2, matchKeywords: ['idle'], rootMotion: 'preserve' as const },
    ],
  });

  const untouchedProfile = await tools['gen3d:get-playable-profile']({ slug: SLUG, assetPath: untouched });
  expect(untouchedProfile.override).toBeNull();
});

test('set-playable-profile rejects empty slots array', async () => {
  const assetPath = await seedCharacter('hero-empty');
  await expect(
    tools['gen3d:set-playable-profile']({ slug: SLUG, assetPath, slots: [] }),
  ).rejects.toMatchObject({ code: 'invalid_slots' });
});

test('set-playable-profile rejects a slot with non-positive speed', async () => {
  const assetPath = await seedCharacter('hero-bad-speed');
  await expect(
    tools['gen3d:set-playable-profile']({
      slug: SLUG,
      assetPath,
      slots: [
        { slotId: 'idle', displayName: '待机', required: true, playbackMode: 'loop' as const, speed: -1, matchKeywords: ['idle'], rootMotion: 'preserve' as const },
      ],
    }),
  ).rejects.toMatchObject({ code: 'invalid_slots' });
});

test('set-playable-profile rejects a slot with an unrecognized playbackMode/rootMotion', async () => {
  const assetPath = await seedCharacter('hero-bad-enum');
  await expect(
    tools['gen3d:set-playable-profile']({
      slug: SLUG,
      assetPath,
      slots: [
        { slotId: 'idle', displayName: '待机', required: true, playbackMode: 'sideways' as never, speed: 1, matchKeywords: ['idle'], rootMotion: 'preserve' as const },
      ],
    }),
  ).rejects.toMatchObject({ code: 'invalid_slots' });
  await expect(
    tools['gen3d:set-playable-profile']({
      slug: SLUG,
      assetPath,
      slots: [
        { slotId: 'idle', displayName: '待机', required: true, playbackMode: 'loop' as const, speed: 1, matchKeywords: ['idle'], rootMotion: 'teleport' as never },
      ],
    }),
  ).rejects.toMatchObject({ code: 'invalid_slots' });
});

test('saveAsGameDefault:true is atomic under concurrent writers — no lost update', async () => {
  const heroA = await seedCharacter('concurrent-a');
  const heroB = await seedCharacter('concurrent-b');
  const before = await tools['gen3d:get-playable-profile']({ slug: SLUG });
  const baseVersion = before.gameProfile?.profileVersion ?? 0;

  const [resA, resB] = await Promise.all([
    tools['gen3d:set-playable-profile']({
      slug: SLUG,
      assetPath: heroA,
      slots: [
        { slotId: 'idle', displayName: '待机', required: true, playbackMode: 'loop' as const, speed: 1, matchKeywords: ['idle'], rootMotion: 'preserve' as const },
      ],
      saveAsGameDefault: true,
    }),
    tools['gen3d:set-playable-profile']({
      slug: SLUG,
      assetPath: heroB,
      slots: [
        { slotId: 'idle', displayName: '待机', required: true, playbackMode: 'loop' as const, speed: 1, matchKeywords: ['idle'], rootMotion: 'preserve' as const },
        { slotId: 'attack', displayName: '攻击', required: true, playbackMode: 'once' as const, speed: 1, matchKeywords: ['attack'], rootMotion: 'preserve' as const },
      ],
      saveAsGameDefault: true,
    }),
  ]);

  // Both writers must observe distinct, sequential versions — never the same
  // version twice (that would mean one silently clobbered the other).
  expect(resA.gameProfile.profileVersion).not.toBe(resB.gameProfile.profileVersion);
  const versions = [resA.gameProfile.profileVersion, resB.gameProfile.profileVersion].sort((x, y) => x - y);
  expect(versions).toEqual([baseVersion + 1, baseVersion + 2]);

  // The persisted file must match whichever write landed last, not a version
  // that mixes/loses one writer's slots.
  const finalProfile = await tools['gen3d:get-playable-profile']({ slug: SLUG });
  const winner = resA.gameProfile.profileVersion > resB.gameProfile.profileVersion ? resA : resB;
  expect(finalProfile.gameProfile?.profileVersion).toBe(baseVersion + 2);
  expect(finalProfile.gameProfile?.slots).toEqual(winner.gameProfile.slots);
});

test('set-playable-profile rejects a non-character asset', async () => {
  const meshRes = await tools['gen3d:generate-meshy-text-mock']({
    slug: SLUG,
    assetSlot: 'meshes',
    assetName: 'barrel',
    prompt: 'a barrel',
  });
  await expect(
    tools['gen3d:set-playable-profile']({
      slug: SLUG,
      assetPath: meshRes.manifest.assetPath,
      slots: [
        { slotId: 'idle', displayName: '待机', required: true, playbackMode: 'loop' as const, speed: 1, matchKeywords: ['idle'], rootMotion: 'preserve' as const },
      ],
    }),
  ).rejects.toMatchObject({ code: 'not_a_character' });
});

test('set-playable-motion-mapping saves a draft, confirmed defaults to false', async () => {
  const assetPath = await seedCharacter('hero-mapping');
  const res = await tools['gen3d:set-playable-motion-mapping']({
    slug: SLUG,
    assetPath,
    mappings: [{ slotId: 'idle', motionRefKey: 'meshy:5', autoMatched: true }],
  });
  expect(res.mapping.confirmed).toBe(false);
  expect(res.mapping.mappings).toEqual([{ slotId: 'idle', motionRefKey: 'meshy:5', autoMatched: true }]);

  const reloaded = await tools['gen3d:get-playable-profile']({ slug: SLUG, assetPath });
  expect(reloaded.mapping?.mappings).toEqual([{ slotId: 'idle', motionRefKey: 'meshy:5', autoMatched: true }]);
});

test('set-playable-motion-mapping with confirmed:true persists the confirmation', async () => {
  const assetPath = await seedCharacter('hero-confirmed');
  await tools['gen3d:set-playable-motion-mapping']({
    slug: SLUG,
    assetPath,
    mappings: [{ slotId: 'idle', motionRefKey: 'meshy:1', autoMatched: true }],
    confirmed: true,
  });
  const reloaded = await tools['gen3d:get-playable-profile']({ slug: SLUG, assetPath });
  expect(reloaded.mapping?.confirmed).toBe(true);
});

test('get-playable-profile reports no one-click update before a successful delivery', async () => {
  const assetPath = await seedCharacter('hero-not-delivered');
  await tools['gen3d:set-playable-motion-mapping']({
    slug: SLUG,
    assetPath,
    mappings: [{ slotId: 'idle', motionRefKey: 'meshy:1', autoMatched: false }],
    confirmed: true,
  });

  const reloaded = await tools['gen3d:get-playable-profile']({ slug: SLUG, assetPath });
  expect(reloaded.delivery).toBeNull();
  expect(reloaded.oneClickReady).toBe(false);
  expect(reloaded.migrationNeeded).toBe(false);
  expect(reloaded.adoptCandidate).toBeNull();
});
