// wb-ai-asset tool-handlers smoke — mock path only (no real env), so zero network
// and zero credits. Exercises the full persist path: a generation lands a durable
// meshes/ asset, an identical re-run hits the cache, the asset lists back, and a
// store call without an active game is rejected (missing_game).

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { splitForPrecise, tools } from './tool-handlers';

const SLUG = 'mock-game';
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'wbaiasset-'));
  process.env.FORGEAX_PROJECT_ROOT = root;
  // Force the mock path: getMeshyEnv() returns null unless the gate is "1" AND a
  // key is present. Setting these explicitly wins over any plugin-local .env
  // (loadPluginEnvOnce never overrides an existing process.env key).
  process.env.AIASSET_ENABLE_REAL_PROVIDERS = '0';
  delete process.env.MESHY_API_KEY;
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

test('provider-status: mock mode, quota-safe, 6 Meshy capabilities', async () => {
  const s = await tools['aiasset:provider-status']({});
  expect(s.realProvidersEnabled).toBe(false);
  expect(s.meshyConfigured).toBe(false);
  expect(s.cosConfigured).toBe(false);
  expect(s.quotaSafe).toBe(true);
  expect(s.balance).toBeNull();
  expect(s.capabilities).toHaveLength(6);
});

test('text-to-3d (mock): lands a durable meshes/ asset tagged meshy/mock', async () => {
  const r = await tools['aiasset:text-to-3d']({ slug: SLUG, prompt: 'a wooden barrel' });
  expect(r.ok).toBe(true);
  expect(r.usedMock).toBe(true);
  expect(r.cacheHit).toBe(false);
  expect(r.manifest.provider).toBe('meshy');
  expect(r.manifest.providerMode).toBe('mock');
  expect(r.manifest.mode).toBe('text');
  expect(r.manifest.assetSlot).toBe('meshes');
  expect(r.manifest.assetPath).toContain('assets/3d/props/meshes/');
  expect(r.manifest.readiness.hasSourceMesh).toBe(true);
});

test('text-to-3d (mock): identical inputs hit the cache (no re-burn)', async () => {
  const first = await tools['aiasset:text-to-3d']({ slug: SLUG, prompt: 'a clay pot' });
  const second = await tools['aiasset:text-to-3d']({ slug: SLUG, prompt: 'a clay pot' });
  expect(first.cacheHit).toBe(false);
  expect(second.cacheHit).toBe(true);
  expect(second.cacheKey).toBe(first.cacheKey);
  expect(second.manifest.assetPath).toBe(first.manifest.assetPath);
});

test('text-to-3d: a rename (assetName) does NOT change the cacheKey', async () => {
  const a = await tools['aiasset:text-to-3d']({ slug: SLUG, prompt: 'a torch', assetName: 'torch-a' });
  const b = await tools['aiasset:text-to-3d']({ slug: SLUG, prompt: 'a torch', assetName: 'torch-b' });
  expect(b.cacheKey).toBe(a.cacheKey);
  expect(b.cacheHit).toBe(true);
});

test('image-to-3d (mock): tagged image, mock mode', async () => {
  const r = await tools['aiasset:image-to-3d']({ slug: SLUG, imageUrl: 'https://x/y.png' });
  expect(r.usedMock).toBe(true);
  expect(r.manifest.mode).toBe('image');
  expect(r.manifest.assetSlot).toBe('meshes');
});

test('list-assets: surfaces generated meshy assets for the game', async () => {
  const r = await tools['aiasset:list-assets']({ slug: SLUG });
  expect(r.ok).toBe(true);
  expect(r.assets.length).toBeGreaterThan(0);
  expect(r.assets.every((m) => m.provider === 'meshy')).toBe(true);
});

test('store tools require an active game (missing_game)', async () => {
  await expect(tools['aiasset:text-to-3d']({ prompt: 'no slug' })).rejects.toMatchObject({ code: 'missing_game' });
  await expect(tools['aiasset:list-assets']({})).rejects.toMatchObject({ code: 'missing_game' });
});

test('text-to-3d: empty prompt rejects invalid_prompt', async () => {
  await expect(tools['aiasset:text-to-3d']({ slug: SLUG, prompt: '   ' })).rejects.toMatchObject({
    code: 'invalid_prompt',
  });
});

test('upload-image without COS configured → cos_not_configured', async () => {
  const onePixelPng =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  await expect(
    tools['aiasset:upload-image']({ slug: SLUG, base64: onePixelPng, mimetype: 'image/png' }),
  ).rejects.toMatchObject({ code: 'cos_not_configured' });
});

test('splitForPrecise: pins ai_model=meshy-6 when the user left it default (item7)', () => {
  expect(splitForPrecise({})).toEqual({ aiModel: 'meshy-6', stageOneParams: {} });
  expect(splitForPrecise({ symmetry_mode: 'auto' })).toEqual({
    aiModel: 'meshy-6',
    stageOneParams: { symmetry_mode: 'auto' },
  });
});

test('splitForPrecise: an explicit ai_model overrides the pinned default', () => {
  expect(splitForPrecise({ ai_model: 'meshy-5' }).aiModel).toBe('meshy-5');
});
