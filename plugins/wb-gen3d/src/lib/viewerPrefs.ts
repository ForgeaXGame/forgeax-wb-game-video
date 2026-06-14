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
