import { injectStyleOnce } from '../../styles/injectStyle'
import type { Scenario, Scene, HudElement } from '../../scenario/types'
import { coerceHudRules } from '../../scenario/gameplayTypes'
import type { HudPreset } from '../../scenario/gameplayTypes'
import type { EntitiesState } from '../entities'
import { findPlayer, findBoss } from '../entities'
import { isBattleScene, isQteScene } from '../gameplayGuards'
import { inferHudPreset } from '../gameplayState'
import { HealthBar } from './HealthBar'
import { BossBar } from './BossBar'
import { StatusIcons } from './StatusIcons'
import type { VarState } from '../conditionEval'

/**
 * HudLayer —— 玩法 HUD 叠层总装。Player 在 `isGameplay` 为真时挂一行渲染本组件。
 *
 * 可见性规则:
 *   - 作者在 Scenario.ui.hud 显式配了规则 → 按规则 + 当前上下文(battle/qte)判定;
 *   - 没配 → 走内置兜底(playerHp 常显、bossHp 仅 battle、status 有才显)。
 *
 * M2 为「只读骨架」:实体血量来自 initEntities(满血)，状态恒空。
 * 数据形状(EntitiesState)与 M5 回合结算共用，到时仅需把实时 state 传进来。
 */
export function HudLayer({
  scenario,
  scene,
  entities,
  vars,
  score,
  timerMs,
}: {
  scenario: Scenario
  scene: Scene
  entities: EntitiesState
  /** 运行时数值状态；用于显示气力点等资源。 */
  vars?: VarState
  /** 当前累计 QTE 分数（score 元素显示用）。 */
  score?: number
  /** 倒计时剩余毫秒（timer 元素显示用）；null/缺省 = 无倒计时。 */
  timerMs?: number | null
}) {
  injectStyleOnce('player-hud-layer', HUD_CSS)

  const battle = isBattleScene(scene)
  const qte = isQteScene(scene)

  const player = findPlayer(entities)
  const boss = findBoss(entities)
  const accent = scenario.ui?.accentColor
  const qiDef = scenario.variables?.qi
  const qiMax = typeof qiDef?.max === 'number' ? qiDef.max : 5
  const qiCurrent = Math.max(0, Math.min(qiMax, Math.round(vars?.qi ?? qiDef?.initial ?? 0)))
  const qiEnergy = qiDef ? { current: qiCurrent, max: qiMax } : undefined

  const activeStatuses = player
    ? player.statusIds
        .map((id) => scenario.statuses?.[id])
        .filter((s): s is NonNullable<typeof s> => !!s)
    : []

  // 兜底显隐依赖上下文（是否有 Boss / 是否有状态 / 是否有倒计时），集中算一次。
  const ctx = {
    battle,
    qte,
    hasBoss: !!boss,
    hasStatus: activeStatuses.length > 0,
    hasTimer: timerMs != null,
  }
  const show = (el: HudElement) =>
    presetAllows(inferHudPreset(scene), el, ctx) && resolveVisible(scenario, el, ctx)

  return (
    <div className="ks-hud" aria-hidden={false} data-testid="hud-layer">
      {show('bossHp') && boss && <BossBar entity={boss} />}

      {(show('score') || show('timer')) && (
        <div className="ks-hud-topright">
          {show('timer') && timerMs != null && (
            <div className="ks-hud-timer" data-testid="hud-timer">
              {(Math.max(0, timerMs) / 1000).toFixed(1)}s
            </div>
          )}
          {show('score') && (
            <div className="ks-hud-score" data-testid="hud-score">
              {Math.round(score ?? 0)}
            </div>
          )}
        </div>
      )}

      <div className="ks-hud-bottom">
        {show('status') && <StatusIcons statuses={activeStatuses} />}
        {show('playerHp') && player && <HealthBar entity={player} accent={accent} energy={qiEnergy} />}
      </div>
    </div>
  )
}

interface HudCtx {
  battle: boolean
  qte: boolean
  hasBoss: boolean
  hasStatus: boolean
  hasTimer: boolean
}

/** 场景 HUD 方案（原型四档）—— 在全局规则 / 兜底之前做粗粒度门控。 */
function presetAllows(preset: HudPreset, el: HudElement, ctx: HudCtx): boolean {
  switch (preset) {
    case 'hidden':
      return false
    case 'explore':
      return el === 'playerHp'
    case 'main':
      return el === 'playerHp' || el === 'score' || el === 'timer' || (el === 'status' && ctx.hasStatus)
    case 'battle':
      if (el === 'inventory') return false
      if (el === 'bossHp') return ctx.hasBoss
      if (el === 'playerHp') return true
      if (el === 'score' || el === 'timer') return ctx.qte
      if (el === 'status') return ctx.hasStatus
      return false
    default:
      return true
  }
}

/** 某 HUD 元素当前是否可见。作者规则优先；否则按上下文智能兜底。 */
function resolveVisible(scenario: Scenario, el: HudElement, ctx: HudCtx): boolean {
  const rule = coerceHudRules(scenario.ui?.hud).find((r) => r.element === el)
  if (rule) {
    switch (rule.show) {
      case 'always':
        return true
      case 'never':
        return false
      case 'battle':
        return ctx.battle
      case 'qte':
        return ctx.qte
    }
  }
  // 内置兜底（无作者规则时按上下文智能显示）：
  switch (el) {
    case 'playerHp':
      return true // 玩家血条常显
    case 'bossHp':
      return ctx.battle && ctx.hasBoss
    case 'status':
      return ctx.hasStatus // 身上有状态才显
    case 'score':
      return ctx.qte // 节奏/限时交互时显示得分
    case 'timer':
      return ctx.qte && ctx.hasTimer // 有倒计时且处于限时交互
    case 'inventory':
      return false // 背包另由 InventoryHUD 负责
    default:
      return false
  }
}

const HUD_CSS = `
.ks-hud {
  position: absolute; inset: 0;
  pointer-events: none;
  z-index: 25;
}
.ks-hud-bottom {
  position: absolute;
  right: 4%; bottom: 4%;
  display: flex; flex-direction: column; gap: 8px;
  align-items: flex-end;
  max-width: 36%;
}
/* 分数 / 倒计时(右上) */
.ks-hud-topright {
  position: absolute;
  right: 4%; top: 5%;
  display: flex; align-items: center; gap: 10px;
}
.ks-hud-score, .ks-hud-timer {
  font-variant-numeric: tabular-nums;
  padding: 4px 12px;
  border-radius: 6px;
  background: rgba(0,0,0,0.46);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.14);
  letter-spacing: 0.06em;
}
.ks-hud-score {
  font-size: 18px; font-weight: 600;
  color: #fbbf24;
}
.ks-hud-timer {
  font-size: 15px;
  color: rgba(255,255,255,0.9);
}
/* 玩家血条 */
.ks-hud-hp {
  display: flex; flex-direction: column; gap: 4px;
  padding: 8px 10px 9px;
  background: rgba(8,6,4,0.38);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
}
.ks-hud-hp-row {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
}
.ks-hud-hp-name {
  font-size: 12px; letter-spacing: 0.08em;
  color: rgba(255,255,255,0.92);
}
.ks-hud-hp-num {
  font-size: 11px;
  color: rgba(255,255,255,0.6);
}
.ks-hud-hp-track {
  width: min(250px, 24vw); height: 10px;
  border-radius: 7px 8px 6px 7px / 5px 7px 5px 6px;
  background: linear-gradient(180deg,#2b2620,#0c0a08);
  box-shadow: 0 2px 6px rgba(0,0,0,.5) inset;
  overflow: hidden;
  transform: scaleX(-1);
}
.ks-hud-hp-fill {
  height: 100%;
  background: linear-gradient(90deg, #7398cf, #a6c6ee);
  transition: width 220ms ease;
}
.ks-hud-hp.is-low .ks-hud-hp-fill {
  background: linear-gradient(90deg, #f87171, #ef4444);
  animation: ks-hud-lowpulse 1s ease-in-out infinite;
}
.ks-hud-rage {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 6px;
}
.ks-hud-pip {
  width: 13px; height: 13px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #5a5346, #262219);
  border: 1px solid rgba(0,0,0,.5);
  box-shadow: 0 1px 2px rgba(0,0,0,.5);
  transition: all .2s;
}
.ks-hud-pip.on {
  background: radial-gradient(circle at 35% 30%, #ffe49c, #c8902f);
  border-color: rgba(255,220,150,.7);
  box-shadow: 0 0 7px rgba(255,190,90,.7), 0 1px 2px rgba(0,0,0,.4);
}
@keyframes ks-hud-lowpulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
/* Boss 血条(顶部) */
.ks-hud-boss {
  position: absolute;
  top: 3.5%; left: 50%;
  transform: translateX(-50%);
  width: min(30%, 320px);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.ks-hud-boss-name {
  font-size: 13px; letter-spacing: 0.18em;
  color: rgba(255,255,255,0.94);
  text-shadow: 0 1px 8px rgba(0,0,0,0.6);
}
.ks-hud-boss-track {
  width: 100%; height: 10px;
  border-radius: 5px;
  background: rgba(0,0,0,0.5);
  border: 1px solid rgba(239,68,68,0.5);
  overflow: hidden;
}
.ks-hud-boss-fill {
  height: 100%;
  background: linear-gradient(90deg, #ef4444, #b91c1c);
  box-shadow: 0 0 12px rgba(239,68,68,0.5);
  transition: width 220ms ease;
}
/* 状态图标行 */
.ks-hud-status {
  display: flex; gap: 6px; flex-wrap: wrap;
}
.ks-hud-status-chip {
  font-size: 11px; padding: 2px 8px; border-radius: 10px;
  background: rgba(0,0,0,0.42);
  border: 1px solid rgba(255,255,255,0.16);
  color: rgba(255,255,255,0.9);
}
.ks-hud-status-chip.ks-buff { border-color: rgba(52,211,153,0.6); }
.ks-hud-status-chip.ks-debuff { border-color: rgba(248,113,113,0.6); }
`
