import { test, expect } from 'bun:test';
import type { Gen3DAssetManifest, ManifestFile } from '@shared/manifest';
import { planBundle } from './exportBundle';

const file = (over: Partial<ManifestFile>): ManifestFile => ({
  fileId: 'x',
  role: 'source_mesh',
  format: 'glb',
  storageKey: 'assets/3d/meshes/barrel.glb',
  bytes: 1,
  sha256: 'a',
  localUrl: '/api/game-assets/g/3d/meshes/barrel.glb',
  hasSkeleton: false,
  skeletonProfile: 'unknown',
  animationInputReady: false,
  ...over,
});

const manifest: Gen3DAssetManifest = {
  manifestVersion: 1,
  assetPath: 'assets/3d/meshes/barrel.glb',
  assetSlot: 'meshes',
  kind: 'mesh',
  provider: 'meshy',
  providerMode: 'mock',
  mode: 'text',
  sourceJobId: null,
  sourceInputAssetPaths: [],
  prompt: 'a wooden barrel',
  files: [
    file({ role: 'source_mesh', format: 'glb' }),
    file({
      role: 'texture',
      format: 'png',
      storageKey: 'assets/3d/meshes/barrel.texture.png',
      localUrl: '/api/game-assets/g/3d/meshes/barrel.texture.png',
    }),
    // No localUrl and no storageKey → unreachable → skipped.
    file({ role: 'preview_image', format: 'png', storageKey: '', localUrl: null }),
  ],
  readiness: { hasSourceMesh: true, rigged: false, animated: false },
  quality: { geometry: null, topology: null, texture: null, pbr: null, prompt_fidelity: null, total: null },
  createdAt: '2026-06-29T00:00:00.000Z',
  updatedAt: '2026-06-29T00:00:00.000Z',
};

test('planBundle names the zip + root from the asset stem', () => {
  const plan = planBundle(manifest);
  expect(plan.zipName).toBe('barrel.zip');
  expect(plan.rootDir).toBe('barrel');
});

test('planBundle includes reachable files under the root dir and skips unreachable ones', () => {
  const plan = planBundle(manifest);
  expect(plan.files).toEqual([
    { name: 'barrel/barrel.glb', url: '/api/game-assets/g/3d/meshes/barrel.glb' },
    { name: 'barrel/barrel.texture.png', url: '/api/game-assets/g/3d/meshes/barrel.texture.png' },
  ]);
});

test('planBundle embeds a parseable manifest.json', () => {
  const plan = planBundle(manifest);
  expect(JSON.parse(plan.manifestJson).assetPath).toBe('assets/3d/meshes/barrel.glb');
});
