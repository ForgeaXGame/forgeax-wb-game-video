import type { Branch, PerformanceCue, Scenario, Scene, VarEffect } from './types'

export interface CombatRulesDraft {
  playerMaxHp: number
  playerInitialHp: number
  playerAttack: number
  playerDefense: number
  playerCritRate: number
  playerSpeed: number
  bossMaxHp: number
  bossInitialHp: number
  bossAttack: number
  bossDefense: number
  bossCritRate: number
  bossAggression: number
  bossSpeed: number
  qiInitial: number
  qiMax: number
  lightQiGain: number
  heavyQiCost: number
  meditateQiGain: number
  ultQiRequired: number
  lightDamage: number
  heavyDamage: number
  ultDamage: number
  parryPerfectDamage: number
  parryGoodDamage: number
  parryFailDamageToPlayer: number
  parryGoodQiCost: number
  parryFailQiGain: number
}

export type CombatRulesPatch = Partial<CombatRulesDraft>

const PLAYER_ID = 'ent-player'
const BOSS_ID = 'ent-boss'
const QI_ID = 'qi'
const EXT_KEY = 'combatRules'

interface CombatRulesExt {
  playerAttack?: number
  playerDefense?: number
  playerCritRate?: number
  playerSpeed?: number
  bossAttack?: number
  bossDefense?: number
  bossCritRate?: number
  bossAggression?: number
  bossSpeed?: number
}

export function readCombatRules(scenario: Scenario): CombatRulesDraft {
  const player = scenario.entities?.[PLAYER_ID]
  const boss = scenario.entities?.[BOSS_ID]
  const qi = scenario.variables?.[QI_ID]
  const ext = readCombatRulesExt(scenario)
  const wait = scenario.scenes.wait
  const light = branchById(wait, 'my-s1')
  const heavy = branchById(wait, 'my-s2')
  const meditate = branchById(wait, 'my-s3')
  const ult = branchById(wait, 'my-ult')
  const parryGood = branchById(scenario.scenes.tele, 'ai-qte-good')
  const parryFail = branchById(scenario.scenes.tele, 'ai-qte-fail')

  return {
    playerMaxHp: player?.maxHp ?? 1000,
    playerInitialHp: player?.initialHp ?? player?.maxHp ?? 1000,
    playerAttack: ext.playerAttack ?? 80,
    playerDefense: ext.playerDefense ?? 40,
    playerCritRate: ext.playerCritRate ?? 10,
    playerSpeed: ext.playerSpeed ?? 30,
    bossMaxHp: boss?.maxHp ?? 1200,
    bossInitialHp: boss?.initialHp ?? boss?.maxHp ?? 1200,
    bossAttack: ext.bossAttack ?? 75,
    bossDefense: ext.bossDefense ?? 50,
    bossCritRate: ext.bossCritRate ?? 8,
    bossAggression: ext.bossAggression ?? 0.5,
    bossSpeed: ext.bossSpeed ?? 25,
    qiInitial: qi?.initial ?? 0,
    qiMax: qi?.max ?? 5,
    lightQiGain: varEffectValue(light, 'add', 2),
    heavyQiCost: Math.abs(varEffectValue(heavy, 'add', -2)),
    meditateQiGain: varEffectValue(meditate, 'add', 2),
    ultQiRequired: ult?.condition?.all.find((c) => c.type === 'var' && c.varId === QI_ID)?.value ?? 5,
    lightDamage: firstDamageToBoss(scenario.scenes.pu, 80),
    heavyDamage: firstDamageToBoss(scenario.scenes.zhong, 144),
    ultDamage: firstDamageToBoss(scenario.scenes.ult, 240),
    parryPerfectDamage: firstDamageToBoss(scenario.scenes.block, 96),
    parryGoodDamage: firstDamageToBoss(scenario.scenes.dodgeP, 64),
    parryFailDamageToPlayer: firstDamageToPlayer(scenario.scenes.hurt, 120),
    parryGoodQiCost: Math.abs(varEffectValue(parryGood, 'add', -1)),
    parryFailQiGain: varEffectValue(parryFail, 'add', 1),
  }
}

export function applyCombatRules(scenario: Scenario, patch: CombatRulesPatch): Scenario {
  const current = readCombatRules(scenario)
  const next: CombatRulesDraft = { ...current, ...patch }
  const entities = { ...(scenario.entities ?? {}) }
  const player = entities[PLAYER_ID]
  if (player) {
    entities[PLAYER_ID] = {
      ...player,
      maxHp: next.playerMaxHp,
      initialHp: patch.playerInitialHp ?? (patch.playerMaxHp != null ? next.playerMaxHp : next.playerInitialHp),
    }
  }
  const boss = entities[BOSS_ID]
  if (boss) {
    entities[BOSS_ID] = {
      ...boss,
      maxHp: next.bossMaxHp,
      initialHp: patch.bossInitialHp ?? (patch.bossMaxHp != null ? next.bossMaxHp : next.bossInitialHp),
    }
  }

  const variables = { ...(scenario.variables ?? {}) }
  variables[QI_ID] = {
    ...(variables[QI_ID] ?? { id: QI_ID, name: '气力', kind: 'number' as const }),
    initial: next.qiInitial,
    min: 0,
    max: next.qiMax,
  }

  const scenes = { ...scenario.scenes }
  scenes.init = orderInitiativeBranches(scenes.init, next.playerSpeed, next.bossSpeed)
  scenes.wait = updateSceneBranch(scenes.wait, 'my-s1', {
    effects: qiEffects('add', next.lightQiGain),
  })
  scenes.wait = updateSceneBranch(scenes.wait, 'my-s2', {
    condition: { all: [{ type: 'var', varId: QI_ID, op: 'gte', value: next.heavyQiCost }] },
    gateMode: 'lock',
    effects: qiEffects('add', -next.heavyQiCost),
  })
  scenes.wait = updateSceneBranch(scenes.wait, 'my-s3', {
    effects: qiEffects('add', next.meditateQiGain),
  })
  scenes.wait = updateSceneBranch(scenes.wait, 'my-ult', {
    condition: { all: [{ type: 'var', varId: QI_ID, op: 'gte', value: next.ultQiRequired }] },
    gateMode: 'lock',
    effects: qiEffects('set', 0),
  })

  scenes.pu = updateFirstCue(scenes.pu, { damageToBoss: next.lightDamage })
  scenes.zhong = updateFirstCue(scenes.zhong, { damageToBoss: next.heavyDamage })
  scenes.ult = updateFirstCue(scenes.ult, { damageToBoss: next.ultDamage })
  scenes.block = updateFirstCue(scenes.block, { damageToBoss: next.parryPerfectDamage })
  scenes.dodgeP = updateFirstCue(scenes.dodgeP, { damageToBoss: next.parryGoodDamage })
  scenes.hurt = updateFirstCue(scenes.hurt, { damageToPlayer: next.parryFailDamageToPlayer })
  scenes.tele = updateSceneBranch(scenes.tele, 'ai-qte-good', {
    effects: qiEffects('add', -next.parryGoodQiCost),
  })
  scenes.tele = updateSceneBranch(scenes.tele, 'ai-qte-fail', {
    effects: qiEffects('add', next.parryFailQiGain),
  })

  return {
    ...scenario,
    entities,
    variables,
    scenes,
    ext: {
      ...(scenario.ext ?? {}),
      [EXT_KEY]: {
        playerAttack: next.playerAttack,
        playerDefense: next.playerDefense,
        playerCritRate: next.playerCritRate,
        playerSpeed: next.playerSpeed,
        bossAttack: next.bossAttack,
        bossDefense: next.bossDefense,
        bossCritRate: next.bossCritRate,
        bossAggression: next.bossAggression,
        bossSpeed: next.bossSpeed,
      } satisfies CombatRulesExt,
    },
  }
}

function readCombatRulesExt(scenario: Scenario): CombatRulesExt {
  const raw = scenario.ext?.[EXT_KEY]
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as CombatRulesExt) : {}
}

function branchById(scene: Scene | undefined, id: string): Branch | undefined {
  return scene?.branches.find((b) => b.id === id)
}

function varEffectValue(branch: Branch | undefined, op: VarEffect['op'], fallback: number): number {
  return branch?.effects?.find((e) => e.varId === QI_ID && e.op === op)?.value ?? fallback
}

function firstDamageToBoss(scene: Scene | undefined, fallback: number): number {
  return scene?.performance?.cues.find((c) => c.damageToBoss != null)?.damageToBoss ?? fallback
}

function firstDamageToPlayer(scene: Scene | undefined, fallback: number): number {
  return scene?.performance?.cues.find((c) => c.damageToPlayer != null)?.damageToPlayer ?? fallback
}

function qiEffects(op: VarEffect['op'], value: number): VarEffect[] {
  return [{ varId: QI_ID, op, value }]
}

function updateSceneBranch(scene: Scene | undefined, branchId: string, patch: Partial<Branch>): Scene {
  if (!scene) throw new Error(`missing scene for branch ${branchId}`)
  return {
    ...scene,
    branches: scene.branches.map((b) => (b.id === branchId ? { ...b, ...patch } : b)),
  }
}

function orderInitiativeBranches(scene: Scene | undefined, playerSpeed: number, bossSpeed: number): Scene {
  if (!scene) throw new Error('missing init scene')
  const branches = [...scene.branches]
  const playerFirst = playerSpeed >= bossSpeed
  branches.sort((a, b) => {
    const ar = a.targetSceneId === (playerFirst ? 'a_my' : 'b_ai') ? 0 : 1
    const br = b.targetSceneId === (playerFirst ? 'a_my' : 'b_ai') ? 0 : 1
    return ar - br
  })
  return { ...scene, branches }
}

function updateFirstCue(scene: Scene | undefined, patch: Partial<PerformanceCue>): Scene {
  if (!scene) throw new Error('missing scene for cue update')
  const cues = scene.performance?.cues ?? []
  const [first, ...rest] = cues.length > 0 ? cues : [{ id: `${scene.id}-rule`, atMs: 1000 }]
  return {
    ...scene,
    performance: {
      cues: [{ ...first, ...patch }, ...rest],
    },
  }
}
