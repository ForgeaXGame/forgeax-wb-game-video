/**
 * 组件注册契约 —— Overlay child 的**唯一扩展点**（历史名 KindPlugin / KindRegistry）。
 *
 * 落盘字段只有 `OverlayChild.component`；插件上的 `kind` 字符串 = 组件 id。
 * `role` / `surface` 仅注册表内部，不进 OverlayChild。
 *
 * 多局并行：每个 GraphRuntime / GraphSession 持有自己的实例；
 * 模块级 `registerKind` / `getKind` / `getComponent` 仍指向默认表。
 */
import type { ComponentEvent, ComponentInput, ComponentManifest, Overlay, OverlayChild } from '../schema/node-config-schema'
import type { ElementRole, GameNode, GraphEffect, NodeHandle } from '../schema/graph-schema'
import type { OverlayInstanceChild } from '../schema/node-config-schema'
import { expandNodeOverlays } from '../schema/expand-overlay'
import { effectiveComponent } from '../schema/overlay-component'
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

/**
 * 声明式表单字段 schema —— 让 NodeInspector 的 per-kind 检视器由注册表驱动，
 * 取代硬编码 switch。标量字段（text/number/select/checkbox/color）直接渲染；
 * 复杂字段（textStyle/effects/options/qteCues/hotspots）派发到专用受控组件，
 * 由组件自身处理内部条件分支。
 */
export type FormField =
  | { t: 'text'; key: string; label: string; placeholder?: string; mono?: boolean }
  /** slider=渲染成 0~1 类滑条（标签实时显示当前值，如「强度 0.60」），缺省=普通数字输入框。 */
  | { t: 'number'; key: string; label: string; step?: number; min?: number; max?: number; slider?: boolean }
  /** fallback：params 未设值时的展示态默认选中项（不落盘，仅 UI；如 filter 缺省显示 'warm'）。 */
  | { t: 'select'; key: string; label: string; options: { value: string; label: string }[]; fallback?: string }
  | { t: 'checkbox'; key: string; label: string }
  | { t: 'color'; key: string; label: string; placeholder?: string }
  /** 场景实体下拉（复用 EntityPicker；需 KindFormFields 注入 pickers.entities）。 */
  | { t: 'bind'; key: string; label: string }
  /** 实体属性下拉（复用 AttrPicker；entityKey 默认 'bind'）。 */
  | { t: 'attr'; key: string; label: string; entityKey?: string }
  | { t: 'textStyle'; key: string; label: string; group: 'subtitle' | 'overlay' }
  | { t: 'effects'; key: string; label: string }
  /** variant：plain=仅目录；choice=可配 condition；hotspot=可配 x/y。 */
  | { t: 'events'; key: string; label: string; variant?: 'plain' | 'choice' | 'hotspot' }
  | { t: 'qteCues'; key: string; label: string }

/** FormField.t → ComponentInput.valueType（复合控件归 'json'）。 */
function formTypeToValueType(t: FormField['t']): ComponentInput['valueType'] {
  switch (t) {
    case 'number':
      return 'number'
    case 'checkbox':
      return 'boolean'
    case 'color':
      return 'color'
    case 'bind':
      return 'bind'
    case 'attr':
      return 'attr'
    case 'text':
    case 'select':
      return 'string'
    default:
      return 'json' // textStyle / effects / options / qteCues / hotspots
  }
}

/** 向后兼容：无显式 inputs 时，从 form + defaults 派生 ComponentInput[]（契约投影）。 */
function deriveInputsFromForm(form: FormField[] | undefined, defaults: Record<string, unknown>): ComponentInput[] {
  if (!form?.length) return []
  return form.map((f): ComponentInput => {
    const base: ComponentInput = { key: f.key, label: f.label, valueType: formTypeToValueType(f.t) }
    if (f.t === 'select') base.options = f.options
    if (f.t === 'attr' && f.entityKey) base.entityKey = f.entityKey
    const dv = defaults[f.key]
    if (typeof dv === 'string' || typeof dv === 'number' || typeof dv === 'boolean') base.default = dv
    return base
  })
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
   * 皮肤/别名专属展示名（编辑器用）。
   * `getManifest(aliasId).label` 优先读这里；缺省回退 `label`。
   * 新皮肤注册 alias 时一并写上，避免添加栏/时间轴只显示泛化基类名（如「HUD」）。
   */
  aliasLabels?: Record<string, string>
  /** 导出事件（无则回退 params.events）。 */
  events?: ComponentEvent[]
  /** 中文标签（编辑器「+ 元素」菜单展示）；缺省用 kind。 */
  label?: string
  /** 新建该组件时的默认 params。 */
  defaults?(): P
  /**
   * **输入契约（In · SSOT）**：组件接收哪些 params 及其语义类型。
   * 进 `ComponentManifest.inputs`；编辑器据此自动渲染配置控件。
   * 缺省时由 `form` 派生（向后兼容）。
   */
  inputs?: ComponentInput[]
  /**
   * 编辑器控件覆盖（可选）：仅当某输入需要**复合控件**（effects/textStyle/qteCues…）时声明；
   * 标量输入无需 form——由 `inputs` 的 valueType 自动出控件。
   */
  form?: FormField[]
  /** 返回问题描述数组，空数组 = 合法。 */
  validate(params: P): string[]
  /**
   * 该组件需要的输出 handle（仅 interaction 通常有多出口）。
   * 出口随 `params.events`（或 kind 默认 events）派生；`componentId` 仅供调用方透传，勿在此按皮肤分支。
   */
  outputs(params: P, componentId?: string): NodeHandle[]

  // ── 运行时契约（按 role 实现其一；引擎调用，纯 TS）──────────────────────────
  // 副作用（改状态）一律走 node.data.reactions 的生命周期相位，组件不再承载 run()。
  render?(ctx: RuntimeCtx, params: P): RuntimeDirective[]
  present?(ctx: RuntimeCtx, params: P): RuntimeDirective[]
  resolve?(ctx: RuntimeCtx, params: P, input: unknown): ResolveResult
}

/** resolve 只判定 outcome；作者副作用一律走 reactions。continue 路径可带引擎内部累积 effects。 */
export type ResolveResult =
  | { outcome: string; continue?: false }
  | { continue: true; effects?: GraphEffect[]; outcome?: undefined }

export function isContinueResult(r: ResolveResult): r is { continue: true; effects?: GraphEffect[]; outcome?: undefined } {
  return r.continue === true
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

  /** 组件导出清单（manifest）：inputs（契约）+ events（无则从 params 默认值折）。 */
  getManifest(componentId: string): ComponentManifest | undefined {
    const p = this.getComponent(componentId)
    if (!p) return undefined
    const defaults = (p.defaults?.() ?? {}) as Record<string, unknown>
    const events = p.events?.length ? p.events : eventsFromParams(defaults)
    const inputs = p.inputs ?? deriveInputsFromForm(p.form, defaults)
    // 按查找键取名：alias → aliasLabels；基类 → label；都缺则用 id。
    const label =
      (componentId !== p.kind ? p.aliasLabels?.[componentId] : undefined) ?? p.label ?? componentId
    return {
      id: componentId,
      label,
      ...(inputs.length ? { inputs } : {}),
      events,
    }
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
   * interaction → `outputs(params)`（= params.events）；presentation 等有 events 的（如面板按钮）一并纳入。
   * 走向由边承接（sourceHandle === 出口 id）。
   */
  deriveOutputs(node: GameNode, overlays?: Record<string, Overlay>): NodeHandle[] {
    const instances = expandNodeOverlays(overlays, node)
    const children: OverlayInstanceChild[] = instances.flatMap((i) => i.children)
    const out: NodeHandle[] = [{ id: 'default' }]
    for (const el of children) {
      const plugin = this.getComponent(el.component)
      if (!plugin) continue
      if (plugin.role === 'interaction') {
        out.push(...plugin.outputs(el.params, el.component))
        continue
      }
      const fromParams = eventsFromParams(el.params as Record<string, unknown>)
      const events = fromParams.length ? fromParams : (plugin.events ?? [])
      for (const e of events) out.push({ id: e.id, label: e.label })
    }
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

/** KindPlugin.kind（如 inkYingMo → choice）；未注册则原样返回。 */
export function baseKindOf(componentId: string): string {
  return getKind(componentId)?.kind ?? componentId
}

/** 是否属于某基础 kind（含皮肤 alias；兼容遗留 params.component）。 */
export function isKind(child: Pick<OverlayChild, 'component' | 'params'>, kind: string): boolean {
  return baseKindOf(effectiveComponent(child)) === kind
}
export function getComponentManifest(componentId: string): ComponentManifest | undefined {
  return defaultKindRegistry.getManifest(componentId)
}

/** 编辑器展示名：读 `ComponentManifest.label`（含 aliasLabels）；未注册则退回 component id。 */
export function componentTypeLabel(componentId: string): string {
  return getComponentManifest(componentId)?.label || componentId
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

/** 输入永远单一 'in'。 */
export function deriveInputs(): NodeHandle[] {
  return [{ id: 'in' }]
}
