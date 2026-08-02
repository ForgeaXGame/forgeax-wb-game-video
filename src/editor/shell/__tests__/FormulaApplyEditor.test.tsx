// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Formula, FormulaHoleBinding } from '../../persist/formula-authoring'
import { FormulaApplyEditor } from '../FormulaApplyEditor'

afterEach(cleanup)

describe('FormulaApplyEditor variable guidance', () => {
  it('prompts the author to create a variable referenced by the selected formula', () => {
    const formula: Formula = {
      id: 'formula-rage',
      name: '怒气伤害',
      ast: { t: 'ref', id: 'r0', ref: { kind: 'var', varId: 'rage' } },
    }
    render(
      <FormulaApplyEditor
        formulaId={formula.id}
        holeBindings={{}}
        formulas={{ [formula.id]: formula }}
        entities={{}}
        variables={{}}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText('公式引用的变量「rage」尚未创建，请先到「规则 → 变量」创建变量。')).toBeTruthy()
  })

  it('prompts for creating variables when the selected formula has an unbound variable slot', () => {
    const formula: Formula = {
      id: 'formula-slot',
      name: '变量加成',
      ast: { t: 'hole', id: 'h0', holeId: 'bonus', kind: 'var', label: '加成变量' },
    }
    render(
      <FormulaApplyEditor
        formulaId={formula.id}
        holeBindings={{}}
        formulas={{ [formula.id]: formula }}
        entities={{}}
        variables={{}}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText('该公式需要变量，请先到「规则 → 变量」创建变量。')).toBeTruthy()
  })

  it('keeps random sample output stable across unrelated rerenders', () => {
    const formula: Formula = {
      id: 'formula-random',
      name: '随机伤害',
      ast: {
        t: 'unary',
        id: 'neg',
        op: '-',
        x: {
          t: 'call',
          id: 'floor',
          name: 'floor',
          args: [{
            t: 'bin',
            id: 'mul',
            op: '*',
            a: { t: 'num', id: 'base', v: 10 },
            b: {
              t: 'bin',
              id: 'random-factor',
              op: '+',
              a: { t: 'num', id: 'min-factor', v: 0.85 },
              b: {
                t: 'bin',
                id: 'random-span',
                op: '*',
                a: { t: 'call', id: 'rand', name: 'rand', args: [] },
                b: { t: 'num', id: 'span', v: 0.3 },
              },
            },
          }],
        },
      },
    }
    function Harness(): JSX.Element {
      const [, rerender] = useState(0)
      return (
        <>
          <button type="button" onClick={() => rerender((value) => value + 1)}>刷新</button>
          <FormulaApplyEditor
            formulaId={formula.id}
            holeBindings={{}}
            formulas={{ [formula.id]: formula }}
            entities={{}}
            variables={{}}
            onChange={vi.fn()}
          />
        </>
      )
    }
    render(<Harness />)
    const first = screen.getByText(/^≈ /).textContent
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(screen.getByText(/^≈ /).textContent).toBe(first)
  })
})

describe('FormulaApplyEditor reusable entity parameters', () => {
  const formula: Formula = {
    id: 'formula-damage',
    name: '通用伤害',
    ast: {
      t: 'bin',
      id: 'damage',
      op: '-',
      a: { t: 'hole', id: 'attacker', holeId: 'attacker', kind: 'number', label: '攻击方属性' },
      b: { t: 'hole', id: 'defender', holeId: 'defender', kind: 'number', label: '防御方属性' },
    },
  }
  const entities = {
    player: { id: 'player', name: '玩家', attrs: { attack: 40, defense: 10 } },
    boss: { id: 'boss', name: 'Boss', attrs: { attack: 55, defense: 20 } },
  }

  it('binds both formula parameters to entity attributes and allows rebinding the defender', () => {
    const onChange = vi.fn()
    function Harness(): JSX.Element {
      const [bindings, setBindings] = useState<Record<string, FormulaHoleBinding>>({})
      return (
        <FormulaApplyEditor
          formulaId={formula.id}
          holeBindings={bindings}
          formulas={{ [formula.id]: formula }}
          entities={entities}
          variables={{}}
          onChange={(next) => {
            onChange(next)
            const formulaValue = next as {
              pick?: { mode?: string; holeBindings?: Record<string, FormulaHoleBinding> }
            }
            if (formulaValue.pick?.mode === 'formula' && formulaValue.pick.holeBindings) {
              setBindings(formulaValue.pick.holeBindings)
            }
          }}
        />
      )
    }

    render(<Harness />)
    const attacker = screen.getByRole('group', { name: '参数：攻击方属性' })
    const defender = screen.getByRole('group', { name: '参数：防御方属性' })

    fireEvent.change(within(attacker).getByRole('combobox', { name: '攻击方属性来源' }), {
      target: { value: 'entityAttr' },
    })
    fireEvent.change(within(attacker).getAllByRole('combobox')[1]!, {
      target: { value: 'player' },
    })

    fireEvent.change(within(defender).getByRole('combobox', { name: '防御方属性来源' }), {
      target: { value: 'entityAttr' },
    })
    fireEvent.change(within(defender).getAllByRole('combobox')[1]!, {
      target: { value: 'boss' },
    })
    fireEvent.change(within(defender).getAllByRole('combobox')[2]!, {
      target: { value: 'defense' },
    })

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      expr: 'entity.player.attr.attack - entity.boss.attr.defense',
    }))
    expect(screen.getByText(/^≈ 20/)).toBeTruthy()

    fireEvent.change(within(defender).getAllByRole('combobox')[1]!, {
      target: { value: 'player' },
    })
    fireEvent.change(within(defender).getAllByRole('combobox')[2]!, {
      target: { value: 'defense' },
    })

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      expr: 'entity.player.attr.attack - entity.player.attr.defense',
    }))
  })

  it('shows the exact stale entity binding instead of silently treating it as zero', () => {
    render(
      <FormulaApplyEditor
        formulaId={formula.id}
        holeBindings={{
          attacker: { kind: 'entityAttr', entityId: 'deleted-enemy', attr: 'attack' },
          defender: { kind: 'entityAttr', entityId: 'boss', attr: 'defense' },
        }}
        formulas={{ [formula.id]: formula }}
        entities={entities}
        variables={{}}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert').textContent)
      .toContain('攻击方属性（实体「deleted-enemy」已不存在）')
    expect(screen.queryByText(/^≈ /)).toBeNull()
  })
})
