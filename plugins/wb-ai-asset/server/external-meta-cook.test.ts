// external-meta-cook smoke — builds real GLBs in-memory (gltf-transform Document
// → writeBinary), zero network. Asserts the cook produces the engine
// external-asset-package meta shape buildCatalog expects: one sub-asset per
// glTF mesh / material / scene / image (the texture row is what unblocks the
// importer from extracting image bytes — without it the runtime renders
// flat-shaded), with deterministic GUIDs (same contentHash → same GUID, re-cook
// never churns identity) and graceful null on bad input.

import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { Document, WebIO } from '@gltf-transform/core';
import { cookExternalAssetFields } from './external-meta-cook';

// Build a GLB with `meshCount` meshes (each a single triangle primitive). Each
// mesh is placed under its own node so glTF emits a distinct mesh entry. No
// materials / textures — used to assert mesh + scene sub-asset emission only.
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

// Minimal 1×1 RGBA PNG so gltf-transform can emit a real `images[]` row (it
// stores bytes verbatim; the importer's decodeImage seam decodes later).
function oneByOnePng(): Uint8Array {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = chunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]));
  const idat = chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255])));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

// GLB with one mesh + one textured material → asserts material + texture
// sub-assets are emitted alongside mesh + scene.
async function buildTexturedGlb(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const tex = doc.createTexture('base-color').setImage(oneByOnePng()).setMimeType('image/png');
  const material = doc.createMaterial('mat-0').setBaseColorTexture(tex);
  const prim = doc.createPrimitive().setAttribute('POSITION', position).setMaterial(material);
  const mesh = doc.createMesh('mesh-0').addPrimitive(prim);
  scene.addChild(doc.createNode('node-0').setMesh(mesh));
  return new WebIO().writeBinary(doc);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

test('single-mesh GLB → mesh + scene subAssets, importSettings.defaultSceneIndex=0', async () => {
  const glb = await buildGlb(1);
  const contentHash = `sha256:${sha256Hex(glb)}`;
  const meta = await cookExternalAssetFields(glb, contentHash, 'prop-test.glb');
  expect(meta).not.toBeNull();
  expect(meta!.schemaVersion).toBe(1);
  expect(meta!.kind).toBe('external-asset-package');
  expect(meta!.importer).toBe('gltf');
  expect(meta!.source).toBe('prop-test.glb');
  expect(meta!.importSettings).toEqual({ defaultSceneIndex: 0 });
  const byKind = Object.fromEntries(meta!.subAssets.map((s) => [s.kind, s]));
  expect(Object.keys(byKind).sort()).toEqual(['mesh', 'scene']);
  const mesh = byKind.mesh;
  expect(mesh.sourceIndex).toBe(0);
  expect(mesh.guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(mesh.name).toBe('mesh-0');
  expect(byKind.scene.sourceIndex).toBe(0);
});

test('multi-mesh GLB → one mesh subAsset per mesh + one scene, sourceIndex 0..N-1', async () => {
  const glb = await buildGlb(3);
  const meta = await cookExternalAssetFields(glb, `sha256:${sha256Hex(glb)}`, 'prop-test.glb');
  const meshes = meta!.subAssets.filter((s) => s.kind === 'mesh');
  const scenes = meta!.subAssets.filter((s) => s.kind === 'scene');
  expect(meshes.length).toBe(3);
  expect(scenes.length).toBe(1);
  meshes.forEach((s, i) => {
    expect(s.sourceIndex).toBe(i);
    expect(s.name).toBe(`mesh-${i}`);
  });
});

test('textured GLB → mesh + material + scene + texture subAssets (texture sourceIndex = image index)', async () => {
  const glb = await buildTexturedGlb();
  const meta = await cookExternalAssetFields(glb, `sha256:${sha256Hex(glb)}`, 'prop-tex.glb');
  expect(meta).not.toBeNull();
  const byKind: Record<string, typeof meta!.subAssets> = {};
  for (const s of meta!.subAssets) (byKind[s.kind] ??= []).push(s);
  expect(byKind.mesh?.length).toBe(1);
  expect(byKind.material?.length).toBe(1);
  expect(byKind.scene?.length).toBe(1);
  expect(byKind.texture?.length).toBe(1);
  expect(byKind.texture![0].sourceIndex).toBe(0);
  expect(byKind.texture![0].guid).not.toBe(byKind.mesh![0].guid);
});

test('deterministic GUID: same GLB + same contentHash → same GUIDs across runs', async () => {
  const glb = await buildGlb(2);
  const contentHash = `sha256:${sha256Hex(glb)}`;
  const a = await cookExternalAssetFields(glb, contentHash, 'prop-test.glb');
  const b = await cookExternalAssetFields(glb, contentHash, 'prop-test.glb');
  expect(a!.subAssets.map((s) => s.guid)).toEqual(b!.subAssets.map((s) => s.guid));
});

test('mesh GUID stays sha256(hash:sourceIndex) so existing scene-pack refs survive re-cook', async () => {
  const glb = await buildGlb(1);
  const bareHash = sha256Hex(glb);
  const meta = await cookExternalAssetFields(glb, `sha256:${bareHash}`, 'prop-test.glb');
  const mesh = meta!.subAssets.find((s) => s.kind === 'mesh')!;
  const expected = `${createHash('sha256').update(`${bareHash}:0`).digest('hex').slice(0, 8)}-${createHash('sha256').update(`${bareHash}:0`).digest('hex').slice(8, 12)}-${createHash('sha256').update(`${bareHash}:0`).digest('hex').slice(12, 16)}-${createHash('sha256').update(`${bareHash}:0`).digest('hex').slice(16, 20)}-${createHash('sha256').update(`${bareHash}:0`).digest('hex').slice(20, 32)}`;
  expect(mesh.guid).toBe(expected);
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
