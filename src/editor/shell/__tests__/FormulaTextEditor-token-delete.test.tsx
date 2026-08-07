// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FormulaTextEditor } from '../FormulaTextEditor'

afterEach(cleanup)

function setup(value: string): HTMLTextAreaElement {
  render(
    <FormulaTextEditor
      ast={{ t: 'num', id: 'n0', v: 0 }}
      onChange={vi.fn()}
    />,
  )
  const ta = screen.getByRole('textbox', { name: '公式表达式' }) as HTMLTextAreaElement
  fireEvent.change(ta, { target: { value } })
  // 等 change 的 setDraft commit，否则 keyDown 时 draft 仍是旧值
  act(() => {})
  return ta
}

/** 删除后光标在 requestAnimationFrame 里重定位，waitFor 等 rAF flush。 */
async function expectDeleted(ta: HTMLTextAreaElement, value: string): Promise<void> {
  await waitFor(() => {
    expect(ta.value).toBe(value)
    expect(ta.selectionStart).toBe(0)
    expect(ta.selectionEnd).toBe(0)
  })
}

describe('FormulaTextEditor atomic token delete', () => {
  it('deletes a whole ?参数 token on Backspace instead of one character', async () => {
    const ta = setup('?攻击力 + 1')
    ta.setSelectionRange(4, 4)
    fireEvent.keyDown(ta, { key: 'Backspace' })
    await expectDeleted(ta, ' + 1')
  })

  it('deletes a whole var.x token on Backspace', async () => {
    const ta = setup('var.倍率 * 2')
    ta.setSelectionRange(6, 6)
    fireEvent.keyDown(ta, { key: 'Backspace' })
    await expectDeleted(ta, ' * 2')
  })

  it('deletes a whole entity.x.attr.y token on Backspace', async () => {
    const ta = setup('entity.atk.attr.攻击力 + 1')
    ta.setSelectionRange(19, 19)
    fireEvent.keyDown(ta, { key: 'Backspace' })
    await expectDeleted(ta, ' + 1')
  })

  it('still deletes one char when cursor is not adjacent to a token', () => {
    const ta = setup('1 + 2')
    ta.setSelectionRange(5, 5)
    fireEvent.keyDown(ta, { key: 'Backspace' })
    // 不拦截：值不变（keydown 不改 value，交给默认行为），且不应整块删
    expect(ta.value).toBe('1 + 2')
  })

  it('falls back to default when there is a selection', () => {
    const ta = setup('?攻击力')
    ta.setSelectionRange(1, 3)
    fireEvent.keyDown(ta, { key: 'Backspace' })
    expect(ta.value).toBe('?攻击力')
  })
})

describe('FormulaTextEditor insert padding', () => {
  function setup(value: string): HTMLTextAreaElement {
    render(
      <FormulaTextEditor ast={{ t: 'num', id: 'n0', v: 0 }} onChange={vi.fn()} />,
    )
    const ta = screen.getByRole('textbox', { name: '公式表达式' }) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value } })
    act(() => {})
    return ta
  }

  it('pads a space before a tag when the previous char is an identifier char', () => {
    const ta = setup('foo')
    // 光标在末尾，紧随 'foo' 的字母 → 插入 ?参数 前补空格
    const end = ta.value.length
    ta.setSelectionRange(end, end)
    fireEvent.focus(ta)
    fireEvent.select(ta)
    const parameter = screen.getByRole('button', { name: '插入参数' })
    fireEvent.click(parameter)
    expect(ta.value).toBe('foo ?参数')
  })

  it('does not pad when the previous char is already a space', () => {
    const ta = setup('1 + ')
    // 光标在 '+ ' 后，前一个字符是空格 → 不重复补空格
    ta.setSelectionRange(4, 4)
    fireEvent.focus(ta)
    fireEvent.select(ta)
    const parameter = screen.getByRole('button', { name: '插入参数' })
    fireEvent.click(parameter)
    expect(ta.value).toBe('1 + ?参数')
  })
})
