import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// One selectable preview clip. Each applied motion is a self-contained GLB
// (ADR-0003), so switching motions = switching which GLB the viewer loads.
// `motionType` is the structural label (provider-private int today; a stable
// semantic key later) and is kept opaque here so the viewer never needs to
// know which retarget engine produced the clip.
export interface ViewerClip {
  url: string;
  label: string;
  key: string;
}

interface ModelStats {
  faces: number;
  vertices: number;
  // World-space bounding box dimensions (x/y/z) after framing.
  size: THREE.Vector3;
  hasSkeleton: boolean;
  // Number of animation clips embedded in the GLB (animated_model exports).
  clipCount: number;
}

// ModelViewer — render a GLB at `url` in a self-contained three.js canvas with
// orbit controls. The mount is the single owner of the renderer/scene/RAF loop;
// everything is torn down on unmount or url change to avoid WebGL context leaks
// (browsers cap live contexts, so a leak silently breaks later viewers).
//
// A grid floor and a skeleton overlay are toggled from React state; their three
// objects are created once at load and only have `.visible` flipped, so toggling
// never touches the renderer lifecycle.
export function ModelViewer({
  url,
  clips,
}: {
  // Fallback single-GLB url (back-compat: callers that don't pass `clips`).
  url: string;
  // Selectable preview clips (rest pose + each applied motion). When provided,
  // the first entry is the initial selection and a chip row lets the user swap.
  clips?: ViewerClip[];
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const skeletonRef = useRef<THREE.SkeletonHelper | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [playing, setPlaying] = useState(true);

  // Resolve the selectable clip list once per props change. Falls back to a
  // single synthetic entry around `url` so the rest of the component has one
  // code path regardless of whether the caller passed `clips`.
  const clipList = useMemo<ViewerClip[]>(
    () => (clips && clips.length > 0 ? clips : [{ url, label: '模型', key: '__single__' }]),
    [clips, url],
  );
  const [activeKey, setActiveKey] = useState<string>(clipList[0]!.key);
  // Keep the selection valid when the clip set changes (e.g. a new motion was
  // applied, or a different asset was selected): snap back to the first entry.
  useEffect(() => {
    if (!clipList.some((c) => c.key === activeKey)) setActiveKey(clipList[0]!.key);
  }, [clipList, activeKey]);
  const activeUrl = (clipList.find((c) => c.key === activeKey) ?? clipList[0]!).url;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let raf = 0;
    setStatus('loading');
    setErrMsg('');
    setStats(null);
    gridRef.current = null;
    skeletonRef.current = null;
    mixerRef.current = null;
    actionRef.current = null;

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
      activeUrl,
      (gltf) => {
        if (disposed) return;
        model = gltf.scene;
        // Frame the model: recenter to origin and pull the camera back to fit
        // the bounding sphere so any-scale GLB lands sensibly in view.
        const box = new THREE.Box3().setFromObject(model);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const dimensions = box.getSize(new THREE.Vector3());
        model.position.sub(sphere.center);
        scene.add(model);

        // Accumulate geometry stats and detect a skeleton in one traversal.
        let faces = 0;
        let vertices = 0;
        let hasSkeleton = false;
        model.traverse((obj) => {
          if ((obj as THREE.SkinnedMesh).isSkinnedMesh) hasSkeleton = true;
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh || !mesh.geometry) return;
          const geom = mesh.geometry;
          const posCount = geom.getAttribute('position')?.count ?? 0;
          vertices += posCount;
          faces += geom.index ? geom.index.count / 3 : posCount / 3;
        });

        const r = sphere.radius || 1;
        const dist = r / Math.sin((camera.fov * Math.PI) / 180 / 2);
        camera.position.set(0, r * 0.3, dist * 1.25);
        camera.near = r / 100;
        camera.far = dist * 10;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();

        // Grid floor sized to the model, placed at its base.
        const grid = new THREE.GridHelper(r * 4, 20, 0x3a4250, 0x252b34);
        grid.position.y = -sphere.center.y - dimensions.y / 2;
        grid.visible = showGrid;
        scene.add(grid);
        gridRef.current = grid;

        if (hasSkeleton) {
          const skeleton = new THREE.SkeletonHelper(model);
          skeleton.visible = showSkeleton;
          scene.add(skeleton);
          skeletonRef.current = skeleton;
        }

        // Animated GLBs (animated_model exports) embed clips; play the first one
        // via an AnimationMixer driven by the shared clock in the RAF loop. When
        // a clip plays, stop auto-rotate so the motion (not the orbit) reads.
        const clips = gltf.animations ?? [];
        if (clips.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          const action = mixer.clipAction(clips[0]!);
          action.play();
          mixerRef.current = mixer;
          actionRef.current = action;
          controls.autoRotate = false;
        }

        setStats({
          faces: Math.round(faces),
          vertices,
          size: dimensions,
          hasSkeleton,
          clipCount: clips.length,
        });
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
      const delta = clock.getDelta();
      if (mixerRef.current) mixerRef.current.update(delta);
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    const clock = new THREE.Clock();
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      gridRef.current = null;
      skeletonRef.current = null;
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        if (model) mixerRef.current.uncacheRoot(model);
        mixerRef.current = null;
      }
      actionRef.current = null;
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
    // showGrid/showSkeleton are intentionally excluded: toggling them must not
    // rebuild the scene; the dedicated effects below flip `.visible` instead.
    // Switching `activeUrl` (motion chip) DOES rebuild: each motion is a separate
    // GLB, and a full teardown/reload is the leak-safe way to swap it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUrl]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

  useEffect(() => {
    if (skeletonRef.current) skeletonRef.current.visible = showSkeleton;
  }, [showSkeleton]);

  useEffect(() => {
    if (actionRef.current) actionRef.current.paused = !playing;
  }, [playing, stats]);

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="model-viewer">
      <div ref={mountRef} className="model-viewer-canvas" />
      {status === 'loading' && <div className="model-viewer-overlay">加载模型…</div>}
      {status === 'error' && (
        <div className="model-viewer-overlay model-viewer-overlay--error" title={errMsg}>
          模型加载失败
        </div>
      )}

      {clipList.length > 1 && (
        <div className="model-viewer-clips" role="group" aria-label="切换动作">
          {clipList.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`mv-toggle mv-clip ${c.key === activeKey ? 'is-on' : ''}`}
              aria-pressed={c.key === activeKey}
              onClick={() => setActiveKey(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="model-viewer-toolbar">
        <button
          type="button"
          className={`mv-toggle ${showGrid ? 'is-on' : ''}`}
          aria-pressed={showGrid}
          onClick={() => setShowGrid((v) => !v)}
        >
          网格
        </button>
        <button
          type="button"
          className={`mv-toggle ${showSkeleton ? 'is-on' : ''}`}
          aria-pressed={showSkeleton}
          disabled={!stats?.hasSkeleton}
          title={stats?.hasSkeleton ? '' : '此模型无骨骼'}
          onClick={() => setShowSkeleton((v) => !v)}
        >
          骨骼
        </button>
        {stats && stats.clipCount > 0 && (
          <button
            type="button"
            className={`mv-toggle ${playing ? 'is-on' : ''}`}
            aria-pressed={playing}
            title="播放 / 暂停动画"
            onClick={() => setPlaying((v) => !v)}
          >
            {playing ? '暂停' : '播放'}
          </button>
        )}
      </div>

      {stats && (
        <div className="model-viewer-info">
          <span>{fmt(stats.faces)} 面</span>
          <span>{fmt(stats.vertices)} 顶点</span>
          <span>
            {stats.size.x.toFixed(2)} × {stats.size.y.toFixed(2)} × {stats.size.z.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
