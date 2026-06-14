# Plan A — Viewer Rendering Enhancement (P1→P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modularize `ModelViewer` (P1, behavior-preserving), then upgrade it to a DCC-like "studio-lite" preview (P2): vertical-gradient background + RoomEnvironment IBL + ACES tone mapping + soft ground shadows + wireframe tri-state + camera chrome (view presets / reset / corner XYZ gizmo) collected behind a `渲染设置` popover, with per-plugin `localStorage` persistence.

**Architecture:** P1 extracts the renderer/camera/controls/RAF/dispose/framing lifecycle out of the 377-line `ModelViewer.tsx` into a pure-ish `viewer/scene.ts` while keeping the *exact* current look (solid `0x14171c` background, ambient+key+fill lights). P2 then adds three net-new, droppable modules — `viewer/environment.ts` (gradient texture + IBL + exposure + lazy HDR presets), `viewer/shadows.ts` (shadowMap + ShadowMaterial ground + frustum fit), `viewer/wireframe.ts` (tri-state) — and rewires `ModelViewer.tsx` to orchestrate them. `viewer/capture.ts` is **deferred to P4** (grill A3).

**Tech Stack:** React 19, three `^0.184.0` (`RoomEnvironment`, `RGBELoader`, `PMREMGenerator`, `ViewHelper`, `ShadowMaterial`, `WireframeGeometry`, `ACESFilmicToneMapping`, `PCFSoftShadowMap`), Vite 6, TypeScript 5.7.

**Scope guard (grill A1/A2/A3):** Only `ModelViewer` render quality + `渲染设置` popover + camera-class chrome. **No** model-transform gizmo, **no** DCC shell (tabs/asset-tree/hierarchy/material lists), **no** reflective floor, **no** `capture.ts`. Default look = "影棚 lite" (bright neutral gradient + RoomEnvironment IBL + ACES + soft shadow), HDR `.hdr` files optional (builtin `RoomEnvironment` fallback).

**Conventions:** All commands run from `packages/marketplace/plugins/wb-gen3d/`. After any `src/**` change you MUST `bun run build` to regenerate `dist/` before hard-refreshing the embedded Workbench (HANDOFF dist 铁律). A is verified by **typecheck + build + visual regression** (no unit tests — three.js/DOM), per spec §11.

**Suggested branch:** `laurenceelu/feat-20260614-gen3d-viewer-studio`.

---

## File Structure

| File | New/Mod | Responsibility |
|---|---|---|
| `src/components/viewer/scene.ts` | **New (P1)** | renderer / camera / OrbitControls / RAF / resize / dispose + model placement & camera framing helpers (moved verbatim from `ModelViewer`) |
| `src/components/ModelViewer.tsx` | Mod (P1+P2) | React shell: load GLB, drive lifecycle via modules, toggles, popover, state, persistence |
| `src/components/viewer/environment.ts` | **New (P2)** | gradient `CanvasTexture` background, `RoomEnvironment`→PMREM IBL, exposure/env-intensity, `HDR_PRESETS` lazy `RGBELoader` |
| `src/components/viewer/shadows.ts` | **New (P2)** | `shadowMap` config, key-light `castShadow` + bbox frustum fit, `ShadowMaterial` ground |
| `src/components/viewer/wireframe.ts` | **New (P2)** | tri-state solid / wireframe / shaded+wireframe apply & restore |
| `src/lib/viewerPrefs.ts` | **New (P2)** | typed `localStorage` get/set for render settings (per-plugin key) |
| `src/styles.css` | Mod (P2) | `渲染设置` popover, segmented tri-state, viewer chrome, gizmo mount |
| `public/hdr/*.hdr` | operator (P2) | optional 1k HDRs; `presets.json` already present; builtin fallback if absent |

---

# PHASE P1 — Behavior-Preserving Modularization

> P1 goal: zero visual/behavioral change. Pure extraction. The diff is "move code into `scene.ts`, call it from `ModelViewer`". Verification is a side-by-side visual regression: it must look and behave **identically** to `main`.

## Task P1.1: Capture the baseline (so regression is provable)

**Files:** none (baseline artifacts only)

- [ ] **Step 1: Confirm a green baseline build**

Run:
```bash
bun install
bun run typecheck && bun run build
```
Expected: both exit 0; `dist/` regenerated.

- [ ] **Step 2: Capture before-screenshots for the regression checklist**

Run the standalone dev server and record the current look as the reference:
```bash
bun run dev
# open http://localhost:15175
```
Capture, for both a `mock` asset and (if available) a `real` asset:
1. default framed view (note: solid dark `#14171c` background, auto-rotating),
2. `网格` on/off,
3. `骨骼` on/off (rigged asset),
4. motion chip switch + `播放`/`暂停`,
5. orbit/zoom, then resize the panel.

Keep these as the P1 acceptance reference. No code yet.

- [ ] **Step 3: Commit the checklist note (optional)**

No code change — skip commit. Proceed to P1.2.

## Task P1.2: Extract `viewer/scene.ts`

**Files:**
- Create: `src/components/viewer/scene.ts`
- Modify: `src/components/ModelViewer.tsx` (replace inline renderer/camera/controls/framing with calls)

- [ ] **Step 1: Create `src/components/viewer/scene.ts` with the moved lifecycle + framing**

This is a 1:1 move of the existing logic (`ModelViewer.tsx:100-127`, `143-194`, `241-285`). Behavior must be identical: same fov/positions/lights/solid background/feet-anchor/cached framing/dispose.

```ts
// src/components/viewer/scene.ts
// Renderer/camera/controls/RAF lifecycle + model placement & framing, extracted
// verbatim from ModelViewer (P1: behavior-preserving). The mount stays the single
// owner of the WebGL context; dispose() tears everything down to avoid context
// leaks. P2 layers environment/shadows/wireframe on top of this core.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface ViewerCore {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  clock: THREE.Clock;
  resize: () => void;
  dispose: () => void;
}

// Create the renderer/scene/camera/controls exactly as the pre-split ModelViewer
// did (solid background + ambient/key/fill lights). P2 replaces the lights/
// background via environment.ts + shadows.ts.
export function createViewerCore(mount: HTMLDivElement): ViewerCore {
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

  return { scene, camera, renderer, controls, clock, resize, dispose };
}

export interface FrameSpec {
  camPos: THREE.Vector3;
  target: THREE.Vector3;
  near: number;
  far: number;
}

// Center the model horizontally and anchor its FEET (bbox floor) to y=0 — NOT its
// center — so a motion GLB (whose first frame may be mid-air) still stands on the
// ground. Returns the measured sphere/size for framing + grid sizing.
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

// Compute the camera framing from the measured bounds (matches the pre-split math).
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

// Dispose all geometries/materials of a loaded model subtree (leak-safe teardown).
export function disposeModel(model: THREE.Object3D): void {
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) (mat as THREE.Material).dispose();
  });
}
```

- [ ] **Step 2: Rewire `ModelViewer.tsx` to use `scene.ts`**

In `src/components/ModelViewer.tsx`, replace the inline renderer/camera/light/controls block (`:100-127`), the framing block (`:165-194`), the resize handler (`:241-247`), and the dispose block (`:261-285`) with calls into the module. Keep the GLB load, traversal stats, grid, skeleton, mixer, and `frameRef` cache logic exactly as-is. The effect body becomes:

```tsx
import {
  createViewerCore,
  placeAndMeasure,
  computeFrame,
  applyFrame,
  disposeModel,
  type FrameSpec,
} from '@/components/viewer/scene';
// ...
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
  const { scene, camera, renderer, controls, clock } = core;

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
      }

      const r = sphere.radius || 1;
      const grid = new THREE.GridHelper(r * 4, 20, 0x3a4250, 0x252b34);
      grid.position.y = 0;
      grid.visible = showGrid;
      scene.add(grid);
      gridRef.current = grid;

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
    raf = requestAnimationFrame(tick);
  };
  tick();

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    gridRef.current = null;
    skeletonRef.current = null;
    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
      if (model) mixerRef.current.uncacheRoot(model);
      mixerRef.current = null;
    }
    actionRef.current = null;
    if (model) disposeModel(model);
    core.dispose();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeUrl, clipsKey]);
```

Note the `frameRef` type still stores `{ key, camPos, target, near, far }`; the spread `{ key: clipsKey, ...f }` keeps it compatible. Remove the now-unused inline `THREE.WebGLRenderer`/light/`OrbitControls` imports only if they become unused (OrbitControls + Color are no longer referenced directly in `ModelViewer` — drop those imports; keep `THREE`, `GLTFLoader`).

- [ ] **Step 2b: Add a tiny `bun test` smoke for the pure framing math (optional but cheap)**

`scene.ts` framing is pure enough to assert without a renderer. Add the test runner first (also used by Plans B/C):

In `package.json` add to `scripts`: `"test": "bun test"`.
In `tsconfig.json` add `"exclude": ["**/*.test.ts"]` (so `tsc` never sees `bun:test`).

```ts
// src/components/viewer/scene.test.ts
import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { computeFrame } from './scene';

test('computeFrame places camera in front at a sane distance', () => {
  const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);
  const size = new THREE.Vector3(1, 2, 1);
  const f = computeFrame(cam, sphere, size);
  expect(f.target.y).toBeCloseTo(1, 5); // midY = size.y/2
  expect(f.camPos.z).toBeGreaterThan(f.target.z);
  expect(f.far).toBeGreaterThan(f.near);
});
```

- [ ] **Step 3: Typecheck + build + run tests**

Run:
```bash
bun run typecheck && bun test && bun run build
```
Expected: typecheck 0 errors; `1 pass`; build succeeds.

- [ ] **Step 4: Visual regression vs the P1.1 baseline**

Run `bun run dev` → http://localhost:15175. Walk the entire P1.1 checklist. Acceptance: **pixel-identical look + identical behavior** (background, lights, auto-rotate, framing, grid/skeleton/play toggles, motion-chip teardown/reload, resize). Then rebuild `dist/` and hard-refresh the embedded Workbench (Studio) and re-check one mock + one real asset, switching between ≥4 assets to confirm no WebGL-context leak (no "too many contexts" warning, later viewers still render).

- [ ] **Step 5: Commit**

```bash
git add src/components/viewer/scene.ts src/components/viewer/scene.test.ts src/components/ModelViewer.tsx package.json tsconfig.json
git commit -m "$(cat <<'EOF'
refactor(wb-gen3d): extract ModelViewer lifecycle into viewer/scene.ts (P1)

Behavior-preserving split: renderer/camera/controls/RAF/dispose +
feet-anchor placement & camera framing move to viewer/scene.ts. Adds
bun test runner (excluded from tsc). No visual/behavior change.
EOF
)"
```

---

# PHASE P2 — Studio-Lite Rendering Features

> Each P2 task is additive and independently reviewable. Build after every task; the gate is the visual checklist. Start with the **observability-changing** ACES + IBL switch (Task P2.1) and verify existing assets look acceptable before layering shadows/wireframe/HDR/chrome.

## Task P2.1: `viewer/environment.ts` — gradient background + RoomEnvironment IBL + ACES

**Files:**
- Create: `src/components/viewer/environment.ts`
- Modify: `src/components/viewer/scene.ts` (switch tone mapping; drop ambient/fill, keep key for shadows), `src/components/ModelViewer.tsx` (wire env)

- [ ] **Step 1: Create `src/components/viewer/environment.ts`**

```ts
// src/components/viewer/environment.ts
// Background + image-based lighting for the studio-lite look.
//   - background tri-state: 'gradient' (default) | 'solid' | 'hdr'
//   - IBL: builtin RoomEnvironment (zero-file) by default; HDR presets lazy-load
//   - exposure (renderer.toneMappingExposure) + environmentIntensity knobs
// All resources created here are disposed via the returned handle.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export type BackgroundMode = 'gradient' | 'solid' | 'hdr';

export interface HdrPreset {
  id: string;
  label: string;
  file: string | null; // null = builtin RoomEnvironment (no file)
}

// builtin is always first + always available (grill A2: builtin fallback).
export const HDR_PRESETS: HdrPreset[] = [
  { id: 'builtin-neutral', label: '中性影棚 (内置)', file: null },
  // operator-provided presets are appended at runtime from /hdr/presets.json
];

const SOLID_COLOR = 0x14171c;
// Bright neutral vertical gradient (grill A2 "影棚 lite"): brighter mid, darker
// top/bottom. Tunable; not from CSS tokens because this is a WebGL texture.
const GRAD_TOP = '#2a2f37';
const GRAD_MID = '#3c424c';
const GRAD_BOTTOM = '#1c2026';

function makeGradientTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, GRAD_TOP);
  g.addColorStop(0.55, GRAD_MID);
  g.addColorStop(1, GRAD_BOTTOM);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface EnvironmentHandle {
  setBackgroundMode: (mode: BackgroundMode) => void;
  setExposure: (v: number) => void;
  setEnvIntensity: (v: number) => void;
  // Lazy-load + apply an HDR preset's equirect for IBL (and bg in 'hdr' mode).
  // builtin id → RoomEnvironment. Rejects/falls back to builtin on load error.
  applyPreset: (id: string) => Promise<void>;
  dispose: () => void;
}

export function createEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): EnvironmentHandle {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const gradient = makeGradientTexture();
  let mode: BackgroundMode = 'gradient';
  // The currently applied IBL env map (PMREM render target texture) + the raw
  // equirect (for 'hdr' background). Disposed on replace.
  let envRT: THREE.WebGLRenderTarget | null = null;
  let hdrEquirect: THREE.DataTexture | null = null;

  const applyBuiltinIBL = () => {
    const room = new RoomEnvironment();
    const rt = pmrem.fromScene(room, 0.04);
    room.dispose?.();
    if (envRT) envRT.dispose();
    envRT = rt;
    scene.environment = rt.texture;
  };

  const refreshBackground = () => {
    if (mode === 'solid') scene.background = new THREE.Color(SOLID_COLOR);
    else if (mode === 'hdr' && hdrEquirect) scene.background = hdrEquirect;
    else scene.background = gradient;
  };

  applyBuiltinIBL();
  refreshBackground();

  return {
    setBackgroundMode: (m) => {
      mode = m;
      refreshBackground();
    },
    setExposure: (v) => {
      renderer.toneMappingExposure = v;
    },
    setEnvIntensity: (v) => {
      scene.environmentIntensity = v;
    },
    applyPreset: async (id) => {
      const preset = HDR_PRESETS.find((p) => p.id === id);
      if (!preset || preset.file === null) {
        if (hdrEquirect) {
          hdrEquirect.dispose();
          hdrEquirect = null;
        }
        applyBuiltinIBL();
        refreshBackground();
        return;
      }
      try {
        const tex = await new RGBELoader().loadAsync(preset.file);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        const rt = pmrem.fromEquirectangular(tex);
        if (envRT) envRT.dispose();
        envRT = rt;
        scene.environment = rt.texture;
        if (hdrEquirect) hdrEquirect.dispose();
        hdrEquirect = tex;
        refreshBackground();
      } catch {
        // grill A2 fallback: HDR failed → builtin neutral + keep going.
        applyBuiltinIBL();
        refreshBackground();
      }
    },
    dispose: () => {
      gradient.dispose();
      if (envRT) envRT.dispose();
      if (hdrEquirect) hdrEquirect.dispose();
      pmrem.dispose();
      scene.environment = null;
    },
  };
}

// Load operator presets from /hdr/presets.json (served from dist root). Best-
// effort: failure leaves only the builtin entry.
export async function loadHdrPresetManifest(): Promise<void> {
  try {
    const res = await fetch('/hdr/presets.json');
    if (!res.ok) return;
    const data = (await res.json()) as { custom?: { id: string; label: string; file: string }[] };
    for (const p of data.custom ?? []) {
      if (!HDR_PRESETS.some((e) => e.id === p.id)) {
        HDR_PRESETS.push({ id: p.id, label: p.label, file: `/hdr/${p.file}` });
      }
    }
  } catch {
    /* builtin only */
  }
}
```

- [ ] **Step 2: Update `scene.ts` for IBL-driven lighting**

In `createViewerCore`, the ACES + IBL now provides ambient/fill. Remove `scene.background` assignment and the `AmbientLight` + `fill` `DirectionalLight` (environment provides them). **Keep** the `key` `DirectionalLight` (it casts the ground shadow in P2.2) but rename for clarity and return it:

```ts
// in scene.ts createViewerCore — replace the background + 3-light block with:
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
  camera.position.set(0, 1, 3);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  // Key light only (IBL provides ambient/fill); used for the ground shadow (P2.2).
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight.position.set(3, 5, 4);
  scene.add(keyLight);
```

Add `keyLight` to the `ViewerCore` interface and the returned object: `keyLight: THREE.DirectionalLight`.

- [ ] **Step 3: Wire environment into `ModelViewer` effect**

In the effect, right after `const core = createViewerCore(mount);`:
```tsx
const env = createEnvironment(core.scene, core.renderer);
void env.applyPreset(prefs.presetId);          // prefs from P2.6; default 'builtin-neutral'
env.setBackgroundMode(prefs.backgroundMode);   // default 'gradient'
env.setExposure(prefs.exposure);               // default 1.0
env.setEnvIntensity(prefs.envIntensity);       // default 1.0
```
and in cleanup, before `core.dispose()`: `env.dispose();`. (Until P2.6 wires `prefs`, use literals `'builtin-neutral'`, `'gradient'`, `1.0`, `1.0`.)

- [ ] **Step 4: Typecheck + build**

```bash
bun run typecheck && bun run build
```
Expected: 0 errors; build OK.

- [ ] **Step 5: Visual regression (observability change is expected, grill A2)**

`bun run dev`. Confirm: bright neutral gradient background, models lit by RoomEnvironment IBL with ACES (more photographic). Compare a mock + a real asset to the P1 reference — the new look is **expected to differ**; acceptance is "PBR reads better, not blown out / not too dark". If too bright/dark, note it for the exposure slider (P2.6). Rebuild `dist/`, hard-refresh Studio, re-check.

- [ ] **Step 6: Commit**

```bash
git add src/components/viewer/environment.ts src/components/viewer/scene.ts src/components/ModelViewer.tsx
git commit -m "feat(wb-gen3d): studio-lite background + RoomEnvironment IBL + ACES (P2.1)"
```

## Task P2.2: `viewer/shadows.ts` — soft ground shadow (default on, D6)

**Files:**
- Create: `src/components/viewer/shadows.ts`
- Modify: `src/components/ModelViewer.tsx`

- [ ] **Step 1: Create `src/components/viewer/shadows.ts`**

```ts
// src/components/viewer/shadows.ts
// PCF-soft ground shadow: enable shadowMap, make the key light cast, fit its
// orthographic frustum to the model bbox, and add a transparent ShadowMaterial
// plane at y=0 (receive-only) so the model reads as standing on the ground.
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
```

- [ ] **Step 2: Wire shadows in `ModelViewer` (after model placed/measured)**

Inside the `loader.load` success callback, after `scene.add(model)` and after `placeAndMeasure` gives `sphere`:
```tsx
const shadow = createGroundShadow(scene, renderer, core.keyLight, model, sphere.radius || 1);
shadow.setEnabled(showShadow); // showShadow state default true; from prefs in P2.6
shadowRef.current = shadow;
```
Add `const shadowRef = useRef<ShadowHandle | null>(null);` and a `const [showShadow, setShowShadow] = useState(true);`. In cleanup: `shadowRef.current?.dispose(); shadowRef.current = null;`. Add a `.visible`-style effect:
```tsx
useEffect(() => { shadowRef.current?.setEnabled(showShadow); }, [showShadow]);
```
The ground plane shares y=0 with the grid; `ShadowMaterial` is transparent so no z-fighting with the grid lines (grid sits exactly on the plane; render order is fine because the shadow plane writes no color). If any z-fight appears, nudge `ground.position.y = -0.001`.

- [ ] **Step 3: Typecheck + build + visual**

```bash
bun run typecheck && bun run build
```
Visual: a soft contact shadow appears under the model on the ground; toggling `showShadow` (temporary button or via P2.6 popover) adds/removes it; no z-fighting with the grid; animated GLB casts a moving shadow. Rebuild `dist/`, hard-refresh Studio.

- [ ] **Step 4: Commit**

```bash
git add src/components/viewer/shadows.ts src/components/ModelViewer.tsx
git commit -m "feat(wb-gen3d): PCF-soft ground shadow via ShadowMaterial (P2.2)"
```

## Task P2.3: `viewer/wireframe.ts` — tri-state

**Files:**
- Create: `src/components/viewer/wireframe.ts`
- Modify: `src/components/ModelViewer.tsx`

- [ ] **Step 1: Create `src/components/viewer/wireframe.ts`**

```ts
// src/components/viewer/wireframe.ts
// Tri-state mesh display:
//   'solid'           — restore original materials (wireframe=false)
//   'wireframe'       — set material.wireframe=true on every mesh material
//   'shaded-wireframe'— keep shaded + overlay LineSegments(WireframeGeometry)
// Caches original wireframe flags so 'solid' restores exactly. Overlay lines are
// disposed when leaving 'shaded-wireframe'.
import * as THREE from 'three';

export type WireMode = 'solid' | 'wireframe' | 'shaded-wireframe';

export interface WireframeHandle {
  setMode: (mode: WireMode) => void;
  dispose: () => void;
}

const OVERLAY_NAME = '__wire_overlay__';

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
      scene.remove(o);
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
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(mesh.geometry), lineMat);
      wire.name = OVERLAY_NAME;
      mesh.add(wire); // follows the mesh's world transform (incl. skinned pose)
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
```

- [ ] **Step 2: Wire wireframe in `ModelViewer`**

After model load: `const wf = createWireframe(scene, model); wf.setMode(wireMode); wireRef.current = wf;` with `const wireRef = useRef<WireframeHandle | null>(null);` and `const [wireMode, setWireMode] = useState<WireMode>('solid');`. Cleanup: `wireRef.current?.dispose(); wireRef.current = null;`. Effect:
```tsx
useEffect(() => { wireRef.current?.setMode(wireMode); }, [wireMode]);
```

- [ ] **Step 3: Typecheck + build + visual**

```bash
bun run typecheck && bun run build
```
Visual: tri-state switches solid → wireframe → shaded+wireframe (lemon-green overlay) and back; overlay lines follow animation; switching does not rebuild the scene; no leaks across asset switches. Rebuild `dist/`, hard-refresh Studio.

- [ ] **Step 4: Commit**

```bash
git add src/components/viewer/wireframe.ts src/components/ModelViewer.tsx
git commit -m "feat(wb-gen3d): wireframe tri-state (solid/wire/shaded+wire) (P2.3)"
```

## Task P2.4: Camera chrome — view presets + reset + corner XYZ gizmo (grill A1)

**Files:**
- Modify: `src/components/ModelViewer.tsx`

- [ ] **Step 1: Add view-preset + reset handlers**

Add a ref to the last computed `FrameSpec` (`lastFrameRef`) set when framing the model. Add handlers that move the camera to canonical directions around the cached target/distance and a reset to the framed view:
```tsx
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js';
// ...
const viewHelperRef = useRef<ViewHelper | null>(null);
const lastFrameRef = useRef<FrameSpec | null>(null);

const setView = (dir: 'front' | 'back' | 'left' | 'right' | 'top' | 'persp') => {
  const core = coreRef.current; const f = lastFrameRef.current;
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

const resetView = () => { const f = lastFrameRef.current; const core = coreRef.current; if (f && core) applyFrame(core.camera, core.controls, f); };
```
Store the `ViewerCore` in a `coreRef` so handlers can reach it (`const coreRef = useRef<ViewerCore | null>(null);` set to `core` in the effect, cleared in cleanup). Set `lastFrameRef.current = f` wherever framing is applied.

- [ ] **Step 2: Mount the corner XYZ `ViewHelper`**

After creating `core`, create the helper bound to the canvas and render it in the RAF loop:
```tsx
const viewHelper = new ViewHelper(core.camera, core.renderer.domElement);
viewHelperRef.current = viewHelper;
// in tick(), after renderer.render(scene, camera):
core.renderer.autoClear = false;
if (viewHelperRef.current) viewHelperRef.current.render(core.renderer);
core.renderer.autoClear = true;
```
Add a small DOM mount for click handling per three's `ViewHelper` docs (an absolutely-positioned `<div id="view-helper">` in the bottom-right; the helper reads pointer events on the renderer canvas). Dispose in cleanup: `viewHelperRef.current?.dispose(); viewHelperRef.current = null;`.

- [ ] **Step 3: Add the chrome buttons to the toolbar**

Extend the existing `.model-viewer-toolbar` with a preset row (六视角 + 复位):
```tsx
<div className="mv-view-row" role="group" aria-label="视角">
  {(['front','back','left','right','top','persp'] as const).map((d) => (
    <button key={d} type="button" className="mv-toggle" onClick={() => setView(d)}>
      {{front:'前',back:'后',left:'左',right:'右',top:'顶',persp:'透'}[d]}
    </button>
  ))}
  <button type="button" className="mv-toggle" onClick={resetView}>复位</button>
</div>
```

- [ ] **Step 4: Typecheck + build + visual**

```bash
bun run typecheck && bun run build
```
Visual: corner gizmo shows X/Y/Z; clicking presets snaps to front/back/left/right/top/persp; 复位 restores the framed view; gizmo click also reorients; resize keeps gizmo in the corner. Rebuild `dist/`, hard-refresh Studio.

- [ ] **Step 5: Commit**

```bash
git add src/components/ModelViewer.tsx
git commit -m "feat(wb-gen3d): camera chrome — view presets, reset, corner XYZ gizmo (P2.4)"
```

## Task P2.5: `渲染设置` popover — collect heavy controls (grill A1, A.5)

**Files:**
- Modify: `src/components/ModelViewer.tsx`, `src/styles.css`

- [ ] **Step 1: Keep light toggles inline; move heavy controls into a popover**

Inline toolbar stays: `网格 / 骨骼 / 播放 / 线框(tri-state)`. New `渲染设置 ⚙` button toggles a popover containing: HDR 预设 `<select>` (from `HDR_PRESETS`), 曝光 `<input type=range 0.2–3.0 step .05>`, 环境强度 `<input type=range 0–2 step .05>`, 地面投影 checkbox, 背景 segmented (`渐变/纯色/HDR`), 环境作背景 checkbox (enabled only when a non-builtin HDR preset is selected).

```tsx
const [showSettings, setShowSettings] = useState(false);
// wire each control to env.* / shadow.setEnabled / setWireMode via refs:
//   exposure → envRef.current?.setExposure(v)
//   envIntensity → envRef.current?.setEnvIntensity(v)
//   preset → void envRef.current?.applyPreset(id)
//   backgroundMode → envRef.current?.setBackgroundMode(m)
//   shadow → setShowShadow(v)
```
Add `const envRef = useRef<EnvironmentHandle | null>(null);` set in the effect. Call `void loadHdrPresetManifest()` once on mount (a `useEffect([])`) so operator presets populate the dropdown.

- [ ] **Step 2: Add popover CSS to `src/styles.css`**

Append (using existing tokens; mirrors `.mv-toggle` / `.fx-segmented` patterns):
```css
.mv-view-row { display: flex; gap: 4px; flex-wrap: wrap; }
.mv-settings-wrap { position: relative; }
.mv-popover {
  position: absolute; right: 0; bottom: calc(100% + 6px); z-index: 5;
  display: grid; gap: 10px; width: 240px; padding: 12px;
  border: 1px solid var(--color-border-strong); border-radius: var(--radius-md);
  background: var(--color-background-floating);
  box-shadow: var(--motion-shadow-hover);
}
.mv-popover label { display: grid; gap: 4px; font-size: 11px; color: var(--color-text-secondary); }
.mv-popover input[type="range"] { width: 100%; accent-color: var(--primary); }
.mv-popover select {
  border: 1px solid var(--color-border-default); border-radius: var(--radius-md);
  background: var(--color-background-floating); color: var(--color-text-primary); padding: 5px 8px;
}
```

- [ ] **Step 3: Typecheck + build + visual**

```bash
bun run typecheck && bun run build
```
Visual: popover opens/closes; exposure slider visibly brightens/darkens; env-intensity changes IBL strength independently; preset dropdown lists builtin (+ any operator presets) and lazy-loads HDR on select (network tab shows the `.hdr` fetched only on selection); 背景三态 switches gradient/solid/HDR; 环境作背景 only enabled for non-builtin presets. Rebuild `dist/`, hard-refresh Studio.

- [ ] **Step 4: Commit**

```bash
git add src/components/ModelViewer.tsx src/styles.css
git commit -m "feat(wb-gen3d): 渲染设置 popover (exposure/IBL/HDR/shadow/background) (P2.5)"
```

## Task P2.6: Persist render settings to `localStorage` (A.5)

**Files:**
- Create: `src/lib/viewerPrefs.ts`
- Modify: `src/components/ModelViewer.tsx`

- [ ] **Step 1: Create `src/lib/viewerPrefs.ts`**

```ts
// src/lib/viewerPrefs.ts
// Per-plugin render-setting persistence (survives asset/session switches).
import type { BackgroundMode } from '@/components/viewer/environment';
import type { WireMode } from '@/components/viewer/wireframe';

export interface ViewerPrefs {
  exposure: number;
  envIntensity: number;
  presetId: string;
  backgroundMode: BackgroundMode;
  showShadow: boolean;
  wireMode: WireMode;
}

const KEY = 'wb-gen3d.viewerPrefs.v1';

export const DEFAULT_PREFS: ViewerPrefs = {
  exposure: 1.0,
  envIntensity: 1.0,
  presetId: 'builtin-neutral',
  backgroundMode: 'gradient',
  showShadow: true,
  wireMode: 'solid',
};

export function loadPrefs(): ViewerPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ViewerPrefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: ViewerPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota/private-mode errors */
  }
}
```

- [ ] **Step 2: Seed `ModelViewer` state from prefs and persist on change**

Initialize the render-setting state from `loadPrefs()` (lazy init), and write back whenever any of them change:
```tsx
const [prefs] = useState(loadPrefs);
const [exposure, setExposure] = useState(prefs.exposure);
const [envIntensity, setEnvIntensity] = useState(prefs.envIntensity);
const [presetId, setPresetId] = useState(prefs.presetId);
const [backgroundMode, setBackgroundMode] = useState(prefs.backgroundMode);
const [showShadow, setShowShadow] = useState(prefs.showShadow);
const [wireMode, setWireMode] = useState(prefs.wireMode);

useEffect(() => {
  savePrefs({ exposure, envIntensity, presetId, backgroundMode, showShadow, wireMode });
}, [exposure, envIntensity, presetId, backgroundMode, showShadow, wireMode]);
```
Use these as the initial values when wiring `env.*` in Task P2.1 Step 3 (replace the literals with the state values). `网格 / 骨骼 / 播放` remain session-only (not persisted), matching current behavior.

- [ ] **Step 3: Typecheck + build + visual**

```bash
bun run typecheck && bun run build
```
Visual: change exposure/preset/background/shadow/wireframe → reload the page (or switch assets, switch motion) → settings persist; `网格/骨骼/播放` reset per asset as before. Rebuild `dist/`, hard-refresh Studio.

- [ ] **Step 4: Commit**

```bash
git add src/lib/viewerPrefs.ts src/components/ModelViewer.tsx
git commit -m "feat(wb-gen3d): persist viewer render settings to localStorage (P2.6)"
```

## Task P2.7: Final regression pass + HANDOFF/CONTEXT notes

**Files:**
- Modify: `HANDOFF.md`, `CONTEXT.md`

- [ ] **Step 1: Full viewer regression**

`bun run dev` and run the entire P1.1 checklist **plus** every P2 feature on: a mock asset, a real textured asset, a rigged asset, and an animated asset. Confirm: no WebGL-context leak across ≥6 asset switches (DevTools console clean), motion-chip switch still teardown/reloads correctly, framing cache still prevents jumps, popover settings persist. Rebuild `dist/` and repeat once inside the embedded Studio Workbench (hard refresh).

- [ ] **Step 2: Update docs**

In `CONTEXT.md` 术语表, add a `渲染设置 / 影棚 lite` entry (background tri-state, IBL, exposure, ground shadow, wireframe tri-state, persisted prefs). In `HANDOFF.md`, mark P1+P2 done and point to this plan + remaining `.hdr` operator open item (spec §13.1).

- [ ] **Step 3: Commit**

```bash
git add HANDOFF.md CONTEXT.md
git commit -m "docs(wb-gen3d): record viewer P1+P2 (studio-lite) completion"
```

---

## Self-Review (A)

**Spec coverage (PLAN §4 / §10 P1–P2 / grill A1–A3):**
- A.0 module split → P1.2 (`scene.ts`) + P2.1/2.2/2.3 (`environment/shadows/wireframe`). `capture.ts` intentionally **omitted** (grill A3 / spec P4). ✅
- A.1 gradient background + tri-state → P2.1 (`makeGradientTexture`, `setBackgroundMode`). ✅
- A.2 RoomEnvironment IBL + lazy HDR presets + exposure (ACES) → P2.1 (`createEnvironment`, `applyPreset`, `loadHdrPresetManifest`). ✅
- A.3 ground shadow default-on → P2.2 (`createGroundShadow`, default `showShadow=true`). ✅
- A.4 wireframe tri-state → P2.3. ✅
- A.5 chrome layout + env-as-background + persistence → P2.4 (camera chrome), P2.5 (popover), P2.6 (`viewerPrefs`). ✅
- grill A2 "影棚 lite, no reflective floor" → only `ShadowMaterial`, no Reflector. ✅
- grill A1 "no transform gizmo / no DCC shell" → only camera chrome added. ✅

**Placeholder scan:** every code step ships real code; verification steps give exact commands + expected output. No TBD/TODO. ✅

**Type consistency:** `ViewerCore` (adds `keyLight` in P2.1), `FrameSpec`, `EnvironmentHandle`, `BackgroundMode`, `HdrPreset`, `ShadowHandle`, `WireMode`, `WireframeHandle`, `ViewerPrefs` are referenced consistently across tasks. `frameRef`/`lastFrameRef` store `{ key?, camPos, target, near, far }` compatibly with `FrameSpec`. ✅

**Known integration risk:** P2.4 `ViewHelper` requires `renderer.autoClear=false` around its render + a corner DOM mount; if the gizmo eats orbit input, gate its pointer handling to its own bounds (three docs). Flagged in the task.
