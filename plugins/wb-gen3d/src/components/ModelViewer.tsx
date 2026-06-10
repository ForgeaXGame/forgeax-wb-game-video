import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ModelViewer — render a GLB at `url` in a self-contained three.js canvas with
// orbit controls. The mount is the single owner of the renderer/scene/RAF loop;
// everything is torn down on unmount or url change to avoid WebGL context leaks
// (browsers cap live contexts, so a leak silently breaks later viewers).
export function ModelViewer({ url }: { url: string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let raf = 0;
    setStatus('loading');
    setErrMsg('');

    const width = mount.clientWidth || 480;
    const height = mount.clientHeight || 320;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14171c);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
    camera.position.set(0, 1, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;

    const loader = new GLTFLoader();
    let model: THREE.Object3D | null = null;

    loader.load(
      url,
      (gltf) => {
        if (disposed) return;
        model = gltf.scene;
        // Frame the model: recenter to origin and pull the camera back to fit
        // the bounding sphere so any-scale GLB lands sensibly in view.
        const box = new THREE.Box3().setFromObject(model);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        model.position.sub(sphere.center);
        scene.add(model);

        const r = sphere.radius || 1;
        const dist = r / Math.sin((camera.fov * Math.PI) / 180 / 2);
        camera.position.set(0, r * 0.3, dist * 1.25);
        camera.near = r / 100;
        camera.far = dist * 10;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();
        setStatus('ready');
      },
      undefined,
      (err) => {
        if (disposed) return;
        setStatus('error');
        setErrMsg(err instanceof Error ? err.message : String(err));
      },
    );

    const onResize = () => {
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      if (model) {
        model.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const mat = mesh.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else if (mat) (mat as THREE.Material).dispose();
        });
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [url]);

  return (
    <div className="model-viewer">
      <div ref={mountRef} className="model-viewer-canvas" />
      {status === 'loading' && <div className="model-viewer-overlay">加载模型…</div>}
      {status === 'error' && (
        <div className="model-viewer-overlay model-viewer-overlay--error" title={errMsg}>
          模型加载失败
        </div>
      )}
    </div>
  );
}
