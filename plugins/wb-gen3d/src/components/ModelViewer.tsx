import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js';
import {
  createViewerCore,
  placeAndMeasure,
  computeFrame,
  applyFrame,
  disposeModel,
  type ViewerCore,
  type FrameSpec,
} from '@/components/viewer/scene';
import {
  createEnvironment,
  loadHdrPresetManifest,
  HDR_PRESETS,
  type EnvironmentHandle,
  type BackgroundMode,
} from '@/components/viewer/environment';
import { createGroundShadow, type ShadowHandle } from '@/components/viewer/shadows';
import { createWireframe, type WireframeHandle, type WireMode } from '@/components/viewer/wireframe';
import { loadPrefs, savePrefs } from '@/lib/viewerPrefs';

export interface ViewerClip {
  url: string;
  label: string;
  key: string;
}

interface ModelStats {
  faces: number;
  vertices: number;
  size: THREE.Vector3;
  hasSkeleton: boolean;
  clipCount: number;
}

export function ModelViewer({
  url,
  clips,
}: {
  url: string;
  clips?: ViewerClip[];
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const skeletonRef = useRef<THREE.SkeletonHelper | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const coreRef = useRef<ViewerCore | null>(null);
  const envRef = useRef<EnvironmentHandle | null>(null);
  const shadowRef = useRef<ShadowHandle | null>(null);
  const wireRef = useRef<WireframeHandle | null>(null);
  const viewHelperRef = useRef<ViewHelper | null>(null);
  const lastFrameRef = useRef<FrameSpec | null>(null);
  const frameRef = useRef<{
    key: string;
    camPos: THREE.Vector3;
    target: THREE.Vector3;
    near: number;
    far: number;
  } | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const [prefs] = useState(loadPrefs);
  const [exposure, setExposure] = useState(prefs.exposure);
  const [envIntensity, setEnvIntensity] = useState(prefs.envIntensity);
  const [presetId, setPresetId] = useState(prefs.presetId);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(prefs.backgroundMode);
  const [showShadow, setShowShadow] = useState(prefs.showShadow);
  const [wireMode, setWireMode] = useState<WireMode>(prefs.wireMode);

  useEffect(() => {
    savePrefs({ exposure, envIntensity, presetId, backgroundMode, showShadow, wireMode });
  }, [exposure, envIntensity, presetId, backgroundMode, showShadow, wireMode]);

  useEffect(() => { void loadHdrPresetManifest(); }, []);

  const clipList = useMemo<ViewerClip[]>(
    () => (clips && clips.length > 0 ? clips : [{ url, label: '模型', key: '__single__' }]),
    [clips, url],
  );
  const [activeKey, setActiveKey] = useState<string>(clipList[0]!.key);
  useEffect(() => {
    if (!clipList.some((c) => c.key === activeKey)) setActiveKey(clipList[0]!.key);
  }, [clipList, activeKey]);
  const activeUrl = (clipList.find((c) => c.key === activeKey) ?? clipList[0]!).url;
  const clipsKey = useMemo(() => clipList.map((c) => c.key).join('|'), [clipList]);

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

    const core = createViewerCore(mount);
    coreRef.current = core;
    const { scene, camera, renderer, controls, clock } = core;

    const env = createEnvironment(scene, renderer);
    envRef.current = env;
    void env.applyPreset(presetId);
    env.setBackgroundMode(backgroundMode);
    env.setExposure(exposure);
    env.setEnvIntensity(envIntensity);

    const viewHelper = new ViewHelper(camera, renderer.domElement);
    viewHelperRef.current = viewHelper;

    const loader = new GLTFLoader();
    let model: THREE.Object3D | null = null;

    loader.load(
      activeUrl,
      (gltf) => {
        if (disposed) return;
        model = gltf.scene;
        const { sphere, size } = placeAndMeasure(model);
        scene.add(model);

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

        const cached = frameRef.current;
        if (cached && cached.key === clipsKey) {
          applyFrame(camera, controls, cached as unknown as FrameSpec);
        } else {
          const f = computeFrame(camera, sphere, size);
          applyFrame(camera, controls, f);
          frameRef.current = { key: clipsKey, ...f };
          lastFrameRef.current = f;
        }

        const r = sphere.radius || 1;
        const grid = new THREE.GridHelper(r * 4, 20, 0x3a4250, 0x252b34);
        grid.position.y = 0;
        grid.visible = showGrid;
        scene.add(grid);
        gridRef.current = grid;

        const shadow = createGroundShadow(scene, renderer, core.keyLight, model, r);
        shadow.setEnabled(showShadow);
        shadowRef.current = shadow;

        const wf = createWireframe(scene, model);
        wf.setMode(wireMode);
        wireRef.current = wf;

        if (hasSkeleton) {
          const skeleton = new THREE.SkeletonHelper(model);
          skeleton.visible = showSkeleton;
          scene.add(skeleton);
          skeletonRef.current = skeleton;
        }

        const anims = gltf.animations ?? [];
        if (anims.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          const action = mixer.clipAction(anims[0]!);
          action.play();
          mixerRef.current = mixer;
          actionRef.current = action;
          controls.autoRotate = false;
        }

        setStats({ faces: Math.round(faces), vertices, size, hasSkeleton, clipCount: anims.length });
        setStatus('ready');
      },
      undefined,
      (err) => {
        if (disposed) return;
        setStatus('error');
        setErrMsg(err instanceof Error ? err.message : String(err));
      },
    );

    const ro = new ResizeObserver(core.resize);
    ro.observe(mount);

    const tick = () => {
      const delta = clock.getDelta();
      if (mixerRef.current) mixerRef.current.update(delta);
      controls.update();
      renderer.render(scene, camera);
      renderer.autoClear = false;
      if (viewHelperRef.current) viewHelperRef.current.render(renderer);
      renderer.autoClear = true;
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      gridRef.current = null;
      skeletonRef.current = null;
      wireRef.current?.dispose();
      wireRef.current = null;
      shadowRef.current?.dispose();
      shadowRef.current = null;
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        if (model) mixerRef.current.uncacheRoot(model);
        mixerRef.current = null;
      }
      actionRef.current = null;
      viewHelperRef.current?.dispose();
      viewHelperRef.current = null;
      if (model) disposeModel(model);
      env.dispose();
      envRef.current = null;
      coreRef.current = null;
      core.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUrl, clipsKey]);

  useEffect(() => { if (gridRef.current) gridRef.current.visible = showGrid; }, [showGrid]);
  useEffect(() => { if (skeletonRef.current) skeletonRef.current.visible = showSkeleton; }, [showSkeleton]);
  useEffect(() => { if (actionRef.current) actionRef.current.paused = !playing; }, [playing, stats]);
  useEffect(() => { shadowRef.current?.setEnabled(showShadow); }, [showShadow]);
  useEffect(() => { wireRef.current?.setMode(wireMode); }, [wireMode]);
  useEffect(() => { envRef.current?.setExposure(exposure); }, [exposure]);
  useEffect(() => { envRef.current?.setEnvIntensity(envIntensity); }, [envIntensity]);
  useEffect(() => { envRef.current?.setBackgroundMode(backgroundMode); }, [backgroundMode]);
  useEffect(() => { void envRef.current?.applyPreset(presetId); }, [presetId]);

  const setView = (dir: 'front' | 'back' | 'left' | 'right' | 'top' | 'persp') => {
    const core = coreRef.current;
    const f = lastFrameRef.current;
    if (!core || !f) return;
    const dist = f.camPos.distanceTo(f.target);
    const t = f.target;
    const p = new THREE.Vector3();
    if (dir === 'front') p.set(t.x, t.y, t.z + dist);
    else if (dir === 'back') p.set(t.x, t.y, t.z - dist);
    else if (dir === 'left') p.set(t.x - dist, t.y, t.z);
    else if (dir === 'right') p.set(t.x + dist, t.y, t.z);
    else if (dir === 'top') p.set(t.x, t.y + dist, t.z + 0.0001);
    else p.copy(f.camPos);
    core.camera.position.copy(p);
    core.controls.target.copy(t);
    core.controls.update();
  };

  const resetView = () => {
    const f = lastFrameRef.current;
    const core = coreRef.current;
    if (f && core) applyFrame(core.camera, core.controls, f);
  };

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
        <div className="mv-wire-seg" role="group" aria-label="线框模式">
          {(['solid', 'wireframe', 'shaded-wireframe'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`mv-toggle ${wireMode === m ? 'is-on' : ''}`}
              aria-pressed={wireMode === m}
              onClick={() => setWireMode(m)}
            >
              {{ solid: '实体', wireframe: '线框', 'shaded-wireframe': '着色线框' }[m]}
            </button>
          ))}
        </div>
        <div className="mv-settings-wrap">
          <button
            type="button"
            className={`mv-toggle ${showSettings ? 'is-on' : ''}`}
            onClick={() => setShowSettings((v) => !v)}
            aria-expanded={showSettings}
          >
            ⚙ 渲染设置
          </button>
          {showSettings && (
            <div className="mv-popover">
              <label>
                HDR 预设
                <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                  {HDR_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label>
                曝光 ({exposure.toFixed(2)})
                <input
                  type="range"
                  min={0.2}
                  max={3.0}
                  step={0.05}
                  value={exposure}
                  onChange={(e) => setExposure(Number(e.target.value))}
                />
              </label>
              <label>
                环境强度 ({envIntensity.toFixed(2)})
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={envIntensity}
                  onChange={(e) => setEnvIntensity(Number(e.target.value))}
                />
              </label>
              <label className="fx-check">
                <input
                  type="checkbox"
                  checked={showShadow}
                  onChange={(e) => setShowShadow(e.target.checked)}
                />
                <span>地面投影</span>
              </label>
              <label>
                背景
                <div className="mv-bg-seg" role="group">
                  {(['gradient', 'solid', 'hdr'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`mv-toggle ${backgroundMode === m ? 'is-on' : ''}`}
                      aria-pressed={backgroundMode === m}
                      onClick={() => setBackgroundMode(m)}
                      disabled={m === 'hdr' && presetId === 'builtin-neutral'}
                    >
                      {{ gradient: '渐变', solid: '纯色', hdr: 'HDR' }[m]}
                    </button>
                  ))}
                </div>
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="mv-view-row" role="group" aria-label="视角">
        {(['front', 'back', 'left', 'right', 'top', 'persp'] as const).map((d) => (
          <button key={d} type="button" className="mv-toggle" onClick={() => setView(d)}>
            {{ front: '前', back: '后', left: '左', right: '右', top: '顶', persp: '透' }[d]}
          </button>
        ))}
        <button type="button" className="mv-toggle" onClick={resetView}>复位</button>
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
