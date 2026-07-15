// Topology quality gate (research §5 Phase 3 / 决策②④, 2026-06-30).
//
// Parses a produced GLB and computes the few signals that decide whether a
// low-poly prop is game-ready: the exact triangle count (the hard <2000 budget),
// plus welded connected-components / boundary edges / non-manifold edges. We weld
// vertices by rounded position first because exporters split a single surface
// vertex per normal/UV seam — without welding, every triangle would look like its
// own component and every edge a boundary, making the gate meaningless.
//
// Policy (决策: mark-only, no auto-retry): the verdict NEVER fails generation. It
// is written into the asset's quality.topology (source 'auto') so the UI/agent
// can see a degraded mesh and decide; the asset is always delivered.
//
// Verdict rule — only the two signals that are genuine delivery defects degrade:
//   • faceCount > 2000  (hard budget breach)
//   • non-manifold edges (an edge shared by >2 triangles — a true topology defect)
// boundary edges (open shells) and multi-component counts are RECORDED as notes
// but do NOT degrade: legitimate props are often open (a plane, a cup) or made of
// several disjoint parts (blade + guard + grip).
//
// ⚠️ Draco-compressed GLBs (KHR_draco_mesh_compression) are NOT decoded here (core
// only). If live Meshy returns Draco, inspectGlb throws and topologyReportForGlb
// marks it degraded('glb parse failed') — surfaced, never fatal. Whether Meshy
// emits Draco is confirmed in the post-T2 e2e batch (PLAN §9).

import { WebIO } from '@gltf-transform/core';
import { emptyQualityReport, type QualityReport } from '../shared/manifest';

// Hard delivery budget: low-poly props must stay under 2000 triangles.
const FACE_BUDGET = 2000;
// Vertex weld grid: round positions to 1/1e5 model units before comparing.
const WELD_PRECISION = 1e5;
// glTF primitive.mode for TRIANGLES (the only mode we analyze topology for).
const MODE_TRIANGLES = 4;

export interface GeometryCheck {
  // Total triangles across every primitive (the hard <2000 gate).
  faceCount: number;
  // Distinct vertex positions after welding (seam-split duplicates merged).
  weldedVertices: number;
  // Connected components over welded vertices (disjoint mesh parts).
  components: number;
  // Edges used by exactly one triangle — open boundaries / holes (advisory).
  boundaryEdges: number;
  // Edges shared by >2 triangles — a genuine non-manifold defect.
  nonManifoldEdges: number;
  verdict: 'pass' | 'degraded';
  // Why it degraded (empty on pass).
  reasons: string[];
}

// Minimal union-find over integer vertex ids for component counting.
class UnionFind {
  private readonly parent: number[] = [];
  make(id: number): void {
    while (this.parent.length <= id) this.parent.push(this.parent.length);
  }
  find(id: number): number {
    let root = id;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[id] !== root) {
      const next = this.parent[id];
      this.parent[id] = root;
      id = next;
    }
    return root;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

// Parse + analyze. Throws on an unparseable/compressed GLB (the caller's
// topologyReportForGlb converts that into a degraded report, never a throw).
export async function inspectGlb(glb: Uint8Array): Promise<GeometryCheck> {
  const doc = await new WebIO().readBinary(glb);
  const root = doc.getRoot();

  const weldIds = new Map<string, number>();
  const uf = new UnionFind();
  const used = new Set<number>();
  // Undirected edge "a|b" (a<b) → number of triangles touching it.
  const edgeUse = new Map<string, number>();
  let faceCount = 0;
  let nonTriangleSeen = false;

  const weld = (px: number, py: number, pz: number): number => {
    const key = `${Math.round(px * WELD_PRECISION)}|${Math.round(py * WELD_PRECISION)}|${Math.round(pz * WELD_PRECISION)}`;
    let id = weldIds.get(key);
    if (id === undefined) {
      id = weldIds.size;
      weldIds.set(key, id);
      uf.make(id);
    }
    return id;
  };
  const addEdge = (a: number, b: number): void => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    uf.union(a, b);
  };

  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const posArr = pos?.getArray();
      if (!pos || !posArr) continue;
      if (prim.getMode() !== MODE_TRIANGLES) {
        // Strip/fan/points/lines: count an approximate face budget but skip the
        // edge/manifold analysis (Meshy low-poly output is indexed triangles).
        nonTriangleSeen = true;
        faceCount += Math.max(0, Math.floor(pos.getCount() / 3));
        continue;
      }
      const idxArr = prim.getIndices()?.getArray() ?? null;
      const triCount = idxArr ? Math.floor(idxArr.length / 3) : Math.floor(pos.getCount() / 3);
      for (let t = 0; t < triCount; t++) {
        const localOf = (k: number): number => (idxArr ? Number(idxArr[t * 3 + k]) : t * 3 + k);
        const vert = (k: number): number => {
          const l = localOf(k);
          return weld(posArr[l * 3], posArr[l * 3 + 1], posArr[l * 3 + 2]);
        };
        const a = vert(0);
        const b = vert(1);
        const c = vert(2);
        used.add(a).add(b).add(c);
        addEdge(a, b);
        addEdge(b, c);
        addEdge(c, a);
        faceCount++;
      }
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edgeUse.values()) {
    if (count === 1) boundaryEdges++;
    else if (count > 2) nonManifoldEdges++;
  }
  const roots = new Set<number>();
  for (const id of used) roots.add(uf.find(id));

  const reasons: string[] = [];
  if (faceCount === 0) reasons.push('no triangle geometry found');
  if (faceCount > FACE_BUDGET) reasons.push(`face count ${faceCount} exceeds budget ${FACE_BUDGET}`);
  if (nonManifoldEdges > 0) reasons.push(`${nonManifoldEdges} non-manifold edge(s)`);
  if (nonTriangleSeen) reasons.push('non-triangle primitive (topology not analyzed)');

  return {
    faceCount,
    weldedVertices: weldIds.size,
    components: roots.size,
    boundaryEdges,
    nonManifoldEdges,
    verdict: reasons.length > 0 ? 'degraded' : 'pass',
    reasons,
  };
}

// Build the auto topology QualityReport from a check. topology.value is a
// normalized 0..1 pass/fail (1 = pass, 0 = degraded); the human-readable metrics
// + reasons live in notes. Other dimensions stay null (out-of-band, ADR-0001).
export function topologyReport(check: GeometryCheck): QualityReport {
  const report = emptyQualityReport();
  report.topology = { value: check.verdict === 'pass' ? 1 : 0, source: 'auto' };
  report.method = 'auto';
  report.rater = 'geometry-check';
  report.scoredAt = new Date().toISOString();
  const parts = [
    `topology=${check.verdict}`,
    `faces=${check.faceCount}`,
    `components=${check.components}`,
    `boundaryEdges=${check.boundaryEdges}`,
    `nonManifoldEdges=${check.nonManifoldEdges}`,
  ];
  if (check.reasons.length > 0) parts.push(`reasons: ${check.reasons.join('; ')}`);
  report.notes = parts.join(', ');
  return report;
}

// Parse + report, never throwing: an unparseable/compressed GLB is itself a
// degraded signal under the mark-only policy, not a generation failure.
export async function topologyReportForGlb(glb: Uint8Array): Promise<QualityReport> {
  try {
    return topologyReport(await inspectGlb(glb));
  } catch (err) {
    const report = emptyQualityReport();
    report.topology = { value: 0, source: 'auto' };
    report.method = 'auto';
    report.rater = 'geometry-check';
    report.scoredAt = new Date().toISOString();
    report.notes = `topology=degraded, reasons: glb parse failed (${(err as Error)?.message ?? 'unknown'})`;
    return report;
  }
}
