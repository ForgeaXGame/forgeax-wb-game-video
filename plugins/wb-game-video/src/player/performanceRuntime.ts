import type { PerformanceCue, PerformanceSpec, Scenario } from '../scenario/types'
import { applyDamage, type EntitiesState } from './entities'

/** 到点且未触发过的 performance cues。 */
export function duePerformanceCues(
  spec: PerformanceSpec | undefined,
  elapsedMs: number,
  firedIds: ReadonlySet<string>,
): PerformanceCue[] {
  if (!spec?.cues?.length) return []
  return spec.cues.filter((c) => elapsedMs >= c.atMs && !firedIds.has(c.id))
}

function defaultBossId(scenario: Scenario): string | undefined {
  return Object.entries(scenario.entities ?? {}).find(([, e]) => e.kind === 'boss')?.[0]
}

function defaultPlayerId(scenario: Scenario): string | undefined {
  return Object.entries(scenario.entities ?? {}).find(([, e]) => e.kind === 'player')?.[0]
}

/** 应用一条 performance cue 的伤害；返回新 entities 与可选飘字。 */
export function applyPerformanceCue(
  cue: PerformanceCue,
  scenario: Scenario,
  entities: EntitiesState,
): { entities: EntitiesState; notice?: string } {
  let next = entities
  const bossId = cue.bossEntityId ?? defaultBossId(scenario)
  const playerId = cue.playerEntityId ?? defaultPlayerId(scenario)
  if (cue.damageToBoss && bossId) {
    next = applyDamage(next, bossId, cue.damageToBoss)
  }
  if (cue.damageToPlayer && playerId) {
    next = applyDamage(next, playerId, cue.damageToPlayer)
  }
  const parts: string[] = []
  if (cue.damageToBoss) parts.push(`巨龙 -${cue.damageToBoss}`)
  if (cue.damageToPlayer) parts.push(`你 -${cue.damageToPlayer}`)
  const notice = cue.label ?? (parts.length ? parts.join(' · ') : undefined)
  return { entities: next, notice }
}
