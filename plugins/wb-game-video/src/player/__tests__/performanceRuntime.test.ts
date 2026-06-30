import { describe, expect, it } from 'vitest'
import { applyPerformanceCue, duePerformanceCues } from '../performanceRuntime'
import { initEntities } from '../entities'
import type { Scenario } from '../../scenario/types'

const scenario: Scenario = {
  id: 't',
  title: 't',
  rootSceneId: 's1',
  defaultCharMs: 32,
  scenes: { s1: { id: 's1', title: '', media: { kind: 'VIDEO', ref: 'v' }, durationMs: 5000, dialogue: [], branches: [] } },
  entities: {
    'ent-player': { id: 'ent-player', name: 'P', kind: 'player', maxHp: 100, initialHp: 100 },
    'ent-boss': { id: 'ent-boss', name: 'B', kind: 'boss', maxHp: 300, initialHp: 300 },
  },
}

describe('performanceRuntime', () => {
  it('duePerformanceCues filters by time and dedupes', () => {
    const spec = {
      cues: [
        { id: 'a', atMs: 1000, damageToBoss: 10 },
        { id: 'b', atMs: 2000, damageToBoss: 20 },
      ],
    }
    expect(duePerformanceCues(spec, 500, new Set())).toEqual([])
    expect(duePerformanceCues(spec, 1500, new Set()).map((c) => c.id)).toEqual(['a'])
    expect(duePerformanceCues(spec, 2500, new Set(['a'])).map((c) => c.id)).toEqual(['b'])
  })

  it('applyPerformanceCue damages boss and player', () => {
    let ent = initEntities(scenario)
    const r = applyPerformanceCue(
      { id: 'x', atMs: 0, damageToBoss: 40, damageToPlayer: 15 },
      scenario,
      ent,
    )
    expect(r.entities['ent-boss']!.hp).toBe(260)
    expect(r.entities['ent-player']!.hp).toBe(85)
  })
})
