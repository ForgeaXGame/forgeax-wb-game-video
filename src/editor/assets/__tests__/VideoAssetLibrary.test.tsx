import { createRef } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { GameScenario } from '../../../runtime/schema/graph-schema'
import { VideoAssetLibrary, type VideoAssetsController, type VideoLibraryEntry } from '../VideoAssetLibrary'

const EMPTY_SCENARIO: GameScenario = {
  version: 'wb-game-video.graph.v1',
  graph: { nodes: [], edges: [] },
}

function bundledEntry(id: string): VideoLibraryEntry {
  return { id, label: id, url: `/bundled/${id}.mp4`, group: '战斗', bundled: true }
}

function apiEntry(id: string, label = id): VideoLibraryEntry {
  return {
    id,
    label,
    url: `/api/v1/kino/resources/${id}/content?game_id=demo`,
    group: '上传',
    fromApi: true,
  }
}

function makeController(
  overrides: Partial<VideoAssetsController> & {
    uploading?: boolean
    mutating?: boolean
  } = {},
): VideoAssetsController {
  return {
    loading: false,
    error: null,
    items: [apiEntry('api-1', 'Clip one')],
    total: 1,
    page: 1,
    pageSize: 20,
    hasMore: false,
    uploadProgress: null,
    uploadError: null,
    canRetryComplete: false,
    uploading: false,
    mutating: false,
    refresh: vi.fn(async () => {}),
    loadPage: vi.fn(async () => {}),
    loadMore: vi.fn(async () => {}),
    upload: vi.fn(async () => undefined),
    retryComplete: vi.fn(async () => undefined),
    rename: vi.fn(async () => {}),
    deleteResource: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('VideoAssetLibrary', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading state', () => {
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[]}
        controller={makeController({ loading: true, items: [] })}
        selectedId=""
        onSelect={() => {}}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/加载/)
  })

  it('lists bundled and api entries', () => {
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[bundledEntry('idle01')]}
        controller={makeController()}
        selectedId="api-1"
        onSelect={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /idle01/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: '上传 · Clip one' })).toHaveClass('is-on')
  })

  it('calls refresh from manual refresh button', async () => {
    const controller = makeController()
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[]}
        controller={controller}
        selectedId=""
        onSelect={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '刷新视频库' }))
    await waitFor(() => expect(controller.refresh).toHaveBeenCalledOnce())
  })

  it('shows upload progress and retry complete', async () => {
    const controller = makeController({
      uploadProgress: 42,
      uploadError: 'Failed to finalize upload',
      canRetryComplete: true,
    })
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[]}
        controller={controller}
        selectedId=""
        onSelect={() => {}}
      />,
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getByText(/Failed to finalize upload/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试完成上传' }))
    await waitFor(() => expect(controller.retryComplete).toHaveBeenCalledOnce())
  })

  it('submits an inline rename through the controller', async () => {
    const controller = makeController({
      items: [apiEntry('res-1', 'Old name')],
    })
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[]}
        controller={controller}
        selectedId=""
        onSelect={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '重命名 Old name' }))
    const input = screen.getByLabelText('新名称')
    fireEvent.change(input, { target: { value: 'New title' } })
    fireEvent.click(screen.getByRole('button', { name: '保存名称' }))
    await waitFor(() =>
      expect(controller.rename).toHaveBeenCalledWith('res-1', 'New title'),
    )
  })

  it('delete with references shows graph and node names in confirm dialog', async () => {
    const controller = makeController({ items: [apiEntry('vid-used', 'Used clip')] })
    const scenario: GameScenario = {
      version: 'wb-game-video.graph.v1',
      graph: {
        nodes: [{
          id: 'n1',
          type: 'perf',
          position: { x: 0, y: 0 },
          inputs: [],
          outputs: [],
          data: { name: 'Boss intro', media: { kind: 'video', ref: 'vid-used' } },
        }],
        edges: [],
      },
    }
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={scenario}
        bundledEntries={[]}
        controller={controller}
        selectedId=""
        onSelect={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '删除 Used clip' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Boss intro')
    expect(screen.getByRole('dialog')).toHaveTextContent('主图')
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(controller.deleteResource).toHaveBeenCalledWith('vid-used'))
  })

  it('uses a single confirmation for an unreferenced delete', async () => {
    const controller = makeController({ items: [apiEntry('unused', 'Unused clip')] })
    const onDeleted = vi.fn()
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[]}
        controller={controller}
        selectedId=""
        onSelect={() => {}}
        onDeleted={onDeleted}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '删除 Unused clip' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(controller.deleteResource).toHaveBeenCalledOnce())
    expect(onDeleted).toHaveBeenCalledWith('unused')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps rename input open when rename fails', async () => {
    const controller = makeController({
      items: [apiEntry('res-1', 'Old name')],
      error: 'Rename failed',
      rename: vi.fn(async () => {
        throw new Error('Rename failed')
      }),
    })
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[]}
        controller={controller}
        selectedId=""
        onSelect={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '重命名 Old name' }))
    fireEvent.change(screen.getByLabelText('新名称'), {
      target: { value: 'New title' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存名称' }))

    await waitFor(() => expect(controller.rename).toHaveBeenCalledOnce())
    expect(screen.getByLabelText('新名称')).toHaveValue('New title')
    expect(screen.getByRole('alert')).toHaveTextContent('Rename failed')
  })

  it('keeps delete dialog open when delete fails', async () => {
    const controller = makeController({
      items: [apiEntry('res-1', 'Old name')],
      error: 'Delete failed',
      deleteResource: vi.fn(async () => {
        throw new Error('Delete failed')
      }),
    })
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[]}
        controller={controller}
        selectedId=""
        onSelect={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '删除 Old name' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(controller.deleteResource).toHaveBeenCalledOnce())
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('alert')).toHaveTextContent('Delete failed')
  })

  it('focuses the safe action, traps Tab, closes on Escape, and restores trigger focus', () => {
    const controller = makeController({ items: [apiEntry('res-1', 'Old name')] })
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[]}
        controller={controller}
        selectedId=""
        onSelect={() => {}}
      />,
    )
    const trigger = screen.getByRole('button', { name: '删除 Old name' })
    trigger.focus()
    fireEvent.click(trigger)

    const cancel = screen.getByRole('button', { name: '取消' })
    const confirm = screen.getByRole('button', { name: '确认删除' })
    expect(cancel).toHaveFocus()
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })
    expect(confirm).toHaveFocus()
    fireEvent.keyDown(confirm, { key: 'Tab' })
    expect(cancel).toHaveFocus()
    fireEvent.keyDown(cancel, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('disables conflicting actions while upload or mutation is active', () => {
    const controller = makeController({
      items: [apiEntry('res-1', 'Clip')],
      uploadProgress: 25,
      uploading: true,
      mutating: false,
    })
    const { rerender } = render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[]}
        controller={controller}
        selectedId=""
        onSelect={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: '上传视频' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重命名 Clip' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '删除 Clip' })).toBeDisabled()

    rerender(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[]}
        controller={makeController({
          items: [apiEntry('res-1', 'Clip')],
          uploading: false,
          mutating: true,
        })}
        selectedId=""
        onSelect={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: '上传视频' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重命名 Clip' })).toBeDisabled()
  })

  it('disables rename and delete for bundled entries', () => {
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[bundledEntry('idle01')]}
        controller={makeController({ items: [] })}
        selectedId=""
        onSelect={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: /重命名 idle01/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /删除 idle01/ })).toBeNull()
  })

  it('does not expose mutations for generated registry entries', () => {
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[]}
        supplementalEntries={[{
          id: 'a-vid-generated',
          label: 'Generated clip',
          url: '/__gva__/media/a-vid-generated?game=demo',
          group: '生成',
          fromRegistry: true,
        }]}
        controller={makeController({ items: [] })}
        selectedId=""
        onSelect={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: '生成 · Generated clip' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重命名 Generated clip' })).toBeNull()
    expect(screen.queryByRole('button', { name: '删除 Generated clip' })).toBeNull()
  })

  it('forwards the list body ref to the scroll container', () => {
    const listBodyRef = createRef<HTMLDivElement>()
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[bundledEntry('idle01')]}
        controller={makeController({ items: [] })}
        selectedId=""
        onSelect={() => {}}
        listBodyRef={listBodyRef}
      />,
    )
    expect(listBodyRef.current).toHaveClass('gc-list-body')
    expect(listBodyRef.current?.querySelector('[data-clip-id="idle01"]')).toBeTruthy()
  })

  it('shows error without leaking provider tokens', () => {
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[]}
        controller={makeController({
          error: 'Unauthorized',
          items: [],
        })}
        selectedId=""
        onSelect={() => {}}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Unauthorized')
    expect(screen.getByRole('alert').textContent).not.toMatch(/token|bearer/i)
  })

  it('shows empty state when no entries', () => {
    render(
      <VideoAssetLibrary
        gameId="demo"
        scenario={EMPTY_SCENARIO}
        bundledEntries={[]}
        controller={makeController({ items: [], total: 0 })}
        selectedId=""
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText(/暂无视频素材/)).toBeTruthy()
  })
})
