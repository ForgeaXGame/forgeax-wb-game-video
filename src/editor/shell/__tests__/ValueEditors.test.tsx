// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Entity, Variable } from '../../../runtime/schema/graph-schema'
import type { Formula } from '../../persist/formula-authoring'
import { TextValueEditor } from '../TextValueEditor'
import { ValueExprEditor } from '../ValueExprEditor'

afterEach(cleanup)

const entities: Record<string, Entity> = {
  hero: {
    id: 'hero',
    name: '主角',
    attrs: { hp: 100 },
    attrMeta: { hp: { label: '生命值' } },
  },
}

const variables: Record<string, Variable> = {
  rage: { id: 'rage', name: '怒气', initial: 0 },
}

const formulas: Record<string, Formula> = {
  damage: {
    id: 'damage',
    name: '伤害公式',
    ast: { t: 'num', id: 'n0', v: 10 },
  },
}

describe('numberExpr dropdown labels', () => {
  it('shows concise entity names and entity attributes for text values', () => {
    const onChange = vi.fn()
    render(
      <TextValueEditor
        value={{ ref: 'entity.hero.name' }}
        entities={entities}
        variables={variables}
        onChange={onChange}
      />,
    )

    const select = screen.getByRole('combobox', { name: '文本内容' })
    expect(within(select).getByRole('option', { name: '主角' })).toBeTruthy()
    const attrOption = within(select).getByRole('option', { name: '主角的生命值' }) as HTMLOptionElement
    expect(within(select).getByRole('option', { name: '怒气' })).toBeTruthy()
    expect(select.textContent).not.toContain('（hero）')
    expect(select.textContent).not.toContain('/ 名称')

    fireEvent.change(select, { target: { value: attrOption.value } })
    expect(onChange).toHaveBeenCalledWith({ ref: 'entity.hero.attr.hp' })
  })

  it('separates source type from entity, variable, and formula selection', () => {
    const onChange = vi.fn()
    function Harness(): JSX.Element {
      const [value, setValue] = useState(0 as Parameters<typeof ValueExprEditor>[0]['value'])
      return (
        <ValueExprEditor
          value={value}
          entities={entities}
          variables={variables}
          formulas={formulas}
          onChange={(next) => {
            setValue(next)
            onChange(next)
          }}
        />
      )
    }
    render(<Harness />)

    const source = screen.getByRole('combobox', { name: '数值来源类型' })
    expect(within(source).getByRole('option', { name: '实体属性' })).toBeTruthy()
    expect(within(source).getByRole('option', { name: '变量' })).toBeTruthy()
    expect(within(source).getByRole('option', { name: '公式' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: '主角的生命值' })).toBeNull()

    fireEvent.change(source, { target: { value: 'entity' } })
    const entitySource = screen.getByRole('combobox', { name: '实体属性' })
    expect(within(entitySource).getByRole('option', { name: '主角的生命值' })).toBeTruthy()
    expect(entitySource.textContent).not.toContain('（hero）')
    expect(entitySource.textContent).not.toContain('（hp）')
    expect(onChange).toHaveBeenCalledWith({
      expr: 'entity.hero.attr.hp',
      pick: {
        mode: 'pick',
        terms: [{ op: '+', source: 'entity', refId: 'hero', attr: 'hp' }],
      },
    })

    fireEvent.change(source, { target: { value: 'var' } })
    expect(within(screen.getByRole('combobox', { name: '变量' }))
      .getByRole('option', { name: '怒气' })).toBeTruthy()

    fireEvent.change(source, { target: { value: 'formula' } })
    expect(within(screen.getByRole('combobox', { name: '公式' }))
      .getByRole('option', { name: '伤害公式' })).toBeTruthy()
  })

  it('opens application-time source binding for text formula parameters', () => {
    const reusable: Formula = {
      id: 'reusable',
      name: '通用伤害',
      ast: {
        t: 'bin',
        id: 'damage',
        op: '-',
        a: { t: 'hole', id: 'attacker', holeId: 'attacker', kind: 'number', label: '攻击方属性' },
        b: { t: 'hole', id: 'defender', holeId: 'defender', kind: 'number', label: '防御方属性' },
      },
    }
    const onChange = vi.fn()
    render(
      <ValueExprEditor
        value={0}
        entities={entities}
        variables={variables}
        formulas={{ reusable }}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByRole('combobox', { name: '数值来源类型' }), {
      target: { value: 'formula' },
    })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      expr: '0',
      pick: { mode: 'formula', formulaId: 'reusable', holeBindings: {} },
    }))
  })
})
