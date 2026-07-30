import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GameGraph, GameNodeData } from '../../../runtime/schema/graph-schema'
import { getSubFlowPack } from '../../../runtime/schema/graph-schema'
import { NodeInspector } from '../NodeInspector'

function graphWith(data: GameNodeData): GameGraph {
  return {
    nodes: [{ id: 'node', type: 'perf', position: { x: 0, y: 0 }, inputs: [], outputs: [], data }],
    edges: [],
  }
}

function expectPerformanceFieldsHidden(): void {
  expect(screen.queryByText('视频', { selector: 'label > span:first-child' })).toBeNull()
  expect(screen.queryByText('播放', { selector: 'label > span:first-child' })).toBeNull()
  expect(screen.queryByText('界面', { selector: 'b' })).toBeNull()
  expect(screen.queryByText('结算', { selector: 'b' })).toBeNull()
  expect(screen.queryByText('响应规则', { selector: 'b' })).toBeNull()
}

afterEach(cleanup)

describe('NodeInspector · 蓝图节点角色约束', () => {
  it('子流程容器不开放演出、界面、结算和响应规则配置', () => {
    render(<NodeInspector graph={graphWith({ name: '容器', subFlowPack: { id: 'bp-child', version: '1' } })} nodeId="node" onChange={vi.fn()} />)

    expectPerformanceFieldsHidden()
    expect(screen.queryByText('入口覆盖')).toBeNull()
  })

  it('子蓝图入口标识节点不开放演出、界面、结算和响应规则配置', () => {
    render(
      <NodeInspector
        graph={graphWith({ name: '入口' })}
        nodeId="node"
        isBlueprintEntry
        onChange={vi.fn()}
      />,
    )

    expectPerformanceFieldsHidden()
  })

  it('普通演出节点仍可配置上述字段', () => {
    render(<NodeInspector graph={graphWith({ name: '演出' })} nodeId="node" onChange={vi.fn()} />)

    expect(screen.getByText('视频', { selector: 'label > span:first-child' })).toBeTruthy()
    expect(screen.getByText('播放', { selector: 'label > span:first-child' })).toBeTruthy()
    expect(screen.getByText('界面', { selector: 'b' })).toBeTruthy()
    expect(screen.getByText('结算', { selector: 'b' })).toBeTruthy()
    expect(screen.getByText('响应规则', { selector: 'b' })).toBeTruthy()
  })

  it('子蓝图包没有候选时显示“无”，有候选时只显示实际蓝图', () => {
    const graph = graphWith({ name: '容器', subFlowPack: { id: 'missing', version: '1' } })
    const { rerender } = render(<NodeInspector graph={graph} nodeId="node" onChange={vi.fn()} />)
    const emptySelect = screen.getByTitle('子流程使用独立蓝图；双击容器下钻编辑')
    expect(within(emptySelect).getByRole('option', { name: '无' })).toBeTruthy()

    rerender(
      <NodeInspector
        graph={graph}
        nodeId="node"
        packs={[{ id: 'missing', version: '1', title: '战斗', entry: 'entry', graph: { nodes: [], edges: [] } }]}
        onChange={vi.fn()}
      />,
    )
    const populatedSelect = screen.getByTitle('子流程使用独立蓝图；双击容器下钻编辑')
    expect(within(populatedSelect).queryByRole('option', { name: '无' })).toBeNull()
    expect(within(populatedSelect).getByRole('option', { name: '战斗 (missing@1)' })).toBeTruthy()
  })

  it('新建子流程时创建独立蓝图，不向父图追加入口节点', () => {
    const graph = graphWith({ name: '回合' })
    const onChange = vi.fn()
    const onPacksChange = vi.fn()
    render(
      <NodeInspector
        graph={graph}
        nodeId="node"
        packs={[]}
        onChange={onChange}
        onPacksChange={onPacksChange}
      />,
    )

    fireEvent.change(screen.getByTitle('无 / 子流程（独立蓝图作用域）'), { target: { value: 'subflow' } })

    const nextPacks = onPacksChange.mock.calls[0]?.[0]
    expect(nextPacks).toHaveLength(1)
    expect(nextPacks[0].graph.nodes).toHaveLength(1)
    const nextGraph = onChange.mock.calls.at(-1)?.[0] as GameGraph
    expect(nextGraph.nodes).toHaveLength(1)
    expect(getSubFlowPack(nextGraph.nodes[0]!.data)).toEqual({
      id: nextPacks[0].id,
      version: nextPacks[0].version,
    })
  })
})
