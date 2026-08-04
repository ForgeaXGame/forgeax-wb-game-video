import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { GraphApp } from '../GraphApp'

const { ensureBoot, bootstrapProps } = vi.hoisted(() => ({
  ensureBoot: vi.fn(),
  bootstrapProps: vi.fn(),
}))

vi.mock('../editor/bootstrap/GameBootstrap', () => ({
  GameBootstrap: ({ children, onBoot, gameId }: { children: ReactNode; onBoot?: (gameId: string) => void; gameId?: string }) => {
    bootstrapProps({ gameId })
    onBoot?.('猫')
    return <div data-testid="bootstrap">{children}</div>
  },
}))
vi.mock('../editor/shell/BlueprintLibraryView', () => ({ BlueprintLibraryView: () => <div>blueprint</div> }))
vi.mock('../editor/shell/GraphVideoView', () => ({ GraphVideoView: () => <div>video</div> }))
vi.mock('../editor/shell/GraphAssetView', () => ({ GraphAssetView: () => <div>assets</div> }))
vi.mock('../editor/shell/GraphConfigView', () => ({ GraphConfigView: () => <div>config</div> }))
vi.mock('../editor/shell/GraphPlaySurface', () => ({ GraphPlaySurface: () => <div>play</div> }))
vi.mock('../editor/persist/graphScenarioStore', () => ({
  useGraphScenario: (selector: (state: {
    graph: { nodes: never[] }
    ensureBoot: typeof ensureBoot
    loadEpoch: number
    scn: () => { graph: { nodes: never[] } }
  }) => unknown) => selector({
    graph: { nodes: [] },
    ensureBoot,
    loadEpoch: 0,
    scn: () => ({ graph: { nodes: [] } }),
  }),
}))
vi.mock('../editor/persist/graphViewStore', () => ({
  useGraphView: (selector: (state: { view: string; setView: () => void }) => unknown) => selector({ view: 'graph', setView: vi.fn() }),
  installGraphViewSync: () => vi.fn(),
}))
vi.mock('../styles/injectStyle', () => ({ injectStyleOnce: vi.fn() }))

afterEach(() => window.history.replaceState({}, '', '/'))

test('wraps only the center pane with bootstrap and leaves the left pane side-effect free', () => {
  window.history.replaceState({}, '', '/?pane=left')
  render(<GraphApp />)
  expect(screen.getByRole('complementary')).toBeTruthy()
  expect(screen.queryByTestId('bootstrap')).toBeNull()
})

test('wraps the center pane with bootstrap before rendering the main surface', () => {
  window.history.replaceState({}, '', '/?pane=center')
  render(<GraphApp />)
  expect(screen.getByTestId('bootstrap')).toBeTruthy()
  expect(screen.getByText('blueprint')).toBeTruthy()
})

test('passes the handshake game id to the single boot owner', () => {
  window.history.replaceState({}, '', '/?pane=center')
  ensureBoot.mockClear()
  render(<GraphApp />)
  expect(ensureBoot).toHaveBeenCalledWith('猫')
})

test('uses explicit in-process pane and game id without changing the host URL', () => {
  window.history.replaceState({}, '', '/?pane=left&slug=other')
  bootstrapProps.mockClear()

  render(<GraphApp pane="center" gameId="arrival-game" />)

  expect(screen.queryByRole('complementary')).toBeNull()
  expect(screen.getByTestId('bootstrap')).toBeTruthy()
  expect(bootstrapProps).toHaveBeenCalledWith({ gameId: 'arrival-game' })
  expect(location.search).toBe('?pane=left&slug=other')
})
