import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { type AssetLibraryClient, type ManagedAsset, useAssetLibrary } from '../assetLibraryClient'

function client(): AssetLibraryClient {
  return {
    list: vi.fn(async (_game, kind): Promise<ManagedAsset[]> => kind === 'image'
      ? [{ id: 'image-1', kind: 'image', name: '封面', mime: 'image/png' }]
      : [{ id: 'bgm-1', kind: 'audio', name: '主题曲', mime: 'audio/mpeg' }]),
    upload: vi.fn(async (_game, kind, file): Promise<ManagedAsset> => ({ id: `${kind}-new`, kind, name: file.name })),
    rename: vi.fn(async (_game, id, name): Promise<ManagedAsset> => ({ id, kind: id.startsWith('bgm') ? 'audio' : 'image', name })),
    remove: vi.fn(async () => {}),
  }
}

describe('useAssetLibrary', () => {
  it('reports the missing API rather than pretending the manifest is empty', async () => {
    const { result } = renderHook(() => useAssetLibrary('demo'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.available).toBe(false)
    expect(result.current.error).toMatch(/尚未启用/)
  })

  it('loads both asset groups from an injected client', async () => {
    const api = client()
    const { result } = renderHook(() => useAssetLibrary('demo', api))

    await waitFor(() => expect(result.current.items).toHaveLength(2))
    expect(api.list).toHaveBeenCalledWith('demo', 'image', expect.anything())
    expect(api.list).toHaveBeenCalledWith('demo', 'audio', expect.anything())
    expect(result.current.items.map((item) => item.kind)).toEqual(['image', 'audio'])
  })

  it('updates local state after uploading, renaming, and deleting', async () => {
    const api = client()
    const { result } = renderHook(() => useAssetLibrary('demo', api))
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    await act(async () => {
      await result.current.upload('image', new File(['x'], 'new.png', { type: 'image/png' }))
      await result.current.rename('image-new', '新封面')
      await result.current.remove('image-new')
    })

    expect(api.upload).toHaveBeenCalledWith('demo', 'image', expect.any(File))
    expect(api.rename).toHaveBeenCalledWith('demo', 'image-new', '新封面')
    expect(api.remove).toHaveBeenCalledWith('demo', 'image-new')
    expect(result.current.items.find((item) => item.id === 'image-new')).toBeUndefined()
  })
})
