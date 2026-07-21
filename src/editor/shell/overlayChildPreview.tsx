/**
 * overlayChildPreview —— 把一个 OverlayChild 通用地渲染成预览节点（节点无关）。
 *
 * 不写死任何具体皮肤 id：按 component 查注册表的 role 分流 —— 交互 / 表现，
 * 各自造对应的运行态 snap 交给 SkinRegistry 渲染。皮肤是什么就画什么，编辑器不认识具体皮肤。
 *
 * timeMs 统一转成 `localMsForChild` 本地时刻再传给皮肤的 preview/previewTimeMs——
 * 供支持预览态的皮肤（如 inkKou / inkYingMo）驱动动画/显隐。
 *
 * 尺寸/位置盒子与 runtime `renderOverlayMount`（见 rendererRegistry.tsx）复用同一份
 * `childWrapStyle` SSOT（layout.ts）：有 layout 则换算盒子，否则按默认。
 */
import type { CSSProperties, ReactNode } from 'react'
import type { OverlayChild } from '../../runtime/schema/graph-schema'
import { defaultsForComponent, getComponent } from '../../runtime/registry/component-registry'
import type { SkinCtx, SkinRegistry } from '../../runtime/skins/rendererRegistry'
import { childWrapStyle, layoutHasExplicitSize } from '../../runtime/schema/layout'
import { applyStyleLockedEventParams } from '../video/graphMaterialOps'
import { localMsForChild } from './previewClock'

const STAGE_FILL_WRAP: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' }

/**
 * 渲染单个 overlay child 到预览。timeMs = 当前播放头（相对整段素材）；未知 component 返回 null（不炸）。
 *
 * 缺省字段兜底：老数据 / 手改 JSON 常见只写 `{ id, component }` 不带 `inputs`——皮肤按自己的
 * `inputs.events` 之类必填字段 map 渲染，缺了就画不出任何东西（不报错，纯静默空白，
 * 容易被误当成「组件坏了」）。这里用 `defaultsForComponent` 兜底缺省值，child 自己写的字段仍优先。
 *
 * 叩击/防反/應默/技能条这几个样式锁定组件还要再过一遍 `applyStyleLockedEventParams`——
 * 通用 defaultsForComponent 只给得出无皮肤特征的泛用兜底（"选项一"），这几个组件自己的出口
 * 文案（應/默、斩/突/守…）只有这个函数知道，预览才能跟真正克隆出来的实例长一样。
 */
export function renderOverlayChildPreview(
  child: OverlayChild,
  reg: SkinRegistry,
  ctx: SkinCtx,
  timeMs: number,
): ReactNode {
  const plugin = getComponent(child.component)
  const inputs = applyStyleLockedEventParams(
    { ...defaultsForComponent(child.component), ...(child.inputs ?? {}) },
    child.component,
  )
  const preview = { timeMs: localMsForChild(child, timeMs) }

  if (plugin?.role === 'interaction') {
    // 交互层不走 mount/child layout（runtime 侧同样把整个 interaction 单独铺一层 inset:0，
    // 不按 Layout 摆放——见 GraphPlaySurface.tsx），锚点交给组件自己的 inputs.x/y。
    const body = reg.renderInteraction(
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
    return body ? <div style={STAGE_FILL_WRAP}>{body}</div> : null
  }

  // 表现层（dialogue / floatText / battleHpBar / transition …）统一 overlay 表 + ctx（绘制时 resolve）。
  const body = reg.renderOverlay(
    {
      elementId: child.id,
      component: child.component,
      inputs,
    },
    undefined,
    preview,
    ctx,
  )
  if (!body) return null
  // 有显式 layout（含 STAGE_FILL）→ childWrapStyle；否则铺满预览舞台（血条等自定位 CSS）。
  const wrapStyle: CSSProperties = layoutHasExplicitSize(child.layout)
    ? { ...childWrapStyle(child.layout, true), pointerEvents: 'none' }
    : STAGE_FILL_WRAP
  return <div style={wrapStyle}>{body}</div>
}
