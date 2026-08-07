// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ScenarioInspector, type ScenarioMeta } from '../ScenarioInspector'

afterEach(cleanup)

describe('ScenarioInspector formulas', () => {
  it('creates a formula with an empty expression', () => {
    function Harness(): JSX.Element {
      const [value, setValue] = useState<ScenarioMeta>({})
      return <ScenarioInspector value={value} section="formulas" onChange={setValue} />
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '＋ 新建公式' }))

    const input = screen.getByRole('textbox', { name: '公式表达式' }) as HTMLTextAreaElement
    expect(input.value).toBe('')
    expect(input).toHaveAttribute('placeholder', '输入公式')

    fireEvent.focus(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(0)
  })

  it('uses formula-specific toolbar copy and accordion rows', () => {
    render(
      <ScenarioInspector
        value={{
          formulas: {
            'formula-0': {
              id: 'formula-0',
              name: '减法',
              description: '打',
              ast: { t: 'num', id: 'n0', v: 1 },
            },
            'formula-1': {
              id: 'formula-1',
              name: '加法',
              ast: { t: 'num', id: 'n0', v: 2 },
            },
          },
        }}
        section="formulas"
        onChange={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: '＋ 新建公式' })).toBeTruthy()
    expect(screen.getByPlaceholderText('搜索公式')).toHaveAttribute('aria-label', '搜索公式')
    expect(screen.queryByText('新建实体')).toBeNull()
    expect(screen.queryByPlaceholderText('搜索实体')).toBeNull()

    const open = screen.getByRole('button', { name: '折叠公式 减法' })
    const closed = screen.getByRole('button', { name: '展开公式 加法' })
    expect(open).toHaveClass('is-open')
    expect(open).toHaveStyle({ color: 'rgba(255,255,255,.92)' })
    expect(closed).not.toHaveClass('is-open')
    expect(closed).toHaveStyle({ color: 'rgba(255,255,255,.34)' })
    expect(screen.getByDisplayValue('打')).toBeTruthy()

    fireEvent.click(closed)
    expect(screen.getByRole('button', { name: '折叠公式 加法' })).toHaveClass('is-open')
  })

  it('filters formulas by name, id, and description', () => {
    render(
      <ScenarioInspector
        value={{
          formulas: {
            damage: { id: 'damage', name: '减法', description: '扣除防御', ast: { t: 'num', id: 'n0', v: 1 } },
            heal: { id: 'heal', name: '加法', ast: { t: 'num', id: 'n0', v: 2 } },
          },
        }}
        section="formulas"
        onChange={() => undefined}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: '搜索公式' }), { target: { value: '防御' } })
    expect(screen.getByDisplayValue('减法')).toBeTruthy()
    expect(screen.queryByDisplayValue('加法')).toBeNull()
  })
})
