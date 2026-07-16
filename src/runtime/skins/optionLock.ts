/**
 * 选项门控（方案 B）：皮肤用落盘 `condition` + 实时态自行判断，引擎不注入 `_locked`。
 */
import type { GraphCondition } from '../schema/graph-schema'
import type { MutableState } from '../engine/apply-effects'
import { evaluateCondition, type ConditionTarget } from '../engine/condition'
import type { HudSnap } from '../engine/session'
import type { SkinCtx } from './rendererRegistry'

/** 由 hud 拼弱化运行态（仅 hp + vars/flags/score；无完整 attr 时用）。 */
export function conditionTargetFromHud(hud: HudSnap, visited: Set<string> = new Set()): ConditionTarget {
  const entities: MutableState['entities'] = {}
  for (const [id, e] of Object.entries(hud.entities)) {
    entities[id] = {
      attrs: { hp: e.hp },
      attrMeta: { hp: { max: e.maxHp } },
    }
  }
  return {
    state: {
      vars: hud.vars,
      flags: hud.flags,
      score: hud.score,
      entities,
    },
    visited,
  }
}

/** 皮肤求值目标：优先完整 condition；否则用 hud 弱化态。 */
export function skinConditionTarget(ctx: SkinCtx | undefined): ConditionTarget | undefined {
  if (!ctx) return undefined
  if (ctx.condition) return ctx.condition
  return conditionTargetFromHud(ctx.hud)
}

/**
 * 选项是否锁定（condition 不成立 → true）。
 * 无 condition → 不锁；无 ctx → 不锁（预览未注入态时仍可点）。
 */
export function isOptionLocked(
  opt: { condition?: GraphCondition },
  ctx: SkinCtx | undefined,
): boolean {
  if (!opt.condition) return false
  const t = skinConditionTarget(ctx)
  if (!t) return false
  return !evaluateCondition(opt.condition, t)
}
