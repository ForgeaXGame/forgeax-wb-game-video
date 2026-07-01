import { describe, expect, test } from 'vitest'
import { getBlueprintCombatDemoScenario } from '../../scenario/demoScenario'
import { getVideoClip } from '../../scenario/gameAssetCatalog'
import { scenarioToBlueprint } from '../scenarioToBlueprint'
import { BlueprintRuntime } from '../runtime/engine'
import type { GameVideoBlueprintGraph } from '../blueprint-schema'

/**
 * 用「真实内置 demo 蓝图」验证编译器 + 运行时不崩：
 *  - 编译出连通且自洽的 BlueprintGraph。
 *  - 自动驾驶（按 phase 选第一项/通过 QTE/Boss 命中）能走到结局或步数上限内不抛错。
 */
describe('real demo blueprint', () => {
  test('compiles to a self-consistent graph', () => {
    const graph = scenarioToBlueprint(getBlueprintCombatDemoScenario())
    expect(graph.nodes.length).toBeGreaterThan(0)
    const ids = new Set(graph.nodes.map((n) => n.id))
    expect(graph.edges.every((e) => ids.has(e.sourceRef) && ids.has(e.targetRef))).toBe(true)
    expect(graph.nodes.some((n) => n.elementType === 'start')).toBe(true)
    // incoming/outgoing 必须能在 edges 里找到对应 flow。
    for (const n of graph.nodes) {
      for (const fid of [...n.incoming, ...n.outgoing]) {
        expect(graph.edges.some((e) => e.id === fid)).toBe(true)
      }
    }
  })

  test('every combat demo blueprint node resolves to a fixed video clip instead of default playback', () => {
    const graph = scenarioToBlueprint(getBlueprintCombatDemoScenario())
    const nodes = [
      ...graph.nodes,
      ...Object.values(graph.subflows ?? {}).flatMap((subflow) => subflow.nodes),
    ]

    expect(nodes.length).toBeGreaterThan(0)
    for (const node of nodes) {
      const clipId = node.extensionElements.clipId
      expect(clipId, `${node.id} should specify a fixed video clip`).toBeTruthy()
      expect(getVideoClip(clipId), `${node.id} clip ${clipId} should resolve`).toBeTruthy()
    }
  })

  test('runtime auto-pilot walks the demo without throwing', () => {
    const scenario = getBlueprintCombatDemoScenario()
    const graph = scenarioToBlueprint(scenario)
    const rt = new BlueprintRuntime(graph, scenario)
    rt.start()

    const terminal = new Set(['ended', 'victory', 'defeat'])
    let steps = 0
    while (!terminal.has(rt.state.phase) && steps < 1000) {
      steps += 1
      switch (rt.state.phase) {
        case 'playing':
        case 'awaitHotspot':
          rt.onClipEnded()
          break
        case 'awaitChoice': {
          const node = rt.state.currentNodeId
          const graphNode = findBlueprintNode(graph, node)
          const first = graphNode?.extensionElements.options?.[0]?.key
          if (first) rt.chooseOption(first)
          else rt.onClipEnded()
          break
        }
        case 'awaitQte':
          rt.submitQte(99)
          break
        case 'awaitBoss':
          rt.submitBossRound(true)
          break
        default:
          steps = 1000
      }
    }
    expect(terminal.has(rt.state.phase)).toBe(true)
    expect(steps).toBeGreaterThan(0)
    expect(rt.state.visited.size).toBeGreaterThan(0)
  })
})

function findBlueprintNode(graph: GameVideoBlueprintGraph, nodeId: string | null) {
  if (!nodeId) return undefined
  return (
    graph.nodes.find((n) => n.id === nodeId) ??
    Object.values(graph.subflows ?? {})
      .flatMap((subflow) => subflow.nodes)
      .find((n) => n.id === nodeId)
  )
}
