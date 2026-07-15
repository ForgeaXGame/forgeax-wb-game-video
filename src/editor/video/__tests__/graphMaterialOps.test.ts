import { describe, expect, it } from 'vitest'
import type { GameNode, GameScenario } from '../../../runtime/schema/graph-schema'
import type { OverlayChild } from '../../../runtime/schema/node-config-schema'
import type { QteCue } from '../../../runtime/registry/core-kinds'
import { node, scnOf } from '../../../runtime/__tests__/test-fixtures'
import { nodeOverlayId } from '../../../runtime/schema/overlay-edit'
import { addQteCueGraph, patchSelectedGraph } from '../graphMaterialOps'
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
