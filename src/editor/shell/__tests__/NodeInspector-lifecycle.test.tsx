import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GameGraph, GameNodeData } from '../../../runtime/schema/graph-schema'
import type { Reaction } from '../../../runtime/schema/node-config-schema'
import { NodeInspector } from '../NodeInspector'

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView

function lifecycle(ms: number, entityId: string): Reaction {
  return {
    when: { type: 'at', ms },
    do: [{
      kind: 'effect',
      effects: [{ kind: 'attr', entityId, attr: 'attack', op: 'add', value: 0 }],
    }],
  }
}

function graphWith(reactions: Reaction[]): GameGraph {
  const data: GameNodeData = { name: '慈悲狱门口', durationMs: 3_000, reactions }
  return {
    nodes: [{ id: 'gate', type: 'perf', position: { x: 0, y: 0 }, inputs: [], outputs: [], data }],
    edges: [],
  }
}

afterEach(() => {
  cleanup()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: originalScrollIntoView,
  })
})

describe('NodeInspector · 结算选中联动', () => {
  it('新增结算使用宿主计算的时间轴插入时刻，没有时回落到 0ms', () => {
    const onChange = vi.fn()
    const onFocusLifecycle = vi.fn()
    const emptyGraph = graphWith([])
    const { rerender } = render(
      <NodeInspector
        graph={emptyGraph}
        nodeId="gate"
        settlementInsertMs={1_350}
        onFocusLifecycle={onFocusLifecycle}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '＋ 结算' }))
    let next = onChange.mock.calls.at(-1)?.[0] as GameGraph
    expect(next.nodes[0]?.data.reactions?.[0]?.when).toEqual({ type: 'at', ms: 1_350 })
    expect(onFocusLifecycle).toHaveBeenLastCalledWith(0)

    onChange.mockClear()
    rerender(<NodeInspector graph={emptyGraph} nodeId="gate" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '＋ 结算' }))
    next = onChange.mock.calls.at(-1)?.[0] as GameGraph
    expect(next.nodes[0]?.data.reactions?.[0]?.when).toEqual({ type: 'at', ms: 0 })
  })

  it('沿边推进统一选择目标节点，并在没有连线时同步建边', () => {
    const onChange = vi.fn()
    const graph = graphWith([lifecycle(1000, 'ent-boss')])
    graph.nodes.push({
      id: 'battle',
      type: 'perf',
      position: { x: 240, y: 0 },
      inputs: [],
      outputs: [],
      data: { name: '战斗节点' },
    })
    const { rerender } = render(<NodeInspector graph={graph} nodeId="gate" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '＋ 沿边推进' }))
    const withAdvance = onChange.mock.calls.at(-1)?.[0] as GameGraph
    rerender(<NodeInspector graph={withAdvance} nodeId="gate" onChange={onChange} />)

    expect(screen.queryByText('走边')).toBeNull()
    expect(screen.getByText('慈悲狱门口')).toBeTruthy()
    expect(screen.queryByText('慈悲狱门口 (gate)')).toBeNull()
    const targetSelect = screen.getByRole('combobox', { name: '目标节点' }) as HTMLSelectElement
    expect([...targetSelect.options].find((option) => option.value === 'battle')?.text).toBe('战斗节点')
    expect(targetSelect.textContent).not.toContain('battle)')
    fireEvent.change(targetSelect, { target: { value: 'battle' } })

    const next = onChange.mock.calls.at(-1)?.[0] as GameGraph
    const edge = next.edges.find((candidate) => candidate.source === 'gate' && candidate.target === 'battle')
    expect(edge).toBeTruthy()
    expect(edge?.sourceHandle).toMatch(/^settlement-advance:/)
    expect(next.nodes[0]?.data.reactions?.[0]?.do.at(-1)).toEqual({ kind: 'advance', edgeId: edge?.id })

    rerender(<NodeInspector graph={next} nodeId="gate" onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox', { name: '跳转时机' }), { target: { value: 'complete' } })
    const deferred = onChange.mock.calls.at(-1)?.[0] as GameGraph
    expect(deferred.edges.find((candidate) => candidate.id === edge?.id)?.data?.transition).toBe('onSettlement')
    expect(deferred.nodes[0]?.data.routingSettlement).toEqual({ type: 'complete' })
  })

  it('多个效果时只高亮时间轴指定的配置块，块内编辑不会取消选中', () => {
    const onFocusLifecycle = vi.fn()
    const { container } = render(
      <NodeInspector
        graph={graphWith([lifecycle(0, 'ent-player'), lifecycle(800, 'ent-boss')])}
        nodeId="gate"
        focusedLifecycleIndex={1}
        onFocusLifecycle={onFocusLifecycle}
        onChange={vi.fn()}
      />,
    )

    const first = container.querySelector<HTMLElement>('[data-lifecycle-effect-index="0"]')
    const second = container.querySelector<HTMLElement>('[data-lifecycle-effect-index="1"]')
    expect(first).toHaveAttribute('data-selected', 'false')
    expect(second).toHaveAttribute('data-selected', 'true')
    expect(second?.style.border).toContain('#5ad4c0')
    expect(second?.style.background).toBe('')
    expect(second?.style.boxShadow).toBe('')
    expect(screen.getByText('结算')).toBeTruthy()
    expect(screen.getByRole('button', { name: '＋ 结算' })).toBeTruthy()
    expect(screen.queryByText('生命周期效果')).toBeNull()
    expect(screen.queryByText(/演出播到指定 ms/)).toBeNull()

    fireEvent.pointerDown(second!.querySelector('input')!)
    expect(onFocusLifecycle).toHaveBeenLastCalledWith(1)
    expect(onFocusLifecycle).not.toHaveBeenCalledWith(null)

    fireEvent.pointerDown(first!)
    expect(onFocusLifecycle).toHaveBeenLastCalledWith(0)
  })

  it('重复选择同一个结算时仍把配置块平滑滚到面板中央', () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    })
    const graph = graphWith([lifecycle(0, 'ent-player'), lifecycle(800, 'ent-boss')])
    const { rerender } = render(
      <NodeInspector
        graph={graph}
        nodeId="gate"
        focusedLifecycleIndex={1}
        focusAnchorRevision={1}
        onChange={vi.fn()}
      />,
    )

    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    scrollIntoView.mockClear()
    rerender(
      <NodeInspector
        graph={graph}
        nodeId="gate"
        focusedLifecycleIndex={1}
        focusAnchorRevision={2}
        onChange={vi.fn()}
      />,
    )
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('选择时间轴覆盖物时滚动到对应挂载卡片，重复选择仍可重新定位', () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    })
    const graph: GameGraph = {
      nodes: [{
        id: 'gate',
        type: 'perf',
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: [],
        data: {
          name: '慈悲狱门口',
          overlayNodes: [
            { id: 'mount-a', overlay: 'hud' },
            { id: 'mount-b', overlay: 'hud' },
          ],
        },
      }],
      edges: [],
    }
    const overlays = {
      hud: { id: 'hud', children: [{ id: 'hp', component: 'BattlePlayerHpBar' }] },
    }
    const { container, rerender } = render(
      <NodeInspector
        graph={graph}
        nodeId="gate"
        overlays={overlays}
        focusedMountId="mount-b"
        focusAnchorRevision={1}
        onChange={vi.fn()}
      />,
    )

    const focusedMount = container.querySelector<HTMLElement>('[data-focus-anchor="mount:mount-b"]')
    expect(focusedMount).toBeTruthy()
    expect(focusedMount?.style.outline).toContain('#f08840')
    expect(focusedMount?.style.background).toBe('')
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    scrollIntoView.mockClear()
    rerender(
      <NodeInspector
        graph={graph}
        nodeId="gate"
        overlays={overlays}
        focusedMountId="mount-b"
        focusAnchorRevision={2}
        onChange={vi.fn()}
      />,
    )
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('删除选中项前面的效果后同步修正高亮序号', () => {
    const onFocusLifecycle = vi.fn()
    const onChange = vi.fn()
    const { container } = render(
      <NodeInspector
        graph={graphWith([lifecycle(0, 'ent-player'), lifecycle(800, 'ent-boss')])}
        nodeId="gate"
        focusedLifecycleIndex={1}
        onFocusLifecycle={onFocusLifecycle}
        onChange={onChange}
      />,
    )

    const first = container.querySelector<HTMLElement>('[data-lifecycle-effect-index="0"]')!
    fireEvent.click(Array.from(first.querySelectorAll('button')).find((button) => button.textContent === '移除')!)

    expect(onFocusLifecycle).toHaveBeenLastCalledWith(0)
    const next = onChange.mock.calls.at(-1)?.[0] as GameGraph
    expect(next.nodes[0]?.data.reactions).toHaveLength(1)
  })

  it('统一呈现定时与数值变化结算，动作只开放效果和沿边推进', () => {
    const onChange = vi.fn()
    render(
      <NodeInspector
        graph={graphWith([
          lifecycle(500, 'ent-player'),
          { when: { type: 'watch', of: 'entity.ent-player.attr.hp', on: 'dec' }, do: [] },
        ])}
        nodeId="gate"
        onChange={onChange}
      />,
    )

    const triggerSelects = screen.getAllByTitle('触发条件') as HTMLSelectElement[]
    expect(triggerSelects.map((select) => select.value)).toEqual(['at', 'condition'])
    expect(screen.getByRole('combobox', { name: '条件类型' })).toHaveValue('dec')
    expect(screen.getByRole('option', { name: '数值增加' })).toBeTruthy()
    expect(screen.getByRole('option', { name: '数值减少' })).toBeTruthy()
    expect(screen.queryByText('响应规则')).toBeNull()
    expect(screen.queryByRole('button', { name: '＋ 生成组件' })).toBeNull()
    expect(screen.getAllByRole('button', { name: '＋ 效果' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: '+ 效果' })).toBeNull()
    expect(screen.getAllByRole('button', { name: '＋ 沿边推进' })).toHaveLength(2)

    fireEvent.change(triggerSelects[0]!, { target: { value: 'hidden' } })
    const next = onChange.mock.calls.at(-1)?.[0] as GameGraph
    expect(next.nodes[0]?.data.reactions?.[0]?.when.type).toBe('hidden')
  })

  it('条件结算复用出边 ConditionEditor，并支持完整比较运算符', () => {
    const onChange = vi.fn()
    const entities = {
      'ent-player': { id: 'ent-player', name: '玩家', attrs: { hp: 100 }, attrMeta: { hp: { label: '生命值', max: 100 } } },
    }
    const initial = graphWith([
      {
        when: { type: 'state', condition: { all: [{ type: 'attr', entityId: 'ent-player', attr: 'hp', op: 'eq', value: 50 }] } },
        do: [],
      },
    ])
    render(
      <NodeInspector graph={initial} nodeId="gate" entities={entities} onChange={onChange} />,
    )

    expect(screen.getByTitle('触发条件')).toHaveValue('condition')
    expect(screen.getByRole('combobox', { name: '条件类型' })).toHaveValue('state')
    expect(screen.getByRole('combobox', { name: '比较运算符' })).toHaveValue('eq')
    expect(screen.getByRole('textbox', { name: '比较值' })).toHaveValue('50')
    expect(['gte', 'lte', 'gt', 'lt', 'eq', 'neq']).toEqual(
      Array.from((screen.getByRole('combobox', { name: '比较运算符' }) as HTMLSelectElement).options).map((option) => option.value),
    )

    fireEvent.change(screen.getByRole('combobox', { name: '比较运算符' }), { target: { value: 'neq' } })

    const next = onChange.mock.calls.at(-1)?.[0] as GameGraph
    expect(next.nodes[0]?.data.reactions?.[0]?.when).toEqual({
      type: 'state',
      condition: { all: [{ type: 'attr', entityId: 'ent-player', attr: 'hp', op: 'neq', value: 50 }] },
    })
  })
})
