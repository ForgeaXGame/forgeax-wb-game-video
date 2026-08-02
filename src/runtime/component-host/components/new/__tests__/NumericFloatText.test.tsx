// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createRng } from '../../../../engine/rng'
import type { SkinCtx } from '../../../rendererRegistry'
import { createCoreSkinRegistry } from '../../index'
import {
  DamageFloatText,
  DamageFloatTextManifest,
} from '../DamageFloatText'
import {
  GainFloatText,
  GainFloatTextManifest,
} from '../GainFloatText'
import { resolveNumericFloatDurationMs, resolveNumericFloatValue } from '../numericFloatText'

afterEach(cleanup)

const ctx: SkinCtx = {
  hud: {
    entities: {
      hero: {
        hp: 100,
        maxHp: 100,
        attrs: { hp: 100, attack: 20 },
        attrMax: { hp: 100, attack: 20 },
      },
    },
    vars: { bonus: 3 },
    flags: {},
    score: 0,
  },
}

function renderViaHost(component: string, inputs: Record<string, unknown>, skinCtx: SkinCtx = ctx) {
  const skins = createCoreSkinRegistry()
  return render(
    <>
      {skins.renderOverlay(
        { elementId: component, component, inputs },
        undefined,
        undefined,
        skinCtx,
      )}
    </>,
  )
}

describe('numeric float text components', () => {
  it('declare a shared constant-or-formula value input', () => {
    expect(DamageFloatTextManifest.inputs).toEqual([
      { key: 'value', label: '数值', valueType: 'number', component: 'numberExpr' },
      { key: 'color', label: '字色', valueType: 'string', component: 'color', default: '#ff5a5a' },
      { key: 'fontSize', label: '字号', valueType: 'number', default: 3.5 },
      { key: 'durationMs', label: '总时长ms', valueType: 'number', default: 1100 },
    ])
    expect(GainFloatTextManifest.inputs).toEqual([
      { key: 'value', label: '数值', valueType: 'number', component: 'numberExpr', default: 50 },
      { key: 'color', label: '字色', valueType: 'string', component: 'color', default: '#ffd54a' },
      { key: 'fontSize', label: '字号', valueType: 'number', default: 3.5 },
      { key: 'durationMs', label: '总时长ms', valueType: 'number', default: 1100 },
    ])
  })

  it('Host resolves fixed and formula values into flat props', () => {
    renderViaHost('DamageFloatText', { value: 25 })
    renderViaHost('GainFloatText', { value: 50 })
    renderViaHost('DamageFloatText', { value: { expr: 'entity.hero.attr.attack + var.bonus' } })
    renderViaHost('GainFloatText', { value: { expr: 'entity.hero.attr.attack / 2' } })

    expect(screen.getByText('-25')).toBeTruthy()
    expect(screen.getByText('+50')).toBeTruthy()
    expect(screen.getByText('-23')).toBeTruthy()
    expect(screen.getByText('+10')).toBeTruthy()
  })

  it('always presents damage values with a minus sign', () => {
    const { rerender } = render(<DamageFloatText value={10} />)
    expect(screen.getByText('-10')).toBeTruthy()

    rerender(<DamageFloatText value={-10} />)
    expect(screen.getByText('-10')).toBeTruthy()
  })

  it('uses each skin default appearance and accepts overrides', () => {
    const { rerender } = render(<DamageFloatText />)
    expect(screen.getByText('-25')).toHaveStyle({ color: '#ff5a5a', '--gv-text-font-size': '3.5cqh' })

    rerender(<GainFloatText value={50} color="#123456" fontSize={4} />)
    expect(screen.getByText('+50')).toHaveStyle({ color: '#123456', '--gv-text-font-size': '4cqh' })
  })

  it('scales the entire float animation from its total duration input', () => {
    render(<DamageFloatText value={25} durationMs={2400} />)
    expect(screen.getByText('-25').parentElement).toHaveStyle({ '--gv-animation-duration': '2400ms' })
    expect(resolveNumericFloatDurationMs(undefined)).toBe(1100)
    expect(resolveNumericFloatDurationMs(0)).toBe(1100)
  })

  it('does not advance runtime RNG when a random formula is evaluated repeatedly', () => {
    const rng = createRng(0)
    const runtimeCtx: SkinCtx = {
      ...ctx,
      condition: {
        state: {
          vars: { bonus: 3 },
          entities: { hero: { attrs: { hp: 100, attack: 20 } } },
          flags: {},
          score: 0,
          rng,
        },
        visited: new Set(),
      },
    }
    const value = { expr: 'floor((entity.hero.attr.attack + var.bonus) * (0.85 + rand() * 0.3) * (1 + chance(1) * 0.5))' }
    const before = rng.getState()
    const first = resolveNumericFloatValue(value, runtimeCtx)
    const second = resolveNumericFloatValue(value, runtimeCtx)

    expect(second).toBe(first)
    expect(rng.getState()).toEqual(before)
  })
})
