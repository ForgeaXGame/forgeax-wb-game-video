/**
 * overlayChildPreview —— 把一个 OverlayChild 通用地渲染成预览节点（节点无关）。
 *
 * 不写死任何具体皮肤 id：按 component 查注册表的 role/surface 分流 —— HUD / 交互 / 表现，
 * 各自造对应的运行态 snap 交给 SkinRegistry 渲染。皮肤是什么就画什么，编辑器不认识具体皮肤。
 *
 * timeMs 统一转成 `localMsForChild` 本地时刻再传给皮肤的 preview/previewTimeMs——
 * 供支持预览态的皮肤（如 inkKou / inkYingMo）驱动动画/显隐。
 *
 * 尺寸/位置盒子与 runtime `renderOverlayMount`（见 rendererRegistry.tsx）复用同一份
 * `childWrapStyle` SSOT（layout.ts）：selfPositioned（stageRelative）组件铺满舞台，
 * 否则按 `child.layout` 换算盒子——预览和全屏试玩对同一份 layout 配置必须算出同一个盒子，
 * 不能各写一套换算，否则又会出现"预览忽略配置"的分叉。
 */
import type { CSSProperties, ReactNode } from 'react'
import type { OverlayChild } from '../../runtime/schema/graph-schema'
import { defaultsForComponent, getComponent } from '../../runtime/registry/component-registry'
import type { HudElementView, SkinCtx, SkinRegistry } from '../../runtime/skins/rendererRegistry'
import { childWrapStyle } from '../../runtime/schema/layout'
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

  if (plugin?.surface === 'hud') {
    const bind = typeof inputs.bind === 'string' ? inputs.bind : child.id
    const attr = typeof inputs.attr === 'string' ? inputs.attr : undefined
    const label = typeof inputs.label === 'string' ? inputs.label : undefined
    const accent = typeof inputs.accent === 'string' ? inputs.accent : undefined
    const el: HudElementView = { element: bind, component: child.component, bind, attr, label, accent, layout: child.layout }
    return reg.renderHudElement(el, ctx, preview)
  }

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

  // 表现层（dialogue / floatText / transition …）
  const body = reg.renderOverlay(
    {
      elementId: child.id,
      component: child.component,
      inputs,
    },
    undefined,
    preview,
  )
  if (!body) return null
  // stageRelative 组件（floatText 等靠自己 inputs.x/y 定位）铺满舞台；其余套 childWrapStyle，
  // 让 `child.layout.width/height/left/top` 在预览里也生效（mountHasSize 恒为 false：当前
  // 没有任何 UI 会写 mount 级 layout，见 graphMaterialOps.ts 里对 layout 的写入点）。尺寸/位置
  // 换算完全复用 runtime 同一函数；但预览层始终是被动展示（拖拽走独立的手柄层），
  // 固定 pointerEvents:'none'，不采用 childWrapStyle 给试玩场景准备的 'auto'。
  const wrapStyle: CSSProperties = plugin?.stageRelative
    ? STAGE_FILL_WRAP
    : { ...childWrapStyle(child.layout, false), pointerEvents: 'none' }
  return <div style={wrapStyle}>{body}</div>
}
