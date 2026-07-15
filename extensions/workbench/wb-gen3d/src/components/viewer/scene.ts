import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface ViewerCore {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  clock: THREE.Clock;
  keyLight: THREE.DirectionalLight;
  resize: () => void;
  dispose: () => void;
}

export function createViewerCore(mount: HTMLDivElement): ViewerCore {
  const width = mount.clientWidth || 480;
  const height = mount.clientHeight || 320;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
  camera.position.set(0, 1, 3);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight.position.set(3, 5, 4);
  scene.add(keyLight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;

  const clock = new THREE.Clock();

  const resize = () => {
    const w = mount.clientWidth || width;
    const h = mount.clientHeight || height;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const dispose = () => {
    controls.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
  };

  return { scene, camera, renderer, controls, clock, keyLight, resize, dispose };
}

export interface FrameSpec {
  camPos: THREE.Vector3;
  target: THREE.Vector3;
  near: number;
  far: number;
}

export function placeAndMeasure(model: THREE.Object3D): {
  sphere: THREE.Sphere;
  size: THREE.Vector3;
} {
  const box = new THREE.Box3().setFromObject(model);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const size = box.getSize(new THREE.Vector3());
  model.position.x -= sphere.center.x;
  model.position.z -= sphere.center.z;
  model.position.y -= box.min.y;
  return { sphere, size };
}

export function computeFrame(
  camera: THREE.PerspectiveCamera,
  sphere: THREE.Sphere,
  size: THREE.Vector3,
): FrameSpec {
  const r = sphere.radius || 1;
  const midY = size.y / 2;
  const dist = r / Math.sin((camera.fov * Math.PI) / 180 / 2);
  return {
    camPos: new THREE.Vector3(0, midY + r * 0.3, dist * 1.25),
    target: new THREE.Vector3(0, midY, 0),
    near: r / 100,
    far: dist * 10,
  };
}

export function applyFrame(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  f: FrameSpec,
): void {
  camera.position.copy(f.camPos);
  camera.near = f.near;
  camera.far = f.far;
  camera.updateProjectionMatrix();
  controls.target.copy(f.target);
  controls.update();
}

export function disposeModel(model: THREE.Object3D): void {
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) (mat as THREE.Material).dispose();
  });
}
