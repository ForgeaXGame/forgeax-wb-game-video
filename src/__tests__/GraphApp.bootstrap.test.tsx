import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { GraphApp } from '../GraphApp'

const ensureBoot = vi.hoisted(() => vi.fn())

const mockScenarioState = vi.hoisted(() => {
  const blueprints = {
    'bp-main': { id: 'bp-main', title: '主蓝图' },
    'bp-sub': { id: 'bp-sub', title: '子蓝图' },
  }
  return {
    graph: { nodes: [] as never[] },
    ensureBoot,
    blueprints,
    mainBlueprintId: 'bp-main',
    activeBlueprintId: 'bp-main',
    selectBlueprint: vi.fn(),
    createBlueprint: () => ({ ok: true as const, id: 'bp-new' }),
    renameBlueprint: () => ({ ok: true as const }),
    deleteBlueprint: () => ({ ok: true as const }),
    setMainBlueprint: vi.fn(),
    authoringProject: () => ({ manifest: { packs: {} } }),
    meta: { ui: { overlays: {} }, uiTree: { root: [] } },
  }
})

vi.mock('../editor/bootstrap/GameBootstrap', () => ({
  GameBootstrap: ({ children }: { children: ReactNode }) => <div data-testid="bootstrap">{children}</div>,
}))
vi.mock('../editor/assets/catalog', () => ({
  ZHANDOU_VIDEOS: {},
  zhandouUrl: () => '',
}))
vi.mock('../editor/shell/GraphStudio', () => ({ GraphStudio: () => <div>blueprint</div> }))
vi.mock('../editor/shell/GraphVideoView', () => ({ GraphVideoView: () => <div>video</div> }))
vi.mock('../editor/shell/GraphAssetView', () => ({ GraphAssetView: () => <div>assets</div> }))
vi.mock('../editor/shell/GraphConfigView', () => ({ GraphConfigView: () => <div>config</div> }))
vi.mock('../editor/shell/GraphPlaySurface', () => ({ GraphPlaySurface: () => <div>play</div> }))
vi.mock('../editor/persist/graphScenarioStore', () => ({
  useGraphScenario: (selector: (state: typeof mockScenarioState) => unknown) => selector(mockScenarioState),
}))
vi.mock('../editor/persist/graphViewStore', () => ({
  useGraphView: (selector: (state: { view: string; setView: () => void }) => unknown) => selector({ view: 'graph', setView: vi.fn() }),
  installGraphViewSync: () => vi.fn(),
}))
vi.mock('../editor/persist/uiNavSync', () => ({
  installUiNavSync: () => vi.fn(),
  sendUiNavCommand: vi.fn(),
  useUiNavMirror: (selector: (state: { role: string; snapshot: null }) => unknown) =>
    selector({ role: 'standalone', snapshot: null }),
}))
vi.mock('../editor/persist/uiSelectionStore', () => ({
  useUiSelection: (selector: (state: { selectedTreeNodeId: null; selectUiNode: () => void }) => unknown) =>
    selector({ selectedTreeNodeId: null, selectUiNode: vi.fn() }),
}))
vi.mock('../editor/persist/graphBlueprintSync', () => ({
  installGraphBlueprintSync: () => vi.fn(),
}))
vi.mock('../editor/persist/gameScope', () => ({ getGameSlug: () => 'demo' }))
vi.mock('../styles/injectStyle', () => ({ injectStyleOnce: vi.fn() }))

afterEach(() => {
  ensureBoot.mockClear()
  window.history.replaceState({}, '', '/')
})

test('boots the left pane without GameBootstrap chrome and lists real blueprints', () => {
  window.history.replaceState({}, '', '/?pane=left')
  render(<GraphApp />)
  expect(screen.getByRole('complementary')).toBeTruthy()
  expect(screen.queryByTestId('bootstrap')).toBeNull()
  expect(ensureBoot).toHaveBeenCalled()
  expect(screen.getByText('主蓝图')).toBeTruthy()
  expect(screen.getByText('子蓝图')).toBeTruthy()
  expect(screen.getByRole('button', { name: '新增 蓝图 子项' })).toBeTruthy()
  expect(screen.getByText('生成视频')).toBeTruthy()
  expect(screen.getByText('上传视频')).toBeTruthy()
  // 行操作仅 hover 显示（display:none），用 hidden:true 断言存在。
  expect(screen.getByRole('button', { name: '重命名 主蓝图', hidden: true })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '删除 主蓝图', hidden: true })).toBeNull()
  expect(screen.queryByRole('button', { name: '设为入口 主蓝图', hidden: true })).toBeNull()
  expect(screen.getByRole('button', { name: '重命名 子蓝图', hidden: true })).toBeTruthy()
  expect(screen.getByRole('button', { name: '删除 子蓝图', hidden: true })).toBeTruthy()
  expect(screen.getByRole('button', { name: '设为入口 子蓝图', hidden: true })).toBeTruthy()
})

test('wraps the center pane with bootstrap before rendering the main surface', () => {
  window.history.replaceState({}, '', '/?pane=center')
  render(<GraphApp />)
  expect(screen.getByTestId('bootstrap')).toBeTruthy()
  expect(screen.getByText('blueprint')).toBeTruthy()
})
