/**
 * @deprecated 滤镜/特效已迁到 `skins/components/Filter.tsx` / `FxEffect.tsx`，
 * 经 `EXTRA_COMPONENTS` / `registerCoreSkins` 注册。本文件仅作兼容 re-export。
 */
export type { FilterParams } from '../skins/components/Filter'
export { filterComponent } from '../skins/components/Filter'
export type { FxParams } from '../skins/components/FxEffect'
export { fxComponent } from '../skins/components/FxEffect'
export { FILTER_OPTIONS, FX_OPTIONS } from '../fx/video-fx'

import type { ComponentDef } from './component-registry'
import { filterComponent } from '../skins/components/Filter'
import { fxComponent } from '../skins/components/FxEffect'

/** @deprecated 使用 `EXTRA_COMPONENTS`（已含 filter/fx）。 */
export const FX_COMPONENTS: Array<[string, ComponentDef]> = [
  ['filter', filterComponent as unknown as ComponentDef],
  ['fx', fxComponent as unknown as ComponentDef],
]

/** @deprecated 编辑器请调 `registerCoreSkins()` / `bootEditorSkins()`。 */
export function registerFxComponents(): void {
  // no-op：契约已由 registerCoreSkins / createDefaultComponentRegistry 装入
}
