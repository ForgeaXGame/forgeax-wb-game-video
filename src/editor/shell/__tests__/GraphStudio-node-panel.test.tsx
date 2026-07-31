import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlueprintDoc, GameScenario } from '../../../runtime/schema/graph-schema'
import { useGraphScenario } from '../../persist/graphScenarioStore'
import { GraphStudio } from '../GraphStudio'

const useKinoVideoResources = vi.hoisted(() => vi.fn())
const useProjectAssets = vi.hoisted(() => vi.fn())

vi.mock('../../assets/kinoVideoCacheStore', () => ({ useKinoVideoResources }))
vi.mock('../../assets/projectAssetCacheStore', () => ({ useProjectAssets }))

const SCENARIO: GameScenario = {
  version: 'wb-game-video.graph.v1',
  graph: {
    nodes: [
      {
        id: 'intro',
        type: 'perf',
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: [],
        data: { name: 'Intro' },
      },
      {
        id: 'second',
        type: 'perf',
        position: { x: 240, y: 0 },
        inputs: [],
        outputs: [],
        data: { name: 'Second' },
      },
    ],
    edges: [],
  },
}

const MAIN_ID = 'bp-main'
const MAIN_DOC: BlueprintDoc = { id: MAIN_ID, title: 'Main', entry: 'intro', graph: SCENARIO.graph }

const FOCUS_SCENARIO: GameScenario = {
  version: 'wb-game-video.graph.v1',
  graph: {
    nodes: [{
      id: 'intro',
      type: 'perf',
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: [],
      data: {
        name: 'Intro',
        durationMs: 3_000,
        overlayNodes: [{ id: 'mount-hud', overlay: 'hud' }],
        reactions: [{
          when: { type: 'at', ms: 1_000 },
          do: [{ kind: 'effect', effects: [{ kind: 'attr', entityId: 'ent-player', attr: 'hp', op: 'add', value: -20 }] }],
        }],
      },
    }],
    edges: [],
  },
  ui: {
    overlays: {
      hud: {
        id: 'hud',
        title: 'HUD',
        children: [{ id: 'damage', component: 'DamageFloatText', window: { startMs: 500, endMs: 2_500 }, trigger: { when: 'enter' }, inputs: { value: 20 } }],
      },
    },
  },
}

describe('GraphStudio 节点配置分栏', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ versions: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })))
    vi.stubGlobal('confirm', vi.fn(() => true))
    useKinoVideoResources.mockReturnValue({
      items: [], total: 0, loading: false, error: null, generation: 0, refresh: vi.fn(),
    })
    useProjectAssets.mockReturnValue({
      items: [], loading: false, error: null, generation: 0,
    })
    useGraphScenario.setState({
      game: 'game-nodia-fighting',
      demo: SCENARIO,
      blueprints: { [MAIN_ID]: MAIN_DOC },
      mainBlueprintId: MAIN_ID,
      activeBlueprintId: MAIN_ID,
      graph: SCENARIO.graph,
      meta: {},
      selectedNodeId: 'intro',
      booted: true,
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('记忆已有节点的展开状态，但新增节点时强制收起', async () => {
    render(<GraphStudio scenario={SCENARIO} />)

    expect(screen.getByRole('button', { name: '展开预览区' })).toBeTruthy()
    expect(screen.queryByTestId('node-preview-column')).toBeNull()
    expect(screen.getByTestId('node-inspector-column')).toHaveStyle({ minWidth: '280px' })

    fireEvent.click(screen.getByRole('button', { name: '展开预览区' }))
    expect(screen.getByTestId('node-panel-columns')).toHaveStyle({
      gridTemplateColumns: 'minmax(340px, 3fr) 5px minmax(280px, 2fr)',
    })
    expect(screen.getByRole('button', { name: '收起预览区' })).toBeTruthy()
    expect(window.localStorage.getItem('wb-game-video.nodePanel.previewOpen')).toBe('1')

    act(() => { useGraphScenario.getState().setSelectedNode('second') })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '收起预览区' })).toBeTruthy()
      expect(screen.getByTestId('node-preview-column')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: '＋ 添加节点' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '展开预览区' })).toBeTruthy()
      expect(screen.queryByTestId('node-preview-column')).toBeNull()
      expect(window.localStorage.getItem('wb-game-video.nodePanel.previewOpen')).toBe('0')
    })
  })

  it('配置面板打开时屏蔽 Delete，关闭面板后恢复删除', async () => {
    useGraphScenario.setState({ selectedNodeId: null })
    render(<GraphStudio scenario={SCENARIO} />)

    fireEvent.click(screen.getByTestId('rf__node-intro'))
    expect(screen.getByText('节点配置 · Intro')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Delete', code: 'Delete' })
    fireEvent.keyUp(document, { key: 'Delete', code: 'Delete' })
    expect(useGraphScenario.getState().graph.nodes.some((node) => node.id === 'intro')).toBe(true)
    expect(confirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTitle('关闭'))
    await waitFor(() => { expect(screen.queryByText('节点配置 · Intro')).toBeNull() })

    fireEvent.keyDown(document, { key: 'Delete', code: 'Delete' })
    fireEvent.keyUp(document, { key: 'Delete', code: 'Delete' })
    await waitFor(() => {
      expect(useGraphScenario.getState().graph.nodes.some((node) => node.id === 'intro')).toBe(false)
    })
  })

  it('点击预览工作区的其他区域会清空选中态，当前对象自身与配置块除外', async () => {
    window.localStorage.setItem('wb-game-video.nodePanel.previewOpen', '1')
    useGraphScenario.setState({
      demo: FOCUS_SCENARIO,
      blueprints: { [MAIN_ID]: { ...MAIN_DOC, graph: FOCUS_SCENARIO.graph } },
      graph: FOCUS_SCENARIO.graph,
      meta: { ui: FOCUS_SCENARIO.ui },
      selectedNodeId: 'intro',
    })
    const { container } = render(<GraphStudio scenario={FOCUS_SCENARIO} />)

    const clip = await waitFor(() => container.querySelector<HTMLElement>('.gc-mclip.is-mount')!)
    fireEvent.pointerDown(clip, { pointerId: 1, clientX: 10, clientY: 10 })
    await waitFor(() => expect(clip).toHaveClass('is-selected'))

    const mountCard = container.querySelector<HTMLElement>('[data-focus-anchor="mount:mount-hud"]')!
    expect(mountCard.style.outline).not.toBe('')
    fireEvent.pointerDown(mountCard)
    expect(clip).toHaveClass('is-selected')

    const play = screen.getByRole('button', { name: '播放' })
    fireEvent.pointerDown(play)
    fireEvent.click(play)
    await waitFor(() => {
      expect(clip).not.toHaveClass('is-selected')
      expect(mountCard.style.outline).toBe('')
    })

    const settlement = screen.getByRole('slider', { name: /结算 · ent-player\.hp add -20/ })
    fireEvent.pointerDown(settlement, { pointerId: 2, clientX: 20, clientY: 20 })
    await waitFor(() => expect(settlement.closest('.gc-point-mark')).toHaveClass('is-selected'))
    fireEvent.pointerDown(container.querySelector('.gc-mtimeline-canvas')!, { pointerId: 3, clientX: 200, clientY: 200 })
    await waitFor(() => expect(settlement.closest('.gc-point-mark')).not.toHaveClass('is-selected'))
  })

  it('子蓝图入口标识节点不展示演出配置和可编辑预览', () => {
    const childGraph = {
      nodes: [{
        id: 'child-entry',
        type: 'perf' as const,
        position: { x: 0, y: 0 },
        inputs: [],
        outputs: [],
        data: { name: '子蓝图入口' },
      }],
      edges: [],
    }
    const child: BlueprintDoc = { id: 'bp-child', title: 'Child', entry: 'child-entry', graph: childGraph }
    useGraphScenario.setState({
      blueprints: { [MAIN_ID]: MAIN_DOC, [child.id]: child },
      mainBlueprintId: MAIN_ID,
      activeBlueprintId: child.id,
      graph: childGraph,
      selectedNodeId: 'child-entry',
    })

    render(<GraphStudio scenario={SCENARIO} />)

    expect(screen.queryByRole('button', { name: '展开预览区' })).toBeNull()
    expect(screen.queryByTestId('node-preview-column')).toBeNull()
    expect(screen.queryByText('视频', { selector: 'label > span:first-child' })).toBeNull()
    expect(screen.queryByText('播放', { selector: 'label > span:first-child' })).toBeNull()
    expect(screen.queryByText('界面', { selector: 'b' })).toBeNull()
    expect(screen.queryByText('结算', { selector: 'b' })).toBeNull()
    expect(screen.queryByText('响应规则', { selector: 'b' })).toBeNull()
  })
})
