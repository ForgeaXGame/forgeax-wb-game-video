/**
 * 组件参数类型与共享 inputs 表（无 React）。
 *
 * 具体组件的 `ComponentDef` + 渲染实现住在 `runtime/skins/components/*`（BattleHpBar 同构），
 * 经 `EXTRA_COMPONENTS` / `createDefaultComponentRegistry` 注入。本文件只保留跨组件复用的
 * 类型与 inputs 常量，避免皮肤包互相复制、也避免 core 反向依赖 React。
 */
import type { GraphCondition, GraphTextStyle } from '../schema/graph-schema'
import type { ComponentEvent, ComponentInput } from '../schema/node-config-schema'
import type { ComponentDef } from './component-registry'
import { ComponentRegistry, registerComponent } from './component-registry'

// ── presentation: floatText ───────────────────────────────────────────────────
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
  presentation?: ChoicePresentation
  /** 整组选项锚点（归一化 0~1；预览拖拽 / 试玩共用）。 */
  x?: number
  y?: number
}
/** choice 系共享 inputs（`choice`/`skill`/`inkYingMo`/`battleSkillBar` 契约复用）。 */
export const CHOICE_INPUTS: ComponentInput[] = [
  { key: 'presentation', label: '呈现', valueType: 'string', default: 'list', options: [{ value: 'list', label: '列表' }, { value: 'hotspot', label: '热区' }] },
  { key: 'timeoutMs', label: '限时ms', valueType: 'number' },
  { key: 'defaultEvent', label: '超时出口', valueType: 'string' },
  { key: 'events', label: '选项', valueType: 'string', component: 'events', default: [{ id: 'opt0', label: '选项一' }] },
  { key: 'x', label: 'x', valueType: 'number' },
  { key: 'y', label: 'y', valueType: 'number' },
]
export const validateChoiceEvents = (p: ChoiceParams): string[] =>
  Array.isArray(p.events) && p.events.length > 0 ? [] : ['events must be non-empty']

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
  /** @deprecated 由 perfectMs 取代；保留仅为旧数据兼容。 */
  tolerance?: number
  /** 满分。 */
  score?: number
  /** 过关分数线。 */
  passingScore?: number
  /** sequence 型的按键序列。 */
  sequence?: string[]
  /** 交互目录：自定义判定出口（缺省见本组件 `events`；皮肤自带 defaults 写进 params.events）。 */
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
/** 无皮肤 / 未落盘 events 时的通用三档出口。 */
export const QTE_DEFAULT_EVENTS: ComponentEvent[] = [
  { id: 'pass', label: '完美' },
  { id: 'good', label: '良好' },
  { id: 'fail', label: '失败' },
]
/** qte 系共享 inputs。 */
export const QTE_INPUTS: ComponentInput[] = [
  { key: 'qteKind', label: 'QTE型', valueType: 'string', default: 'parry', options: [{ value: 'parry', label: '完美防反' }, { value: 'timing', label: '打点' }, { value: 'mash', label: '连打' }, { value: 'sequence', label: '连招' }, { value: 'sweep', label: '划动' }] },
  { key: 'passingHits', label: '过关次', valueType: 'number', default: 1 },
  { key: 'passingScore', label: '过关分', valueType: 'number' },
  { key: 'perfectMs', label: '完美半窗ms', valueType: 'number' },
  { key: 'tolerance', label: '容差ms', valueType: 'number' },
  { key: 'score', label: '满分', valueType: 'number' },
  { key: 'windowMs', label: '窗口ms', valueType: 'number' },
  { key: 'durationMs', label: '收圈时长ms', valueType: 'number' },
  { key: 'timeoutMs', label: '限时ms', valueType: 'number' },
  { key: 'defaultEvent', label: '超时出口', valueType: 'string' },
  { key: 'glyph', label: '字形（inkKou）', valueType: 'string' },
  { key: 'events', label: '出口', valueType: 'string', component: 'events' },
  { key: 'cues', label: '拍点', valueType: 'string', component: 'qteCues', default: [] },
]

// ── presentation: dialogue / transition ───────────────────────────────────────
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

export interface TransitionParams {
  durationMs?: number
  style?: 'fade' | 'wipe'
  color?: string
}

// ── interaction: hotspot ──────────────────────────────────────────────────────
/** 热点项 = 共享事件 + 本组件画面锚点（归一化 0~1）。 */
export type HotspotSpot = ComponentEvent & { x?: number; y?: number }
export interface HotspotParams {
  /** 交互目录：每个 spot 一个同名出口；坐标由本组件 inputs 决定。 */
  events: HotspotSpot[]
}

/**
 * @deprecated 组件契约已迁到 `skins/components/*`；保留空表以免旧调用方炸。
 * 请用 `registerCoreSkins()` / `createDefaultComponentRegistry()`。
 */
export const CORE_COMPONENTS: Array<[string, ComponentDef]> = []

/**
 * @deprecated 不再注册任何组件（契约在皮肤包）。请改调 `registerCoreSkins()`。
 * 保留为空操作以兼容旧 beforeAll。
 */
export function registerCoreComponents(): void {
  for (const [id, c] of CORE_COMPONENTS) registerComponent(id, c)
}

/** 空隔离表；完整表请用 `createDefaultComponentRegistry()`。 */
export function createCoreComponentRegistry(): ComponentRegistry {
  const reg = new ComponentRegistry()
  for (const [id, c] of CORE_COMPONENTS) reg.registerComponent(id, c)
  return reg
}
