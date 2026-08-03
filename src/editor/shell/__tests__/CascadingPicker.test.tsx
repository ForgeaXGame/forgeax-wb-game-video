// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CascadingPicker, type CascadingPickerOption } from '../CascadingPicker'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const options: CascadingPickerOption[] = [
  {
    key: 'entity',
    label: '实体属性',
    children: [
      {
        key: 'hero',
        label: '主角',
        children: [{ key: 'hero-hp', label: '当前生命', value: 'entity.hero.attr.hp' }],
      },
      {
        key: 'enemy',
        label: '敌方',
        children: [{ key: 'enemy-hp', label: '当前生命', value: 'entity.enemy.attr.hp' }],
      },
    ],
  },
  {
    key: 'variable',
    label: '变量',
    children: [{ key: 'rage', label: '怒气', value: 'var.rage' }],
  },
]

function renderPicker(): void {
  render(
    <CascadingPicker
      ariaLabel="绑定属性"
      value="entity.hero.attr.hp"
      displayValue="主角的当前生命"
      options={options}
      onSelect={vi.fn()}
    />,
  )
}

describe('CascadingPicker interaction stability', () => {
  it('keeps the popup width and position stable while switching branches', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('combobox', { name: '绑定属性' }))

    const panel = screen.getByRole('menu', { name: '绑定属性选项' })
    const initialStyle = {
      width: panel.style.width,
      left: panel.style.left,
      top: panel.style.top,
    }

    fireEvent.click(screen.getByRole('menuitem', { name: '变量' }))
    expect(panel.style.width).toBe(initialStyle.width)
    expect(panel.style.left).toBe(initialStyle.left)
    expect(panel.style.top).toBe(initialStyle.top)
  })

  it('delays hover branch changes and cancels an accidental diagonal crossing', () => {
    vi.useFakeTimers()
    renderPicker()
    fireEvent.click(screen.getByRole('combobox', { name: '绑定属性' }))

    fireEvent.pointerEnter(screen.getByRole('menuitem', { name: '敌方' }))
    expect(screen.getAllByRole('menuitem', { name: '当前生命' })).toHaveLength(1)

    act(() => vi.advanceTimersByTime(119))
    expect(screen.getAllByRole('menuitem', { name: '当前生命' })).toHaveLength(1)

    fireEvent.pointerEnter(screen.getByRole('menuitem', { name: '当前生命' }))
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getAllByRole('menuitem', { name: '当前生命' })).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: '敌方' })).toHaveAttribute('aria-expanded', 'false')

    fireEvent.pointerEnter(screen.getByRole('menuitem', { name: '敌方' }))
    act(() => vi.advanceTimersByTime(120))
    expect(screen.getAllByRole('menuitem', { name: '当前生命' })).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: '敌方' })).toHaveAttribute('aria-expanded', 'true')
  })
})
