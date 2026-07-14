import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export type BackgroundMode = 'gradient' | 'solid' | 'hdr';

export interface HdrPreset {
  id: string;
  label: string;
  file: string | null;
}

export const HDR_PRESETS: HdrPreset[] = [
  { id: 'builtin-neutral', label: 'env.builtinNeutral', file: null },
];

const SOLID_COLOR = 0x14171c;
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
