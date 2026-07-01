/**
 * 合成 Scenario fixture —— 覆盖 Loop / 转场 / QTE / 状态机(条件路由) / Boss / 选择，
 * 给蓝图编译器、reactflow 转换层、运行时引擎做确定性单测。
 */

import type { Branch, Scene, Scenario } from '../../scenario/types'

function scene(partial: Partial<Scene> & { id: string }): Scene {
  return {
    title: partial.id,
    media: { kind: 'VIDEO', ref: `media-${partial.id}` },
    durationMs: 5000,
    dialogue: [],
    branches: [],
    ...partial,
  }
}

function branch(b: Branch): Branch {
  return b
}

/** start(loop+转场) → choice → {qte → boss} | {boss(+effect)} → good/bad 结局。 */
export function makeDemoScenario(): Scenario {
  const scenes: Record<string, Scene> = {}
  const add = (s: Scene): void => {
    scenes[s.id] = s
  }

  add(
    scene({
      id: 'start',
      title: '开场对峙',
      mediaPlayMode: 'loop',
      transition: { presetId: 'dissolve', durationMs: 600 },
      branches: [branch({ id: 'b-start', kind: 'auto', targetSceneId: 'choose' })],
    }),
  )

  add(
    scene({
      id: 'choose',
      title: '抉择',
      kind: 'choice',
      decision: { optType: 'static', prompt: '怎么办？' },
      branches: [
        branch({ id: 'opt-qte', kind: 'choice', label: '迎击（QTE）', targetSceneId: 'qte' }),
        branch({
          id: 'opt-rush',
          kind: 'choice',
          label: '直冲 Boss',
          targetSceneId: 'boss',
          effects: [{ varId: 'brave', op: 'add', value: 1 }],
        }),
      ],
    }),
  )

  add(
    scene({
      id: 'qte',
      title: '防反 QTE',
      kind: 'qte',
      qte: {
        cues: [
          { id: 'c1', shape: 'tap', x: 0.4, y: 0.5, appearAt: 800, targetAt: 1000 },
          { id: 'c2', shape: 'tap', x: 0.6, y: 0.5, appearAt: 1600, targetAt: 1800 },
        ],
        window: { perfect: 80, great: 140, good: 220 },
        score: { perfect: 100, great: 70, good: 40, miss: -10 },
      },
      branches: [
        branch({ id: 'b-qpass', kind: 'qte_pass', targetSceneId: 'boss' }),
        branch({ id: 'b-qfail', kind: 'qte_fail', targetSceneId: 'badEnd' }),
      ],
    }),
  )

  add(
    scene({
      id: 'boss',
      title: 'Boss 战',
      kind: 'battle',
      boss: {
        entityId: 'foe',
        playerEntityId: 'hero',
        rounds: [
          { id: 'r1', label: '一招', damageToBoss: 100, damageToPlayer: 60 },
          { id: 'r2', label: '二招', damageToBoss: 100, damageToPlayer: 60 },
        ],
        winSceneId: 'goodEnd',
        loseSceneId: 'badEnd',
      },
      branches: [],
    }),
  )

  add(scene({ id: 'goodEnd', title: '胜利结局', isEnding: true, hudPreset: 'hidden', branches: [] }))
  add(scene({ id: 'badEnd', title: '失败结局', isEnding: true, hudPreset: 'hidden', branches: [] }))

  return {
    id: 'demo-bp',
    title: '蓝图运行时 demo',
    rootSceneId: 'start',
    scenes,
    defaultCharMs: 40,
    schemaVersion: 9,
    variables: {
      brave: { id: 'brave', name: '勇气', kind: 'number', initial: 0 },
    },
    entities: {
      foe: { id: 'foe', name: '妖将', kind: 'boss', maxHp: 150 },
      hero: { id: 'hero', name: '主角', kind: 'player', maxHp: 100 },
    },
  }
}
