/**
 * overlayChildPreview —— 把一个 OverlayChild 通用地渲染成预览节点（节点无关）。
 *
 * 不写死任何具体皮肤 id：按 component 查注册表的 role/surface 分流 —— HUD / 交互 / 表现，
 * 各自造对应的运行态 snap 交给 SkinRegistry 渲染。皮肤是什么就画什么，编辑器不认识具体皮肤。
 *
 * timeMs 统一转成 `localMsForChild` 本地时刻再传给皮肤的 preview/previewTimeMs——
 * 供支持预览态的皮肤（如 inkKou / inkYingMo）驱动动画/显隐。
 */
import type { ReactNode } from 'react'
import type { OverlayChild } from '../../runtime/schema/graph-schema'
import { getKind } from '../../runtime/registry/kind-registry'
import type { HudElementView, SkinCtx, SkinRegistry } from '../../runtime/skins/rendererRegistry'
import { localMsForChild } from './previewClock'

/** 解析落盘 child 的实际渲染 component id（inputs.component 皮肤优先，回退基础 kind）。 */
function skinIdOf(child: OverlayChild): string {
  const c = child.inputs?.component
  return typeof c === 'string' && c ? c : child.component
}

/**
 * 渲染单个 overlay child 到预览。timeMs = 当前播放头（相对整段素材）；未知 component 返回 null（不炸）。
 */
export function renderOverlayChildPreview(
  child: OverlayChild,
  reg: SkinRegistry,
  ctx: SkinCtx,
  timeMs: number,
): ReactNode {
  const skinId = skinIdOf(child)
  const plugin = getKind(skinId) ?? getKind(child.component)
  const inputs = { ...(child.inputs ?? {}) }
  if (inputs.component == null) inputs.component = child.component
  const preview = { timeMs: localMsForChild(child, timeMs) }

  if (plugin?.surface === 'hud') {
    const bind = typeof inputs.bind === 'string' ? inputs.bind : child.id
    const label = typeof inputs.label === 'string' ? inputs.label : undefined
    const accent = typeof inputs.accent === 'string' ? inputs.accent : undefined
    const el: HudElementView = { element: bind, component: skinId, bind, label, accent, layout: child.layout }
    return reg.renderHudElement(el, ctx, preview)
  }

  if (plugin?.role === 'interaction') {
    return reg.renderInteraction(
      {
        elementId: child.id,
        component: child.component,
        inputs,
        handles: [],
        timeoutMs: typeof inputs.timeoutMs === 'number' ? inputs.timeoutMs : undefined,
      },
      () => {},
      ctx,
      preview,
    )
  }

  // 表现层（dialogue / floatText / transition …）
  return reg.renderOverlay(
    {
      elementId: child.id,
      component: child.component,
      inputs,
    },
    undefined,
    preview,
  )
}
