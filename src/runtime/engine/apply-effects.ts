/**
 * effect 应用器（图原生、通用）—— 把声明式 GraphEffect 作用到可变运行态。
 *
 * 通用化（方向 C）：**没有 hp 特权**。实体只是一袋 attrs（+可选 attrMeta 约束）；`attr` effect 写任意
 * attr，按 attrMeta 的 min/max clamp。value 可为常量或表达式 `{expr}`（公式，就地声明，去 combatRules 散耦合）。
 */
import type { AttrMeta, GraphEffect, NumericEffectOp } from '../schema/graph-schema'
import { evalExpr, type EvalCtx } from './expr'
import type { Rng } from './rng'

export interface MutableEntity {
  attrs: Record<string, number>
  attrMeta?: Record<string, AttrMeta>
}

export interface MutableState {
  vars: Record<string, number>
  varMeta?: Record<string, { min?: number; max?: number }>
  entities: Record<string, MutableEntity>
  flags: Record<string, number>
  score: number
  items?: Record<string, number>
  rng?: Rng
  /** 已应用过的 once effect id 集合。 */
  appliedOnce?: Set<string>
}

function ctxFrom(state: MutableState): EvalCtx {
  return {
    vars: state.vars,
    entities: state.entities,
    flags: state.flags,
    score: state.score,
    rng: state.rng,
  }
}

function resolveValue(value: number | { expr: string }, state: MutableState): number {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof value.expr === 'string') {
    return evalExpr(value.expr, ctxFrom(state))
  }
  throw new Error(`bad effect value: ${JSON.stringify(value)}`)
}

export function clampNumericValue(v: number, meta?: { min?: number; max?: number }): number {
  let out = v
  if (meta?.min !== undefined) out = Math.max(meta.min, out)
  if (meta?.max !== undefined) out = Math.min(meta.max, out)
  return out
}

/**
 * 规则编辑器沿用 `<属性>Max` 配对约定（hp/hpMax、stamina/staminaMax）。
 * 最大值在运行时变化时，同步更新基础属性的约束并立即收紧当前值。
 */
export function syncPairedAttributeMax(entity: MutableEntity, changedAttr: string): void {
  if (!changedAttr.endsWith('Max')) return
  const baseAttr = changedAttr.slice(0, -3)
  if (!baseAttr || !Object.hasOwn(entity.attrs, baseAttr)) return

  const previousMeta = entity.attrMeta?.[baseAttr] ?? {}
  const rawMax = entity.attrs[changedAttr]
  if (rawMax === undefined) return
  const max = previousMeta.min === undefined ? rawMax : Math.max(previousMeta.min, rawMax)
  entity.attrs[changedAttr] = max
  const nextMeta = { ...previousMeta, max }
  entity.attrMeta = { ...entity.attrMeta, [baseAttr]: nextMeta }
  entity.attrs[baseAttr] = clampNumericValue(entity.attrs[baseAttr] ?? 0, nextMeta)
}

/** 数值 op：add=加、mul=乘、set=设为。 */
export function applyNumericOp(op: NumericEffectOp, cur: number, val: number): number {
  switch (op) {
    case 'set':
      return val
    case 'mul':
      return cur * val
    case 'add':
    default:
      return cur + val
  }
}

/** 把一组 effect 顺序作用到 state（原地修改）。 */
export function applyEffects(state: MutableState, effects: readonly GraphEffect[]): void {
  for (const eff of effects) {
    // once：仅首次生效（跨回合循环用）。
    if ('once' in eff && eff.once && eff.id) {
      state.appliedOnce ??= new Set()
      if (state.appliedOnce.has(eff.id)) continue
      state.appliedOnce.add(eff.id)
    }
    switch (eff.kind) {
      case 'var': {
        const cur = state.vars[eff.varId] ?? 0
        const val = resolveValue(eff.value, state)
        state.vars[eff.varId] = clampNumericValue(applyNumericOp(eff.op, cur, val), state.varMeta?.[eff.varId])
        break
      }
      case 'attr': {
        const ent = state.entities[eff.entityId]
        if (!ent) break
        const cur = ent.attrs[eff.attr] ?? 0
        const val = resolveValue(eff.value, state)
        ent.attrs[eff.attr] = clampNumericValue(applyNumericOp(eff.op, cur, val), ent.attrMeta?.[eff.attr])
        syncPairedAttributeMax(ent, eff.attr)
        break
      }
      case 'flag': {
        state.flags[eff.varId] = eff.value ? 1 : 0
        break
      }
      case 'item': {
        state.items ??= {}
        const cur = state.items[eff.itemId] ?? 0
        state.items[eff.itemId] = eff.op === 'give' ? cur + eff.count : Math.max(0, cur - eff.count)
        break
      }
    }
  }
}
