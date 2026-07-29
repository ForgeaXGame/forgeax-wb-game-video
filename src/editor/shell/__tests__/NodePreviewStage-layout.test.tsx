// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  it('resizes a mounted overlay and writes left/top/width/height to mount.layout', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    }))
    const current = node('n1', {
      overlayNodes: [{ overlay: 'hud' }],
    })
    const scenario = scnOf(
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
    const edits: Array<(scenario: GameScenario, node: GameNode) => GameScenario> = []
    render(
      <NodePreviewStage
        scenario={scenario}
        node={scenario.graph.nodes[0]!}
        game="test"
        focusedMountId="hud"
        onEditScenario={(edit) => edits.push(edit)}
        onFocusMount={vi.fn()}
      />,
    )

    const handle = await waitFor(() =>
      screen.getByRole('button', { name: '调整HUD大小：左上' }))
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 20, clientY: 10 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 20, clientY: 10 })

    const next = edits.at(-1)!(scenario, scenario.graph.nodes[0]!)
    expect(next.graph.nodes[0]?.data.overlayNodes?.[0]?.layout).toEqual({
      left: 0.1,
      top: 0.1,
      width: 0.9,
      height: 0.9,
    })
  })
})
