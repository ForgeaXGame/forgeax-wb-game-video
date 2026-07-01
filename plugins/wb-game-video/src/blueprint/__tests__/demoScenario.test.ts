import { describe, expect, test } from 'vitest'
import { getDemoScenario } from '../../scenario/demoScenario'
import { scenarioToBlueprint } from '../scenarioToBlueprint'
import { BlueprintRuntime } from '../runtime/engine'

/**
 * 用「真实内置 demo 蓝图」验证编译器 + 运行时不崩：
 *  - 编译出连通且自洽的 BlueprintGraph。
 *  - 自动驾驶（按 phase 选第一项/通过 QTE/Boss 命中）能走到结局或步数上限内不抛错。
 */
describe('real demo blueprint', () => {
  test('compiles to a self-consistent graph', () => {
    const graph = scenarioToBlueprint(getDemoScenario())
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

  test('runtime auto-pilot walks the demo without throwing', () => {
    const scenario = getDemoScenario()
    const rt = new BlueprintRuntime(scenarioToBlueprint(scenario), scenario)
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
          const graphNode = scenarioToBlueprint(scenario).nodes.find((n) => n.id === node)
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
    // 不要求一定到结局（reel demo 可能有环）；只要求不抛错、确有推进。
    expect(steps).toBeGreaterThan(0)
    expect(rt.state.visited.size).toBeGreaterThan(0)
  })
})
