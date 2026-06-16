import { test, expect } from 'bun:test';
import type { Gen3DAssetManifest, ManifestFile } from '@shared/manifest';
import { planBundle } from './exportBundle';

const file = (over: Partial<ManifestFile>): ManifestFile => ({
  fileId: 'x',
  role: 'source_mesh',
  format: 'glb',
  storageKey: 'assets/3d/characters/knight.glb',
  bytes: 1,
  sha256: 'a',
  localUrl: '/api/game-assets/g/3d/characters/knight.glb',
  hasSkeleton: false,
  skeletonProfile: 'unknown',
  animationInputReady: false,
  ...over,
});

const manifest: Gen3DAssetManifest = {
  manifestVersion: 1,
  assetPath: 'assets/3d/characters/knight.glb',
  assetSlot: 'characters',
  kind: 'mesh',
  provider: 'hunyuan_workflow',
  providerMode: 'mock',
  mode: 'text',
  sourceJobId: null,
  sourceInputAssetPaths: [],
  prompt: 'a knight',
  files: [
    file({ role: 'source_mesh', format: 'glb' }),
    file({
      role: 'animated_model',
      format: 'fbx',
      storageKey: 'assets/3d/characters/knight.animated_model.motion-14.fbx',
      localUrl: '/api/game-assets/g/3d/characters/knight.animated_model.motion-14.fbx',
      motionType: 14,
    }),
    // No localUrl and no storageKey → unreachable → skipped.
    file({ role: 'preview_image', format: 'png', storageKey: '', localUrl: null }),
  ],
  readiness: { hasSourceMesh: true, rigged: false, animated: true },
  quality: { geometry: null, topology: null, texture: null, pbr: null, prompt_fidelity: null, total: null },
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:00.000Z',
};

test('planBundle names the zip + root from the asset stem', () => {
  const plan = planBundle(manifest);
  expect(plan.zipName).toBe('knight.zip');
  expect(plan.rootDir).toBe('knight');
});

test('planBundle includes reachable files under the root dir and skips unreachable ones', () => {
  const plan = planBundle(manifest);
  expect(plan.files).toEqual([
    { name: 'knight/knight.glb', url: '/api/game-assets/g/3d/characters/knight.glb' },
    {
      name: 'knight/knight.animated_model.motion-14.fbx',
      url: '/api/game-assets/g/3d/characters/knight.animated_model.motion-14.fbx',
    },
  ]);
});

test('planBundle embeds a parseable manifest.json', () => {
  const plan = planBundle(manifest);
  expect(JSON.parse(plan.manifestJson).assetPath).toBe('assets/3d/characters/knight.glb');
});
