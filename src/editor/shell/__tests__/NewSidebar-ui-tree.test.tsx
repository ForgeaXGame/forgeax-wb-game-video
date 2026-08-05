import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BlueprintDoc, GameGraph } from '../../../runtime/schema/graph-schema'
import { findUiTreeNode } from '../../persist/ui-tree'
import { useGraphScenario } from '../../persist/graphScenarioStore'
import { useGraphView } from '../../persist/graphViewStore'
import { useUiSelection } from '../../persist/uiSelectionStore'
import { NewSidebar } from '../NewSidebar'

const initialScenario = useGraphScenario.getState()
const emptyGraph: GameGraph = { nodes: [], edges: [] }
const main: BlueprintDoc = { id: 'main', title: '主蓝图', entry: 'entry', graph: emptyGraph }

beforeEach(() => {
  useGraphView.setState({ view: 'ui' })
  useUiSelection.getState().clearUiSelection()
  useGraphScenario.setState({
    booted: true,
    blueprints: { main },
    mainBlueprintId: 'main',
    activeBlueprintId: 'main',
    graph: emptyGraph,
    meta: {
      ui: {
        overlays: {
          hud: { id: 'hud', title: '战斗 HUD', children: [] },
        },
      },
      uiTree: {
        root: [{
          kind: 'folder',
          id: 'folder',
          name: '战斗',
          children: [{
            kind: 'folder',
            id: 'nested',
            name: '首领',
            children: [{ kind: 'scheme', id: 'hud-node', overlayId: 'hud' }],
          }],
        }],
      },
    },
  })
})

afterEach(() => {
  cleanup()
  useGraphScenario.setState(initialScenario, true)
  useUiSelection.getState().clearUiSelection()
})

describe('NewSidebar interface tree', () => {
  it('keeps the main-branch 240px rail while exposing only real product routes', () => {
    render(<NewSidebar />)

    const sidebar = screen.getByRole('complementary', { name: /视频游戏工坊/ })
    expect(sidebar).toBeTruthy()
    expect(document.querySelector('style[data-reel-style="new-sidebar"]')?.textContent).toContain('width: 240px')
    expect(sidebar.querySelector('.ns-label[title="蓝图"]')?.textContent).toContain('蓝图')
    expect(sidebar.querySelector('.ns-label[title="视频"]')?.textContent).toContain('视频')
    expect(sidebar.querySelector('.ns-label[title="界面"]')?.textContent).toContain('界面')
    expect(sidebar.querySelector('.ns-label[title="文档"]')).toBeNull()
    expect(sidebar.querySelector('.ns-label[title="控件"]')).toBeNull()
  })

  it('renders the real recursive tree and publishes scheme selection', () => {
    render(<NewSidebar />)
    expect(screen.queryByText('自定义界面')).toBeNull()
    expect(screen.getByText('首领')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '选择界面方案 战斗 HUD' }))
    expect(useUiSelection.getState()).toMatchObject({
      selectedTreeNodeId: 'hud-node',
      selectedOverlayId: 'hud',
    })
  })

  it('creates an overlay and tree reference in one shared meta update', () => {
    render(<NewSidebar />)
    fireEvent.click(screen.getByRole('button', { name: '战斗操作' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ 方案' }))

    const selection = useUiSelection.getState()
    expect(selection.selectedOverlayId).toBeTruthy()
    const meta = useGraphScenario.getState().meta
    expect(meta.ui?.overlays?.[selection.selectedOverlayId!]).toMatchObject({
      id: selection.selectedOverlayId,
      children: [],
    })
    expect(findUiTreeNode(meta.uiTree!, selection.selectedTreeNodeId!)).toMatchObject({
      kind: 'scheme',
      overlayId: selection.selectedOverlayId,
    })
  })

  it('persists nested folder create, rename, and delete operations', () => {
    render(<NewSidebar />)
    fireEvent.click(screen.getByRole('button', { name: '战斗操作' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ 子文件夹' }))
    const folderId = useUiSelection.getState().selectedTreeNodeId!
    expect(findUiTreeNode(useGraphScenario.getState().meta.uiTree!, folderId)).toMatchObject({
      kind: 'folder',
      name: '新文件夹',
    })

    fireEvent.click(screen.getByRole('button', { name: '新文件夹操作' }))
    fireEvent.click(screen.getByRole('button', { name: '重命名' }))
    fireEvent.change(screen.getByRole('textbox', { name: '重命名文件夹' }), {
      target: { value: '过场界面' },
    })
    fireEvent.click(screen.getByRole('button', { name: '确定' }))
    expect(findUiTreeNode(useGraphScenario.getState().meta.uiTree!, folderId)).toMatchObject({
      name: '过场界面',
    })

    fireEvent.click(screen.getByRole('button', { name: '过场界面操作' }))
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(findUiTreeNode(useGraphScenario.getState().meta.uiTree!, folderId)).toBeUndefined()
  })

  it('deletes a scheme reference and its overlay together', () => {
    render(<NewSidebar />)
    fireEvent.click(screen.getByRole('button', { name: '战斗 HUD操作' }))
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    const meta = useGraphScenario.getState().meta
    expect(meta.ui?.overlays?.hud).toBeUndefined()
    expect(findUiTreeNode(meta.uiTree!, 'hud-node')).toBeUndefined()
  })
})
