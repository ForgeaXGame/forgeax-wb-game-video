// geometry-check smoke — builds real GLBs in-memory (gltf-transform Document →
// writeBinary), zero network. Asserts the topology gate's hard signals: exact
// face count, vertex welding (so seam-split duplicates don't fake extra
// components/boundaries), the <2000 budget breach, the non-manifold defect, and
// the mark-only parse-failure path (never throws).

import { expect, test } from 'bun:test';
import { Document, WebIO } from '@gltf-transform/core';
import { inspectGlb, topologyReport, topologyReportForGlb } from './geometry-check';

// Build a single-mesh GLB from raw positions (+ optional indices). Non-indexed
// when indices is null, so a test can deliberately duplicate positions to
// exercise welding.
async function buildGlb(positions: number[], indices: number[] | null): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(positions))
    .setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute('POSITION', position);
  if (indices) {
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer));
  }
  const mesh = doc.createMesh().addPrimitive(prim);
  doc.createScene().addChild(doc.createNode().setMesh(mesh));
  return new WebIO().writeBinary(doc);
}

// Four corners of a unit quad in the XY plane.
const QUAD = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];

test('indexed quad → pass: 2 faces, 1 component, shared interior edge is manifold', async () => {
  const glb = await buildGlb(QUAD, [0, 1, 2, 0, 2, 3]);
  const check = await inspectGlb(glb);
  expect(check.faceCount).toBe(2);
  expect(check.components).toBe(1);
  expect(check.nonManifoldEdges).toBe(0);
  expect(check.boundaryEdges).toBe(4); // the 0-2 diagonal is interior (used twice)
  expect(check.verdict).toBe('pass');

  const report = topologyReport(check);
  expect(report.topology).toEqual({ value: 1, source: 'auto' });
  expect(report.rater).toBe('geometry-check');
  expect(report.notes).toContain('topology=pass');
});

test('non-indexed soup welds duplicate positions (no fake components/boundary)', async () => {
  // Two triangles given as a 6-vertex soup, but sharing edge A-B by identical
  // coords. Without welding this would read as 2 components + 6 boundary edges.
  const A = [0, 0, 0];
  const B = [1, 0, 0];
  const C = [0, 1, 0];
  const D = [1, 1, 0];
  const glb = await buildGlb([...A, ...B, ...C, ...A, ...B, ...D], null);
  const check = await inspectGlb(glb);
  expect(check.faceCount).toBe(2);
  expect(check.weldedVertices).toBe(4); // A,B,C,D — the duplicate A,B merged
  expect(check.components).toBe(1);
  expect(check.boundaryEdges).toBe(4);
  expect(check.nonManifoldEdges).toBe(0);
  expect(check.verdict).toBe('pass');
});

test('over budget (>2000 faces) → degraded with a budget reason', async () => {
  const positions: number[] = [];
  for (let t = 0; t < 2001; t++) {
    // Spread triangles apart so nothing accidentally welds.
    positions.push(t, 0, 0, t, 1, 0, t, 0, 1);
  }
  const check = await inspectGlb(await buildGlb(positions, null));
  expect(check.faceCount).toBe(2001);
  expect(check.verdict).toBe('degraded');
  expect(check.reasons.join(' ')).toContain('exceeds budget');

  const report = topologyReport(check);
  expect(report.topology.value).toBe(0);
  expect(report.notes).toContain('topology=degraded');
});

test('non-manifold edge (shared by 3 triangles) → degraded', async () => {
  // Edge A-B shared by ABC, ABD, ABE → used 3 times.
  const A = [0, 0, 0];
  const B = [1, 0, 0];
  const C = [0, 1, 0];
  const D = [0, -1, 0];
  const E = [0, 0, 1];
  const glb = await buildGlb([...A, ...B, ...C, ...D, ...E], [0, 1, 2, 0, 1, 3, 0, 1, 4]);
  const check = await inspectGlb(glb);
  expect(check.faceCount).toBe(3); // under budget — degrades on the defect, not size
  expect(check.nonManifoldEdges).toBeGreaterThanOrEqual(1);
  expect(check.verdict).toBe('degraded');
  expect(check.reasons.join(' ')).toContain('non-manifold');
});

test('unparseable GLB → degraded report, never throws (mark-only)', async () => {
  const report = await topologyReportForGlb(new Uint8Array([1, 2, 3, 4, 5]));
  expect(report.topology.value).toBe(0);
  expect(report.notes).toContain('parse failed');
});
