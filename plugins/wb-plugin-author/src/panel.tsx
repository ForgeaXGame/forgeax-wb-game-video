// Phase D6 (4/4) placeholder — @forgeax-plugin/wb-plugin-author.
//
// Real impl per docs/v2-vision/architecture-evolution/09-NON-EXPERT-AUTHORING.md §4:
//   - left pane: file tree under ~/.forgeax/plugins/<id>/
//   - middle pane: Monaco editor (markdown/json/ts)
//   - save → POST /api/plugins/reload → effect visible in sidebar
//
// Until that lands, this shim follows the marketplace convention used by
// wb-skill / wb-anim / wb-bgm: render() throws loudly so any consumer that
// mounts the panel sees the deferral message rather than silent emptiness.
//
// The currently-supported authoring paths:
//   - SettingsPanel · "Fork & 录制"     (D6 path 2/4 — implemented)
//   - SettingsPanel · ".fxpack 导入"    (D6 path 3/4 — implemented)
//   - meta:author-plugin skill          (D6 path 1/4 — implemented)

export interface WorkbenchPanelHandle {
  unmount(): void;
}

const PHASE_D6_4_MESSAGE =
  '[Phase D6 4/4 placeholder] @forgeax-plugin/wb-plugin-author · ' +
  'in-app editor 未实现。当前作者路径:SettingsPanel · Fork & 录制 / .fxpack 导入,' +
  '或 chat 输入 /author-plugin。';

export function render(_target: unknown): WorkbenchPanelHandle {
  throw new Error(PHASE_D6_4_MESSAGE);
}

export function createPanel(): never {
  throw new Error(PHASE_D6_4_MESSAGE);
}

export const __placeholder = true as const;
