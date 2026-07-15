/**
 * 皮肤组件 registry 注册入口 —— 把从旧引擎迁移过来的皮肤组件按 component id 注册进渲染器 registry。
 *
 * 交互皮肤：battleParry / inkKou / inkYingMo / battleSkillBar
 * HUD 皮肤：battleHpBar
 * 配置里（元素 params.component / overlay HUD child `component`）填这些 id，试玩即按对应旧样式渲染；
 * 未指定 → 回退通用按钮 / 内置血条。加新皮肤只需在此注册一行。
 */
import { registerHudRenderer, registerInteractionSkin, SkinRegistry } from '../rendererRegistry'
import { BattleParryLayer } from './BattleParryLayer'
import { InkKouLayer } from './InkKouLayer'
import { InkYingMoLayer } from './InkYingMoLayer'
import { BattleSkillLayer } from './BattleSkillLayer'
import { BattleHpBar } from './BattleHpBar'

/**
 * 皮肤定位类型：
 *  - 'point'：单点皮肤，位置由作者的锚点/cue 坐标决定（可拖，创作=皮肤=试玩三处一致）。
 *  - 'fixed'：组合/固定布局皮肤（防反 A/B、底部按钮条），位置由皮肤自身固定，作者拖拽无意义。
 */
export type SkinPositioning = 'point' | 'fixed'

/**
 * 可选交互皮肤（供编辑器下拉）。`target` 区分它天然是 QTE 皮肤还是选项皮肤；
 * `defaultAnchor` 仅 point 皮肤有意义（新建拍点的初始归一化位置）。
 */
export const INTERACTION_SKINS: Array<{
  id: string
  label: string
  target: 'choice' | 'qte'
  positioning: SkinPositioning
  defaultAnchor?: { x: number; y: number }
}> = [
  { id: 'battleParry', label: '防反 QTE（A/B 收圈）', target: 'qte', positioning: 'fixed' },
  { id: 'inkKou', label: '叩击 QTE（单点）', target: 'qte', positioning: 'point', defaultAnchor: { x: 0.58, y: 0.39 } },
  { id: 'inkYingMo', label: '應/默 抉择', target: 'choice', positioning: 'fixed' },
  { id: 'battleSkillBar', label: '战斗技能条', target: 'choice', positioning: 'fixed' },
]

/** 皮肤定位类型查询；未知/未选皮肤（默认按钮条）按 'fixed'（底部居中）处理。 */
export function skinPositioning(id: string | undefined): SkinPositioning {
  return INTERACTION_SKINS.find((s) => s.id === id)?.positioning ?? 'fixed'
}

/** point 皮肤的默认锚点（新建拍点初始位置）；无则 undefined（走通用兜底 0.5/0.55）。 */
export function skinDefaultAnchor(id: string | undefined): { x: number; y: number } | undefined {
  return INTERACTION_SKINS.find((s) => s.id === id)?.defaultAnchor
}

/** 可选 HUD 皮肤（供编辑器下拉）。 */
export const HUD_SKINS: Array<{ id: string; label: string }> = [{ id: 'battleHpBar', label: '水墨血条' }]

function installCoreSkins(reg: SkinRegistry): void {
  reg.registerInteractionSkin('battleParry', BattleParryLayer)
  reg.registerInteractionSkin('inkKou', InkKouLayer)
  reg.registerInteractionSkin('inkYingMo', InkYingMoLayer)
  reg.registerInteractionSkin('battleSkillBar', BattleSkillLayer)
  reg.registerHudRenderer('battleHpBar', BattleHpBar)
}

let _registered = false
/** 注册到默认表（编辑器幂等）。 */
export function registerCoreSkins(): void {
  if (_registered) return
  _registered = true
  registerInteractionSkin('battleParry', BattleParryLayer)
  registerInteractionSkin('inkKou', InkKouLayer)
  registerInteractionSkin('inkYingMo', InkYingMoLayer)
  registerInteractionSkin('battleSkillBar', BattleSkillLayer)
  registerHudRenderer('battleHpBar', BattleHpBar)
}

/** 新建一份已装核心渲染器 + 战斗/水墨皮肤的隔离表（多局 Session 各持一份）。 */
export function createCoreSkinRegistry(): SkinRegistry {
  const reg = new SkinRegistry()
  reg.registerCoreRenderers()
  installCoreSkins(reg)
  return reg
}
