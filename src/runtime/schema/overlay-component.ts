/**
 * OverlayChild.component 唯一类型键 —— 行为（Kind）与皮肤同此 id（alias 命中同 KindPlugin）。
 * 遗留双层写法（顶栏 kind + params.component 皮肤）在读路径归一到顶栏。
 */
import type { Overlay, OverlayChild } from './node-config-schema'

/** 实际组件 id：遗留 params.component 优先，否则顶栏。 */
export function effectiveComponent(child: Pick<OverlayChild, 'component' | 'params'>): string {
  const nested = child.params?.component
  if (typeof nested === 'string' && nested) return nested
  return child.component
}

/** 从 params 袋剥掉遗留 component 键。 */
export function stripParamsComponent(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!params) return {}
  const { component: _drop, ...rest } = params
  return rest
}

/**
 * 把遗留 `params.component` 提升到顶栏并剥掉，对齐 schema
 * （顶栏 = 唯一类型键；params 禁止 component）。
 */
export function normalizeOverlayChild(child: OverlayChild): OverlayChild {
  const nested = child.params?.component
  if (typeof nested === 'string' && nested) {
    const { component: _drop, ...rest } = child.params ?? {}
    return { ...child, component: nested, params: rest }
  }
  if (child.params && 'component' in child.params) {
    return { ...child, params: stripParamsComponent(child.params) }
  }
  return child
}

/** 归一整个 overlays 目录（boot / 载入时用）。 */
export function normalizeOverlays(
  overlays: Record<string, Overlay> | undefined,
): Record<string, Overlay> {
  const next: Record<string, Overlay> = {}
  for (const [id, ov] of Object.entries(overlays ?? {})) {
    next[id] = { ...ov, children: ov.children.map(normalizeOverlayChild) }
  }
  return next
}
