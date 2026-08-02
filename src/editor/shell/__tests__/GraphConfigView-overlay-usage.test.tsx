import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { BlueprintDoc, GameGraph, GameScenario } from '../../../runtime/schema/graph-schema'
import { registerCoreSkins } from '../../../runtime/component-host/components'
import { useGraphScenario } from '../../persist/graphScenarioStore'
import { GraphConfigView } from '../GraphConfigView'

const initialState = useGraphScenario.getState()
beforeAll(registerCoreSkins)

function graphWithOverlay(nodeId: string, overlay: string): GameGraph {
  return {
    nodes: [{
      id: nodeId,
      type: 'perf',
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: [],
      data: { name: nodeId, overlayNodes: [{ overlay }] },
    }],
    edges: [],
  }
}

function blueprint(id: string, graph: GameGraph): BlueprintDoc {
  return { id, title: id, entry: graph.nodes[0]?.id ?? 'entry', graph }
}

afterEach(() => {
  cleanup()
  useGraphScenario.setState(initialState, true)
})

describe('GraphConfigView overlay usage', () => {
  it('counts references from the main blueprint and unopened sub-blueprints', () => {
    const overlayId = 'scheme-shared'
    const mainGraph = graphWithOverlay('main-node', overlayId)
    const childGraph = graphWithOverlay('child-node', overlayId)
    const overlays = { [overlayId]: { id: overlayId, title: '共享界面', children: [] } }

    useGraphScenario.setState({
      game: 'game-nodia-fighting',
      booted: true,
      blueprints: {
        'bp-main': blueprint('bp-main', mainGraph),
        'bp-child': blueprint('bp-child', childGraph),
      },
      mainBlueprintId: 'bp-main',
      activeBlueprintId: 'bp-main',
      graph: mainGraph,
      meta: { ui: { overlays } },
    })

    const scenario: GameScenario = { version: 'test', graph: mainGraph, ui: { overlays } }
    render(<GraphConfigView tabs={[{ section: 'overlays', label: '界面' }]} scenario={scenario} />)

    expect(screen.getByText('⇢2')).toHaveAttribute('title', '被 2 个节点的 overlayNodes 引用')
    expect(screen.getByText('被 2 个节点引用')).toBeTruthy()
  })

  it('creates unique scheme titles and blocks duplicate renames', () => {
    const graph: GameGraph = { nodes: [], edges: [] }
    const overlays = {
      a: { id: 'a', title: '新方案', children: [] },
      b: { id: 'b', title: '战斗 HUD', children: [] },
    }
    useGraphScenario.setState({
      game: 'game-nodia-fighting',
      booted: true,
      blueprints: { main: blueprint('main', graph) },
      mainBlueprintId: 'main',
      activeBlueprintId: 'main',
      graph,
      meta: { ui: { overlays } },
    })
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    const scenario: GameScenario = { version: 'test', graph, ui: { overlays } }
    render(<GraphConfigView tabs={[{ section: 'overlays', label: '界面' }]} scenario={scenario} />)

    fireEvent.click(screen.getByTitle('新建界面方案'))
    expect(Object.values(useGraphScenario.getState().meta.ui?.overlays ?? {})
      .some((overlay) => overlay.title === '新方案 2')).toBe(true)

    const title = screen.getByDisplayValue('新方案 2')
    fireEvent.change(title, { target: { value: '战斗 HUD' } })
    expect(alert).toHaveBeenCalledWith('界面方案名称「战斗 HUD」已存在')
    expect((useGraphScenario.getState().meta.ui?.overlays?.['scheme-2'])?.title).toBe('新方案 2')
  })

  it('creates a missing hp attribute from the interface scheme entry', () => {
    const graph: GameGraph = { nodes: [], edges: [] }
    const overlays = {
      hud: {
        id: 'hud',
        title: '战斗界面',
        children: [{
          id: 'hp',
          component: 'BattlePlayerHpBar',
          inputs: { bind: 'hero', attr: 'hp' },
        }],
      },
    }
    const entities = { hero: { id: 'hero', name: '主角', attrs: {} } }
    useGraphScenario.setState({
      game: 'game-nodia-fighting',
      booted: true,
      blueprints: { main: blueprint('main', graph) },
      mainBlueprintId: 'main',
      activeBlueprintId: 'main',
      graph,
      meta: { entities, ui: { overlays } },
    })
    const scenario: GameScenario = { version: 'test', graph, entities, ui: { overlays } }
    render(<GraphConfigView tabs={[{ section: 'overlays', label: '界面' }]} scenario={scenario} />)

    fireEvent.click(screen.getByRole('button', { name: '创建属性 hp' }))
    fireEvent.click(screen.getByRole('button', { name: '确认创建' }))

    expect(useGraphScenario.getState().meta.entities?.hero?.attrs?.hp).toBe(100)
    expect(useGraphScenario.getState().meta.entities?.hero?.attrMeta?.hp).toMatchObject({
      label: '生命',
      initial: 100,
      min: 0,
      max: 100,
    })
  })
})
