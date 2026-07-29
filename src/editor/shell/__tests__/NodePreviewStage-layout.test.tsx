// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { registerCoreSkins } from '../../../runtime/component-host/components'
import type { GameNode, GameScenario } from '../../../runtime/schema/graph-schema'
import { node, scnOf } from '../../../runtime/__tests__/test-fixtures'
import { NodePreviewStage } from '../NodePreviewStage'

beforeAll(registerCoreSkins)
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('NodePreviewStage overlay layout', () => {
  it('moves a mounted overlay without writing or changing width/height', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-overlay-fit-target')) {
        return {
          x: 40,
          y: 50,
          left: 40,
          top: 50,
          right: 120,
          bottom: 80,
          width: 80,
          height: 30,
          toJSON: () => ({}),
        }
      }
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 200,
        bottom: 100,
        width: 200,
        height: 100,
        toJSON: () => ({}),
      }
    })
    const current = node('n1', {
      overlayNodes: [{ overlay: 'hud', layout: { left: 0, top: 0, width: 1, height: 1 } }],
    })
    const initialScenario = scnOf(
      { nodes: [current], edges: [] },
      {
        ui: {
          overlays: {
            hud: {
              id: 'hud',
              title: 'HUD',
              children: [{
                id: 'damage',
                component: 'damageFloatText',
                trigger: { when: 'enter' },
                inputs: {},
              }],
            },
          },
        },
      },
    )
    let latestScenario: GameScenario = initialScenario
    function Harness(): JSX.Element {
      const [scenario, setScenario] = useState(initialScenario)
      latestScenario = scenario
      const currentNode = scenario.graph.nodes[0]!
      return (
        <NodePreviewStage
          scenario={scenario}
          node={currentNode}
          game="test"
          focusedMountId="hud"
          onEditScenario={(edit) => setScenario((value) => edit(value, value.graph.nodes[0]!))}
          onFocusMount={vi.fn()}
        />
      )
    }
    const { container } = render(
      <Harness />,
    )

    expect(screen.queryByRole('button', { name: /调整HUD大小/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /调整覆盖物画布大小/ })).toBeNull()
    expect(container.querySelector('[data-canvas-item="__overlay-canvas__"]')).toBeNull()
    const canvas = await waitFor(() =>
      screen.getByRole('application', { name: '节点视频覆盖物画布' }))
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await waitFor(() => {
      const nudgedLayout = latestScenario.graph.nodes[0]?.data.overlayNodes?.[0]?.layout
      expect(nudgedLayout?.left).toBe(0)
      expect(nudgedLayout?.top).toBeCloseTo(0.01)
      expect(nudgedLayout?.width).toBe(1)
      expect(nudgedLayout?.height).toBe(1)
    })
    expect((container.querySelector('[data-canvas-item="hud"]') as HTMLElement).style.width).toBe('40%')

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 80, clientY: 70 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 100, clientY: 80 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 100, clientY: 80 })

    await waitFor(() => {
      const layout = latestScenario.graph.nodes[0]?.data.overlayNodes?.[0]?.layout
      expect(layout?.left).toBeCloseTo(0.1)
      expect(layout?.top).toBeCloseTo(0.11)
      expect(layout?.width).toBe(1)
      expect(layout?.height).toBe(1)
    })
    expect((container.querySelector('[data-canvas-item="hud"]') as HTMLElement).style.width).toBe('40%')
  })

  it('promotes a position-only stage overlay to a full-size mount on first move', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-overlay-fit-target')) {
        return {
          x: 40,
          y: 70,
          left: 40,
          top: 70,
          right: 120,
          bottom: 100,
          width: 80,
          height: 30,
          toJSON: () => ({}),
        }
      }
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 200,
        bottom: 100,
        width: 200,
        height: 100,
        toJSON: () => ({}),
      }
    })
    const current = node('n1', {
      overlayNodes: [{ overlay: 'dialogues' }],
    })
    const initialScenario = scnOf(
      { nodes: [current], edges: [] },
      {
        ui: {
          overlays: {
            dialogues: {
              id: 'dialogues',
              children: [{
                id: 'line',
                component: 'dialogue',
                layout: { left: 0.15, top: -0.02, width: 1, height: 1 },
                trigger: { when: 'enter' },
                inputs: { text: '这是一句字幕示例。' },
              }],
            },
          },
        },
      },
    )
    let latestScenario = initialScenario
    function Harness(): JSX.Element {
      const [scenario, setScenario] = useState(initialScenario)
      latestScenario = scenario
      return (
        <NodePreviewStage
          scenario={scenario}
          node={scenario.graph.nodes[0]!}
          game="test"
          focusedMountId="dialogues"
          onEditScenario={(edit) => setScenario((value) => edit(value, value.graph.nodes[0]!))}
          onFocusMount={vi.fn()}
        />
      )
    }
    render(<Harness />)

    await waitFor(() => screen.getByRole('application', { name: '节点视频覆盖物画布' }))
    fireEvent.keyDown(window, { key: 'ArrowRight' })

    await waitFor(() => {
      expect(latestScenario.graph.nodes[0]?.data.overlayNodes?.[0]?.layout).toEqual({
        left: 0.005,
        top: 0,
        width: 1,
        height: 1,
      })
    })
  })
})
