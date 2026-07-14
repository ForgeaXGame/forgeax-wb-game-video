// Walk a loaded GLTF scene into a plain ObjectiveMetrics for shared heuristics.
// three-dependent (lives in src/, not unit-tested); the scoring it feeds is the
// tested pure unit (shared/quality/heuristics.ts).
import * as THREE from 'three';
import type { ObjectiveMetrics } from '@shared/quality/heuristics';

const DEGENERATE_EPS = 1e-10;

function maxImageSize(tex: THREE.Texture | null | undefined): number {
  const img = tex?.image as { width?: number; height?: number } | undefined;
  if (!img || !img.width || !img.height) return 0;
  return Math.max(img.width, img.height);
}

export function extractObjectiveMetrics(
  root: THREE.Object3D,
  targetFaceCount: number | null,
): ObjectiveMetrics {
  let faces = 0;
  let vertices = 0;
  let degenerate = 0;
  let meshCount = 0;
  let missingNormals = false;
  let hasUV = false;
  let maxTextureSize = 0;
  let hasBaseColorMap = false;
  let hasMetalRoughMap = false;
  let hasNormalMap = false;
  let hasOcclusionMap = false;
  let hasEmissiveMap = false;
  let pbrApplicable = false;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    meshCount += 1;
    const geom = mesh.geometry;
    const pos = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) return;
    vertices += pos.count;
    if (!geom.getAttribute('normal')) missingNormals = true;
    if (geom.getAttribute('uv')) hasUV = true;

    const index = geom.index;
    const triCount = index ? index.count / 3 : pos.count / 3;
    faces += triCount;
    const step = triCount > 20000 ? Math.ceil(triCount / 20000) : 1;
    for (let t = 0; t < triCount; t += step) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, i1);
      c.fromBufferAttribute(pos, i2);
      const area = b.clone().sub(a).cross(c.clone().sub(a)).lengthSq();
      if (area < DEGENERATE_EPS) degenerate += 1;
    }

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (std && (std.isMeshStandardMaterial || (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial)) {
        pbrApplicable = true;
        if (std.map) { hasBaseColorMap = true; maxTextureSize = Math.max(maxTextureSize, maxImageSize(std.map)); }
        if (std.metalnessMap || std.roughnessMap) hasMetalRoughMap = true;
        if (std.normalMap) hasNormalMap = true;
        if (std.aoMap) hasOcclusionMap = true;
        if (std.emissiveMap) hasEmissiveMap = true;
      } else if ((m as THREE.MeshBasicMaterial)?.map) {
        maxTextureSize = Math.max(maxTextureSize, maxImageSize((m as THREE.MeshBasicMaterial).map));
      }
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const dims = [size.x, size.y, size.z].filter((d) => d > 1e-6);
  const aspect = dims.length === 3 ? Math.max(...dims) / Math.min(...dims) : 1;

  const sampled = Math.max(1, Math.ceil(faces / (faces > 20000 ? Math.ceil(faces / 20000) : 1)));
  return {
    faces: Math.round(faces),
    vertices,
    degenerateFaceRatio: sampled > 0 ? degenerate / sampled : 0,
    meshCount,
    missingNormals,
    bboxAspectExtreme: aspect > 25,
    targetFaceCount,
    hasUV,
    maxTextureSize,
    hasBaseColorMap,
    hasMetalRoughMap,
    hasNormalMap,
    hasOcclusionMap,
    hasEmissiveMap,
    pbrApplicable,
  };
}
