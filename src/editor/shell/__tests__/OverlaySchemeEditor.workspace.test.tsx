// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { OverlaySchemeEditor } from '../OverlaySchemeEditor'

afterEach(cleanup)

function renderEditor(
  props: Partial<ComponentProps<typeof OverlaySchemeEditor>> = {},
): ReturnType<typeof render> {
  return render(
    <OverlaySchemeEditor
      overlayId="workspace"
      overlay={{ id: 'workspace', title: '战斗界面', children: [] }}
      entities={{}}
      variables={{}}
      usageCount={0}
      onRename={vi.fn()}
      onRemove={vi.fn()}
      onAddChild={vi.fn()}
      onRemoveChild={vi.fn()}
      onPatchChild={vi.fn()}
      onReactionsChange={vi.fn()}
      {...props}
    />,
  )
}

describe('OverlaySchemeEditor workspace layout', () => {
  it('uses a fill-height flat stage and bottom library workspace', () => {
    const { container } = renderEditor()

    const stageRegion = screen.getByTestId('overlay-stage-region')
    const libraryRegion = screen.getByTestId('overlay-library-region')
    const stage = container.querySelector('.ocp-stage') as HTMLElement
    expect(screen.getByTestId('overlay-scheme-workspace')).toHaveClass('ose-workspace')
    expect(stageRegion).toHaveClass('ose-stage')
    expect(libraryRegion).toHaveClass('ose-bottom')
    expect(stageRegion).toHaveStyle({ height: '56%' })
    expect(getComputedStyle(stageRegion).maxHeight).toBe('calc(100% - 190px)')
    expect(getComputedStyle(libraryRegion).minHeight).toBe('184px')
    expect(getComputedStyle(stage).backgroundColor).toBe('#000')
    expect(container.querySelector('[data-overlay-viewport]')).toHaveStyle({ aspectRatio: '16 / 9' })
    expect(getComputedStyle(stage).borderRadius).toBe('')
    expect(getComputedStyle(stage).boxShadow).toBe('')
    expect(container.querySelector('.ocp-root')).toHaveClass('is-workspace-fill')
    const activeTab = screen.getByRole('tab', { name: '控件库' })
    expect(activeTab).toHaveAttribute('aria-selected', 'true')
    expect(getComputedStyle(activeTab).color).toBe('#ff9c2a')
    const workspaceStyles = document.querySelector('style[data-reel-style="overlay-scheme-workspace"]')?.textContent
    expect(workspaceStyles).toContain('.ose-tabs button:hover { background:transparent; }')
    expect(workspaceStyles).not.toContain('button[aria-selected="true"]::after')
    expect(screen.getByTestId('component-library')).toBeTruthy()
    expect(screen.queryByLabelText('界面方案名称')).toBeNull()
    const separator = screen.getByRole('separator', { name: '调整画布区域高度' })
    expect(separator).toHaveAttribute('aria-valuenow', '56')
    fireEvent.keyDown(separator, { key: 'ArrowDown' })
    expect(separator).toHaveAttribute('aria-valuenow', '58')
  })

  it('defaults to layers when the scheme already has children', () => {
    renderEditor({
      overlay: {
        id: 'workspace',
        title: '战斗界面',
        children: [{ id: 'notice', component: 'StatusNotice', inputs: {} }],
      },
    })

    expect(screen.getByRole('tab', { name: '图层' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('overlay-layers')).toBeTruthy()
    expect(screen.getByRole('button', { name: /状态提示 · notice/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps locked schemes on visible layers without a component library', () => {
    renderEditor({
      locked: true,
      overlay: {
        id: 'workspace',
        children: [{ id: 'notice', component: 'StatusNotice', inputs: {} }],
      },
    })

    expect(screen.queryByRole('tab', { name: '控件库' })).toBeNull()
    expect(screen.getByRole('tab', { name: '图层' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('overlay-layers')).toBeTruthy()
    expect(screen.queryByTestId('component-library')).toBeNull()
  })
})
