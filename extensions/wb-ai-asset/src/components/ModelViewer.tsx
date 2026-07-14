import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { t } from '@/i18n';

interface ModelStats {
  faces: number;
  vertices: number;
  size: THREE.Vector3;
}

// Minimal self-contained GLB viewer: neutral studio lighting, auto-framed
// camera, orbit controls, a toggleable ground grid, and face/vertex stats. No
// HDR/shadow/wireframe subsystem (kept dependency-light on purpose).
export function ModelViewer({ url }: { url: string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [showGrid, setShowGrid] = useState(true);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let raf = 0;
    setStatus('loading');
    setErrMsg('');
    setStats(null);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1f27);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.position.set(2, 1.6, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const loader = new GLTFLoader();
    let model: THREE.Object3D | null = null;

    loader.load(
      url,
      (gltf) => {
        if (disposed) return;
        model = gltf.scene;

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        scene.add(model);

        const radius = Math.max(size.x, size.y, size.z, 0.001);
        const dist = radius * 2.6;
        camera.position.set(dist * 0.7, dist * 0.5, dist);
        camera.near = radius / 100;
        camera.far = radius * 100;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();

        let faces = 0;
        let vertices = 0;
        model.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh || !mesh.geometry) return;
          const geom = mesh.geometry;
          const posCount = geom.getAttribute('position')?.count ?? 0;
          vertices += posCount;
          faces += geom.index ? geom.index.count / 3 : posCount / 3;
        });

        const grid = new THREE.GridHelper(radius * 4, 20, 0x3a4250, 0x252b34);
        grid.position.y = -size.y / 2;
        grid.visible = showGrid;
        scene.add(grid);
        gridRef.current = grid;

        setStats({ faces: Math.round(faces), vertices, size });
        setStatus('ready');
      },
      undefined,
      (err) => {
        if (disposed) return;
        setStatus('error');
        setErrMsg(err instanceof Error ? err.message : String(err));
      },
    );

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
          const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        });
      }
      gridRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="aa-viewer">
      <div ref={mountRef} className="aa-viewer-canvas" />
      {status === 'loading' && <div className="aa-viewer-overlay">{t('viewer.loading')}</div>}
      {status === 'error' && (
        <div className="aa-viewer-overlay aa-viewer-overlay--error" title={errMsg}>
          {t('viewer.loadError')}
        </div>
      )}
      <div className="aa-viewer-toolbar">
        <button
          type="button"
          className={`aa-toggle ${showGrid ? 'is-on' : ''}`}
          aria-pressed={showGrid}
          onClick={() => setShowGrid((v) => !v)}
        >
          {t('viewer.grid')}
        </button>
      </div>
      {stats && (
        <div className="aa-viewer-info">
          <span>{t('stat.faces', { count: fmt(stats.faces) })}</span>
          <span>{t('stat.vertices', { count: fmt(stats.vertices) })}</span>
          <span>
            {stats.size.x.toFixed(2)} × {stats.size.y.toFixed(2)} × {stats.size.z.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
