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
import { t } from '@/i18n';

export interface ViewerClip {
  url: string;
  label: string;
  key: string;
  /** When set, switch clips inside the same GLB by AnimationClip.name (PREV1). */
  animationName?: string;
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
  const animsRef = useRef<THREE.AnimationClip[]>([]);
  const modelRootRef = useRef<THREE.Object3D | null>(null);
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
    () => (clips && clips.length > 0 ? clips : [{ url, label: t('viewer.clip.single'), key: '__single__' }]),
    [clips, url],
  );
  const [activeKey, setActiveKey] = useState<string>(clipList[0]!.key);
  useEffect(() => {
    if (!clipList.some((c) => c.key === activeKey)) setActiveKey(clipList[0]!.key);
  }, [clipList, activeKey]);
  const activeClip = clipList.find((c) => c.key === activeKey) ?? clipList[0]!;
  const activeUrl = activeClip.url;

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
    animsRef.current = [];
    modelRootRef.current = null;

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
        modelRootRef.current = model;
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
        if (cached && cached.key === activeUrl) {
          applyFrame(camera, controls, cached as unknown as FrameSpec);
        } else {
          const f = computeFrame(camera, sphere, size);
          applyFrame(camera, controls, f);
          frameRef.current = { key: activeUrl, ...f };
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
        animsRef.current = anims;
        if (anims.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          mixerRef.current = mixer;
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
      animsRef.current = [];
      modelRootRef.current = null;
      viewHelperRef.current?.dispose();
      viewHelperRef.current = null;
      if (model) disposeModel(model);
      env.dispose();
      envRef.current = null;
      coreRef.current = null;
      core.dispose();
    };
    // Reload only when the GLB URL changes — same-URL multi-clip switches
    // happen in the animationName effect below (PREV1).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUrl]);

  // PREV1: switch AnimationClip inside an already-loaded merged GLB by name.
  useEffect(() => {
    if (status !== 'ready') return;
    const mixer = mixerRef.current;
    const anims = animsRef.current;
    if (!mixer || anims.length === 0) return;

    const want = activeClip.animationName?.trim();
    const clip =
      (want ? anims.find((a) => a.name === want) : null) ??
      (want ? anims.find((a) => a.name.toLowerCase() === want.toLowerCase()) : null) ??
      anims[0]!;

    if (actionRef.current) {
      actionRef.current.stop();
      actionRef.current = null;
    }
    const action = mixer.clipAction(clip);
    action.reset();
    action.play();
    action.paused = !playing;
    actionRef.current = action;
    // intentionally omit `playing` — pause toggles are handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, activeKey, activeClip.animationName]);

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

  const wireLabels: Record<WireMode, string> = {
    solid: t('viewer.wire.solid'),
    wireframe: t('viewer.wire.wireframe'),
    'shaded-wireframe': t('viewer.wire.shaded'),
  };
  const bgLabels: Record<BackgroundMode, string> = {
    gradient: t('viewer.bg.gradient'),
    solid: t('viewer.bg.solid'),
    hdr: 'HDR',
  };
  const viewLabels: Record<'front' | 'back' | 'left' | 'right' | 'top' | 'persp', string> = {
    front: t('viewer.view.front'),
    back: t('viewer.view.back'),
    left: t('viewer.view.left'),
    right: t('viewer.view.right'),
    top: t('viewer.view.top'),
    persp: t('viewer.view.persp'),
  };

  return (
    <div className="model-viewer">
      <div ref={mountRef} className="model-viewer-canvas" />
      {status === 'loading' && <div className="model-viewer-overlay">{t('viewer.loading')}</div>}
      {status === 'error' && (
        <div className="model-viewer-overlay model-viewer-overlay--error" title={errMsg}>
          {t('viewer.loadError')}
        </div>
      )}

      {clipList.length > 1 && (
        <div className="model-viewer-clips" role="group" aria-label={t('viewer.aria.clips')}>
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
          {t('viewer.toggle.grid')}
        </button>
        <button
          type="button"
          className={`mv-toggle ${showSkeleton ? 'is-on' : ''}`}
          aria-pressed={showSkeleton}
          disabled={!stats?.hasSkeleton}
          title={stats?.hasSkeleton ? '' : t('viewer.skeleton.noSkeleton')}
          onClick={() => setShowSkeleton((v) => !v)}
        >
          {t('viewer.toggle.skeleton')}
        </button>
        {stats && stats.clipCount > 0 && (
          <button
            type="button"
            className={`mv-toggle ${playing ? 'is-on' : ''}`}
            aria-pressed={playing}
            title={t('viewer.play.title')}
            onClick={() => setPlaying((v) => !v)}
          >
            {playing ? t('viewer.btn.pause') : t('viewer.btn.play')}
          </button>
        )}
        <div className="mv-wire-seg" role="group" aria-label={t('viewer.aria.wire')}>
          {(['solid', 'wireframe', 'shaded-wireframe'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`mv-toggle ${wireMode === m ? 'is-on' : ''}`}
              aria-pressed={wireMode === m}
              onClick={() => setWireMode(m)}
            >
              {wireLabels[m]}
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
            ⚙ {t('viewer.btn.settings')}
          </button>
          {showSettings && (
            <div className="mv-popover">
              <label>
                {t('viewer.settings.hdr')}
                <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                  {HDR_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{t(p.label)}</option>
                  ))}
                </select>
              </label>
              <label>
                {t('viewer.settings.exposure', { value: exposure.toFixed(2) })}
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
                {t('viewer.settings.envIntensity', { value: envIntensity.toFixed(2) })}
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
                <span>{t('viewer.settings.shadow')}</span>
              </label>
              <label>
                {t('viewer.settings.background')}
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
                      {bgLabels[m]}
                    </button>
                  ))}
                </div>
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="mv-view-row" role="group" aria-label={t('viewer.aria.view')}>
        {(['front', 'back', 'left', 'right', 'top', 'persp'] as const).map((d) => (
          <button key={d} type="button" className="mv-toggle" onClick={() => setView(d)}>
            {viewLabels[d]}
          </button>
        ))}
        <button type="button" className="mv-toggle" onClick={resetView}>{t('viewer.btn.reset')}</button>
      </div>

      {stats && (
        <div className="model-viewer-info">
          <span>{t('viewer.stats.faces', { n: fmt(stats.faces) })}</span>
          <span>{t('viewer.stats.vertices', { n: fmt(stats.vertices) })}</span>
          <span>
            {stats.size.x.toFixed(2)} × {stats.size.y.toFixed(2)} × {stats.size.z.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
