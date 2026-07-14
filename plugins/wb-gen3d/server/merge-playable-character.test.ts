
import { expect, test } from 'bun:test';
import { Document, NodeIO, WebIO } from '@gltf-transform/core';
import {
  applyRootMotionStrategy,
  mergePlayableCharacter,
  resolveExportSlots,
} from './merge-playable-character';

async function buildRiggedBase(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Scene');
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const jointsAcc = doc
    .createAccessor()
    .setType('VEC4')
    .setArray(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    .setBuffer(buffer);
  const weights = doc
    .createAccessor()
    .setType('VEC4')
    .setArray(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]))
    .setBuffer(buffer);
  const ibm = doc
    .createAccessor()
    .setType('MAT4')
    .setArray(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]))
    .setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('JOINTS_0', jointsAcc)
    .setAttribute('WEIGHTS_0', weights);
  const mesh = doc.createMesh('body').addPrimitive(prim);
  const hips = doc.createNode('Hips');
  const skin = doc.createSkin('skin').addJoint(hips).setInverseBindMatrices(ibm);
  const skinned = doc.createNode('skinned').setMesh(mesh).setSkin(skin);
  scene.addChild(hips);
  scene.addChild(skinned);
  // Rest/bind clip that must be discarded.
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1])).setBuffer(buffer);
  const output = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 0, 0, 0]))
    .setBuffer(buffer);
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
  const channel = doc.createAnimationChannel().setTargetNode(hips).setTargetPath('translation').setSampler(sampler);
  doc.createAnimation('bind').addSampler(sampler).addChannel(channel);
  return new WebIO().writeBinary(doc);
}

async function buildMotionGlb(tx: [number, number, number], name = 'clip'): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  // Duplicate mesh+skin like Meshy motion GLBs (will be pruned after merge).
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const jointsAcc = doc
    .createAccessor()
    .setType('VEC4')
    .setArray(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    .setBuffer(buffer);
  const weights = doc
    .createAccessor()
    .setType('VEC4')
    .setArray(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]))
    .setBuffer(buffer);
  const ibm = doc
    .createAccessor()
    .setType('MAT4')
    .setArray(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]))
    .setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('JOINTS_0', jointsAcc)
    .setAttribute('WEIGHTS_0', weights);
  const mesh = doc.createMesh('dup').addPrimitive(prim);
  const hips = doc.createNode('Hips');
  const skin = doc.createSkin('skin').addJoint(hips).setInverseBindMatrices(ibm);
  scene.addChild(hips);
  scene.addChild(doc.createNode('skinned').setMesh(mesh).setSkin(skin));
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1])).setBuffer(buffer);
  const output = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, tx[0], tx[1], tx[2]]))
    .setBuffer(buffer);
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
  const channel = doc.createAnimationChannel().setTargetNode(hips).setTargetPath('translation').setSampler(sampler);
  doc.createAnimation(name).addSampler(sampler).addChannel(channel);
  return new WebIO().writeBinary(doc);
}

test('resolveExportSlots F1 rejects missing required', () => {
  const res = resolveExportSlots({
    slots: [
      { slotId: 'idle', required: true, rootMotion: 'preserve' },
      { slotId: 'move', required: true, rootMotion: 'remove_xz' },
      { slotId: 'hit', required: false, rootMotion: 'preserve' },
    ],
    mappings: [
      { slotId: 'idle', motionRefKey: 'meshy:1' },
      { slotId: 'move', motionRefKey: null },
      { slotId: 'hit', motionRefKey: null },
    ],
  });
  expect(res.ok).toBe(false);
  if (res.ok) return;
  expect(res.code).toBe('missing_required');
  expect(res.missingSlots).toEqual(['move']);
});

test('resolveExportSlots omits empty optional; allows MAP3 same key', () => {
  const res = resolveExportSlots({
    slots: [
      { slotId: 'idle', required: true, rootMotion: 'preserve' },
      { slotId: 'move', required: true, rootMotion: 'remove_xz' },
      { slotId: 'hit', required: false, rootMotion: 'preserve' },
    ],
    mappings: [
      { slotId: 'idle', motionRefKey: 'meshy:1' },
      { slotId: 'move', motionRefKey: 'meshy:1' },
      { slotId: 'hit', motionRefKey: null },
    ],
  });
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.exportSlotIds).toEqual(['idle', 'move']);
});

test('resolveExportSlots PROF5: no required slots fails', () => {
  const res = resolveExportSlots({
    slots: [{ slotId: 'emote', required: false, rootMotion: 'preserve' }],
    mappings: [{ slotId: 'emote', motionRefKey: 'meshy:1' }],
  });
  expect(res.ok).toBe(false);
  if (res.ok) return;
  expect(res.code).toBe('no_required_slots');
});

test('mergePlayableCharacter merges N clips and drops base bind', async () => {
  const base = await buildRiggedBase();
  const idle = await buildMotionGlb([0, 0, 0]);
  const move = await buildMotionGlb([1, 0, 2]);
  const result = await mergePlayableCharacter({
    baseRiggedGlbBytes: base,
    slots: [
      { slotId: 'idle', motionGlbBytes: idle, rootMotion: 'preserve' },
      { slotId: 'move', motionGlbBytes: move, rootMotion: 'remove_xz' },
    ],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.clipNames.sort()).toEqual(['idle', 'move']);
  const doc = await new NodeIO().readBinary(result.bytes);
  expect(doc.getRoot().listAnimations().length).toBe(2);
  expect(doc.getRoot().listMeshes().length).toBeGreaterThanOrEqual(1);
  expect(doc.getRoot().listSkins().length).toBe(1);
});

test('mergePlayableCharacter rejects 0-clip motion', async () => {
  const base = await buildRiggedBase();
  const doc = new Document();
  doc.createBuffer();
  doc.createScene();
  const empty = await new WebIO().writeBinary(doc);
  const result = await mergePlayableCharacter({
    baseRiggedGlbBytes: base,
    slots: [{ slotId: 'idle', motionGlbBytes: empty, rootMotion: 'preserve' }],
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.code).toBe('motion_clip_count');
});

test('MAP3: same motion bytes can fill two slots as independent clips', async () => {
  const base = await buildRiggedBase();
  const walk = await buildMotionGlb([2, 0, 3]);
  const result = await mergePlayableCharacter({
    baseRiggedGlbBytes: base,
    slots: [
      { slotId: 'idle', motionGlbBytes: walk, rootMotion: 'preserve' },
      { slotId: 'move', motionGlbBytes: walk, rootMotion: 'remove_xz' },
    ],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.clipNames.sort()).toEqual(['idle', 'move']);
});

test('root motion remove_xz zeroes X/Z on Hips translation', async () => {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const hips = doc.createNode('Hips');
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1])).setBuffer(buffer);
  const output = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 5, 2, 7]))
    .setBuffer(buffer);
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
  const channel = doc.createAnimationChannel().setTargetNode(hips).setTargetPath('translation').setSampler(sampler);
  const anim = doc.createAnimation('move').addSampler(sampler).addChannel(channel);
  expect(applyRootMotionStrategy(anim, 'remove_xz', [hips])).toBe(true);
  const arr = output.getArray() as Float32Array;
  expect(arr[3]).toBe(0);
  expect(arr[4]).toBe(2);
  expect(arr[5]).toBe(0);
});

test('root motion non-preserve without Hips/Root fails', async () => {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const bone = doc.createNode('Spine');
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1])).setBuffer(buffer);
  const output = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0]))
    .setBuffer(buffer);
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
  const channel = doc.createAnimationChannel().setTargetNode(bone).setTargetPath('translation').setSampler(sampler);
  const anim = doc.createAnimation('move').addSampler(sampler).addChannel(channel);
  expect(applyRootMotionStrategy(anim, 'remove_xz', [bone])).toBe(false);
});
