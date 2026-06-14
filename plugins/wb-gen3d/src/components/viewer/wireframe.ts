import * as THREE from 'three';
import { WireframeGeometry } from 'three';

export type WireMode = 'solid' | 'wireframe' | 'shaded-wireframe';

export interface WireframeHandle {
  setMode: (mode: WireMode) => void;
  dispose: () => void;
}

function eachMaterial(model: THREE.Object3D, fn: (m: THREE.Material) => void) {
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach(fn);
    else fn(mat);
  });
}

export function createWireframe(scene: THREE.Scene, model: THREE.Object3D): WireframeHandle {
  const original = new Map<string, boolean>();
  eachMaterial(model, (m) => {
    const wm = m as THREE.MeshStandardMaterial;
    original.set(m.uuid, wm.wireframe ?? false);
  });
  const overlays: THREE.LineSegments[] = [];

  const clearOverlays = () => {
    for (const o of overlays) {
      o.parent?.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    overlays.length = 0;
  };

  const setWireframeFlag = (on: boolean) => {
    eachMaterial(model, (m) => {
      const wm = m as THREE.MeshStandardMaterial;
      wm.wireframe = on ? true : (original.get(m.uuid) ?? false);
    });
  };

  const addOverlays = () => {
    const lineMat = new THREE.LineBasicMaterial({ color: 0x9fe870, transparent: true, opacity: 0.35 });
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const wire = new THREE.LineSegments(new WireframeGeometry(mesh.geometry), lineMat);
      mesh.add(wire);
      overlays.push(wire);
    });
  };

  return {
    setMode: (mode) => {
      clearOverlays();
      if (mode === 'solid') setWireframeFlag(false);
      else if (mode === 'wireframe') setWireframeFlag(true);
      else {
        setWireframeFlag(false);
        addOverlays();
      }
    },
    dispose: clearOverlays,
  };
}
