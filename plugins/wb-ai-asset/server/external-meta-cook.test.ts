// external-meta-cook smoke — builds real GLBs in-memory (gltf-transform Document
// → writeBinary), zero network. Asserts the cook produces the engine
// external-asset-package meta shape buildCatalog expects:
// schemaVersion/kind/importer/source/importSettings + one mesh subAsset per
// glTF mesh, with deterministic GUIDs (same contentHash → same GUID, re-cook
// never churns identity) and graceful null on bad input.

import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { Document, WebIO } from '@gltf-transform/core';
import { cookExternalAssetFields } from './external-meta-cook';

// Build a GLB with `meshCount` meshes (each a single triangle primitive). Each
// mesh is placed under its own node so glTF emits a distinct mesh entry.
async function buildGlb(meshCount: number): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  for (let i = 0; i < meshCount; i += 1) {
    const position = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setBuffer(buffer);
    const prim = doc.createPrimitive().setAttribute('POSITION', position);
    const mesh = doc.createMesh(`mesh-${i}`).addPrimitive(prim);
    scene.addChild(doc.createNode(`node-${i}`).setMesh(mesh));
  }
  return new WebIO().writeBinary(doc);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

test('single-mesh GLB → external-asset-package meta with one mesh subAsset', async () => {
  const glb = await buildGlb(1);
  const contentHash = `sha256:${sha256Hex(glb)}`;
  const meta = await cookExternalAssetFields(glb, contentHash, 'prop-test.glb');
  expect(meta).not.toBeNull();
  expect(meta!.schemaVersion).toBe(1);
  expect(meta!.kind).toBe('external-asset-package');
  expect(meta!.importer).toBe('gltf');
  expect(meta!.source).toBe('prop-test.glb');
  expect(meta!.importSettings).toEqual({ colorSpace: 'srgb', mipmap: 'auto' });
  expect(meta!.subAssets.length).toBe(1);
  const sub = meta!.subAssets[0];
  expect(sub.kind).toBe('mesh');
  expect(sub.sourceIndex).toBe(0);
  expect(sub.guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(sub.name).toBe('mesh-0');
});

test('multi-mesh GLB → one subAsset per mesh, sourceIndex 0..N-1', async () => {
  const glb = await buildGlb(3);
  const meta = await cookExternalAssetFields(glb, `sha256:${sha256Hex(glb)}`, 'prop-test.glb');
  expect(meta!.subAssets.length).toBe(3);
  meta!.subAssets.forEach((s, i) => {
    expect(s.sourceIndex).toBe(i);
    expect(s.kind).toBe('mesh');
    expect(s.name).toBe(`mesh-${i}`);
  });
});

test('deterministic GUID: same GLB + same contentHash → same GUIDs across runs', async () => {
  const glb = await buildGlb(2);
  const contentHash = `sha256:${sha256Hex(glb)}`;
  const a = await cookExternalAssetFields(glb, contentHash, 'prop-test.glb');
  const b = await cookExternalAssetFields(glb, contentHash, 'prop-test.glb');
  expect(a!.subAssets.map((s) => s.guid)).toEqual(b!.subAssets.map((s) => s.guid));
});

test('different contentHash → different GUIDs (identity tracks the GLB, not just mesh count)', async () => {
  const glb = await buildGlb(1);
  const a = await cookExternalAssetFields(glb, 'sha256:aaaa', 'prop-test.glb');
  const b = await cookExternalAssetFields(glb, 'sha256:bbbb', 'prop-test.glb');
  expect(a!.subAssets[0].guid).not.toBe(b!.subAssets[0].guid);
});

test('bad GLB bytes → null (graceful, never throws)', async () => {
  const meta = await cookExternalAssetFields(new Uint8Array([1, 2, 3, 4, 5]), 'sha256:bad', 'bad.glb');
  expect(meta).toBeNull();
});

test('GLB with zero meshes → null', async () => {
  const doc = new Document();
  doc.createBuffer();
  doc.createScene();
  const glb = await new WebIO().writeBinary(doc);
  const meta = await cookExternalAssetFields(glb, `sha256:${sha256Hex(glb)}`, 'prop-test.glb');
  expect(meta).toBeNull();
});
