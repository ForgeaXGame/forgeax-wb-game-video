/**
 * 从 GameScenario 建初始运行态 MutableState。
 *
 * - variables：kind='number' → vars(+varMeta 上下限)；kind='flag' → flags(0/1)。
 * - entities：attrs 直接拷贝作为初始/当前值；attrMeta 透传（clamp/ratio/复位约束）。
 *   若某 attr 只在 attrMeta 里给了 initial 而 attrs 没有，则用 initial 补上初值。
 *   **无 hp 特权**：hp 只是 attrs 里名为 hp 的一项（约定）。
 * - rng：使用会话注入的 seed；缺省 0，保证 headless 调试和测试可复现。
 */
import type { GameScenario } from '../schema/graph-schema'
import { createRng } from './rng'
import {
  clampNumericValue,
  syncPairedAttributeMax,
  type MutableEntity,
  type MutableState,
} from './apply-effects'

export function initState(scenario: GameScenario, rngSeed = 0): MutableState {
  const vars: Record<string, number> = {}
  const varMeta: Record<string, { min?: number; max?: number }> = {}
  const flags: Record<string, number> = {}

  // 声明变量一律进 vars 桶（带 min/max clamp）；flag 为纯运行时概念，由 flag effect 写 flags 桶（默认 0）。
  for (const [id, raw] of Object.entries(scenario.variables ?? {})) {
    const meta = raw.min !== undefined || raw.max !== undefined ? { min: raw.min, max: raw.max } : undefined
    vars[id] = clampNumericValue(raw.initial ?? 0, meta)
    if (meta) varMeta[id] = meta
  }

  const entities: Record<string, MutableEntity> = {}
  for (const [id, raw] of Object.entries(scenario.entities ?? {})) {
    const attrs: Record<string, number> = { ...(raw.attrs ?? {}) }
    const attrMeta = raw.attrMeta
      ? Object.fromEntries(Object.entries(raw.attrMeta).map(([key, meta]) => [key, { ...meta }]))
      : undefined
    if (attrMeta) {
      for (const [k, m] of Object.entries(attrMeta)) {
        if (attrs[k] === undefined && m.initial !== undefined) attrs[k] = m.initial
      }
    }
    const entity: MutableEntity = { attrs, attrMeta }
    for (const attr of Object.keys(attrs)) syncPairedAttributeMax(entity, attr)
    for (const [attr, value] of Object.entries(attrs)) {
      attrs[attr] = clampNumericValue(value, entity.attrMeta?.[attr])
    }
    entities[id] = entity
  }

  return {
    vars,
    varMeta,
    entities,
    flags,
    score: 0,
    items: {},
    rng: createRng(rngSeed),
    appliedOnce: new Set<string>(),
  }
}
