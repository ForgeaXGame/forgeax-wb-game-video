import * as THREE from 'three';

export interface ShadowHandle {
  ground: THREE.Mesh;
  setEnabled: (on: boolean) => void;
  dispose: () => void;
}

export function createGroundShadow(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  keyLight: THREE.DirectionalLight,
  model: THREE.Object3D,
  radius: number,
): ShadowHandle {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  const cam = keyLight.shadow.camera as THREE.OrthographicCamera;
  const span = Math.max(radius * 1.6, 0.5);
  cam.left = -span;
  cam.right = span;
  cam.top = span;
  cam.bottom = -span;
  cam.near = 0.1;
  cam.far = span * 8;
  cam.updateProjectionMatrix();
  keyLight.shadow.bias = -0.0005;

  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 8, radius * 8),
    new THREE.ShadowMaterial({ opacity: 0.32 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  return {
    ground,
    setEnabled: (on) => {
      ground.visible = on;
      keyLight.castShadow = on;
    },
    dispose: () => {
      scene.remove(ground);
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
    },
  };
}
