/**
 * overlayChildPreview —— 把一个 OverlayChild 通用地渲染成预览节点（节点无关）。
 *
 * 不写死任何具体皮肤 id：按 component 查注册表的 role/surface 分流 —— HUD / 交互 / 表现，
 * 各自造对应的运行态 snap 交给 SkinRegistry 渲染。皮肤是什么就画什么，编辑器不认识具体皮肤。
 */
import type { ReactNode } from 'react'
import type { OverlayChild } from '../../runtime/schema/graph-schema'
import { getKind } from '../../runtime/registry/kind-registry'
import type { HudElementView, SkinCtx, SkinRegistry } from '../../runtime/skins/rendererRegistry'

/** 解析落盘 child 的实际渲染 component id（params.component 皮肤优先，回退基础 kind）。 */
function skinIdOf(child: OverlayChild): string {
  const c = child.params?.component
  return typeof c === 'string' && c ? c : child.component
}

/**
 * 渲染单个 overlay child 到预览。timeMs 供支持预览态的皮肤（如 inkKou）驱动动画/显隐。
 * 未知 component 返回 null（不炸）。
 */
export function renderOverlayChildPreview(
  child: OverlayChild,
  reg: SkinRegistry,
  ctx: SkinCtx,
  timeMs: number,
): ReactNode {
  const skinId = skinIdOf(child)
  const plugin = getKind(skinId) ?? getKind(child.component)
  const params = { ...(child.params ?? {}) }
  if (params.component == null) params.component = child.component

  if (plugin?.surface === 'hud') {
    const bind = typeof params.bind === 'string' ? params.bind : child.id
    const label = typeof params.label === 'string' ? params.label : undefined
    const accent = typeof params.accent === 'string' ? params.accent : undefined
    const el: HudElementView = { element: bind, component: skinId, bind, label, accent, layout: child.layout }
    return reg.renderHudElement(el, ctx)
  }

  if (plugin?.role === 'interaction') {
    return reg.renderInteraction(
      {
        elementId: child.id,
        component: child.component,
        params,
        handles: [],
        timeoutMs: typeof params.timeoutMs === 'number' ? params.timeoutMs : undefined,
      },
      () => {},
      ctx,
      { timeMs },
    )
  }

  // 表现层（dialogue / floatText / transition …）
  return reg.renderOverlay({
    elementId: child.id,
    component: child.component,
    params,
  })
}
