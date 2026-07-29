// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Formula } from '../../persist/formula-authoring'
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
})
