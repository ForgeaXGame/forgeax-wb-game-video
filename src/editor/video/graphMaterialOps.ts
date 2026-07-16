/**
 * graphMaterialOps —— 「新引擎 › 视频」编辑器的 scenario 原生数据层（读投影 + 写映射）。
 *
 * 权威数据 = `graphScenarioStore` 合出的 `GameScenario`（graph + `ui.overlays`）。一个演出节点
 * （`node.id === scene.id`）经 `node.data.overlayNodes` 指向 `scenario.ui.overlays[id]`，
 * 该 overlay 的 `children[]`（`OverlayChild[]`）就是旧 Scene 的 dialogue/overlays/qte/choice/branches
 * 的**统一容器**。这里把它投影成时间轴用的 `MaterialItem[]` / 预览叠层，并把编辑（拖拽/检视器/增删/
 * 选项分支）经 `overlay-edit` + `graph-edit` 原语写回 —— 全程不落任何 Scene 拷贝。
 *
 * 每个节点专属一张 overlay（`node:<nodeId>`，见 `ensureNodeOverlay`）：本编辑器只直写该 overlay 的
 * `children`。挂载侧仅 `overlay` + `layout` + `reactions`，不补丁子组件。
 *
 * 旧 → 新 kind 映射：
 *   字幕 dialogue[]     → kind 'dialogue'   （MaterialItem 'subtitle'）
 *   飘字 overlays[]      → kind 'floatText'  （'overlay'）+ 结算联动 = 节点 reaction（effect.id `${floatId}-settle`）
 *   QTE  qte.cues[]      → kind 'qte'（params.cues[]）→ 每 cue 一个 'qte' 项（整段 QTE 跨度由 cues 派生，不再单列 'qte_window' 轨）
 *   选项 choice+branches → kind 'choice'（params.events[]）+ 分支跳转 = 出边 `<id>`；效果 = 节点 event reaction
 */
import type {
  Entity,
  GameNode,
  GameScenario,
  GraphEffect,
  GraphTextStyle,
  NumOrExpr,
  OverlayChild,
  Reaction,
  Trigger,
} from '../../runtime/schema/graph-schema'
import type { ChoiceOption, FloatTextParams, QteCue } from '../../runtime/registry/core-kinds'
import { qteKind } from '../../runtime/registry/core-kinds'
import { FILTER_PRESETS, FX_PRESETS } from '../../runtime/fx/video-fx'
import { initState } from '../../runtime/engine/engine-init'
import type { InteractionSnap } from '../../runtime/engine/session'
import type { MaterialItem, MaterialKind } from './materialTimelineShared'
import { clampLayer, clampMs, normalizeLayer } from './materialTimelineShared'
import {
  type PreviewEvalContext,
  type QteOutcomePreview,
  resolveChoicePreviewDetail,
  resolveFloatTextPreviewLabel,
  resolveQteCuePreviewLabel,
  resolveQteOutcomesPreviewDetail,
} from './previewResolve'
import {
  disconnect,
  newElementId,
  teardownInteraction,
  updateNodeData,
  upsertBranchEdge,
} from '../../graph/edit/graph-edit'
import {
  addOverlayChild,
  ensureNodeOverlay,
  forkSchemeForEdit,
  overriddenChildIds,
  patchOverlayChild,
  patchOverlayMount,
  primaryOverlayMount,
  removeOverlayChild,
  resetOverride,
} from '../../graph/edit/overlay-edit'
import { overlayMountId } from '../../runtime/schema/node-config-schema'
import { resolveMountChildren } from '../../runtime/schema/expand-overlay'

// ── overlay children 读取小工具（内容挂载 = 原型 ⊕ 稀疏差量，见 resolveMountChildren） ──
/** 内容挂载的 children：原型（共享方案）跟随 + 本挂载 overrides/added/removed 差量。 */
function childrenOf(scenario: GameScenario, node: GameNode | undefined): OverlayChild[] {
  const mount = primaryOverlayMount(node)
  if (!mount) return []
  return resolveMountChildren(scenario.ui?.overlays, mount)
}

/** 节点所有挂载（共享方案 + 节点专属）解析后的 children；交互元素检索用。 */
function mountedChildrenOf(scenario: GameScenario, node: GameNode | undefined): OverlayChild[] {
  if (!node) return []
  const out: OverlayChild[] = []
  for (const mount of node.data.overlayNodes ?? []) {
    out.push(...resolveMountChildren(scenario.ui?.overlays, mount))
  }
  return out.length ? out : childrenOf(scenario, node)
}
/** 拆掉一整段交互：先摘掉承载它的 overlay child，再删占用的出边（`teardownInteraction` 只管边）。 */
function teardownInteractionScenario(
  scenario: GameScenario,
  node: GameNode,
  opts: { kind: string; handlePrefixes: string[]; continueHandle?: string; childId?: string },
): GameScenario {
  const s = opts.childId ? removeOverlayChild(scenario, node.id, opts.childId) : scenario
  return { ...s, graph: teardownInteraction(s.graph, node.id, opts) }
}

// ── 预览叠层 ─────────────────────────────────────────────────────────────────
export type PreviewTarget =
  | { kind: 'element'; elementId: string }
  | { kind: 'qteCue'; elementId: string; cueId: string }
  | { kind: 'readonly' }

export interface PreviewOverlay {
  id: string
  materialKey: string
  kind: MaterialKind
  label: string
  /** 求值后的效果摘要（选项各分支 / QTE 各档改数值），多行；预览副标题展示。 */
  detail?: string
  x: number
  y: number
  zIndex: number
  movable: boolean
  style?: GraphTextStyle
  target: PreviewTarget
}

export const SUBTITLE_XY = { x: 0.5, y: 0.9 }
export const OVERLAY_XY = { x: 0.5, y: 0.42 }
const OPTION_XY = { x: 0.5, y: 0.72 }
const QTE_GOOD_WINDOW = 480
/**
 * QTE 元素级参数键（落 el.params，非某个 cue）：完美半窗 / 过关次数 / 满分 / 过关分 /
 * 出口目录（events/defaultEvent，PR #77）+ 旧 exits/defaultKey 兼容 / 皮肤自管时长
 * （windowMs 或 durationMs——注意与 cue 级 `durationMs` hold 时长同名冲突）。
 */
const QTE_ELEMENT_PARAM_KEYS = new Set([
  'component',
  'perfectMs',
  'passingHits',
  'score',
  'passingScore',
  'tolerance',
  'events',
  'defaultEvent',
  'exits',
  'defaultKey',
  'windowMs',
  'durationMs',
  'timeoutMs',
])
/** 边路由统一后选项 handle = 裸 event id（无 `opt:` 前缀）。 */
const CHOICE_HANDLE = ''

// ── 元素读取小工具 ────────────────────────────────────────────────────────────
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}
function paramsOf(el: OverlayChild | undefined): Record<string, unknown> {
  return el?.params ?? {}
}
function cuesOf(el: OverlayChild | undefined): QteCue[] {
  const cues = paramsOf(el).cues
  return Array.isArray(cues) ? (cues as QteCue[]) : []
}
function optionsOf(el: OverlayChild | undefined): ChoiceOption[] {
  const events = paramsOf(el).events
  return Array.isArray(events) ? (events as ChoiceOption[]) : []
}

/** 读节点上某 event（id）reaction 的 effect 副作用（新模型：效果在 reactions，不在选项）。 */
function readEventEffects(node: GameNode, id: string): GraphEffect[] {
  const r = (node.data.reactions ?? []).find((rc) => rc.when.type === 'event' && rc.when.id === id)
  const eff = r?.do.find((a) => a.kind === 'effect')
  return eff && eff.kind === 'effect' ? eff.effects : []
}

/** 写节点上某 event（id）reaction 的 effect 副作用（空则移除该 effect 动作，保留其它 do）。 */
function writeEventEffectsData(
  reactions: Reaction[] | undefined,
  id: string,
  effects: GraphEffect[],
): Reaction[] | undefined {
  const list = reactions ?? []
  const idx = list.findIndex((r) => r.when.type === 'event' && r.when.id === id)
  if (idx < 0) {
    if (!effects.length) return reactions
    return [...list, { when: { type: 'event', id }, do: [{ kind: 'effect', effects }] }]
  }
  const r = list[idx]!
  const rest = r.do.filter((a) => a.kind !== 'effect')
  const nextDo = effects.length ? [{ kind: 'effect' as const, effects }, ...rest] : rest
  const next = [...list]
  if (nextDo.length) next[idx] = { ...r, do: nextDo }
  else next.splice(idx, 1)
  return next.length ? next : undefined
}
function filterLabel(id: unknown): string {
  return FILTER_PRESETS.find((p) => p.id === id)?.label ?? '滤镜'
}
function fxLabel(id: unknown): string {
  return FX_PRESETS.find((p) => p.id === id)?.label ?? '特效'
}

/** 预览求值上下文：以场景 meta 初始态求所有公式（与试玩首帧一致）。 */
function previewCtxFor(scenario: GameScenario): { ctx: PreviewEvalContext; state: ReturnType<typeof initState> } {
  const state = initState(scenario)
  return {
    state,
    ctx: {
      evalCtx: { vars: state.vars, entities: state.entities, flags: state.flags, score: state.score, rng: state.rng },
      entities: scenario.entities,
      variables: scenario.variables,
    },
  }
}

// ── QTE 结算（样式驱动：候选 handle 来自 qteKind.outputs(params)，缺省即 pass/good/fail；
//    跳转=边，改数值=mount/node event reactions）───────────────────────────────
export type QteOutcomeHandle = string
export interface QteOutcomeCandidate {
  handle: QteOutcomeHandle
  label: string
}
export interface QteOutcomeView {
  handle: QteOutcomeHandle
  label: string
  targetId: string | undefined
  edgeId: string | undefined
  effects: GraphEffect[]
  /** 优秀未单独配置时，运行时会按成功结算 —— UI 提示用。 */
  fallsBackToPass?: boolean
}
const QTE_OUTCOME_FALLBACK_LABELS: Record<string, string> = {
  pass: '成功',
  good: '优秀',
  fail: '失败',
}

/** 某 QTE 元素当前样式（params.component / exits）声明的结算候选，顺序即默认优先级。 */
function qteOutcomeCandidates(el: OverlayChild | undefined): QteOutcomeCandidate[] {
  const params = paramsOf(el)
  return qteKind.outputs(params).map((o) => ({
    handle: o.id,
    label: o.label ?? QTE_OUTCOME_FALLBACK_LABELS[o.id] ?? o.id,
  }))
}

function qteOutcomeEdge(scenario: GameScenario, nodeId: string, handle: QteOutcomeHandle) {
  return scenario.graph.edges.find((e) => e.source === nodeId && e.sourceHandle === handle)
}

function qteReactionMountId(scenario: GameScenario, node: GameNode): string | undefined {
  for (const mount of node.data.overlayNodes ?? []) {
    const ov = scenario.ui?.overlays?.[mount.overlay]
    if (ov?.children.some((c) => c.component === 'qte')) return overlayMountId(mount)
  }
  const pm = primaryOverlayMount(node)
  return pm ? overlayMountId(pm) : undefined
}

function mountReactionsOf(scenario: GameScenario, node: GameNode, mountId: string): Reaction[] {
  const mount = (node.data.overlayNodes ?? []).find((m) => overlayMountId(m) === mountId)
  return mount?.reactions ?? []
}

function allQteOutcomeReactions(scenario: GameScenario, node: GameNode): Reaction[] {
  const mountId = qteReactionMountId(scenario, node)
  const mountRx = mountId ? mountReactionsOf(scenario, node, mountId) : []
  return [...(node.data.reactions ?? []), ...mountRx]
}

function reactionEffectsForHandle(reactions: Reaction[], handle: QteOutcomeHandle): GraphEffect[] {
  const out: GraphEffect[] = []
  for (const r of reactions) {
    if (r.when.type !== 'event' || r.when.id !== handle) continue
    out.push(...r.do.flatMap((a) => (a.kind === 'effect' ? a.effects : [])))
  }
  return out
}

function hasOutcomeReaction(reactions: Reaction[], handle: QteOutcomeHandle): boolean {
  return reactions.some((r) => r.when.type === 'event' && r.when.id === handle)
}

function isQteOutcomeConfigured(scenario: GameScenario, node: GameNode, handle: QteOutcomeHandle): boolean {
  if (qteOutcomeEdge(scenario, node.id, handle)) return true
  const rx = allQteOutcomeReactions(scenario, node)
  if (hasOutcomeReaction(rx, handle)) return true
  return reactionEffectsForHandle(rx, handle).length > 0
}

function outcomeView(scenario: GameScenario, node: GameNode, handle: QteOutcomeHandle, label: string): QteOutcomeView {
  const edge = qteOutcomeEdge(scenario, node.id, handle)
  const rx = allQteOutcomeReactions(scenario, node)
  return {
    handle,
    label,
    targetId: edge?.target,
    edgeId: edge?.id,
    effects: reactionEffectsForHandle(rx, handle),
    fallsBackToPass: handle === 'pass' && !isQteOutcomeConfigured(scenario, node, 'good'),
  }
}

/** 检视器：已配置的 QTE 结算档；无任何配置时默认展示样式的第一档候选（可不跳转）。 */
export function listQteOutcomeViews(scenario: GameScenario, node: GameNode): QteOutcomeView[] {
  const el = qteElement(scenario, node)
  if (!el) return []
  const candidates = qteOutcomeCandidates(el)
  const configured = candidates.filter((c) => isQteOutcomeConfigured(scenario, node, c.handle))
  if (configured.length === 0) {
    const first = candidates[0] ?? { handle: 'pass', label: '成功' }
    return [outcomeView(scenario, node, first.handle, first.label)]
  }
  return configured.map((c) => outcomeView(scenario, node, c.handle, c.label))
}

/** 还可添加的 QTE 结算档（来自当前样式的候选集，减去已配置的）。 */
export function listAvailableQteOutcomes(scenario: GameScenario, node: GameNode): QteOutcomeCandidate[] {
  const el = qteElement(scenario, node)
  if (!el) return []
  const used = new Set(listQteOutcomeViews(scenario, node).map((o) => o.handle))
  return qteOutcomeCandidates(el).filter((c) => !used.has(c.handle))
}

function ensureQteReactionMount(scenario: GameScenario, node: GameNode): { scenario: GameScenario; mountId: string } {
  let s = forkSchemeForEdit(scenario, node.id)
  const n = s.graph.nodes.find((x) => x.id === node.id)!
  let mountId = qteReactionMountId(s, n)
  if (!mountId) {
    const pm = primaryOverlayMount(n)!
    mountId = overlayMountId(pm)
  }
  return { scenario: s, mountId }
}

function patchMountEventReaction(
  scenario: GameScenario,
  node: GameNode,
  mountId: string,
  handle: QteOutcomeHandle,
  effects: GraphEffect[] | undefined,
  remove = false,
): GameScenario {
  const kept = mountReactionsOf(scenario, node, mountId).filter(
    (r) => !(r.when.type === 'event' && r.when.id === handle),
  )
  if (!remove) {
    kept.push({ when: { type: 'event', id: handle }, do: [{ kind: 'effect', effects: effects ?? [] }] })
  }
  return patchOverlayMount(scenario, node.id, mountId, { reactions: kept.length ? kept : undefined })
}

export function addQteOutcomeGraph(scenario: GameScenario, node: GameNode, handle: QteOutcomeHandle): GameScenario {
  if (isQteOutcomeConfigured(scenario, node, handle)) return scenario
  let s = scenario
  const first = qteOutcomeCandidates(qteElement(s, node))[0]?.handle ?? 'pass'
  if (listQteOutcomeViews(s, node).length === 1 && !isQteOutcomeConfigured(s, node, first) && handle !== first) {
    s = ensureQtePassOutcomeGraph(s, node)
  }
  return setQteOutcomeEffectsGraph(s, node, handle, [])
}

/** 确保样式第一档候选（缺省 'pass'）已显式落盘——避免"只有一张隐式默认卡"的歧义态。 */
export function ensureQtePassOutcomeGraph(scenario: GameScenario, node: GameNode): GameScenario {
  const first = qteOutcomeCandidates(qteElement(scenario, node))[0]?.handle ?? 'pass'
  if (isQteOutcomeConfigured(scenario, node, first)) return scenario
  return setQteOutcomeEffectsGraph(scenario, node, first, [])
}

export function removeQteOutcomeGraph(scenario: GameScenario, node: GameNode, handle: QteOutcomeHandle): GameScenario {
  const cards = listQteOutcomeViews(scenario, node)
  if (cards.length <= 1) return scenario
  let s = scenario
  const edge = qteOutcomeEdge(s, node.id, handle)
  if (edge) s = { ...s, graph: disconnect(s.graph, edge.id) }
  const mountId = qteReactionMountId(s, s.graph.nodes.find((n) => n.id === node.id)!)
  if (mountId) {
    s = patchMountEventReaction(s, s.graph.nodes.find((n) => n.id === node.id)!, mountId, handle, undefined, true)
  }
  return s
}

export function setQteOutcomeTargetGraph(
  scenario: GameScenario,
  node: GameNode,
  handle: QteOutcomeHandle,
  targetId: string,
): GameScenario {
  let s = scenario
  if (!targetId) {
    const edge = qteOutcomeEdge(s, node.id, handle)
    return edge ? { ...s, graph: disconnect(s.graph, edge.id) } : s
  }
  if (!isQteOutcomeConfigured(s, node, handle)) {
    s = setQteOutcomeEffectsGraph(s, node, handle, [])
  }
  return { ...s, graph: upsertBranchEdge(s.graph, { source: node.id, sourceHandle: handle, target: targetId }) }
}

export function setQteOutcomeEffectsGraph(
  scenario: GameScenario,
  node: GameNode,
  handle: QteOutcomeHandle,
  effects: GraphEffect[],
): GameScenario {
  const { scenario: s0, mountId } = ensureQteReactionMount(scenario, node)
  const n = s0.graph.nodes.find((x) => x.id === node.id)!
  return patchMountEventReaction(s0, n, mountId, handle, effects)
}

/** 预览摘要：各档改数值（读 mount/node reactions）。 */
function listQteOutcomes(scenario: GameScenario, node: GameNode): QteOutcomePreview[] {
  return listQteOutcomeViews(scenario, node)
    .filter((o) => o.effects.length > 0)
    .map((o) => ({ handle: o.handle, effects: o.effects, fallsBackToPass: o.fallsBackToPass }))
}

function firstEntityId(entities: Record<string, Entity> | undefined, kind: 'boss' | 'player'): string {
  for (const [id, e] of Object.entries(entities ?? {})) if (e.kind === kind) return e.id ?? id
  return `ent-${kind}`
}

/** 从飘字内容里解析伤害数值：取首个数字的绝对值，无数字则 0。 */
export function parseDamageFromContent(content: string): number {
  const m = content.match(/-?\d+(?:\.\d+)?/)
  return m ? Math.abs(Number(m[0])) || 0 : 0
}

/**
 * 「飘字联动结算」的结算副作用 = 挂在**节点 reactions** 上的一条 effect（不再是 settle 组件）。
 * 通过 effect.id = `${floatId}-settle` 把结算与对应飘字绑定，便于检视器定位/删改。
 */
function settleEffectId(floatId: string): string {
  return `${floatId}-settle`
}
function hpEffect(
  entities: Record<string, Entity> | undefined,
  target: 'boss' | 'player',
  amount: NumOrExpr,
  floatId: string,
): GraphEffect {
  return {
    kind: 'attr',
    entityId: firstEntityId(entities, target),
    attr: 'hp',
    op: 'add',
    // 常量沿用旧语义（数值取绝对值后自动按扣血取负）；选取式公式的正负号完全由用户在条款里选（−=扣血/+=回血）。
    value: typeof amount === 'number' ? -Math.abs(amount) : amount,
    id: settleEffectId(floatId),
  }
}
/** 飘字出现时机 → 结算 reaction 的相位（at:ms 优先，否则 enter）。 */
function floatSettleWhen(float: OverlayChild | undefined): Reaction['when'] {
  const t = float?.trigger
  if (t?.when === 'at') return { type: 'at', ms: t.ms }
  const start = float?.window?.startMs
  return typeof start === 'number' && start > 0 ? { type: 'at', ms: start } : { type: 'enter' }
}
/** 定位某飘字对应的结算 reaction（node.data.reactions 中含 effect.id=`${floatId}-settle` 的那条）。 */
export function settleElementFor(scenario: GameScenario, node: GameNode | undefined, floatId: string): Reaction | undefined {
  const eid = settleEffectId(floatId)
  return (node?.data.reactions ?? []).find((r) =>
    r.do.some((a) => a.kind === 'effect' && a.effects.some((e) => e.id === eid)),
  )
}
function settleHpEffect(settle: Reaction | undefined): { value?: NumOrExpr; entityId?: string } | undefined {
  for (const a of settle?.do ?? []) {
    if (a.kind !== 'effect') continue
    const hp = a.effects.find((e) => e.kind === 'attr' && e.attr === 'hp')
    if (hp) return hp as { value?: NumOrExpr; entityId?: string }
  }
  return undefined
}
/** 结算 reaction 的绝对伤害（公式态时取不到常量，返回 0）。 */
export function settleDamage(settle: Reaction | undefined): number {
  const hp = settleHpEffect(settle)
  return hp && typeof hp.value === 'number' ? Math.abs(hp.value) : 0
}
/** 结算 reaction 里 hp effect 的原始值（常量或 `{expr,pick}`），供检视器公式编辑器回填。 */
export function settleValue(settle: Reaction | undefined): NumOrExpr | undefined {
  return settleHpEffect(settle)?.value
}
/** 结算作用于 boss 还是 player。 */
export function settleTargetKind(
  settle: Reaction | undefined,
  entities: Record<string, Entity> | undefined,
): 'boss' | 'player' {
  const hp = settleHpEffect(settle)
  const ent = hp?.entityId ? entities?.[hp.entityId] : undefined
  return ent?.kind === 'player' ? 'player' : 'boss'
}
/** 飘字到点广播的 effects（settle reaction 里挂的完整效果列表；无结算则 []）。 */
export function overlayEffects(
  scenario: GameScenario,
  node: GameNode | undefined,
  floatId: string,
): GraphEffect[] {
  const settle = settleElementFor(scenario, node, floatId)
  for (const a of settle?.do ?? []) {
    if (a.kind === 'effect') return a.effects
  }
  return []
}
/** 预览用飘字 params：`expr` 缺省时回落结算效果第一条的值，与「所见即所广播」一致。 */
function floatPreviewParams(
  scenario: GameScenario,
  node: GameNode | undefined,
  el: OverlayChild,
  params: FloatTextParams,
): FloatTextParams {
  if (typeof params.expr === 'string' && params.expr.trim()) return params
  const first = overlayEffects(scenario, node, el.id).find((e) => e.kind === 'attr' || e.kind === 'var')
  const v = first && (first.kind === 'attr' || first.kind === 'var') ? first.value : undefined
  if (v === undefined) return params
  return { ...params, expr: typeof v === 'number' ? String(v) : v.expr }
}
/** 删除某飘字的结算 reaction。 */
function removeSettleReaction(scenario: GameScenario, node: GameNode, floatId: string): GameScenario {
  const eid = settleEffectId(floatId)
  const kept = (node.data.reactions ?? []).filter(
    (r) => !r.do.some((a) => a.kind === 'effect' && a.effects.some((e) => e.id === eid)),
  )
  return { ...scenario, graph: updateNodeData(scenario.graph, node.id, { reactions: kept.length ? kept : undefined }) }
}
/**
 * 写入/覆盖某飘字的结算 reaction，effects 为完整效果列表（对齐 `EffectsEditor` 的编辑单位）。
 * 空列表＝纯展示，等价删除。首条效果打上 `${floatId}-settle` 定位 id，供 `settleElementFor` 检索；
 * 其余保留用户自定义 id（缺省兜底生成，避免 undefined 冲突）。
 */
function upsertSettleEffects(
  scenario: GameScenario,
  node: GameNode,
  floatId: string,
  when: Reaction['when'],
  effects: GraphEffect[],
): GameScenario {
  if (effects.length === 0) return removeSettleReaction(scenario, node, floatId)
  const eid = settleEffectId(floatId)
  const kept = (node.data.reactions ?? []).filter(
    (r) => !r.do.some((a) => a.kind === 'effect' && a.effects.some((e) => e.id === eid)),
  )
  const tagged = effects.map((e, i) => (i === 0 ? { ...e, id: eid } : { ...e, id: e.id ?? `${eid}-${i + 1}` }))
  kept.push({ when, do: [{ kind: 'effect', effects: tagged }] })
  return { ...scenario, graph: updateNodeData(scenario.graph, node.id, { reactions: kept }) }
}

// ── 节点/元素定位 ─────────────────────────────────────────────────────────────
export function findNode(graph: GameScenario['graph'], nodeId: string | undefined): GameNode | undefined {
  if (!nodeId) return undefined
  return graph.nodes.find((n) => n.id === nodeId)
}
export function findElement(scenario: GameScenario, node: GameNode | undefined, elId: string): OverlayChild | undefined {
  return childrenOf(scenario, node).find((e) => e.id === elId)
}
export function qteElementOfCue(scenario: GameScenario, node: GameNode | undefined, cueId: string): OverlayChild | undefined {
  return mountedChildrenOf(scenario, node).find((e) => e.component === 'qte' && cuesOf(e).some((c) => c.id === cueId))
}
export function qteElement(scenario: GameScenario, node: GameNode | undefined): OverlayChild | undefined {
  return mountedChildrenOf(scenario, node).find((e) => e.component === 'qte')
}

/** 编辑器可实时联调的交互皮肤（有真正的按键渲染，值得在预览画布里接管点击/按键）。 */
const QTE_LIVE_PREVIEW_SKINS = new Set(['inkKou', 'battleParry'])

/** 编辑器预览：当前节点 QTE 用到可联调皮肤时，供 GraphVideoView 渲染真实交互皮、按键即时可测。 */
export function qteSkinPreviewInteraction(
  scenario: GameScenario,
  node: GameNode | undefined,
): InteractionSnap | null {
  const el = qteElement(scenario, node)
  if (!el) return null
  const params = paramsOf(el)
  const component = str(params.component)
  if (!component || !QTE_LIVE_PREVIEW_SKINS.has(component)) return null
  const cues = cuesOf(el)
  if (!cues.length) return null
  return {
    elementId: el.id,
    component: 'qte',
    params: { ...params, cues },
    handles: qteOutcomeCandidates(el).map((c) => c.handle),
    timeoutMs: typeof params.timeoutMs === 'number' ? params.timeoutMs : undefined,
  }
}

export function choiceElement(scenario: GameScenario, node: GameNode | undefined): OverlayChild | undefined {
  return mountedChildrenOf(scenario, node).find((e) => e.component === 'choice')
}

/** 起点：window.startMs 优先；否则 trigger='at' 用 ms；其余（含缺省 trigger）落 0。 */
function timedStart(el: OverlayChild): number {
  if (el.window?.startMs != null) return el.window.startMs
  if (el.trigger?.when === 'at') return el.trigger.ms
  return 0
}

// ── 读投影：node → MaterialItem[] ─────────────────────────────────────────────
export function collectMaterialsFromNode(scenario: GameScenario, node: GameNode | undefined, maxMs: number): MaterialItem[] {
  if (!node) return []
  const { overridden, added } = overriddenChildIds(primaryOverlayMount(node))
  const flagged = new Set([...overridden, ...added])
  const out: MaterialItem[] = []
  for (const el of childrenOf(scenario, node)) {
    const overriddenFlag = flagged.has(el.id) || undefined
    if (el.component === 'dialogue') {
      const start = timedStart(el)
      out.push({
        key: `subtitle:${el.id}`,
        id: el.id,
        kind: 'subtitle',
        label: str(paramsOf(el).text) || '字幕',
        startMs: start,
        endMs: el.window?.endMs ?? Math.min(maxMs, start + 2000),
        zIndex: normalizeLayer(el.layout?.zIndex, 0),
        overridden: overriddenFlag,
      })
    } else if (el.component === 'floatText') {
      const start = timedStart(el)
      out.push({
        key: `overlay:${el.id}`,
        id: el.id,
        kind: 'overlay',
        label: (str(paramsOf(el).text) ?? '').trim() || '飘字',
        startMs: start,
        endMs: el.window?.endMs ?? Math.min(maxMs, start + 1200),
        zIndex: normalizeLayer(el.layout?.zIndex, 1),
        overridden: overriddenFlag,
      })
    } else if (el.component === 'choice') {
      out.push({
        key: `option:${el.id}`,
        id: el.id,
        kind: 'option',
        label: str(paramsOf(el).prompt) || '选项',
        startMs: el.window?.startMs ?? 0,
        endMs: el.window?.endMs ?? maxMs,
        zIndex: normalizeLayer(el.layout?.zIndex, 3),
        overridden: overriddenFlag,
      })
    } else if (el.component === 'filter') {
      out.push({
        key: `filter:${el.id}`,
        id: el.id,
        kind: 'filter',
        label: filterLabel(paramsOf(el).filter),
        startMs: el.window?.startMs ?? 0,
        endMs: el.window?.endMs ?? maxMs,
        zIndex: normalizeLayer(el.layout?.zIndex, 4),
        overridden: overriddenFlag,
      })
    } else if (el.component === 'fx') {
      out.push({
        key: `fx:${el.id}`,
        id: el.id,
        kind: 'fx',
        label: fxLabel(paramsOf(el).fx),
        startMs: el.window?.startMs ?? 0,
        endMs: el.window?.endMs ?? maxMs,
        zIndex: normalizeLayer(el.layout?.zIndex, 5),
        overridden: overriddenFlag,
      })
    } else if (el.component === 'qte') {
      for (const c of cuesOf(el)) {
        // 左缘=出现(appearAt) 右缘=消失(endAt) 菱形=命中判定(targetAt，计分锚点)。
        const s = c.appearAt ?? 0
        const target = c.targetAt ?? s
        const end = c.endAt ?? Math.max(target + 300, s + (c.durationMs ?? 500))
        out.push({
          key: `qte:${el.id}:${c.id}`,
          id: c.id,
          kind: 'qte',
          label: c.label || 'QTE',
          startMs: s,
          endMs: end,
          markerMs: Math.min(Math.max(target, s), end),
          zIndex: normalizeLayer(c.zIndex, 2),
          overridden: overriddenFlag,
        })
      }
    }
  }
  return out
}

/** 时间轴「↺ 回连」：清掉该素材所属组件在挂载上的差量，改回跟随共享方案。 */
export function resetMaterialOverrideGraph(scenario: GameScenario, node: GameNode, item: MaterialItem): GameScenario {
  const elId = item.kind === 'qte' ? qteElementOfCue(scenario, node, item.id)?.id : item.id
  if (!elId) return scenario
  return resetOverride(scenario, node.id, elId)
}

// ── 读投影：预览叠层 ──────────────────────────────────────────────────────────
export function activePreviewOverlaysFromNode(
  scenario: GameScenario,
  node: GameNode | undefined,
  ms: number,
  maxMs: number,
): PreviewOverlay[] {
  if (!node) return []
  const out: PreviewOverlay[] = []
  const { ctx: previewCtx, state: previewState } = previewCtxFor(scenario)
  let qteOutcomeDetail: string | undefined
  for (const el of childrenOf(scenario, node)) {
    const params = paramsOf(el)
    if (el.component === 'dialogue') {
      const start = timedStart(el)
      const end = el.window?.endMs ?? Math.min(maxMs, start + 2000)
      if (ms < start || ms > end) continue
      const speaker = str(params.speaker)
      const text = str(params.text) ?? ''
      out.push({
        id: `subtitle:${el.id}`,
        materialKey: `subtitle:${el.id}`,
        kind: 'subtitle',
        label: speaker ? `${speaker}：${text}` : text,
        x: (params.x as number) ?? SUBTITLE_XY.x,
        y: (params.y as number) ?? SUBTITLE_XY.y,
        zIndex: normalizeLayer(el.layout?.zIndex, 0),
        movable: true,
        style: params.style as GraphTextStyle | undefined,
        target: { kind: 'element', elementId: el.id },
      })
    } else if (el.component === 'floatText') {
      const start = timedStart(el)
      const end = el.window?.endMs ?? Math.min(maxMs, start + 1200)
      if (ms < start || ms > end) continue
      const label = resolveFloatTextPreviewLabel(floatPreviewParams(scenario, node, el, params as FloatTextParams), previewCtx)
      if (!label) continue
      out.push({
        id: `overlay:${el.id}`,
        materialKey: `overlay:${el.id}`,
        kind: 'overlay',
        label,
        x: (params.x as number) ?? OVERLAY_XY.x,
        y: (params.y as number) ?? OVERLAY_XY.y,
        zIndex: normalizeLayer(el.layout?.zIndex, 1),
        movable: true,
        style: params.style as GraphTextStyle | undefined,
        target: { kind: 'element', elementId: el.id },
      })
    } else if (el.component === 'qte') {
      if (qteOutcomeDetail === undefined) {
        qteOutcomeDetail = resolveQteOutcomesPreviewDetail(listQteOutcomes(scenario, node), previewState, previewCtx)
      }
      for (const c of cuesOf(el)) {
        const s = c.appearAt ?? 0
        const end = c.endAt ?? s + QTE_GOOD_WINDOW
        if (ms < s || ms > end) continue
        out.push({
          id: `qte:${c.id}`,
          materialKey: `qte:${el.id}:${c.id}`,
          kind: 'qte',
          label: resolveQteCuePreviewLabel(c),
          detail: qteOutcomeDetail || undefined,
          x: c.x ?? 0.5,
          y: c.y ?? 0.55,
          zIndex: normalizeLayer(c.zIndex, 2),
          movable: true,
          target: { kind: 'qteCue', elementId: el.id, cueId: c.id },
        })
      }
    } else if (el.component === 'choice') {
      const start = el.window?.startMs ?? 0
      const end = el.window?.endMs ?? maxMs
      if (ms < start || ms > end) continue
      out.push({
        id: `option:list:${el.id}`,
        materialKey: `option:${el.id}`,
        kind: 'option',
        label: str(params.prompt) ?? '请选择',
        detail: resolveChoicePreviewDetail(
          optionsOf(el).map((o) => ({ label: o.label ?? o.id, effects: readEventEffects(node, o.id), condition: o.condition })),
          previewCtx,
          previewState,
        ) || undefined,
        x: OPTION_XY.x,
        y: OPTION_XY.y,
        zIndex: normalizeLayer(el.layout?.zIndex, 3),
        movable: false,
        target: { kind: 'readonly' },
      })
    }
  }
  return out.sort((a, b) => a.zIndex - b.zIndex)
}

// ── 写映射：时间轴拖拽（start/end/zIndex）──────────────────────────────────────
export function patchMaterialGraph(
  scenario: GameScenario,
  node: GameNode,
  maxMs: number,
  item: MaterialItem,
  patch: { startMs?: number; endMs?: number; zIndex?: number; markerMs?: number },
): GameScenario {
  const start = clampMs(patch.startMs ?? item.startMs, 0, Math.max(0, maxMs - 100))
  const end = clampMs(patch.endMs ?? item.endMs, start + 100, maxMs)
  const zIndex = patch.zIndex == null ? item.zIndex : clampLayer(patch.zIndex)
  switch (item.kind) {
    case 'subtitle':
    case 'overlay':
    case 'filter':
    case 'fx':
      return patchOverlayChild(scenario, node.id, item.id, {
        window: { startMs: start, endMs: end },
        trigger: { when: 'at', ms: start },
        layout: { zIndex },
      })
    case 'option':
      return patchOverlayChild(scenario, node.id, item.id, {
        window: { startMs: start, endMs: end },
        layout: { zIndex },
      })
    case 'qte': {
      const el = qteElementOfCue(scenario, node, item.id)
      if (!el) return scenario
      const isMove = patch.zIndex != null && patch.startMs != null && patch.endMs != null
      const cues = cuesOf(el).map((c) => {
        if (c.id !== item.id) return c
        const next: QteCue = { ...c }
        if (patch.markerMs != null) {
          // 拖菱形：只改命中判定点，夹在 [出现, 消失] 内。
          const lo = c.appearAt ?? 0
          const hi = c.endAt ?? Math.max(lo, c.targetAt ?? lo)
          next.targetAt = clampMs(patch.markerMs, lo, Math.max(lo, hi))
          return next
        }
        if (isMove) {
          // 整体平移：出现/命中/消失同步移，保持相对间距。
          const shift = start - (c.appearAt ?? 0)
          next.appearAt = start
          next.endAt = end
          if (c.targetAt != null) next.targetAt = clampMs(c.targetAt + shift, start, end)
          next.zIndex = zIndex
          return next
        }
        // 拖边缘：左缘→出现(appearAt)，右缘→消失(endAt)；命中点夹回窗内。
        next.appearAt = start
        next.endAt = end
        if (c.targetAt != null) next.targetAt = clampMs(c.targetAt, start, end)
        next.zIndex = zIndex
        return next
      })
      return patchOverlayChild(scenario, node.id, el.id, {
        params: { ...el.params, cues },
      })
    }
    default:
      return scenario
  }
}

// ── 写映射：预览拖拽定位（x/y）─────────────────────────────────────────────────
export function patchOverlayPositionGraph(
  scenario: GameScenario,
  node: GameNode,
  target: PreviewTarget,
  x: number,
  y: number,
): GameScenario {
  if (target.kind === 'element') {
    const el = findElement(scenario, node, target.elementId)
    if (!el) return scenario
    return patchOverlayChild(scenario, node.id, el.id, { params: { ...el.params, x, y } })
  }
  if (target.kind === 'qteCue') {
    const el = findElement(scenario, node, target.elementId)
    if (!el) return scenario
    const cues = cuesOf(el).map((c) => (c.id === target.cueId ? { ...c, x, y } : c))
    return patchOverlayChild(scenario, node.id, el.id, { params: { ...el.params, cues } })
  }
  return scenario
}

// ── 写映射：删除 + 二次确认 ────────────────────────────────────────────────────
function isWholeInteractionDelete(scenario: GameScenario, node: GameNode, item: MaterialItem): boolean {
  if (item.kind === 'option') return true
  if (item.kind === 'qte') return cuesOf(qteElementOfCue(scenario, node, item.id)).length <= 1
  return false
}
export function confirmMaterialDelete(scenario: GameScenario, node: GameNode, item: MaterialItem): boolean {
  if (!isWholeInteractionDelete(scenario, node, item)) return true
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true
  const message =
    item.kind === 'option'
      ? '删除整条选项交互？\n该节点将改回叙事节点，并自动续连到「第一个选项」原本指向的场景。\n这会同步更改蓝图上的节点连接关系，是否确认？'
      : '删除整段 QTE 交互？\n该节点将改回叙事节点，并自动续连到「通过 QTE」原本指向的场景。\n这会同步更改蓝图上的节点连接关系，是否确认？'
  return window.confirm(message)
}
export function deleteMaterialGraph(scenario: GameScenario, node: GameNode, item: MaterialItem): GameScenario {
  switch (item.kind) {
    case 'subtitle':
    case 'filter':
    case 'fx':
      return removeOverlayChild(scenario, node.id, item.id)
    case 'overlay': {
      const s1 = removeOverlayChild(scenario, node.id, item.id)
      const s1Node = findNode(s1.graph, node.id) ?? node
      return removeSettleReaction(s1, s1Node, item.id)
    }
    case 'qte':
      return removeQteCueGraph(scenario, node, item.id)
    case 'option': {
      const el = choiceElement(scenario, node)
      return teardownInteractionScenario(scenario, node, { kind: 'choice', handlePrefixes: el ? optionsOf(el).map((o) => o.id) : [], childId: el?.id })
    }
    default:
      return scenario
  }
}

/**
 * 本节点「默认样式方案」（`node.data.styleScheme`）里，与 `component` 同类型的 child 全集。
 * 方案本身不挂载、不进 `overlayNodes`——纯查表源；新增素材取 [0] 当默认，其余供检视器切换。
 */
export function styleVariantsFor(scenario: GameScenario, node: GameNode, component: string): OverlayChild[] {
  const schemeId = node.data.styleScheme
  if (!schemeId) return []
  return scenario.ui?.overlays?.[schemeId]?.children.filter((c) => c.component === component) ?? []
}

// ── 写映射：新增材料 ──────────────────────────────────────────────────────────
export type MaterialTemplate = 'subtitle' | 'overlay' | 'qte' | 'option' | 'filter' | 'fx'

export interface AddResult {
  scenario: GameScenario
  selectKey: string | null
}

/** 从素材库拖入时间轴的落点：ms = 落点时刻，zIndex = 落点所在轨。 */
export interface DropAt {
  ms: number
  zIndex: number
}

export function addMaterialGraph(
  scenario: GameScenario,
  node: GameNode,
  maxMs: number,
  template: MaterialTemplate,
  entities: Record<string, Entity> | undefined,
  playheadMs: number,
  at?: DropAt,
): AddResult {
  const dur = clampMs(2500, 100, maxMs)
  // at 存在 = 从素材库拖入的精确落点；缺省（点击添加）落在 0ms / 语义默认轨。
  const startMs = at ? clampMs(at.ms, 0, Math.max(0, maxMs - 100)) : 0
  const endMs = clampMs(startMs + dur, startMs + 100, maxMs)
  if (template === 'subtitle') {
    const id = newElementId()
    const style = styleVariantsFor(scenario, node, 'dialogue')[0]?.params
    const el: OverlayChild = {
      id,
      component: 'dialogue',
      trigger: { when: 'enter' },
      window: { startMs, endMs },
      layout: { zIndex: at ? at.zIndex : 0 },
      params: { text: '新字幕', ...style },
    }
    return { scenario: addOverlayChild(scenario, node.id, el), selectKey: `subtitle:${id}` }
  }
  if (template === 'overlay') {
    const id = newElementId()
    const style = styleVariantsFor(scenario, node, 'floatText')[0]?.params
    const float: OverlayChild = {
      id,
      component: 'floatText',
      trigger: { when: 'enter' },
      window: { startMs, endMs },
      layout: { zIndex: at ? at.zIndex : 1 },
      params: { text: '-100', x: OVERLAY_XY.x, y: 0.45, ...style },
    }
    const s1 = addOverlayChild(scenario, node.id, float)
    const s1Node = findNode(s1.graph, node.id) ?? node
    // 结算副作用挂节点 reaction（默认对 boss 扣 100，与飘字同相位出现）。
    const s2 = upsertSettleEffects(s1, s1Node, id, floatSettleWhen(float), [hpEffect(entities, 'boss', 100, id)])
    return { scenario: s2, selectKey: `overlay:${id}` }
  }
  if (template === 'filter' || template === 'fx') {
    const id = newElementId()
    const style = styleVariantsFor(scenario, node, template)[0]?.params
    const el: OverlayChild = {
      id,
      component: template,
      trigger: { when: 'at', ms: startMs },
      window: { startMs, endMs },
      layout: { zIndex: at ? at.zIndex : template === 'filter' ? 4 : 5 },
      params: { ...(template === 'filter' ? { filter: 'warm', intensity: 1 } : { fx: 'flash', intensity: 1 }), ...style },
    }
    return { scenario: addOverlayChild(scenario, node.id, el), selectKey: `${template}:${id}` }
  }
  if (template === 'qte') {
    return addQteCueGraph(scenario, node, maxMs, at ? at.ms : playheadMs)
  }
  // option
  const existing = choiceElement(scenario, node)
  if (existing) return { scenario, selectKey: `option:${existing.id}` }
  const existingQte = qteElement(scenario, node)
  const s0 = teardownInteractionScenario(scenario, node, {
    kind: 'qte',
    handlePrefixes: qteOutcomeCandidates(existingQte).map((c) => c.handle),
  })
  const id = newElementId()
  const el: OverlayChild = {
    id,
    component: 'choice',
    trigger: { when: 'enter' },
    window: { startMs: 0, endMs: dur },
    layout: { zIndex: 3 },
    params: { events: [{ id: 'opt0', label: '选项一' }], prompt: '请选择', presentation: 'list' },
  }
  let s = addOverlayChild(s0, node.id, el)
  return { scenario: s, selectKey: `option:${id}` }
}

/** 新增一个 QTE 按键点（无 qte 元素则新建整段 QTE，并清掉 choice）。 */
export function addQteCueGraph(
  scenario: GameScenario,
  node: GameNode,
  maxMs: number,
  playheadMs: number,
  afterCueId?: string,
): AddResult {
  const el = qteElement(scenario, node)
  const cues = cuesOf(el)
  const base = afterCueId ? cues.find((c) => c.id === afterCueId) : cues[cues.length - 1]
  const appear = clampMs((base?.targetAt ?? playheadMs) + 500, 0, Math.max(0, maxMs - 200))
  const target = clampMs(appear + 300, appear + 100, Math.max(appear + 100, maxMs - 100))
  const end = clampMs(target + 400, target + 100, maxMs)
  const cueId = `q-${Date.now().toString(36)}`
  const cue: QteCue = {
    id: cueId,
    shape: base?.shape ?? 'tap',
    triggerKey: base?.triggerKey,
    x: base?.x ?? 0.5,
    y: base?.y ?? 0.55,
    appearAt: appear,
    targetAt: target,
    endAt: end,
    label: `QTE ${cues.length + 1}`,
    zIndex: base?.zIndex ?? 2,
  }
  if (el) {
    const s = patchOverlayChild(scenario, node.id, el.id, {
      params: { ...el.params, cues: [...cues, cue] },
    })
    return { scenario: s, selectKey: `qte:${el.id}:${cueId}` }
  }
  // 首次建 QTE：清掉 choice（互斥），新建 qte 元素。
  const choice = choiceElement(scenario, node)
  const s0 = teardownInteractionScenario(scenario, node, { kind: 'choice', handlePrefixes: choice ? optionsOf(choice).map((o) => o.id) : [], childId: choice?.id })
  const id = newElementId()
  const newEl: OverlayChild = {
    id,
    component: 'qte',
    trigger: { when: 'enter' },
    params: {
      qteKind: 'parry',
      passingHits: 1,
      cues: [cue],
    },
  }
  let s = addOverlayChild(s0, node.id, newEl)
  const n = findNode(s.graph, node.id) ?? node
  s = ensureQtePassOutcomeGraph(s, n)
  return { scenario: s, selectKey: `qte:${id}:${cueId}` }
}

/** 删一个 QTE 按键点（删到最后一个 = 拆整段 QTE；结算是整段共享的，删单个拍点不动结算）。 */
export function removeQteCueGraph(scenario: GameScenario, node: GameNode, cueId: string): GameScenario {
  const el = qteElementOfCue(scenario, node, cueId)
  if (!el) return scenario
  const cues = cuesOf(el)
  if (cues.length <= 1) {
    return teardownInteractionScenario(scenario, node, {
      kind: 'qte',
      handlePrefixes: qteOutcomeCandidates(el).map((c) => c.handle),
      continueHandle: qteOutcomeCandidates(el)[0]?.handle ?? 'pass',
      childId: el.id,
    })
  }
  const remaining = cues.filter((c) => c.id !== cueId)
  return patchOverlayChild(scenario, node.id, el.id, { params: { ...el.params, cues: remaining } })
}

// ── 写映射：检视器 params 编辑 ────────────────────────────────────────────────
/**
 * 合并出下一份完整 params 快照。`v === undefined` 的键**保留但置为 undefined**（不 delete）——
 * 下游 `patchOverlayChild` → `mergeChild`/`mergePatch` 对 params 是「浅 spread」式累积合并
 * （`{ ...base.params, ...patch.params }`），若这里直接删键，缺席的键不会覆盖 base/override 里
 * 的旧值，「清空」就会被历史值悄悄复活。显式置 undefined 才能穿透层层浅合并真正生效清空；
 * 落盘走 JSON 时 undefined 键本就会被丢弹，不会遗留脏数据。
 */
function mergeParams(el: OverlayChild, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...el.params, ...patch }
}

/** 字幕/QTE-cue/选项的通用 params 编辑（飘字见 patchOverlayGraph）。 */
export function patchSelectedGraph(
  scenario: GameScenario,
  node: GameNode,
  item: MaterialItem,
  patch: Record<string, unknown>,
): GameScenario {
  if (item.kind === 'subtitle' || item.kind === 'filter' || item.kind === 'fx') {
    const el = findElement(scenario, node, item.id)
    if (!el) return scenario
    return patchOverlayChild(scenario, node.id, el.id, { params: mergeParams(el, patch) })
  }
  if (item.kind === 'qte') {
    const el = qteElementOfCue(scenario, node, item.id)
    if (!el) return scenario
    // 元素级 QTE 参数（如完美半窗 perfectMs）落 el.params；其余按 cue 级 patch 进当前拍点。
    const elemPatch: Record<string, unknown> = {}
    const cuePatch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (QTE_ELEMENT_PARAM_KEYS.has(k)) elemPatch[k] = v
      else cuePatch[k] = v
    }
    const cues = cuesOf(el).map((c) => (c.id === item.id ? { ...c, ...cuePatch } : c))
    return patchOverlayChild(scenario, node.id, el.id, { params: { ...el.params, ...elemPatch, cues } })
  }
  if (item.kind === 'option') {
    const el = findElement(scenario, node, item.id)
    if (!el) return scenario
    const next = mergeParams(el, patch)
    return patchOverlayChild(scenario, node.id, el.id, { params: next })
  }
  return scenario
}

/**
 * 飘字（floatText 展示 + 联动结算 reaction）的 params 编辑。键：
 *   - content  → params.text（显示文案，含 {v} 用数值替换）
 *   - effects  → 结算 reaction 的完整效果列表（`EffectsEditor` 直接产出；空数组＝纯展示，删结算）
 *   - 其余（expr/valuePick/style/x/y…）→ 直接并入 params（undefined 删键）
 * expr 缺省时 {v} 取 effects 第一条的值（预览侧对齐，见 `activePreviewOverlaysFromNode`）；
 * 写了 expr 则显示与效果解耦。
 */
export function patchOverlayGraph(
  scenario: GameScenario,
  node: GameNode,
  floatId: string,
  patch: Record<string, unknown>,
  entities: Record<string, Entity> | undefined,
): GameScenario {
  const float = findElement(scenario, node, floatId)
  if (!float) return scenario
  let s = scenario
  const curNode = () => findNode(s.graph, node.id) ?? node

  for (const [key, value] of Object.entries(patch)) {
    if (key === 'content') {
      const content = String(value)
      const cur = findElement(s, node, floatId)
      s = patchOverlayChild(s, node.id, floatId, { params: { ...cur?.params, text: content } })
    } else if (key === 'effects') {
      const list = Array.isArray(value) ? (value as GraphEffect[]) : []
      s = upsertSettleEffects(s, curNode(), floatId, floatSettleWhen(float), list)
    } else {
      const cur = findElement(s, node, floatId)
      if (cur) s = patchOverlayChild(s, node.id, floatId, { params: mergeParams(cur, { [key]: value }) })
    }
  }
  return s
}

// ── 写映射：选项分支（= 出边 <id> + event reaction effects）───────────────────
export interface OptionBranchView {
  key: string
  label: string
  targetId: string | undefined
  edgeId: string | undefined
  effects: GraphEffect[]
}
export function listOptionBranches(scenario: GameScenario, node: GameNode): OptionBranchView[] {
  const el = choiceElement(scenario, node)
  if (!el) return []
  return optionsOf(el).map((o) => {
    const edge = scenario.graph.edges.find((e) => e.source === node.id && (e.sourceHandle ?? 'default') === o.id)
    return {
      key: o.id,
      label: o.label ?? o.id,
      targetId: edge?.target,
      edgeId: edge?.id,
      effects: readEventEffects(node, o.id),
    }
  })
}
export function addOptionBranchGraph(scenario: GameScenario, node: GameNode): GameScenario {
  const el = choiceElement(scenario, node)
  if (!el) return scenario
  const events = optionsOf(el)
  const id = `opt${events.length}-${Date.now().toString(36).slice(-3)}`
  const label = `选项 ${events.length + 1}`
  return patchOverlayChild(scenario, node.id, el.id, {
    params: { ...el.params, events: [...events, { id, label }] },
  })
}
export function updateOptionLabelGraph(scenario: GameScenario, node: GameNode, key: string, label: string): GameScenario {
  const el = choiceElement(scenario, node)
  if (!el) return scenario
  const events = optionsOf(el).map((o) => (o.id === key ? { ...o, label } : o))
  return patchOverlayChild(scenario, node.id, el.id, { params: { ...el.params, events } })
}
export function setOptionTargetGraph(scenario: GameScenario, node: GameNode, key: string, targetId: string): GameScenario {
  const handle = `${CHOICE_HANDLE}${key}`
  if (!targetId) {
    const edge = scenario.graph.edges.find((e) => e.source === node.id && (e.sourceHandle ?? 'default') === handle)
    if (!edge) return scenario
    return { ...scenario, graph: disconnect(scenario.graph, edge.id) }
  }
  return { ...scenario, graph: upsertBranchEdge(scenario.graph, { source: node.id, sourceHandle: handle, target: targetId }) }
}
export function setOptionBranchEffectsGraph(
  scenario: GameScenario,
  node: GameNode,
  key: string,
  effects: GraphEffect[],
): GameScenario {
  const reactions = writeEventEffectsData(node.data.reactions, key, effects)
  return { ...scenario, graph: updateNodeData(scenario.graph, node.id, { reactions }) }
}
export function removeOptionBranchGraph(scenario: GameScenario, node: GameNode, key: string): GameScenario {
  const el = choiceElement(scenario, node)
  if (!el) return scenario
  const events = optionsOf(el).filter((o) => o.id !== key)
  // 删到 0 个选项 = 拆整段选项交互（回落叙事 + 自动续连）。
  if (events.length === 0) {
    return teardownInteractionScenario(scenario, node, { kind: 'choice', handlePrefixes: optionsOf(el).map((o) => o.id), childId: el.id })
  }
  let s = patchOverlayChild(scenario, node.id, el.id, { params: { ...el.params, events } })
  const edge = s.graph.edges.find((e) => e.source === node.id && (e.sourceHandle ?? 'default') === key)
  if (edge) s = { ...s, graph: disconnect(s.graph, edge.id) }
  // 清掉该分支的 event 反应副作用。
  const reactions = writeEventEffectsData(node.data.reactions, key, [])
  if (reactions !== node.data.reactions) s = { ...s, graph: updateNodeData(s.graph, node.id, { reactions }) }
  return s
}

// ── 写映射：视频绑定 ──────────────────────────────────────────────────────────
export function bindVideoGraph(
  scenario: GameScenario,
  node: GameNode,
  ref: string,
  durationMs: number | undefined,
): GameScenario {
  return {
    ...scenario,
    graph: updateNodeData(scenario.graph, node.id, {
      media: { ...(node.data.media ?? {}), kind: 'VIDEO', ref },
      ...(durationMs != null ? { durationMs } : {}),
    }),
  }
}

/** 写节点媒体提示词（生成面板）；空串清掉 `prompt`。 */
export function setNodePromptGraph(
  scenario: GameScenario,
  node: GameNode,
  prompt: string,
): GameScenario {
  const media = node.data.media ?? { kind: 'VIDEO' }
  return {
    ...scenario,
    graph: updateNodeData(scenario.graph, node.id, {
      media: { ...media, prompt: prompt || undefined },
    }),
  }
}

// 保留 ensureNodeOverlay 引用路径可见（供上层需要时显式确保节点已有专属 overlay）。
export { ensureNodeOverlay }
export type { Trigger }
