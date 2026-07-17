/**
 * 组件注册契约 —— Overlay child 的**唯一扩展点**（历史名 KindPlugin / KindRegistry）。
 *
 * 落盘字段只有 `OverlayChild.component`；插件上的 `kind` 字符串 = 组件 id。
 * `role` / `surface` 仅注册表内部，不进 OverlayChild。
 *
 * 多局并行：每个 GraphRuntime / GraphSession 持有自己的实例；
 * 模块级 `registerKind` / `getKind` / `getComponent` 仍指向默认表。
 */
import type { ComponentEvent, ComponentInput, ComponentManifest, Overlay } from '../schema/node-config-schema'
import type { ElementRole, GameNode, NodeHandle } from '../schema/graph-schema'
import type { OverlayInstanceChild } from '../schema/node-config-schema'
import { expandNodeOverlays } from '../schema/expand-overlay'
import { eventsFromParams } from '../schema/overlay-events'
import type { MutableState } from '../engine/apply-effects'
import type { RuntimeDirective } from '../engine/directives'

/** 引擎给运行时契约的上下文（纯数据，模块不摸 DOM、不反读引擎内部）。 */
export interface RuntimeCtx {
  state: MutableState
  nodeId: string
  elapsedMs: number
  /** 当前正在执行的时间线元素 id（render/present 构造 directive 用）。 */
  elementId?: string
}

export interface KindPlugin<P = Record<string, unknown>> {
  /** 组件 id（= OverlayChild.component / 注册键）。 */
  kind: string
  /** 引擎调度用（不进落盘 OverlayChild）。 */
  role: ElementRole
  /** HUD 呈现面（GraphPlaySurface 等据此分流）。 */
  surface?: 'hud'
  /**
   * 组件内部用 %/inset 相对父框定位；挂载未配 layout 时，父框需铺满视频舞台。
   * （如 floatText / dialogue / transition）
   */
  stageRelative?: boolean
  /** 同行为的其它 component id（如 battleParry → qte）。 */
  aliases?: string[]
  /**
   * 组件会抛出的**事件**（= 出口 handle 来源）。
   * 静态出口写这里（如 qte 的 pass/good/fail）；随实例变化的（choice/hotspot 的选项）写在 `inputs.events`，
   * 运行时出口 = `inputs.events`（若有）否则本字段（见 `handlesOf`）。
   */
  events?: ComponentEvent[]
  /** 中文标签（编辑器「+ 元素」菜单展示）；缺省用 kind。 */
  label?: string
  /**
   * **输入契约（In · 唯一 SSOT）**：组件接收哪些 inputs 及其语义类型 + `default`（新建初值）。
   * 进 `ComponentManifest.inputs`；编辑器据此自动渲染配置控件（valueType→控件、options→select、component→复合编辑器）。
   * 新建实例默认值由各 input 的 `default` 组装（`buildDefaults`），不再有 `defaults()` 方法。
   */
  inputs?: ComponentInput[]

  // ── 可选行为逃生舱（默认数据驱动；仅少数组件需要）──────────────────────────────
  /** 作者期跨字段校验（如 floatText 需 text||expr）；必填/类型由 inputs.required/valueType 兜底。 */
  validate?(inputs: P): string[]
  /**
   * 到触发时机按当前态**算出要发的 overlay 指令**（唯一命令式钩子，供 floatText 之类按 expr 求值）。
   * 多数 presentation 无 render：走引擎泛型 renderOverlay，Player 按 inputs 直接画。
   * interaction 无判定钩子：皮肤自判定后经 emit 抛已声明 event id，引擎按事件路由。
   */
  render?(ctx: RuntimeCtx, inputs: P): RuntimeDirective[]
}

/** 从 inputs[].default 组装新建实例默认值（取代旧 `defaults()` 方法）。 */
export function buildDefaults(inputs: ComponentInput[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const i of inputs ?? []) if (i.default !== undefined) out[i.key] = i.default
  return out
}

/** 可注入的组件注册表（每局 Runtime 一份即可隔离）。 */
export class KindRegistry {
  private readonly kinds = new Map<string, KindPlugin>()
  private readonly plugins = new Map<string, { version?: string }>()

  registerKind<P>(plugin: KindPlugin<P>): void {
    const p = plugin as unknown as KindPlugin
    this.kinds.set(p.kind, p)
    for (const a of p.aliases ?? []) this.kinds.set(a, p)
  }
  unregisterKind(kind: string): void {
    const p = this.kinds.get(kind)
    this.kinds.delete(kind)
    if (p) {
      for (const [k, v] of this.kinds) {
        if (v === p) this.kinds.delete(k)
      }
    }
  }
  getKind(kind: string): KindPlugin | undefined {
    return this.kinds.get(kind)
  }
  /** 与 getKind 同义：按 OverlayChild.component 查找。 */
  getComponent(componentId: string): KindPlugin | undefined {
    return this.kinds.get(componentId)
  }
  listKinds(): KindPlugin[] {
    const seen = new Set<KindPlugin>()
    const out: KindPlugin[] = []
    for (const p of this.kinds.values()) {
      if (seen.has(p)) continue
      seen.add(p)
      out.push(p)
    }
    return out
  }

  /** 组件导出清单（manifest）：inputs（契约）+ events（无则从 inputs 默认值折）。 */
  getManifest(componentId: string): ComponentManifest | undefined {
    const p = this.getComponent(componentId)
    if (!p) return undefined
    const inputs = p.inputs ?? []
    const events = p.events?.length ? p.events : eventsFromParams(buildDefaults(inputs))
    return {
      id: componentId,
      label: p.label,
      ...(inputs.length ? { inputs } : {}),
      events,
    }
  }

  /** 新建该组件实例的默认 inputs 值（由 inputs[].default 组装）。 */
  defaultsFor(componentId: string): Record<string, unknown> {
    return buildDefaults(this.getComponent(componentId)?.inputs)
  }

  /**
   * 组件实例的出口 handle：实例 `inputs.events`（choice/hotspot 的选项，若有）否则组件静态 `events`（qte 的 pass/good/fail）。
   * 取代旧的 `outputs(inputs)` 方法。
   */
  handlesOf(componentId: string, inputsBag: Record<string, unknown> | undefined): NodeHandle[] {
    const p = this.getComponent(componentId)
    if (!p) return []
    const fromInputs = eventsFromParams(inputsBag ?? {})
    const events = fromInputs.length ? fromInputs : (p.events ?? [])
    return events.map((e) => ({ id: e.id, label: e.label }))
  }

  registerPlugin(id: string, meta?: { version?: string }): void {
    this.plugins.set(id, { version: meta?.version })
  }
  unregisterPlugin(id: string): void {
    this.plugins.delete(id)
  }
  hasPlugin(id: string, version?: string): boolean {
    const meta = this.plugins.get(id)
    if (!meta) return false
    if (version != null && version !== '' && meta.version !== version) return false
    return true
  }
  listPlugins(): Array<{ id: string; version?: string }> {
    return [...this.plugins.entries()].map(([id, m]) => ({ id, version: m.version }))
  }

  /**
   * 派生节点出口目录（outlets）：保留字 `default` + 各挂载组件可发事件。
   * interaction → `outputs(inputs)`（= inputs.events）；presentation 等有 events 的（如面板按钮）一并纳入。
   * 走向由边承接（sourceHandle === 出口 id）。
   */
  deriveOutputs(node: GameNode, overlays?: Record<string, Overlay>): NodeHandle[] {
    const instances = expandNodeOverlays(overlays, node)
    const children: OverlayInstanceChild[] = instances.flatMap((i) => i.children)
    const out: NodeHandle[] = [{ id: 'default' }]
    for (const el of children) out.push(...this.handlesOf(el.component, el.inputs as Record<string, unknown>))
    const seen = new Set<string>()
    return out.filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)))
  }
}

/** 编辑器 / 单测默认表（模块单例）。多局试玩请用 `createCoreKindRegistry()` 新建实例。 */
export const defaultKindRegistry = new KindRegistry()

export function registerKind<P>(plugin: KindPlugin<P>): void {
  defaultKindRegistry.registerKind(plugin)
}
export function unregisterKind(kind: string): void {
  defaultKindRegistry.unregisterKind(kind)
}
export function getKind(kind: string): KindPlugin | undefined {
  return defaultKindRegistry.getKind(kind)
}
export function getComponent(componentId: string): KindPlugin | undefined {
  return defaultKindRegistry.getComponent(componentId)
}
export function getComponentManifest(componentId: string): ComponentManifest | undefined {
  return defaultKindRegistry.getManifest(componentId)
}
export function listKinds(): KindPlugin[] {
  return defaultKindRegistry.listKinds()
}
export function registerPlugin(id: string, meta?: { version?: string }): void {
  defaultKindRegistry.registerPlugin(id, meta)
}
export function unregisterPlugin(id: string): void {
  defaultKindRegistry.unregisterPlugin(id)
}
export function hasPlugin(id: string, version?: string): boolean {
  return defaultKindRegistry.hasPlugin(id, version)
}
export function listPlugins(): Array<{ id: string; version?: string }> {
  return defaultKindRegistry.listPlugins()
}
export function deriveOutputs(node: GameNode, overlays?: Record<string, import('../schema/node-config-schema').Overlay>): NodeHandle[] {
  return defaultKindRegistry.deriveOutputs(node, overlays)
}
/** 组件实例出口 handle（inputs.events 优先，否则组件静态 events）。 */
export function componentHandles(componentId: string, inputsBag: Record<string, unknown> | undefined): NodeHandle[] {
  return defaultKindRegistry.handlesOf(componentId, inputsBag)
}
/** 组件新建实例默认 inputs 值（由 inputs[].default 组装）。 */
export function defaultsForComponent(componentId: string): Record<string, unknown> {
  return defaultKindRegistry.defaultsFor(componentId)
}

/** 输入永远单一 'in'。 */
export function deriveInputs(): NodeHandle[] {
  return [{ id: 'in' }]
}
