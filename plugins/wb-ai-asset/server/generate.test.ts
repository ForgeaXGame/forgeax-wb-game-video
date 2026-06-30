// generate.ts topology-gate wiring — drives generateCacheFirst with an injected
// producer (no provider, no network) against a real PerGameAssetStore in a temp
// project root. Proves the Phase 3 gate is wired: a real generation persists
// quality.topology (pass for a clean low-poly GLB, degraded for an over-budget
// one), and the mock path is never gated (topology stays null).

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Document, WebIO } from '@gltf-transform/core';
import { generateCacheFirst, type PersistInput } from './generate';
import { PerGameAssetStore } from './per-game-store';
import type { ProviderResult } from '../shared/catalog';

const SLUG = 'topo-game';
let root: string;
const enc = (s: string) => new TextEncoder().encode(s);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wbaiasset-gen-'));
  process.env.FORGEAX_PROJECT_ROOT = root;
});

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

// A GLB with `faces` distinct (non-welding) triangles — face count is the lever
// the budget gate keys on.
async function trianglesGlb(faces: number): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions: number[] = [];
  for (let t = 0; t < faces; t++) positions.push(t, 0, 0, t, 1, 0, t, 0, 1);
  const position = doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute('POSITION', position);
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(prim)));
  return new WebIO().writeBinary(doc);
}

function result(providerMode: 'real' | 'mock', glb: Uint8Array): ProviderResult {
  return {
    provider: 'meshy',
    mode: 'text',
    providerMode,
    sourceJobId: providerMode === 'real' ? 'task-1' : null,
    prompt: 'a barrel',
    files: [
      { role: 'source_mesh', format: 'glb', data: glb },
      { role: 'preview_image', format: 'png', data: enc('preview') },
    ],
  };
}

const ctx = (cacheKey: string): PersistInput => ({
  slug: SLUG,
  assetSlot: 'meshes',
  assetName: 'barrel',
  faceCount: 1500,
  cacheKey,
});

test('real generation scores quality.topology=pass for a clean low-poly GLB', async () => {
  const store = new PerGameAssetStore();
  const glb = await trianglesGlb(2);
  const { manifest, cacheHit } = await generateCacheFirst(store, ctx('k-clean'), async () => result('real', glb));
  expect(cacheHit).toBe(false);
  expect(manifest.quality.topology).toBe(1);
});

test('real generation marks quality.topology degraded for an over-budget GLB', async () => {
  const store = new PerGameAssetStore();
  const glb = await trianglesGlb(2001);
  const { manifest } = await generateCacheFirst(store, ctx('k-fat'), async () => result('real', glb));
  expect(manifest.quality.topology).toBe(0);
});

test('mock generation skips the topology gate (quality.topology stays null)', async () => {
  const store = new PerGameAssetStore();
  const glb = await trianglesGlb(2);
  const { manifest } = await generateCacheFirst(store, ctx('k-mock'), async () => result('mock', glb));
  expect(manifest.quality.topology).toBeNull();
});
