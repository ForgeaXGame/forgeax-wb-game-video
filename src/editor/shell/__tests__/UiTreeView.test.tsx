import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UiTreeView, type UiTreeViewNode } from '../UiTreeView'

const nodes: UiTreeViewNode[] = [{
  id: 'folder-root',
  kind: 'folder',
  name: '战斗界面',
  children: [{
    id: 'folder-nested',
    kind: 'folder',
    name: '首领战',
    children: [{ id: 'scheme-node', kind: 'scheme', overlayId: 'scheme-boss' }],
  }],
}]

const overlays = {
  'scheme-boss': { id: 'scheme-boss', title: '首领 HUD', children: [] },
}

afterEach(cleanup)

function setup(overrides: Partial<Parameters<typeof UiTreeView>[0]> = {}) {
  const props = {
    nodes,
    overlays,
    selectedTreeNodeId: null,
    onSelect: vi.fn(),
    onAddFolder: vi.fn(),
    onAddScheme: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
  render(<UiTreeView {...props} />)
  return props
}

describe('UiTreeView', () => {
  it('recursively renders nested folders and scheme overlay titles', () => {
    setup()
    expect(screen.getByText('战斗界面')).toBeTruthy()
    expect(screen.getByText('首领战')).toBeTruthy()
    expect(screen.getByText('首领 HUD')).toBeTruthy()
  })

  it('collapses and expands a folder without selecting it', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: '收起战斗界面' }))
    expect(screen.queryByText('首领战')).toBeNull()
    expect(props.onSelect).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '展开战斗界面' }))
    expect(screen.getByText('首领战')).toBeTruthy()
  })

  it('selects a scheme with both tree and overlay identity', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: '选择界面方案 首领 HUD' }))
    expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({
      id: 'scheme-node',
      overlayId: 'scheme-boss',
    }))
  })

  it('uses 24px hierarchy steps while keeping selected deep-row actions reachable', () => {
    setup({ selectedTreeNodeId: 'scheme-node' })

    const label = screen.getByText('首领 HUD')
    expect(label.getAttribute('title')).toBe('首领 HUD')
    expect(label.closest('.uit-row')).toHaveClass('is-selected')
    expect(label.closest('.uit-row')).toHaveStyle({ paddingLeft: '48px' })
    expect(screen.getByRole('button', { name: '首领 HUD操作' })).toBeTruthy()
  })

  it('exposes folder create, rename, and delete actions without native dialogs', () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: '战斗界面操作' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ 子文件夹' }))
    expect(props.onAddFolder).toHaveBeenCalledWith('folder-root')

    fireEvent.click(screen.getByRole('button', { name: '战斗界面操作' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ 方案' }))
    expect(props.onAddScheme).toHaveBeenCalledWith('folder-root')

    fireEvent.click(screen.getByRole('button', { name: '战斗界面操作' }))
    fireEvent.click(screen.getByRole('button', { name: '重命名' }))
    fireEvent.change(screen.getByRole('textbox', { name: '重命名文件夹' }), {
      target: { value: '战斗 HUD' },
    })
    fireEvent.click(screen.getByRole('button', { name: '确定' }))
    expect(props.onRename).toHaveBeenCalledWith('folder-root', '战斗 HUD')

    fireEvent.click(screen.getByRole('button', { name: '战斗界面操作' }))
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.getByRole('dialog', { name: '删除战斗界面' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(props.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'folder-root' }))
  })
})
