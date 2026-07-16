import { beforeAll, describe, expect, it } from 'vitest'
import type { GameNode, GameScenario } from '../../../runtime/schema/graph-schema'
import type { OverlayChild } from '../../../runtime/schema/node-config-schema'
import type { QteCue } from '../../../runtime/registry/core-kinds'
import { registerCoreKinds } from '../../../runtime/registry/core-kinds'
import { node, scnOf } from '../../../runtime/__tests__/test-fixtures'
import { nodeOverlayId } from '../../../graph/edit/overlay-edit'
import {
  addMaterialGraph,
  addQteCueGraph,
  canAddQte,
  findElement,
  findNode,
  listAvailableQteOutcomes,
  listQteOutcomeViews,
  overlayEffects,
  addOptionBranchGraph,
  choiceOptionsLocked,
  choiceSkinPreviewInteractions,
  listOptionBranches,
  patchMaterialGraph,
  patchOverlayGraph,
  patchSelectedGraph,
  qteSkinPreviewInteraction,
  setChoiceSkinGraph,
  setQteOutcomeEffectsGraph,
  setQteOutcomeTargetGraph,
} from '../graphMaterialOps'
import type { MaterialItem } from '../materialTimelineShared'

function qteEl(scenario: GameScenario, nodeId: string): OverlayChild | undefined {
  return scenario.ui?.overlays?.[nodeOverlayId(nodeId)]?.children?.find((c) => c.component === 'qte')
}
function qteItem(cueId: string): MaterialItem {
  return { key: `qte:x:${cueId}`, id: cueId, kind: 'qte', label: '', startMs: 0, endMs: 1000, zIndex: 2 }
}

function seedQte(): { scenario: GameScenario; node: GameNode; cueId: string } {
  const n = node('a', { durationMs: 8000 })
  let scenario = scnOf({ nodes: [n], edges: [] })
  const nodeRef = scenario.graph.nodes[0]!
  const res = addQteCueGraph(scenario, nodeRef, 8000, 1000)
  scenario = res.scenario
  const cueId = res.selectKey!.split(':').pop()!
  return { scenario, node: scenario.graph.nodes[0]!, cueId }
}

describe('graphMaterialOps · QTE 元素级参数', () => {
  it('完美判定 perfectMs 落到元素级 params，不写进 cue（成功=命中显示窗内，无独立半窗）', () => {
    const { scenario, node: n, cueId } = seedQte()
    const next = patchSelectedGraph(scenario, n, qteItem(cueId), { perfectMs: 100 })
    const el = qteEl(next, 'a')!
    expect((el.params as { perfectMs?: number }).perfectMs).toBe(100)
    const cue = ((el.params as { cues?: QteCue[] }).cues ?? []).find((c) => c.id === cueId)!
    expect((cue as { perfectMs?: number }).perfectMs).toBeUndefined()
  })

  it('cue 级参数（label/appearAt）仍写进对应拍点，不污染元素级', () => {
    const { scenario, node: n, cueId } = seedQte()
    const next = patchSelectedGraph(scenario, n, qteItem(cueId), { label: '叩', appearAt: 1200 })
    const el = qteEl(next, 'a')!
    const cue = ((el.params as { cues?: QteCue[] }).cues ?? []).find((c) => c.id === cueId)!
    expect(cue.label).toBe('叩')
    expect(cue.appearAt).toBe(1200)
    expect((el.params as { label?: unknown }).label).toBeUndefined()
  })
})

describe('graphMaterialOps · QTE 结算候选（样式驱动，见 qteKind.outputs）', () => {
  beforeAll(() => registerCoreKinds())

  it('默认（无 exits）：候选仍是 完美/良好/失败 三档，未配置时只展示「完美」', () => {
    const { scenario, node: n } = seedQte()
    const views = listQteOutcomeViews(scenario, n)
    expect(views).toHaveLength(1)
    expect(views[0]!.handle).toBe('pass')
    expect(views[0]!.label).toBe('完美')
    const available = listAvailableQteOutcomes(scenario, n)
    expect(available.map((c) => c.handle)).toEqual(['good', 'fail'])
  })

  it('battleParry：出口由样式锁定为 pass/good/fail；写入的自定义 events 被忽略', () => {
    const { scenario, node: n, cueId } = seedQte()
    const next = patchSelectedGraph(scenario, n, qteItem(cueId), {
      component: 'battleParry',
      events: [{ id: 'ok', label: '自定义' }, { id: 'ng', label: '普通' }],
      defaultEvent: 'fail',
    })
    const n2 = findNode(next.graph, 'a')!
    const el = qteEl(next, 'a')!
    // 落盘也被锁回样式 KindPlugin.events
    expect((el.params as { events?: Array<{ id: string }> }).events?.map((e) => e.id)).toEqual(['pass', 'good', 'fail'])
    const available = listAvailableQteOutcomes(next, n2)
    expect(available.map((c) => c.handle)).toEqual(['good', 'fail'])
    const shown = listQteOutcomeViews(next, n2)
    expect(shown.map((v) => v.handle)).toEqual(['pass'])
    expect(shown[0]!.label).toBe('完美')
  })

  it('battleParry 样式出口上可对某一档单独配跳转 + 改数值，互不覆盖', () => {
    const { scenario, node: n, cueId } = seedQte()
    const s0 = patchSelectedGraph(scenario, n, qteItem(cueId), { component: 'battleParry' })
    const n0 = findNode(s0.graph, 'a')!
    const s1 = setQteOutcomeTargetGraph(s0, n0, 'pass', 'b')
    const n1 = findNode(s1.graph, 'a')!
    const s2 = setQteOutcomeEffectsGraph(s1, n1, 'good', [{ kind: 'attr', entityId: 'ent-boss', attr: 'hp', op: 'add', value: -10 }])
    const n2 = findNode(s2.graph, 'a')!
    const views = listQteOutcomeViews(s2, n2)
    const pass = views.find((v) => v.handle === 'pass')!
    const good = views.find((v) => v.handle === 'good')!
    expect(pass.targetId).toBe('b')
    expect(pass.effects).toHaveLength(0)
    expect(good.targetId).toBeUndefined()
    expect(good.effects).toHaveLength(1)
  })
})

describe('graphMaterialOps · QTE 拖入门槛（无挂载/无默认样式含 qte 时不可加）', () => {
  it('节点无挂载、无默认样式方案：canAddQte=false，addMaterialGraph(qte) 原样返回（不新建）', () => {
    const n = node('a', { durationMs: 8000 })
    const scenario = scnOf({ nodes: [n], edges: [] })
    const nodeRef = scenario.graph.nodes[0]!
    expect(canAddQte(scenario, nodeRef)).toBe(false)
    const res = addMaterialGraph(scenario, nodeRef, 8000, 'qte', undefined, 0)
    expect(res.selectKey).toBeNull()
    expect(qteEl(res.scenario, 'a')).toBeUndefined()
  })

  it('默认样式方案（styleScheme）里有 qte 组件：canAddQte=true，可正常新建', () => {
    const n = node('a', { durationMs: 8000, styleScheme: 'scheme1' })
    const scenario = scnOf(
      { nodes: [n], edges: [] },
      {
        ui: {
          overlays: {
            scheme1: {
              id: 'scheme1',
              children: [
                { id: 'skin1', component: 'qte', trigger: { when: 'enter' }, params: { qteKind: 'parry' } },
              ],
            },
          },
        },
      },
    )
    const nodeRef = scenario.graph.nodes[0]!
    expect(canAddQte(scenario, nodeRef)).toBe(true)
    const res = addMaterialGraph(scenario, nodeRef, 8000, 'qte', undefined, 0)
    expect(res.selectKey).not.toBeNull()
    expect(qteEl(res.scenario, 'a')).toBeDefined()
  })

  it('已挂载的 overlay 里有 qte 组件：canAddQte=true（挂载来源，不靠 styleScheme）', () => {
    const n = node('a', { durationMs: 8000, timeline: [{ id: 'skin1', component: 'qte', params: { qteKind: 'parry' } }] })
    const scenario = scnOf({ nodes: [n], edges: [] })
    const nodeRef = scenario.graph.nodes[0]!
    expect(canAddQte(scenario, nodeRef)).toBe(true)
  })
})

describe('graphMaterialOps · battleParry 时间轴 ↔ 预览时钟对齐', () => {
  function seedBattleParryStyle(): { scenario: GameScenario; node: GameNode } {
    const n = node('a', { durationMs: 8000, styleScheme: 'scheme-parry' })
    const scenario = scnOf(
      { nodes: [n], edges: [] },
      {
        ui: {
          overlays: {
            'scheme-parry': {
              id: 'scheme-parry',
              children: [
                {
                  id: 'qte-parry',
                  component: 'qte',
                  trigger: { when: 'enter' },
                  params: {
                    component: 'battleParry',
                    durationMs: 2600,
                    exits: [{ key: 'pass' }, { key: 'good' }, { key: 'fail' }],
                    defaultKey: 'fail',
                  },
                },
              ],
            },
          },
        },
      },
    )
    return { scenario, node: scenario.graph.nodes[0]! }
  }

  it('从 battleParry 样式拖入：cue 落点=appearAt，endAt=appearAt+durationMs，并写 windowMs', () => {
    const { scenario, node: n } = seedBattleParryStyle()
    const res = addQteCueGraph(scenario, n, 8000, 1200)
    const el = qteEl(res.scenario, 'a')!
    const cue = ((el.params as { cues?: QteCue[] }).cues ?? [])[0]!
    expect(cue.appearAt).toBe(1200)
    expect(cue.endAt).toBe(1200 + 2600)
    expect((el.params as { windowMs?: number }).windowMs).toBe(2600)
    expect((el.params as { component?: string }).component).toBe('battleParry')
  })

  it('拖时间轴边缘：同步 cue 窗 + windowMs（检视器时长 SSOT）', () => {
    const { scenario, node: n } = seedBattleParryStyle()
    const res = addQteCueGraph(scenario, n, 8000, 1000)
    const cueId = res.selectKey!.split(':').pop()!
    const n1 = findNode(res.scenario.graph, 'a')!
    const item: MaterialItem = {
      key: `qte:x:${cueId}`,
      id: cueId,
      kind: 'qte',
      label: '',
      startMs: 1000,
      endMs: 3600,
      zIndex: 2,
    }
    const next = patchMaterialGraph(res.scenario, n1, 8000, item, { startMs: 1500, endMs: 3000 })
    const el = qteEl(next, 'a')!
    const cue = ((el.params as { cues?: QteCue[] }).cues ?? []).find((c) => c.id === cueId)!
    expect(cue.appearAt).toBe(1500)
    expect(cue.endAt).toBe(3000)
    expect((el.params as { windowMs?: number }).windowMs).toBe(1500)
  })

  it('qteSkinPreviewInteraction：播放头在 cue 窗外返回 null，窗内返回 snap', () => {
    const { scenario, node: n } = seedBattleParryStyle()
    const res = addQteCueGraph(scenario, n, 8000, 2000)
    const n1 = findNode(res.scenario.graph, 'a')!
    expect(qteSkinPreviewInteraction(res.scenario, n1, 500)).toBeNull()
    expect(qteSkinPreviewInteraction(res.scenario, n1, 2500)).not.toBeNull()
    expect(qteSkinPreviewInteraction(res.scenario, n1, 5000)).toBeNull()
  })
})

describe('graphMaterialOps · choice 皮肤时间轴预览', () => {
  beforeAll(() => registerCoreKinds())

  it('styleScheme 含 inkYingMo：新建选项带上皮肤；播放头窗内可预览、窗外卸掉', () => {
    const n = node('a', { durationMs: 8000, styleScheme: 'scheme-choice' })
    const scenario = scnOf(
      { nodes: [n], edges: [] },
      {
        ui: {
          overlays: {
            'scheme-choice': {
              id: 'scheme-choice',
              children: [
                {
                  id: 'choice-ym',
                  component: 'choice',
                  trigger: { when: 'enter' },
                  params: {
                    component: 'inkYingMo',
                    prompt: '應 / 默',
                    options: [{ key: 'ying', label: '應' }, { key: 'mo', label: '默' }],
                  },
                },
              ],
            },
          },
        },
      },
    )
    const nodeRef = scenario.graph.nodes[0]!
    const res = addMaterialGraph(scenario, nodeRef, 8000, 'option', undefined, 0, { ms: 1000, zIndex: 3 })
    const el = res.scenario.ui?.overlays?.[nodeOverlayId('a')]?.children?.find((c) => c.component === 'choice')
    expect(el).toBeDefined()
    expect((el!.params as { component?: string }).component).toBe('inkYingMo')
    expect((el!.params as { options?: { key: string }[] }).options?.map((o) => o.key)).toEqual(['ying', 'mo'])
    expect(el!.window).toEqual({ startMs: 1000, endMs: 3500 })

    const n1 = findNode(res.scenario.graph, 'a')!
    expect(choiceSkinPreviewInteractions(res.scenario, n1, 500, 8000)).toHaveLength(0)
    const snaps = choiceSkinPreviewInteractions(res.scenario, n1, 2000, 8000)
    expect(snaps).toHaveLength(1)
    expect(snaps[0]!.params.component).toBe('inkYingMo')
    expect(choiceSkinPreviewInteractions(res.scenario, n1, 5000, 8000)).toHaveLength(0)
  })

  it('默认清单（无皮肤 component）：不进预览皮肤层', () => {
    const n = node('a', { durationMs: 8000 })
    let scenario = scnOf({ nodes: [n], edges: [] })
    const res = addMaterialGraph(scenario, scenario.graph.nodes[0]!, 8000, 'option', undefined, 0)
    const n1 = findNode(res.scenario.graph, 'a')!
    expect(choiceSkinPreviewInteractions(res.scenario, n1, 100, 8000)).toHaveLength(0)
  })
})

describe('graphMaterialOps · choice 样式锁定选项集合', () => {
  beforeAll(() => registerCoreKinds())

  function seedDefaultOption(): { scenario: GameScenario; node: GameNode } {
    const n = node('a', { durationMs: 8000 })
    let scenario = scnOf({ nodes: [n], edges: [] })
    const res = addMaterialGraph(scenario, scenario.graph.nodes[0]!, 8000, 'option', undefined, 0)
    return { scenario: res.scenario, node: findNode(res.scenario.graph, 'a')! }
  }

  it('切到 inkYingMo：结算条数变成應/默 两条，并写入皮肤 events', () => {
    const { scenario, node: n } = seedDefaultOption()
    expect(listOptionBranches(scenario, n)).toHaveLength(1)
    const next = setChoiceSkinGraph(scenario, n, 'inkYingMo')
    const n1 = findNode(next.graph, 'a')!
    const branches = listOptionBranches(next, n1)
    expect(branches.map((b) => b.key)).toEqual(['ying', 'mo'])
    expect(branches.map((b) => b.label)).toEqual(['應', '默'])
    const el = next.ui?.overlays?.[nodeOverlayId('a')]?.children?.find((c) => c.component === 'choice')
    expect((el!.params as { component?: string }).component).toBe('inkYingMo')
    expect(choiceOptionsLocked(el!.params)).toBe(true)
  })

  it('样式锁定后 addOptionBranchGraph 为 no-op', () => {
    const { scenario, node: n } = seedDefaultOption()
    const locked = setChoiceSkinGraph(scenario, n, 'inkYingMo')
    const n1 = findNode(locked.graph, 'a')!
    const again = addOptionBranchGraph(locked, n1)
    expect(listOptionBranches(again, findNode(again.graph, 'a')!)).toHaveLength(2)
  })

  it('切回默认清单：摘掉 component，保留当前 events，可再增删', () => {
    const { scenario, node: n } = seedDefaultOption()
    const locked = setChoiceSkinGraph(scenario, n, 'inkYingMo')
    const unlocked = setChoiceSkinGraph(locked, findNode(locked.graph, 'a')!, undefined)
    const n1 = findNode(unlocked.graph, 'a')!
    const el = unlocked.ui?.overlays?.[nodeOverlayId('a')]?.children?.find((c) => c.component === 'choice')
    expect((el!.params as { component?: string }).component).toBeUndefined()
    expect(choiceOptionsLocked(el!.params)).toBe(false)
    expect(listOptionBranches(unlocked, n1)).toHaveLength(2)
    const added = addOptionBranchGraph(unlocked, n1)
    expect(listOptionBranches(added, findNode(added.graph, 'a')!)).toHaveLength(3)
  })
})

function seedFloat(): { scenario: GameScenario; node: GameNode; floatId: string } {
  const n = node('a', { durationMs: 8000 })
  let scenario = scnOf({ nodes: [n], edges: [] })
  const nodeRef = scenario.graph.nodes[0]!
  const res = addMaterialGraph(scenario, nodeRef, 8000, 'overlay', undefined, 0)
  scenario = res.scenario
  const floatId = res.selectKey!.split(':').pop()!
  return { scenario, node: scenario.graph.nodes[0]!, floatId }
}

describe('graphMaterialOps · 飘字 effects/valuePick/expr（结算写回 node.data.reactions，前端表现对齐旧「选取式」）', () => {
  it('新建飘字自带默认到点效果（Boss hp −100）', () => {
    const { scenario, node: n, floatId } = seedFloat()
    const fx = overlayEffects(scenario, n, floatId)
    expect(fx).toHaveLength(1)
    expect(fx[0]).toMatchObject({ kind: 'attr', attr: 'hp', op: 'add', value: -100, id: `${floatId}-settle` })
  })

  it('effects 往返：EffectsEditor 产出的完整列表写入后可读回，首条打上定位 id', () => {
    const { scenario, node: n, floatId } = seedFloat()
    const next = patchOverlayGraph(
      scenario,
      n,
      floatId,
      { effects: [{ kind: 'attr', entityId: 'ent-player', attr: 'hp', op: 'add', value: 30 }] },
      undefined,
    )
    const curNode = findNode(next.graph, n.id)!
    const fx = overlayEffects(next, curNode, floatId)
    expect(fx).toHaveLength(1)
    expect(fx[0]).toMatchObject({ kind: 'attr', entityId: 'ent-player', attr: 'hp', op: 'add', value: 30, id: `${floatId}-settle` })
  })

  it('effects 传空数组＝清除结算（纯展示，不改数值）', () => {
    const { scenario, node: n, floatId } = seedFloat()
    const next = patchOverlayGraph(scenario, n, floatId, { effects: [] }, undefined)
    const curNode = findNode(next.graph, n.id)!
    expect(overlayEffects(next, curNode, floatId)).toEqual([])
    expect(curNode.data.reactions).toBeUndefined()
  })

  it('valuePick/expr 往返：勾选自定义显示数值后写回 params，取消勾选清空二者', () => {
    const { scenario, node: n, floatId } = seedFloat()
    const withExpr = patchOverlayGraph(
      scenario,
      n,
      floatId,
      {
        expr: 'entity.ent-boss.attr.hp',
        valuePick: { mode: 'pick', terms: [{ op: '-', source: 'entity', refId: 'ent-boss', attr: 'hp' }] },
      },
      undefined,
    )
    const el = findElement(withExpr, findNode(withExpr.graph, n.id), floatId)!
    expect(el.params?.expr).toBe('entity.ent-boss.attr.hp')
    expect(el.params?.valuePick).toBeDefined()

    const cleared = patchOverlayGraph(
      withExpr,
      findNode(withExpr.graph, n.id)!,
      floatId,
      { expr: undefined, valuePick: undefined },
      undefined,
    )
    const el2 = findElement(cleared, findNode(cleared.graph, n.id), floatId)!
    expect(el2.params?.expr).toBeUndefined()
    expect(el2.params?.valuePick).toBeUndefined()
  })

  it('content 只改显示文案，不影响结算 effects', () => {
    const { scenario, node: n, floatId } = seedFloat()
    const next = patchOverlayGraph(scenario, n, floatId, { content: '会心一击 {v}' }, undefined)
    const curNode = findNode(next.graph, n.id)!
    const el = findElement(next, curNode, floatId)!
    expect(el.params?.text).toBe('会心一击 {v}')
    expect(overlayEffects(next, curNode, floatId)).toHaveLength(1)
  })
})
