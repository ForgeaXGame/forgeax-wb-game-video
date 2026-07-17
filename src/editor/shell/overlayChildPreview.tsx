/**
 * overlayChildPreview —— 把一个 OverlayChild 通用地渲染成预览节点（节点无关）。
 *
 * 分流对齐试玩 `SkinRegistry.renderOverlayMount`：
 * 先查渲染表（overlay / hud / interaction），再回退 KindPlugin.role/surface。
 * 不依赖「未分类一定是血条」；只要组件包注册了渲染器就能画。
 */
import type { ReactNode } from 'react'
import type { OverlayChild } from '../../runtime/schema/graph-schema'
import { getKind } from '../../runtime/registry/kind-registry'
import { effectiveComponent, stripParamsComponent } from '../../runtime/schema/overlay-component'
import type { HudElementView, SkinCtx, SkinRegistry } from '../../runtime/skins/rendererRegistry'
import { localMsForChild } from './previewClock'

/**
 * 渲染单个 overlay child 到预览。timeMs = 当前播放头（相对整段素材）；三条渲染路径
 * （overlay / hud / interaction）统一转成 `localMsForChild` 本地时刻再传给皮肤的
 * preview/previewTimeMs——供支持预览态的皮肤（如 inkKou / inkYingMo）驱动动画/显隐。
 * 未知 component 返回 null（不炸）。
 */
export function renderOverlayChildPreview(
  child: OverlayChild,
  reg: SkinRegistry,
  ctx: SkinCtx,
  timeMs: number,
): ReactNode {
  const component = effectiveComponent(child)
  const plugin = getKind(component)
  const params = stripParamsComponent(child.params)
  const preview = { timeMs: localMsForChild(child, timeMs) }

  // 1) 表现层：dialogue / floatText / transition / bossHitCheer / panel…
  if (reg.hasOverlayRenderer(component)) {
    return reg.renderOverlay({
      elementId: child.id,
      component,
      params,
    }, undefined, preview)
  }

  // 2) HUD：渲染表有 hud 皮肤，或 Kind 声明 surface:'hud'
  if (reg.hasHudRenderer(component) || plugin?.surface === 'hud') {
    const bind = typeof params.bind === 'string' ? params.bind : child.id
    const attr = typeof params.attr === 'string' ? params.attr : undefined
    const label = typeof params.label === 'string' ? params.label : undefined
    const accent = typeof params.accent === 'string' ? params.accent : undefined
    const el: HudElementView = {
      element: bind,
      component,
      bind,
      attr,
      label,
      accent,
      layout: child.layout ?? { top: 0, left: 0, width: 1, height: 1 },
    }
    return reg.renderHudElement(el, ctx, preview)
  }

  // 3) 交互层：choice / qte / 皮肤 alias
  if (reg.hasInteractionRenderer(component) || plugin?.role === 'interaction') {
    return reg.renderInteraction(
      {
        elementId: child.id,
        component,
        params,
        handles: [],
        timeoutMs: typeof params.timeoutMs === 'number' ? params.timeoutMs : undefined,
      },
      () => {},
      ctx,
      preview,
    )
  }

  return null
}
