// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { GraphCondition, GraphEffect } from '../../../runtime/schema/graph-schema'
import { ConditionEditor, EffectsEditor } from '../editors'

afterEach(cleanup)

describe('EffectsEditor numeric operations', () => {
  it('lets subtraction and division own their operation state while keeping the operand editable', () => {
    let latest: GraphEffect[] = []
    function Harness(): JSX.Element {
      const [effects, setEffects] = useState<GraphEffect[]>([{
        kind: 'attr',
        entityId: 'hero',
        attr: 'hp',
        op: 'add',
        value: 2,
      }])
      latest = effects
      return (
        <EffectsEditor
          value={effects}
          entities={{
            hero: {
              id: 'hero',
              name: '主角',
              attrs: { hp: 100 },
              attrMeta: { hp: { label: '生命值' } },
            },
          }}
          onChange={setEffects}
        />
      )
    }

    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: '÷' }))
    expect(screen.getByRole('button', { name: '÷' }).classList.contains('is-on')).toBe(true)
    expect(screen.getByLabelText('常量数值')).toHaveValue('2')
    expect(latest[0]).toMatchObject({ op: 'mul', value: { expr: '1/(2)' } })

    fireEvent.change(screen.getByLabelText('常量数值'), { target: { value: '4' } })
    expect(latest[0]).toMatchObject({ op: 'mul', value: { expr: '1/(4)' } })
    expect(screen.getByText('属性 · 主角 的 生命值 ÷ 4')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '−' }))
    expect(screen.getByRole('button', { name: '−' }).classList.contains('is-on')).toBe(true)
    expect(screen.getByLabelText('常量数值')).toHaveValue('4')
    expect(latest[0]).toMatchObject({ op: 'add', value: { expr: '-(4)' } })
    expect(screen.getByText('属性 · 主角 的 生命值 − 4')).toBeTruthy()
    expect(screen.queryByText(/add|-\(4\)/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '+' }))
    expect(screen.getByRole('button', { name: '+' }).classList.contains('is-on')).toBe(true)
    expect(screen.getByLabelText('常量数值')).toHaveValue('4')
    expect(latest[0]).toMatchObject({ op: 'add', value: 4 })
  })
})

describe('ConditionEditor score compatibility', () => {
  it('does not offer score for new conditions', () => {
    function Harness(): JSX.Element {
      const [condition, setCondition] = useState<GraphCondition | undefined>()
      return <ConditionEditor value={condition} nodeIds={[]} onChange={setCondition} />
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '+ 条件（AND）' }))

    const type = screen.getByRole('combobox', { name: '条件字段类型' })
    expect(type.querySelector('option[value="score"]')).toBeNull()
    expect(type.textContent).not.toContain('分数')
  })

  it('keeps an existing score condition editable for backward compatibility', () => {
    render(
      <ConditionEditor
        value={{ all: [{ type: 'score', op: 'gte', value: 10 }] }}
        nodeIds={[]}
        onChange={() => undefined}
      />,
    )

    const type = screen.getByRole('combobox', { name: '条件字段类型' })
    expect(type).toHaveValue('score')
    expect(type.querySelector('option[value="score"]')).not.toBeNull()
  })
})
