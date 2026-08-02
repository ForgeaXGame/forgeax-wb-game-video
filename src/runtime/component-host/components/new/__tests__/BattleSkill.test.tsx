import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BattleSkill, BattleSkillManifest } from '../BattleSkill'

afterEach(cleanup)

describe('BattleSkill', () => {
  it('keeps skill costs while declaring configurable keys for all four skills', () => {
    expect(BattleSkillManifest.inputs).toEqual([
      { key: 'qi', label: '当前气力', valueType: 'number', component: 'numberExpr' },
      { key: 'heavyCost', label: '重攻击气力消耗', valueType: 'number', component: 'numberExpr', default: 2 },
      { key: 'ultCost', label: '灭世气力消耗', valueType: 'number', component: 'numberExpr', default: 5 },
      { key: 'lightKey', label: '轻攻击按键', valueType: 'string', default: 'X' },
      { key: 'heavyKey', label: '重攻击按键', valueType: 'string', default: 'A' },
      { key: 'meditKey', label: '冥想按键', valueType: 'string', default: 'S' },
      { key: 'ultKey', label: '灭世按键', valueType: 'string', default: 'B' },
    ])
  })

  it('shows configured keys and emits their matching skill event', () => {
    const emit = vi.fn()
    render(
      <BattleSkill
        emit={emit}
        overlay={{ elementId: 'skills', component: 'BattleSkill', inputs: { lightKey: 'Q', heavyKey: 'E', meditKey: 'R', ultKey: 'T' } }}
      />,
    )

    fireEvent.keyDown(window, { key: 'q' })

    expect(screen.getByRole('button', { name: '轻攻击 Q' })).toHaveTextContent('Q')
    expect(screen.getByRole('button', { name: '重攻击 E' })).toHaveTextContent('E')
    expect(emit).toHaveBeenCalledWith('light')
  })
})
