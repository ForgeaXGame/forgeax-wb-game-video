/**
 * Dirty checks: isDraft only when editor content ≠ last clean tip baseline.
 * After tip flush / save, unchanged content must not stay dirty.
 * Debounced autosave flushes tip via saveProject (not localStorage draft).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../persist-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../persist-client')>()
  return {
    ...actual,
    saveProject: vi.fn(async () => ({ ok: true, revision: 'rev-1' })),
    checkpointTip: vi.fn(async () => ({ ok: true, commitHash: 'c1' })),
    restoreVersionToTip: vi.fn(),
    commitVersion: vi.fn(async () => ({ tag: 'v9', commitHash: 'abc', dirty: false })),
    listVersions: vi.fn(async () => []),
  }
})

import {
  resetCleanFingerprintForTests,
  useGraphScenario,
} from '../graphScenarioStore'
import {
  saveProject,
  restoreVersionToTip,
  commitVersion,
} from '../persist-client'
import type { BlueprintDoc } from '../../../runtime/schema/graph-schema'

const bpNode = (id: string) => ({
  id,
  type: 'perf' as const,
  position: { x: 0, y: 0 },
  inputs: [],
  outputs: [],
  data: { name: id },
})
const bpDoc = (id: string, title = id): BlueprintDoc => ({
  id,
  title,
  entry: 'e',
  graph: { nodes: [bpNode('e')], edges: [] },
})

function seedCleanStore(): void {
  useGraphScenario.setState({
    blueprints: { a: bpDoc('a') },
    mainBlueprintId: 'a',
    activeBlueprintId: 'a',
    graph: bpDoc('a').graph,
    meta: {},
    booted: true,
    game: 'game-test',
    isDraft: false,
    savedTip: '',
  } as any)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(saveProject).mockClear().mockResolvedValue({ ok: true, revision: 'rev-1' })
  vi.mocked(restoreVersionToTip).mockClear()
  vi.mocked(commitVersion).mockClear().mockResolvedValue({ tag: 'v9', commitHash: 'abc', dirty: false })
  resetCleanFingerprintForTests()
  seedCleanStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('content-based isDraft', () => {
  it('successful save clears draft flag and keeps it clear when content unchanged', async () => {
    useGraphScenario.setState({ isDraft: true } as any)
    const errs = useGraphScenario.getState().save()
    expect(errs).toBe(0)
    await vi.waitFor(() => {
      expect(useGraphScenario.getState().isDraft).toBe(false)
    })
    expect(saveProject).toHaveBeenCalled()
    useGraphScenario.getState().touchDraft()
    expect(useGraphScenario.getState().isDraft).toBe(false)
  })

  it('editing marks dirty and debounced flush calls saveProject (tip)', async () => {
    // Establish clean baseline first
    useGraphScenario.getState().save()
    await vi.waitFor(() => expect(useGraphScenario.getState().isDraft).toBe(false))
    vi.mocked(saveProject).mockClear()

    useGraphScenario.getState().setGraph((g) => ({
      ...g,
      nodes: [...g.nodes, bpNode('extra')],
    }))
    expect(useGraphScenario.getState().isDraft).toBe(true)
    await vi.advanceTimersByTimeAsync(800)
    expect(saveProject).toHaveBeenCalled()
  })
})
