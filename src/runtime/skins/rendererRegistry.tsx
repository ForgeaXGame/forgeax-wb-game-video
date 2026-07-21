/**
 * Player 渲染器 registry —— 按 `component`（顶层组件 id）派发**独立 React 组件**（spec §3.3）。
 *
 * 多局并行：每个 GraphSession 持有自己的 `SkinRegistry`；模块级 `register*` / `render*`
 * 仍指向 `defaultSkinRegistry`（编辑器兼容）。
 *
 * 表现层统一走 overlay 表（含原 HUD 血条）；交互仍走 interaction 表（B 阶段再并轨）。
 */
import { Component, createContext, useContext, type ComponentType, type CSSProperties, type ErrorInfo, type ReactNode } from 'react'
import type { OverlaySnap, OverlayMountSnap, InteractionSnap, HudSnap } from '../engine/session'
import type { ConditionTarget } from '../engine/condition'
import { childWrapStyle, layoutHasExplicitSize, mountWrapStyle } from '../schema/layout'
import { isPlayerFocused } from '../input/playerFocus'

/** 皮肤组件渲染时可读的游戏态上下文（vars/entities/score/flags）。 */
export interface SkinCtx {
  hud: HudSnap
  /**
   * 选项门控求值目标（与引擎 condition 同源）。
   * 试玩面应注入 `runtime.state`；缺省时 `isOptionLocked` 用 hud 拼弱化态。
   */
  condition?: ConditionTarget
}

// ── 组件 props 契约 ──────────────────────────────────────────────────────────
export interface OverlayProps {
  overlay: OverlaySnap
  /** 展示组件的非阻塞事件回调（按钮点击等）；由试玩面注入，路由到 session.emitEvent。 */
  emit?: (key: string) => void
  /** 绘制时 resolve（如 battleHpBar 的 bind→value）与选项门控。 */
  ctx?: SkinCtx
  /** 编辑器预览：纯 CSS 动画已由宿主 `.gc-preview-clock.is-paused` 统一冻住，多数皮肤无需接这两个。 */
  preview?: boolean
  previewTimeMs?: number
}
export interface InteractionProps {
  interaction: InteractionSnap
  submit: (input: unknown) => void
  ctx?: SkinCtx
  /** 编辑器预览：由 previewTimeMs 驱动显隐/动画冻结，不吃键、不 submit。 */
  preview?: boolean
  previewTimeMs?: number
}
export type OverlayComponent = ComponentType<OverlayProps>
export type InteractionComponent = ComponentType<InteractionProps>

/** Player 根节点（供交互皮做焦点门控）。由 GraphPlayer / PlaySurface 注入。 */
export const PlayerRootContext = createContext<HTMLElement | null>(null)

/** 交互皮 keydown 前调用：仅当前焦点 Player 放行。 */
export function usePlayerKeyGate(): (e?: KeyboardEvent) => boolean {
  const root = useContext(PlayerRootContext)
  return () => isPlayerFocused(root)
}

// ── 错误隔离：坏组件只提示、不拖垮引擎 ──────────────────────────────────────────
function SkinErrorChip({ name, message }: { name: string; message: string }): ReactNode {
  return (
    <div
      style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 999, maxWidth: '80%', padding: '6px 12px', borderRadius: 8, background: 'rgba(120,20,20,0.92)', border: '1px solid #ff6b6b', color: '#ffdede', fontSize: 12, pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
    >
      ⚠ 组件「{name}」渲染出错（已隔离，不影响流程）：{message}
    </div>
  )
}

class SkinErrorBoundary extends Component<{ name: string; fallback?: ReactNode; children: ReactNode }, { err: Error | null }> {
  override state: { err: Error | null } = { err: null }
  static getDerivedStateFromError(err: Error): { err: Error } {
    return { err }
  }
  override componentDidCatch(err: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(`[skin:${this.props.name}] 渲染出错，已隔离：`, err, info?.componentStack)
  }
  override render(): ReactNode {
    if (this.state.err) {
      return (
        <>
          {this.props.fallback}
          <SkinErrorChip name={this.props.name} message={this.state.err.message} />
        </>
      )
    }
    return this.props.children
  }
}

function safe(name: string, submit: (input: unknown) => void): (input: unknown) => void {
  return (input) => {
    try {
      submit(input)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[skin:${name}] submit 出错，已隔离：`, e)
    }
  }
}

/** 可注入的 Overlay / Interaction 渲染表（每局 Session 一份）。 */
export class SkinRegistry {
  private readonly overlay = new Map<string, OverlayComponent>()
  private readonly interaction = new Map<string, InteractionComponent>()

  registerOverlayRenderer(kind: string, c: OverlayComponent): void {
    this.overlay.set(kind, c)
  }
  registerInteractionRenderer(kind: string, c: InteractionComponent): void {
    this.interaction.set(kind, c)
  }
  registerInteractionSkin(id: string, c: InteractionComponent): void {
    this.interaction.set(id, c)
  }
  /** 是否已注册表现层 overlay 渲染器。 */
  hasOverlayRenderer(id: string): boolean {
    return this.overlay.has(id)
  }
  /** 是否已注册交互/皮肤渲染器。 */
  hasInteractionRenderer(id: string): boolean {
    return this.interaction.has(id)
  }

  /**
   * 渲染一份挂载的全部 children（统一 overlay 表）。
   * 舞台尺寸由 OverlayNode.layout / OverlayChild.layout 配置（如 `STAGE_FILL_LAYOUT`）。
   */
  renderOverlayMount(
    mount: OverlayMountSnap,
    emit?: (elementId: string, key: string) => void,
    ctx?: SkinCtx,
  ): ReactNode {
    const mountHasSize = layoutHasExplicitSize(mount.mountLayout)
    const wrapStyle: CSSProperties = mountWrapStyle(mount.mountLayout)
    return (
      <div key={mount.mountId} style={wrapStyle}>
        {mount.children.map((child) => {
          const C = this.overlay.get(child.component)
          if (!C) return null
          const snap: OverlaySnap = {
            elementId: child.elementId,
            component: child.component,
            inputs: child.inputs,
          }
          const childWrap: CSSProperties = childWrapStyle(child.childLayout, mountHasSize)
          return (
            <div key={child.elementId} style={childWrap}>
              <SkinErrorBoundary name={child.component}>
                <C
                  overlay={snap}
                  emit={(key) => emit?.(child.elementId, key)}
                  ctx={ctx}
                />
              </SkinErrorBoundary>
            </div>
          )
        })}
      </div>
    )
  }

  /** @deprecated 用 renderOverlayMount */
  renderOverlay(
    overlay: OverlaySnap,
    emit?: (key: string) => void,
    preview?: { timeMs?: number },
    ctx?: SkinCtx,
  ): ReactNode {
    const C = this.overlay.get(overlay.component)
    if (!C) return null
    return (
      <SkinErrorBoundary key={overlay.elementId} name={overlay.component}>
        <C
          overlay={overlay}
          emit={emit}
          ctx={ctx}
          preview={!!preview}
          previewTimeMs={preview?.timeMs}
        />
      </SkinErrorBoundary>
    )
  }

  renderInteraction(interaction: InteractionSnap, submit: (input: unknown) => void, ctx?: SkinCtx, preview?: { timeMs?: number }): ReactNode {
    const C = this.interaction.get(interaction.component)
    if (!C) return null
    const name = interaction.component
    const props: InteractionProps = {
      interaction,
      submit: safe(name, submit),
      ctx,
      preview: !!preview,
      previewTimeMs: preview?.timeMs,
    }
    return (
      <SkinErrorBoundary key={`${interaction.elementId}:${name}`} name={name}>
        <C {...props} />
      </SkinErrorBoundary>
    )
  }

  /**
   * @deprecated 默认渲染器已迁到 `skins/components/*`，由 `createCoreSkinRegistry` /
   * `registerCoreSkins` 安装。保留为空操作以免旧调用方炸。
   */
  registerCoreRenderers(): void {}
}

export const defaultSkinRegistry = new SkinRegistry()

export function registerOverlayRenderer(kind: string, c: OverlayComponent): void {
  defaultSkinRegistry.registerOverlayRenderer(kind, c)
}
export function renderOverlayMount(
  mount: OverlayMountSnap,
  emit?: (elementId: string, key: string) => void,
  ctx?: SkinCtx,
): ReactNode {
  return defaultSkinRegistry.renderOverlayMount(mount, emit, ctx)
}
export function renderOverlay(
  overlay: OverlaySnap,
  emit?: (key: string) => void,
  preview?: { timeMs?: number },
  ctx?: SkinCtx,
): ReactNode {
  return defaultSkinRegistry.renderOverlay(overlay, emit, preview, ctx)
}
export function registerInteractionRenderer(kind: string, c: InteractionComponent): void {
  defaultSkinRegistry.registerInteractionRenderer(kind, c)
}
export function registerInteractionSkin(id: string, c: InteractionComponent): void {
  defaultSkinRegistry.registerInteractionSkin(id, c)
}
export function renderInteraction(
  interaction: InteractionSnap,
  submit: (input: unknown) => void,
  ctx?: SkinCtx,
  preview?: { timeMs?: number },
): ReactNode {
  return defaultSkinRegistry.renderInteraction(interaction, submit, ctx, preview)
}
/** @deprecated 见 `SkinRegistry.registerCoreRenderers`；请用 `registerCoreSkins()`。 */
export function registerCoreRenderers(): void {
  defaultSkinRegistry.registerCoreRenderers()
}
