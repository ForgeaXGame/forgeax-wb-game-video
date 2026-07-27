import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssetLibraryPanel } from '../AssetLibraryPanel'
import type { AssetLibraryController } from '../assetLibraryClient'

function controller(overrides: Partial<AssetLibraryController> = {}): AssetLibraryController {
  return {
    available: true,
    loading: false,
    error: null,
    uploading: null,
    mutating: false,
    items: [
      { id: 'image-1', kind: 'image', name: '封面', mime: 'image/png' },
      { id: 'bgm-1', kind: 'audio', name: '主题曲', mime: 'audio/mpeg' },
    ],
    refresh: vi.fn(async () => {}),
    upload: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    remove: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('AssetLibraryPanel', () => {
  it('renders image and BGM groups with their upload inputs', () => {
    render(<AssetLibraryPanel controller={controller()} />)
    expect(screen.getByText('图片')).toBeTruthy()
    expect(screen.getByText('BGM')).toBeTruthy()
    expect(screen.getByLabelText('上传图片')).toHaveAttribute('accept', 'image/*')
    expect(screen.getByLabelText('上传 BGM')).toHaveAttribute('accept', 'audio/*')
  })

  it('shows the API-unavailable state without claiming the library is empty', () => {
    render(<AssetLibraryPanel controller={controller({ available: false, items: [], error: '图片与 BGM 资源 API 尚未启用' })} />)
    expect(screen.getByRole('status')).toHaveTextContent('尚未启用')
    expect(screen.queryByText(/暂无资产/)).toBeNull()
  })

  it('renames and deletes selected assets through the controller', async () => {
    const api = controller()
    render(<AssetLibraryPanel controller={api} />)
    fireEvent.click(screen.getByRole('button', { name: '重命名 封面' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '新封面' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(api.rename).toHaveBeenCalledWith('image-1', '新封面'))

    fireEvent.click(screen.getByRole('button', { name: '删除 主题曲' }))
    expect(screen.getByRole('dialog', { name: '删除资产' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('bgm-1'))
  })
})
