// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerCoreSkins } from '../../../runtime/component-host/components'
import { registerComponent, unregisterComponent } from '../../../runtime/registry/component-registry'
import type { GameGraph, Overlay, OverlayEventRef } from '../../../runtime/schema/graph-schema'
import { ComponentEventsEditor } from '../ComponentEventsEditor'
import { ComponentFormFields } from '../component-form-fields'
import { NodeInspector } from '../NodeInspector'
import { OverlaySchemeEditor } from '../OverlaySchemeEditor'

registerCoreSkins()
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const event: OverlayEventRef = {
  eventId: 'pass',
  mountId: 'hud',
  childId: 'q',
  localEventId: 'pass',
  label: '成功',
  componentId: 'qte',
}

describe('ComponentEventsEditor', () => {
  it('catalog mode writes stable keys and never offers advance', () => {
    const onCatalogChange = vi.fn()
    render(
      <ComponentEventsEditor
        mode="catalog"
        events={[event]}
        spawnOptions={[]}
        onCatalogChange={onCatalogChange}
      />,
    )
    expect(screen.getByText('q:pass')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /沿边推进/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /效果/ }))
    expect(onCatalogChange).toHaveBeenCalledWith([
      expect.objectContaining({ when: { type: 'event', id: 'q:pass' } }),
    ])
  })

  it('mount mode shows inherited catalog actions and edits additions separately', () => {
    render(
      <ComponentEventsEditor
        mode="mount"
        events={[event]}
        catalogReactions={[{
          when: { type: 'event', id: 'q:pass' },
          do: [{ kind: 'effect', effects: [] }],
        }]}
        spawnOptions={[]}
        onMountActionsChange={vi.fn()}
      />,
    )
    expect(screen.getByText('目录继承动作：效果')).toBeTruthy()
    expect(screen.getByText('挂载追加动作')).toBeTruthy()
    expect(screen.getByRole('button', { name: /沿边推进/ })).toBeTruthy()
  })
})

describe('NodeInspector overlay events', () => {
  it('omits the event response area when the mounted overlay exports no events', () => {
    const graph: GameGraph = {
      nodes: [{
        id: 'n1',
        type: 'perf',
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: [],
        data: {
          name: '无事件节点',
          overlayNodes: [{ overlay: 'hud' }],
        },
      }],
      edges: [],
    }
    render(
      <NodeInspector
        graph={graph}
        nodeId="n1"
        overlays={{
          hud: {
            id: 'hud',
            children: [{ id: 'damage', component: 'damageFloatText', inputs: {} }],
          },
        }}
        onChange={vi.fn()}
      />,
    )

    expect(screen.queryByText('事件响应')).toBeNull()
    expect(screen.queryByText(/无导出事件/)).toBeNull()
  })
})

describe('OverlaySchemeEditor selected child', () => {
  it('defaults overlapping components to the visually topmost child', async () => {
    const { container } = render(
      <OverlaySchemeEditor
        overlayId="double-subtitle"
        overlay={{
          id: 'double-subtitle',
          children: [
            { id: 'subtitle-a', component: 'dialogue', inputs: { text: 'A' } },
            { id: 'subtitle-b', component: 'dialogue', inputs: { text: 'B' } },
          ],
        }}
        entities={{}}
        variables={{}}
        usageCount={0}
        onRename={vi.fn()}
        onRemove={vi.fn()}
        onAddChild={vi.fn()}
        onRemoveChild={vi.fn()}
        onPatchChild={vi.fn()}
        onReactionsChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('[data-canvas-item="subtitle-b"]')?.classList.contains('is-selected')).toBe(true)
    })
    expect(container.querySelector('[data-canvas-item="subtitle-a"]')?.classList.contains('is-selected')).toBe(false)
  })

  it('keeps each subtitle layout fields synchronized with canvas move and resize', async () => {
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
    function Harness(): JSX.Element {
      const [overlay, setOverlay] = useState<Overlay>({
        id: 'double-subtitle',
        children: [
          {
            id: 'subtitle-a',
            component: 'dialogue',
            inputs: { text: 'A' },
            layout: { left: 0, top: 0, width: 1, height: 1 },
          },
          {
            id: 'subtitle-b',
            component: 'dialogue',
            inputs: { text: 'B' },
            layout: { left: 0, top: 0, width: 1, height: 1 },
          },
        ],
      })
      return (
        <OverlaySchemeEditor
          overlayId={overlay.id}
          overlay={overlay}
          entities={{}}
          variables={{}}
          usageCount={0}
          onRename={vi.fn()}
          onRemove={vi.fn()}
          onAddChild={vi.fn()}
          onRemoveChild={vi.fn()}
          onPatchChild={(childId, patch) => {
            setOverlay((current) => ({
              ...current,
              children: current.children.map((child) =>
                child.id === childId
                  ? {
                      ...child,
                      ...(patch.inputs ? { inputs: patch.inputs } : {}),
                      ...(patch.layout ? { layout: { ...child.layout, ...patch.layout } } : {}),
                    }
                  : child),
            }))
          }}
          onReactionsChange={vi.fn()}
        />
      )
    }
    const { container } = render(<Harness />)

    await waitFor(() => expect(screen.getByLabelText('subtitle-b 宽%')).toHaveValue(100))
    expect(screen.getByLabelText('subtitle-b X%')).toHaveValue(0)
    expect(screen.getByLabelText('subtitle-b Y%')).toHaveValue(0)
    expect(screen.getByLabelText('subtitle-b 高%')).toHaveValue(100)

    expect(screen.getAllByRole('button', { name: /调整dialogue大小/ })).toHaveLength(8)
    const resize = screen.getByRole('button', { name: '调整dialogue大小：右下' })
    fireEvent.pointerDown(resize, { pointerId: 1, clientX: 200, clientY: 100 })
    fireEvent.pointerMove(resize, { pointerId: 1, clientX: 160, clientY: 80 })
    fireEvent.pointerUp(resize, { pointerId: 1, clientX: 160, clientY: 80 })
    await waitFor(() => expect(screen.getByLabelText('subtitle-b 宽%')).toHaveValue(80))
    expect(screen.getByLabelText('subtitle-b 高%')).toHaveValue(80)

    fireEvent.pointerDown(container.querySelector('[title="subtitle-a"]')!)
    await waitFor(() => expect(screen.getByLabelText('subtitle-a 宽%')).toHaveValue(100))
    expect(screen.getByLabelText('subtitle-a X%')).toHaveValue(0)
    expect(screen.getByLabelText('subtitle-a Y%')).toHaveValue(0)
    expect(screen.getByLabelText('subtitle-a 高%')).toHaveValue(100)

    fireEvent.change(screen.getByLabelText('subtitle-a X%'), { target: { value: '25' } })
    fireEvent.change(screen.getByLabelText('subtitle-a 宽%'), { target: { value: '50' } })
    await waitFor(() => expect(screen.getByLabelText('subtitle-a X%')).toHaveValue(25))
    expect(screen.getByLabelText('subtitle-a 宽%')).toHaveValue(50)
  })

  it('defaults to the first child and immediately shows parameters and events below the canvas', () => {
    render(
      <OverlaySchemeEditor
        overlayId="hud"
        overlay={{
          id: 'hud',
          children: [{
            id: 'q',
            component: 'qte',
            inputs: { events: [{ id: 'pass', label: '成功' }], timeoutMs: 800 },
          }],
        }}
        entities={{}}
        variables={{}}
        usageCount={0}
        onRename={vi.fn()}
        onRemove={vi.fn()}
        onAddChild={vi.fn()}
        onRemoveChild={vi.fn()}
        onPatchChild={vi.fn()}
        onReactionsChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('overlay-selected-child-editor')).toBeTruthy()
    expect(screen.getByText(/^参数 ·/)).toBeTruthy()
    expect(screen.getByText('事件')).toBeTruthy()
    expect(screen.getByText('q:pass')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /调整qte大小/ })).toHaveLength(8)
  })

  it('allows parameter edits while the base scheme structure is locked', () => {
    const onPatchChild = vi.fn()
    render(
      <OverlaySchemeEditor
        overlayId="base:battlePlayerHpBar"
        overlay={{
          id: 'base:battlePlayerHpBar',
          children: [{
            id: 'hp',
            component: 'battlePlayerHpBar',
            inputs: { current: 50, max: 90, label: '我方', qi: 3, qiMax: 5 },
          }],
        }}
        entities={{}}
        variables={{}}
        usageCount={0}
        locked
        onRename={vi.fn()}
        onRemove={vi.fn()}
        onAddChild={vi.fn()}
        onRemoveChild={vi.fn()}
        onPatchChild={onPatchChild}
        onReactionsChange={vi.fn()}
      />,
    )
    const current = screen.getByDisplayValue('50') as HTMLInputElement
    expect(current.disabled).toBe(false)
    fireEvent.change(current, { target: { value: '60' } })
    expect(onPatchChild).toHaveBeenCalledWith('hp', {
      inputs: expect.objectContaining({ current: 60 }),
    })
  })

  it('keeps catalog event actions disabled for locked base schemes', () => {
    render(
      <OverlaySchemeEditor
        overlayId="base:inkYingMo"
        overlay={{ id: 'base:inkYingMo', children: [{ id: 'choice', component: 'inkYingMo', inputs: {} }] }}
        entities={{}}
        variables={{}}
        usageCount={0}
        locked
        onRename={vi.fn()}
        onRemove={vi.fn()}
        onAddChild={vi.fn()}
        onRemoveChild={vi.fn()}
        onPatchChild={vi.fn()}
        onReactionsChange={vi.fn()}
      />,
    )
    expect((screen.getByTestId('overlay-event-editor') as HTMLFieldSetElement).disabled).toBe(true)
    expect(screen.getByText('choice:ying')).toBeTruthy()
  })

  it('does not render an event section for a component without exported events', () => {
    render(
      <OverlaySchemeEditor
        overlayId="float"
        overlay={{ id: 'float', children: [{ id: 'damage', component: 'damageFloatText', inputs: { text: '-25' } }] }}
        entities={{}}
        variables={{}}
        usageCount={0}
        onRename={vi.fn()}
        onRemove={vi.fn()}
        onAddChild={vi.fn()}
        onRemoveChild={vi.fn()}
        onPatchChild={vi.fn()}
        onReactionsChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('overlay-selected-child-editor')).toBeTruthy()
    expect(screen.queryByText('事件')).toBeNull()
  })
})

describe('ComponentFormFields defaults', () => {
  it('shows declared defaults as placeholders without writing them into values', () => {
    registerComponent('test-default-input', {
      inputs: [
        { key: 'text', label: '文本', valueType: 'string', default: '默认文本' },
        { key: 'count', label: '数量', valueType: 'number', default: 3 },
      ],
    })
    const onChange = vi.fn()
    function Harness(): JSX.Element {
      const [values, setValues] = useState<Record<string, unknown>>({ text: '原文本' })
      return (
        <ComponentFormFields
          componentId="test-default-input"
          values={values}
          onChange={(next) => {
            setValues(next)
            onChange(next)
          }}
        />
      )
    }
    render(<Harness />)
    const input = screen.getByDisplayValue('原文本')
    expect(input.getAttribute('placeholder')).toBe('默认文本')
    expect(screen.getByPlaceholderText('3')).toBeTruthy()

    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenNthCalledWith(1, {})

    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledTimes(1)
    unregisterComponent('test-default-input')
  })
})
