import { describe, expect, it } from 'vitest'
import type { GameNode, GameScenario } from '../../../runtime/schema/graph-schema'
import type { OverlayChild } from '../../../runtime/schema/node-config-schema'
import type { QteCue } from '../../../runtime/registry/core-kinds'
import { node, scnOf } from '../../../runtime/__tests__/test-fixtures'
import { nodeOverlayId } from '../../../graph/edit/overlay-edit'
import {
  addMaterialGraph,
  addQteCueGraph,
  findElement,
  findNode,
  listAvailableQteOutcomes,
  listQteOutcomeViews,
  overlayEffects,
  patchOverlayGraph,
  patchSelectedGraph,
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
  it('默认（无 exits）：候选仍是 成功/优秀/失败 三档，未配置时只展示「成功」', () => {
    const { scenario, node: n } = seedQte()
    const views = listQteOutcomeViews(scenario, n)
    expect(views).toHaveLength(1)
    expect(views[0]!.handle).toBe('pass')
    expect(views[0]!.label).toBe('成功')
    const available = listAvailableQteOutcomes(scenario, n)
    expect(available.map((c) => c.handle)).toEqual(['good', 'fail'])
  })

  it('切到 battleParry + 自定义 exits：结算候选变成 exits 的 key（+ defaultKey 超时兜底），不再是 pass/good/fail', () => {
    const { scenario, node: n, cueId } = seedQte()
    const next = patchSelectedGraph(scenario, n, qteItem(cueId), {
      component: 'battleParry',
      exits: [{ key: 'ok', label: '完美' }, { key: 'ng', label: '普通' }],
      defaultKey: 'miss',
    })
    const n2 = findNode(next.graph, 'a')!
    // 未配置时默认展示第一档候选（现在是 exits[0]='ok'，不再是硬编码 'pass'）。
    const views = listAvailableQteOutcomes(next, n2)
    expect(views.map((c) => c.handle)).toEqual(['ng', 'miss'])
    const shown = listQteOutcomeViews(next, n2)
    expect(shown.map((v) => v.handle)).toEqual(['ok'])
    expect(shown[0]!.label).toBe('完美')
  })

  it('自定义 exits 下可对某一个按键单独配跳转 + 改数值，互不覆盖', () => {
    const { scenario, node: n, cueId } = seedQte()
    const s0 = patchSelectedGraph(scenario, n, qteItem(cueId), {
      component: 'battleParry',
      exits: [{ key: 'ok', label: '完美' }, { key: 'ng', label: '普通' }],
      defaultKey: 'miss',
    })
    const n0 = findNode(s0.graph, 'a')!
    const s1 = setQteOutcomeTargetGraph(s0, n0, 'ok', 'b')
    const n1 = findNode(s1.graph, 'a')!
    const s2 = setQteOutcomeEffectsGraph(s1, n1, 'ng', [{ kind: 'attr', entityId: 'ent-boss', attr: 'hp', op: 'add', value: -10 }])
    const n2 = findNode(s2.graph, 'a')!
    const views = listQteOutcomeViews(s2, n2)
    const ok = views.find((v) => v.handle === 'ok')!
    const ng = views.find((v) => v.handle === 'ng')!
    expect(ok.targetId).toBe('b')
    expect(ok.effects).toHaveLength(0)
    expect(ng.targetId).toBeUndefined()
    expect(ng.effects).toHaveLength(1)
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
