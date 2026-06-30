/**
 * 视频游戏「固定资产目录」—— 视频 / 界面 / 规则三个 tab 的内置数据源，
 * 以及蓝图节点「配置」面板各下拉的取值来源。
 *
 * 数据移植自 `视频交互原型.html`（= `新影游平台交互原型.html`），并按
 * 《新影游平台-编辑器开发规格》对齐字段与取值。两处关系：
 *
 *   1. 「视频」tab（VIDEO_CLIPS）= 14 段战斗片段；
 *      → 蓝图节点「演出编号」下拉直接取这份列表（节点 clipId 引用片段 id）；
 *      → 节点「视频类型 / 演出时长」只读派生自所选片段的 type / durMs。
 *   2. 「界面」tab（UI_SCHEMES）= HUD 方案库（主 / 战斗 / 探索 / 隐藏界面，与
 *      HudPreset 对齐）；→ 蓝图节点「HUD 方案」下拉直接取这份列表（节点
 *      hudPreset 引用方案 id），运行时按它叠加 HUD 到视频之上。
 *
 * 不放进 Scenario：这是平台级固定能力清单（可用演出库 / HUD 方案库），跨剧本
 * 共享、不随某本剧本增删，故以模块常量持有，避免污染 Scenario schema。
 */
import type { HudPreset } from './gameplayTypes'

/** 演出片段类型 —— 对齐原型 VIDEO_ASSETS.kind（loop / 演出 / 转场）。 */
export type VideoClipType = 'loop' | '演出' | '转场'

/** 一条内置演出视频（= 原型 VIDEO_ASSETS 的精简投影）。 */
export interface VideoClip {
  /** 稳定 id（节点 clipId 引用它）。 */
  id: string
  /** 显示名（如「主角 · 轻攻击」）。 */
  label: string
  /** 片段性质（loop / 演出 / 转场）—— 蓝图面板「视频类型」只读展示。 */
  type: VideoClipType
  /** 时长（ms）—— 蓝图面板「演出时长」只读展示。 */
  durMs: number
}

/**
 * 内置演出视频库（t-video）—— 14 段，移植自原型 `VIDEO_ASSETS`（无常豺战斗片段）。
 * 顺序即原型左栏展示顺序；type / durMs 取自 VIDEO_ASSETS.kind / dur。
 */
export const VIDEO_CLIPS: readonly VideoClip[] = [
  { id: 'vd-wcc-idle', label: '双方 · 待机', type: 'loop', durMs: 8000 },
  { id: 'vd-wcc-qianyao', label: '小怪 · 攻击前摇', type: '演出', durMs: 4000 },
  { id: 'vd-wcc-pugong', label: '主角 · 轻攻击', type: '演出', durMs: 5000 },
  { id: 'vd-wcc-pugong2', label: '主角 · 轻攻击·变招', type: '演出', durMs: 5000 },
  { id: 'vd-wcc-zhong', label: '主角 · 重攻击', type: '演出', durMs: 6000 },
  { id: 'vd-wcc-zhong2', label: '主角 · 重攻击·变招', type: '演出', durMs: 6000 },
  { id: 'vd-wcc-qinggong', label: '主角 · 轻攻致死', type: '演出', durMs: 7000 },
  { id: 'vd-wcc-dazhao', label: '主角 · 灭世', type: '演出', durMs: 12000 },
  { id: 'vd-wcc-fangfan', label: '主角 · 受击防反', type: '演出', durMs: 4000 },
  { id: 'vd-wcc-shanbi', label: '主角 · 受击闪避', type: '演出', durMs: 4000 },
  { id: 'vd-wcc-huiqi', label: '主角 · 冥想', type: '演出', durMs: 5000 },
  { id: 'vd-wcc-shouji', label: '主角 · 受击', type: '演出', durMs: 4000 },
  { id: 'vd-wcc-shengli', label: '主角 · 胜利', type: '演出', durMs: 10000 },
  { id: 'vd-wcc-shibai', label: '主角 · 失败', type: '演出', durMs: 6000 },
]

/** 一套 HUD 界面方案。id 与 HudPreset 对齐，运行时直接当 hudPreset 用。 */
export interface UiScheme {
  /** 与 HudPreset 对齐的 id —— 蓝图面板「HUD 方案」存它进 scene.hudPreset。 */
  id: HudPreset
  /** 显示名。 */
  label: string
  /** 一句说明（列表/预览展示）。 */
  desc: string
}

/**
 * 内置 HUD 界面库（「界面」tab）—— 列表 + 蓝图「HUD 方案」下拉的共同数据源。
 * id 即 HudPreset，运行时叠加到视频之上。
 */
export const UI_SCHEMES: readonly UiScheme[] = [
  { id: 'main', label: '主界面', desc: '常驻主 HUD：玩家血条 / 头像 / 基础操作。' },
  { id: 'battle', label: '战斗界面', desc: '战斗 HUD：玩家 + Boss 血条、技能、状态图标。' },
  { id: 'explore', label: '探索界面', desc: '探索 HUD：背包 / 热点提示 / 简化操作。' },
  { id: 'hidden', label: '隐藏界面', desc: '纯过场：隐藏全部 HUD，只留画面。' },
]

/** 一条玩法规则（固定展示数据）。 */
export interface GameRule {
  id: string
  label: string
  /** 规则条目（每行一条，列表点开后逐条展示）。 */
  lines: string[]
}

/**
 * 内置规则库（t-rule）—— 「规则」tab 列表 + 预览数据源。移植自原型 t-rule（玩家 / 敌人）。
 */
export const GAME_RULES: readonly GameRule[] = [
  {
    id: 'r-player',
    label: '玩家',
    lines: [
      '生命值：1000（受击归零则进入失败演出）',
      '攻击力 80 · 防御力 40 · 暴击率 10%',
      '气力上限：5（满气可触发「灭世」终结技）',
      '出手速度 30 · 先手判定：出手速度大者先手',
    ],
  },
  {
    id: 'r-enemy',
    label: '敌人',
    lines: [
      '生命值：1200',
      '攻击力 75 · 防御力 50 · 暴击率 8%',
      '进攻欲望 0.5 · 出手速度 25',
      '受创硬直：被重攻击命中后进入硬直',
    ],
  },
]

/** 按 id 取演出视频元数据（找不到返回 undefined）。 */
export function getVideoClip(id: string | undefined): VideoClip | undefined {
  if (!id) return undefined
  return VIDEO_CLIPS.find((v) => v.id === id)
}

/** 按 id 取 HUD 方案。 */
export function getUiScheme(id: HudPreset | undefined): UiScheme | undefined {
  if (!id) return undefined
  return UI_SCHEMES.find((u) => u.id === id)
}

/** 按 id 取规则。 */
export function getGameRule(id: string | undefined): GameRule | undefined {
  if (!id) return undefined
  return GAME_RULES.find((r) => r.id === id)
}
