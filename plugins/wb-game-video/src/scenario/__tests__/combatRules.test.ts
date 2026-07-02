import { describe, expect, it } from 'vitest'
import { scenarioToBlueprint } from '../../blueprint/scenarioToBlueprint'
import { BlueprintRuntime } from '../../blueprint/runtime/engine'
import { getDemoScenario } from '../demoScenario'
import { applyCombatRules, readCombatRules } from '../combatRules'

describe('combatRules', () => {
  it('reads structured combat values from the standalone demo scenario', () => {
    const rules = readCombatRules(getDemoScenario())
    expect(rules.bossMaxHp).toBe(12000)
    expect(rules.playerMaxHp).toBe(10000)
    expect(rules.playerAttack).toBe(80)
    expect(rules.bossAggression).toBe(0.5)
    expect(rules.qiMax).toBe(5)
    expect(rules.ultQiRequired).toBe(5)
    expect(rules.ultDamage).toBe(240)
  })

  it('updates entity hp so BlueprintRuntime uses edited values', () => {
    const scenario = applyCombatRules(getDemoScenario(), { bossMaxHp: 100 })
    const rt = new BlueprintRuntime(scenarioToBlueprint(scenario), scenario)

    rt.start()

    expect(rt.state.entities['ent-boss']?.maxHp).toBe(100)
    expect(rt.state.entities['ent-boss']?.hp).toBe(100)
  })

  it('stores editable actor attributes and applies speed to initiative routing', () => {
    const scenario = applyCombatRules(getDemoScenario(), {
      playerAttack: 88,
      playerDefense: 44,
      playerCritRate: 12,
      playerSpeed: 10,
      bossAttack: 99,
      bossDefense: 55,
      bossCritRate: 9,
      bossAggression: 0.8,
      bossSpeed: 30,
    })
    const rules = readCombatRules(scenario)
    const initTargets = scenario.scenes.init?.branches.map((b) => b.targetSceneId)

    expect(rules.playerAttack).toBe(88)
    expect(rules.bossAggression).toBe(0.8)
    expect(initTargets?.[0]).toBe('b_ai')
  })

  it('updates qi thresholds and skill damage in scenario data', () => {
    const scenario = applyCombatRules(getDemoScenario(), {
      qiMax: 7,
      qiInitial: 1,
      heavyQiCost: 3,
      ultQiRequired: 7,
      ultDamage: 999,
    })
    const wait = scenario.scenes.wait!
    const heavy = wait.branches.find((b) => b.id === 'my-s2')!
    const ult = wait.branches.find((b) => b.id === 'my-ult')!

    expect(scenario.variables?.qi?.max).toBe(7)
    expect(scenario.variables?.qi?.initial).toBe(1)
    expect(heavy.condition?.all).toEqual([{ type: 'var', varId: 'qi', op: 'gte', value: 3 }])
    expect(heavy.effects).toEqual([{ id: 'qi-add-3', kind: 'var', varId: 'qi', op: 'add', value: -3 }])
    expect(ult.condition?.all).toEqual([{ type: 'var', varId: 'qi', op: 'gte', value: 7 }])
    expect(scenario.scenes.ult?.performance?.cues[0]?.effects[0]).toMatchObject({
      kind: 'entityStat',
      entityId: 'ent-boss',
      stat: 'hp',
      value: -999,
    })
  })
})
