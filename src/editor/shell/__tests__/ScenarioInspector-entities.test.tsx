import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { Entity } from '../../../runtime/schema/graph-schema'
import { ScenarioInspector, type ScenarioMeta } from '../ScenarioInspector'

function EntityHarness({ initial }: { initial: Record<string, Entity> }): JSX.Element {
  const [value, setValue] = useState<ScenarioMeta>({ entities: initial })
  return (
    <>
      <ScenarioInspector value={value} section="entities" onChange={setValue} />
      <output data-testid="entities-state">{JSON.stringify(value.entities)}</output>
    </>
  )
}

describe('ScenarioInspector entity attributes', () => {
  it('creates the first property with the same editable placeholder as later properties', () => {
    render(<EntityHarness initial={{ hero: { id: 'hero', name: '主角', attrs: {} } }} />)

    fireEvent.click(screen.getByRole('button', { name: '+ 属性' }))

    const idInput = screen.getByRole('textbox', { name: '属性「attr0」的 id' })
    expect(idInput).toHaveValue('')
    expect(idInput).toHaveAttribute('placeholder', 'attr0')

    fireEvent.change(idInput, { target: { value: 'hp' } })
    fireEvent.keyDown(idInput, { key: 'Enter' })

    expect(screen.getByRole('textbox', { name: '属性「hp」的 id' })).toHaveValue('hp')
    expect(screen.getByTestId('entities-state')).toHaveTextContent('"attrs":{"hp":0}')
  })

  it('keeps existing property ids read-only', () => {
    render(
      <EntityHarness
        initial={{
          hero: {
            id: 'hero',
            name: '主角',
            attrs: { attr0: 10 },
            attrMeta: { attr0: { label: '生命', max: 100 } },
          },
        }}
      />,
    )

    const idInput = screen.getByRole('textbox', { name: '属性「attr0」的 id' })
    expect(idInput).toHaveValue('attr0')
    expect(idInput).toHaveAttribute('readonly')
  })

  it('shows generated ids as placeholders so typing does not append to them', () => {
    render(
      <EntityHarness
        initial={{
          hero: {
            id: 'hero',
            name: '主角',
            attrs: { hp: 10 },
          },
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '+ 属性' }))
    const idInput = screen.getByRole('textbox', { name: '属性「attr1」的 id' }) as HTMLInputElement
    expect(idInput).toHaveValue('')
    expect(idInput).toHaveAttribute('placeholder', 'attr1')

    fireEvent.change(idInput, { target: { value: 'maxhp' } })
    fireEvent.keyDown(idInput, { key: 'Enter' })

    expect(screen.getByRole('textbox', { name: '属性「maxhp」的 id' })).toHaveValue('maxhp')
    expect(screen.getByTestId('entities-state')).toHaveTextContent('"attrs":{"hp":10,"maxhp":0}')
  })

  it('keeps paired attribute metadata in sync when either value changes', () => {
    render(
      <EntityHarness
        initial={{
          hero: {
            id: 'hero',
            name: '主角',
            attrs: { stamina: 40, staminaMax: 100 },
            attrMeta: { stamina: { label: '耐力', min: 0, initial: 300, max: 300 } },
          },
        }}
      />,
    )

    fireEvent.change(screen.getByLabelText('属性「staminaMax」的数值'), {
      target: { value: '120' },
    })
    expect(screen.getByTestId('entities-state')).toHaveTextContent(
      '"stamina":{"label":"耐力","min":0,"initial":40,"max":120}',
    )

    fireEvent.change(screen.getByLabelText('属性「stamina」的数值'), {
      target: { value: '75' },
    })

    expect(screen.getByTestId('entities-state')).toHaveTextContent(
      '"stamina":{"label":"耐力","min":0,"initial":75,"max":120}',
    )
  })

  it('allows a required attribute value to stay empty until blur', () => {
    render(
      <EntityHarness
        initial={{
          hero: {
            id: 'hero',
            attrs: { hp: 60, hpMax: 100 },
            attrMeta: { hp: { initial: 60, max: 100 } },
          },
        }}
      />,
    )

    const hpInput = screen.getByLabelText('属性「hp」的数值')
    fireEvent.focus(hpInput)
    fireEvent.change(hpInput, { target: { value: '' } })

    expect(hpInput).toHaveValue('')
    expect(screen.getByTestId('entities-state')).toHaveTextContent('"hp":60')

    fireEvent.blur(hpInput)

    expect(hpInput).toHaveValue('0')
    expect(screen.getByTestId('entities-state')).toHaveTextContent('"attrs":{"hp":0,"hpMax":100}')
    expect(screen.getByTestId('entities-state')).toHaveTextContent('"hp":{"initial":0,"max":100}')
  })
})
