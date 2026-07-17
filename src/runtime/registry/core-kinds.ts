/**
 * 核心元素 kind 模块（三职责，低耦合可复用）—— 注册后即可被任意节点复用。
 *
 * 每个 kind 只声明：role + params 校验 + 输出 handle + 运行时契约（run/resolve）。引擎按 role 调用；
 * presentation 由引擎发泛型 renderOverlay，Player 按 kind 渲染。新增玩法 = 加一个这样的模块，核心不改。
 *
 * 覆盖 nodia 所需（数值结算/副作用一律走 node.data.reactions 的生命周期相位，无 logic 结算组件）：
 *  - floatText(view) 漂字：纯展示，params 交给 Player。
 *  - choice(interaction) / skill(interaction) 选择/技能：每个 event 一个同名出口。
 *  - qte(interaction)   判定：出口以 params.events 为准；缺省回退本 kind 的 events（三档）。
 *    各皮肤自带出口 defaults（见 skins/components/*Preset），不在此按皮肤 id 分支。
 *  - hotspot(interaction) 热点：每个 HotspotSpot（id + 可选 x/y）一个同名出口。
 *
 * 交互目录：共享壳是 ComponentEvent；choice/skill 用 ChoiceOption（可带 condition），
 * hotspot 用 HotspotSpot（可带 x/y）。出口 id === event.id；副作用一律进 reactions。
 */
import type { GraphCondition, GraphTextStyle } from '../schema/graph-schema'
import type { ComponentEvent } from '../schema/node-config-schema'
import type { FormField, KindPlugin } from './kind-registry'
import { KindRegistry, registerKind } from './kind-registry'
import { evalExpr } from '../engine/expr'

// ── presentation: floatText（花字/飘字：文案飘起淡出，支持固定文案或动态表达式）──────
export interface FloatTextParams {
  /** 固定文案；含 `{v}` 时用 expr 求值替换（如 "气力 {v}"）。 */
  text?: string
  /** 动态值表达式（如伤害 `-(entity.ent-player.attr.attack*2 - entity.ent-boss.attr.defense)`）。 */
  expr?: string
  /** 归一化锚点（0~1，画面中心 0.5,0.5）。 */
  x?: number
  y?: number
  /** 文本样式（预设快照，含 fontSize/描边/色/投影）。 */
  style?: GraphTextStyle
  /** 兜底文字色（无 style.color 时用；伤害飘字用）。 */
  color?: string
  /** 飘起淡出总时长 ms。 */
  durationMs?: number
  /** 入场动画预设 id（pop/fade/slide/floatUp…）。 */
  enter?: string
  /** 出场动画预设 id。 */
  exit?: string
}
function signed(v: number): string {
  return v > 0 ? `+${v}` : String(v)
}
export const floatTextKind: KindPlugin<FloatTextParams> = {
  kind: 'floatText',
  role: 'presentation',
  stageRelative: true,
  label: '花字/飘字',
  defaults: () => ({ text: '', x: 0.5, y: 0.45 }),
  form: [
    { t: 'text', key: 'text', label: '文案', placeholder: '含 {v} 用 expr 替换' },
    { t: 'text', key: 'expr', label: '表达式', placeholder: 'entity.ent-boss.attr.hp', mono: true },
    { t: 'textStyle', key: 'style', label: '样式', group: 'overlay' },
    { t: 'number', key: 'x', label: 'x', step: 0.05 },
    { t: 'number', key: 'y', label: 'y', step: 0.05 },
    { t: 'number', key: 'durationMs', label: '时长ms' },
    { t: 'color', key: 'color', label: '兜底色', placeholder: '#ffd54a' },
  ],
  validate: (p) => (p.text || p.expr ? [] : ['floatText 需要 text 或 expr']),
  outputs: () => [],
  // 到触发时机时按当前状态算出要飘的文本，emit 一个已解析的 renderOverlay（Player 只管飘起淡出动画）。
  render: (ctx, p) => {
    let display = p.text ?? ''
    if (p.expr) {
      const v = evalExpr(p.expr, ctx.state)
      display = p.text ? p.text.replace('{v}', signed(v)) : signed(v)
    }
    return [
      {
        type: 'renderOverlay',
        nodeId: ctx.nodeId,
        elementId: ctx.elementId ?? 'float',
        component: 'floatText',
        params: { text: display, x: p.x, y: p.y, color: p.color, style: p.style, durationMs: p.durationMs, enter: p.enter, exit: p.exit, float: true },
      },
    ]
  },
}

// HUD 呈现（surface:'hud'）的具体组件契约住在各自皮肤 tsx（如 BattleHpBar），
// 经 skins/components 的 COMPONENT_KINDS 注册——不要在 core-kinds 里为「未分类」硬编一种血条。

// ── interaction: choice / skill ───────────────────────────────────────────────
/** 选项呈现形态：列表 / 画面热区。 */
export type ChoicePresentation = 'list' | 'hotspot'
/**
 * choice/skill 的选项项 = 共享事件 + 本组件门控。
 * `condition` 不成立 → 皮肤用实时态灰置禁选（≠ 边 condition；引擎不注入 _locked）。
 */
export type ChoiceOption = ComponentEvent & { condition?: GraphCondition }
export interface ChoiceParams {
  /** 交互目录：每个 option 一个同名出口（id === 出口 handle）。 */
  events: ChoiceOption[]
  /** 限时 ms（0/缺省=不限时）。 */
  timeoutMs?: number
  /** 超时默认出口 event id。 */
  defaultEvent?: string
  prompt?: string
  presentation?: ChoicePresentation
  /** 整组选项锚点（归一化 0~1；预览拖拽 / 试玩共用）。 */
  x?: number
  y?: number
}
const CHOICE_FORM: FormField[] = [
  { t: 'text', key: 'prompt', label: '提示' },
  { t: 'select', key: 'presentation', label: '呈现', options: [{ value: 'list', label: '列表' }, { value: 'hotspot', label: '热区' }] },
  { t: 'number', key: 'x', label: 'x', step: 0.05 },
  { t: 'number', key: 'y', label: 'y', step: 0.05 },
  { t: 'number', key: 'timeoutMs', label: '限时ms' },
  { t: 'text', key: 'defaultEvent', label: '超时出口' },
  { t: 'events', key: 'events', label: '选项', variant: 'choice' },
]
function choiceLike(kind: string, label: string): KindPlugin<ChoiceParams> {
  return {
    kind,
    role: 'interaction',
    label,
    defaults: () => ({ events: [{ id: 'opt0', label: '选项一' }], presentation: 'list', x: 0.5, y: 0.72 }),
    form: CHOICE_FORM,
    validate: (p) =>
      Array.isArray(p.events) && p.events.length > 0 ? [] : [`${kind}.events must be non-empty`],
    outputs: (p) => (p.events ?? []).map((e) => ({ id: e.id, label: e.label })),
    resolve: (_ctx, p, input) => {
      // input = 选项 event id（超时/缺省时用 defaultEvent → 首项）
      const id = typeof input === 'string' ? input : p.defaultEvent ?? p.events[0]?.id ?? 'default'
      return { outcome: id }
    },
  }
}
export const choiceKind = {
  ...choiceLike('choice', '选项'),
  aliases: ['inkYingMo', 'battleSkillBar'],
  aliasLabels: { inkYingMo: '應/默 抉择', battleSkillBar: '战斗技能条' },
} as KindPlugin<ChoiceParams>
export const skillKind = choiceLike('skill', '技能')

// ── interaction: qte ──────────────────────────────────────────────────────────
/** QTE 单拍的几何/判定形态（对齐 legacy QTECue.shape）。 */
export type QteCueShape = 'tap' | 'hold' | 'sweep'
export interface QteCue {
  id: string
  shape?: QteCueShape
  /** 归一化坐标（0~1）。 */
  x?: number
  y?: number
  /** 提示环出现 / 判定命中时刻（相对演出 ms）。 */
  appearAt?: number
  targetAt?: number
  /** 单个按键的结束 / 消失时刻（相对演出 ms）；缺省由 targetAt/durationMs 派生。 */
  endAt?: number
  /** hold 时长 / sweep 划动窗口 ms。 */
  durationMs?: number
  /** sweep 方向。 */
  sweepDir?: 'left' | 'right' | 'up' | 'down'
  label?: string
  /** 触发键（键盘）。 */
  triggerKey?: string
  /** 慢动作系数（<1 减速）。 */
  slowMo?: number
  zIndex?: number
}
export interface QteParams {
  qteKind?: 'parry' | 'timing' | 'mash' | 'sequence' | 'sweep'
  windowMs?: number
  passingHits?: number
  /** 结构化拍点。 */
  cues?: QteCue[]
  /**
   * 完美判定半窗 ms：|玩家按下时刻 − 拍点「命中(targetAt)」时刻| ≤ 此值 → pass（完美）。
   * 「成功(good)」不需要独立参数——命中落在拍点显示窗 [appearAt, endAt] 内即成功、窗外/超时=fail。
   * 缺省=窗内命中即完美。运行时由各 QTE 皮肤消费。
   */
  perfectMs?: number
  /** @deprecated 由 perfectMs 取代（成功=命中于拍点显示窗内，无需独立半窗）；保留仅为旧数据兼容。 */
  tolerance?: number
  /** 满分。 */
  score?: number
  /** 过关分数线。 */
  passingScore?: number
  /** sequence 型的按键序列。 */
  sequence?: string[]
  /** UI 皮肤 id。 */
  ui?: string
  /** 交互目录：自定义判定出口（缺省见本 kind `events`；皮肤自带 defaults 写进 params.events）。 */
  events?: ComponentEvent[]
  /** 超时默认出口 event id（缺省 'fail'）。 */
  defaultEvent?: string
  /** 限时 ms。 */
  timeoutMs?: number
  /** 皮肤自管时限 ms（如收圈时长；缺省各皮肤自带）。 */
  durationMs?: number
}
/** @deprecated 旧草稿字段；新数据用 `events` / `defaultEvent`（边路由统一）。 */
export type QteExit = { key: string; label?: string }
export type QteFullParams = QteParams & {
  exits?: QteExit[]
  defaultKey?: string
  outcomeLabels?: Record<string, string>
}
/** 无皮肤 / 未落盘 events 时的通用三档出口（皮肤差异在各自 preset，不在此分支）。 */
const QTE_DEFAULT_EVENTS: ComponentEvent[] = [
  { id: 'pass', label: '完美' },
  { id: 'good', label: '良好' },
  { id: 'fail', label: '失败' },
]
export const qteKind: KindPlugin<QteFullParams> = {
  kind: 'qte',
  role: 'interaction',
  aliases: ['battleParry', 'inkKou'],
  aliasLabels: { battleParry: '防反 QTE', inkKou: '叩击 QTE' },
  label: 'QTE',
  events: QTE_DEFAULT_EVENTS,
  defaults: () => ({ qteKind: 'parry', cues: [], passingHits: 1 }),
  form: [
    { t: 'select', key: 'qteKind', label: 'QTE型', options: [{ value: 'parry', label: '完美防反' }, { value: 'timing', label: '打点' }, { value: 'mash', label: '连打' }, { value: 'sequence', label: '连招' }, { value: 'sweep', label: '划动' }] },
    { t: 'number', key: 'passingHits', label: '过关次' },
    { t: 'number', key: 'passingScore', label: '过关分' },
    { t: 'number', key: 'tolerance', label: '容差ms' },
    { t: 'number', key: 'score', label: '满分' },
    { t: 'number', key: 'windowMs', label: '窗口ms' },
    { t: 'events', key: 'events', label: '出口', variant: 'plain' },
    { t: 'qteCues', key: 'cues', label: '拍点' },
  ],
  validate: () => [],
  outputs: (p) => {
    // 落盘 events 优先；旧 exits 仅作草稿兼容；再回退本 kind 通用三档。
    if (Array.isArray(p.events) && p.events.length > 0) {
      return p.events.map((e) => ({ id: e.id, label: e.label }))
    }
    const exits = p.exits
    if (Array.isArray(exits) && exits.length > 0) {
      const list = exits.map((e) => ({ id: e.key, label: e.label ?? p.outcomeLabels?.[e.key] }))
      const missKey = p.defaultKey ?? p.defaultEvent ?? 'fail'
      if (!list.some((o) => o.id === missKey)) {
        list.push({ id: missKey, label: p.outcomeLabels?.[missKey] })
      }
      return list
    }
    return QTE_DEFAULT_EVENTS.map((e) => ({ id: e.id, label: e.label }))
  },
  resolve: (_ctx, p, input) => {
    // ① 字符串 outcome（event id / pass|good|fail）；② { key }；③ { hits } 由 passingHits 判；④ 超时 defaultEvent。
    if (typeof input === 'string' && input) return { outcome: input }
    if (input && typeof input === 'object' && 'key' in input && typeof (input as { key: unknown }).key === 'string') {
      return { outcome: (input as { key: string }).key }
    }
    if (input && typeof input === 'object' && 'hits' in input) {
      const hits = Number((input as { hits: number }).hits)
      const need = p.passingHits ?? 1
      return { outcome: hits >= need ? 'pass' : 'fail' }
    }
    return { outcome: p.defaultEvent ?? 'fail' }
  },
}

// ── presentation: dialogue（原地对话：说话人 + 台词，底部对话框）──────────────────
export interface DialogueParams {
  speaker?: string
  text: string
  color?: string
  /** 文本样式（字幕预设快照）。 */
  style?: GraphTextStyle
  /** 归一化位置（缺省=底部居中字幕带）。 */
  x?: number
  y?: number
}
export const dialogueKind: KindPlugin<DialogueParams> = {
  kind: 'dialogue',
  role: 'presentation',
  stageRelative: true,
  label: '字幕/对白',
  defaults: () => ({ text: '', speaker: '' }),
  form: [
    { t: 'text', key: 'speaker', label: '说话人' },
    { t: 'text', key: 'text', label: '台词' },
    { t: 'textStyle', key: 'style', label: '样式', group: 'subtitle' },
    { t: 'number', key: 'x', label: 'x', step: 0.05 },
    { t: 'number', key: 'y', label: 'y', step: 0.05 },
  ],
  validate: (p) => (p.text ? [] : ['dialogue 需要 text']),
  outputs: () => [],
  // 无 render()：走引擎泛型 renderOverlay，Player 侧 dialogue 渲染器画底部对话框。
}

// ── presentation: transition（转场：全屏淡入/淡出，durationMs 控时长）──────────────
export interface TransitionParams {
  durationMs?: number
  style?: 'fade' | 'wipe'
  color?: string
}
export const transitionKind: KindPlugin<TransitionParams> = {
  kind: 'transition',
  role: 'presentation',
  stageRelative: true,
  label: '转场',
  defaults: () => ({ durationMs: 600, style: 'fade' }),
  form: [
    { t: 'number', key: 'durationMs', label: '时长ms' },
    { t: 'select', key: 'style', label: '样式', options: [{ value: 'fade', label: '淡入淡出' }, { value: 'wipe', label: '擦除' }] },
    { t: 'color', key: 'color', label: '颜色', placeholder: '#000000' },
  ],
  validate: () => [],
  outputs: () => [],
  // 无 render()：走引擎泛型 renderOverlay，Player 侧 transition 渲染器按 durationMs 做淡入淡出，换节点时随叠层清空。
}

// ── interaction: hotspot ──────────────────────────────────────────────────────
/** 热点项 = 共享事件 + 本组件画面锚点（归一化 0~1）。 */
export type HotspotSpot = ComponentEvent & { x?: number; y?: number }
export interface HotspotParams {
  /** 交互目录：每个 spot 一个同名出口；坐标由本组件 params 决定。 */
  events: HotspotSpot[]
}
export const hotspotKind: KindPlugin<HotspotParams> = {
  kind: 'hotspot',
  role: 'interaction',
  label: '热点',
  defaults: () => ({ events: [] }),
  form: [{ t: 'events', key: 'events', label: '热点', variant: 'hotspot' }],
  validate: (p) => (Array.isArray(p.events) ? [] : ['hotspot.events must be an array']),
  outputs: (p) => (p.events ?? []).map((e) => ({ id: e.id, label: e.label })),
  resolve: (_ctx, _p, input) => ({ outcome: String(input) }),
}

export const CORE_KINDS: KindPlugin[] = [
  floatTextKind as unknown as KindPlugin,
  dialogueKind as unknown as KindPlugin,
  transitionKind as unknown as KindPlugin,
  choiceKind as unknown as KindPlugin,
  skillKind as unknown as KindPlugin,
  qteKind as unknown as KindPlugin,
  hotspotKind as unknown as KindPlugin,
]

/** 注册全部核心 kind 到默认表（幂等：重复调用覆盖同名）。编辑器 / 单测用。 */
export function registerCoreKinds(): void {
  for (const k of CORE_KINDS) registerKind(k)
}

/** 新建一份已装核心 kind 的隔离注册表（多局 Runtime 各持一份）。 */
export function createCoreKindRegistry(): KindRegistry {
  const reg = new KindRegistry()
  for (const k of CORE_KINDS) reg.registerKind(k)
  return reg
}
