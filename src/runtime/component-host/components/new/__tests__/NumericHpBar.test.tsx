// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createCoreSkinRegistry } from '../../index'
import type { SkinCtx } from '../../../rendererRegistry'
import { BattleEnemyHpBar, BattleEnemyHpBarManifest } from '../BattleEnemyHpBar'
import { BattlePlayerHpBar, BattlePlayerHpBarManifest } from '../BattlePlayerHpBar'

afterEach(cleanup)

const ctx: SkinCtx = {
  hud: {
    entities: {
      'ent-player': {
        name: '空藏',
        hp: 75,
        maxHp: 100,
        attrs: { hp: 75, hpMax: 150, attack: 20 },
        attrMax: { hp: 100, hpMax: 150, attack: 20 },
      },
      'ent-boss': {
        name: '小怪',
        hp: 240,
        maxHp: 300,
        attrs: { hp: 240, defense: 10 },
        attrMax: { hp: 300, defense: 10 },
      },
    },
    vars: { qi: 2 },
    flags: {},
    score: 0,
  },
}

function fillWidth(container: HTMLElement, selector: string): string {
  return (container.querySelector(selector) as HTMLElement).style.width
}

function renderViaHost(
  component: string,
  inputs: Record<string, unknown>,
  skinCtx: SkinCtx = ctx,
): ReturnType<typeof render> {
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

describe('numeric hp bar components', () => {
  it('declare entity binding and optional numeric overrides', () => {
    expect(BattlePlayerHpBarManifest.inputs?.map((input) => input.key)).toEqual([
      'bind',
      'attr',
      'label',
      'current',
      'max',
      'qi',
      'qiMax',
    ])
    expect(BattleEnemyHpBarManifest.inputs?.map((input) => input.key)).toEqual([
      'bind',
      'attr',
      'label',
      'current',
      'max',
    ])
  })

  it('Host resolves entity bind into flat current/max for the leaf', () => {
    const player = renderViaHost('BattlePlayerHpBar', { bind: 'ent-player', attr: 'hp' })
    expect(fillWidth(player.container, '.ks-hud-hp-fill')).toBe('75%')
    expect(player.container.querySelector('.ks-hud-rage')?.getAttribute('aria-label')).toBe('气力 2/5')
    player.unmount()

    const enemy = renderViaHost('BattleEnemyHpBar', { bind: 'ent-boss', attr: 'hp' })
    expect(fillWidth(enemy.container, '.ks-hud-boss-fill')).toBe('80%')
  })

  it('binds arbitrary rule entity and property ids at runtime', () => {
    const customCtx: SkinCtx = {
      hud: {
        entities: {
          'ent-0': {
            name: '悟空',
            hp: 0,
            maxHp: 0,
            attrs: { vitality: 45 },
            attrMax: { vitality: 90 },
          },
        },
        vars: {},
        flags: {},
        score: 0,
      },
    }
    const { container } = renderViaHost(
      'BattleEnemyHpBar',
      { bind: 'ent-0', attr: 'vitality' },
      customCtx,
    )
    expect(fillWidth(container, '.ks-hud-boss-fill')).toBe('50%')
  })

  it('allows constants, state bindings, and formulas via Host', () => {
    const { container } = renderViaHost('BattlePlayerHpBar', {
      current: 'entity.ent-player.attr.attack + var.qi',
      max: 44,
      qi: { expr: 'var.qi + 1' },
      qiMax: { expr: 'var.qi + 2' },
      label: { ref: 'entity.ent-player.name' },
    })

    expect(fillWidth(container, '.ks-hud-hp-fill')).toBe('50%')
    expect(container.querySelector('.ks-hud-rage')?.getAttribute('aria-label')).toBe('气力 3/4')
    expect(container.querySelector('.ks-hud-hp-name')?.textContent).toBe('空藏')
  })

  it('keeps the current value bound while max reads any selected entity property', () => {
    const { container } = renderViaHost('BattlePlayerHpBar', {
      bind: 'ent-player',
      attr: 'hp',
      max: { expr: 'entity.ent-player.attr.hpMax' },
    })

    expect(fillWidth(container, '.ks-hud-hp-fill')).toBe('50%')
  })

  it('leaf reads already-resolved flat props', () => {
    const { container } = render(
      <BattleEnemyHpBar current={45} max={90} label="悟空" />,
    )
    expect(fillWidth(container, '.ks-hud-boss-fill')).toBe('50%')
    expect(container.querySelector('.ks-hud-boss-name')?.textContent).toBe('悟空')
  })
})
