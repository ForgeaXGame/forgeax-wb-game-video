import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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
        attrs: { hp: 240, hpMax: 300, defense: 10 },
        attrMax: { hp: 300, hpMax: 300, defense: 10 },
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

describe('numeric hp bar components', () => {
  it('declares only the values each component needs', () => {
    expect(BattlePlayerHpBarManifest.inputs?.map((input) => input.key)).toEqual([
      'label',
      'current',
      'max',
      'qi',
      'qiMax',
    ])
    expect(BattlePlayerHpBarManifest.inputs).toEqual(expect.arrayContaining([
      { key: 'label', label: '显示名', valueType: 'string', default: '我方', component: 'numberExpr' },
      { key: 'current', label: '血量', valueType: 'number', required: true, component: 'numberExpr' },
      { key: 'max', label: '最大血量', valueType: 'number', required: true, component: 'numberExpr' },
      { key: 'qi', label: '当前气力', valueType: 'number', component: 'numberExpr', default: 3 },
      { key: 'qiMax', label: '气力上限', valueType: 'number', component: 'numberExpr', default: 5 },
    ]))
    expect(BattleEnemyHpBarManifest.inputs?.map((input) => input.key)).toEqual([
      'label',
      'current',
      'max',
    ])
    expect(BattleEnemyHpBarManifest.inputs).toEqual(expect.arrayContaining([
      { key: 'label', label: '显示名', valueType: 'string', default: '敌方', component: 'numberExpr' },
      { key: 'current', label: '血量', valueType: 'number', required: true, component: 'numberExpr' },
      { key: 'max', label: '最大血量', valueType: 'number', required: true, component: 'numberExpr' },
    ]))
  })

  it('reads direct entity expressions for current, max, and qi', () => {
    const player = render(
      <BattlePlayerHpBar
        overlay={{
          elementId: 'player',
          component: 'BattlePlayerHpBar',
          inputs: {
            current: { expr: 'entity.ent-player.attr.hp' },
            max: { expr: 'entity.ent-player.attr.hpMax' },
          },
        }}
        ctx={ctx}
      />,
    )
    expect(fillWidth(player.container, '.ks-hud-hp-fill')).toBe('50%')
    expect(player.container.querySelector('.ks-hud-rage')?.getAttribute('aria-label')).toBe('气力 2/5')
    player.unmount()

    const enemy = render(
      <BattleEnemyHpBar
        overlay={{
          elementId: 'enemy',
          component: 'BattleEnemyHpBar',
          inputs: {
            current: { expr: 'entity.ent-boss.attr.hp' },
            max: { expr: 'entity.ent-boss.attr.hpMax' },
          },
        }}
        ctx={ctx}
      />,
    )
    expect(fillWidth(enemy.container, '.ks-hud-boss-fill')).toBe('80%')
  })

  it('reads arbitrary entity properties through direct expressions', () => {
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
    const { container } = render(
      <BattleEnemyHpBar
        overlay={{
          elementId: 'custom-entity',
          component: 'BattleEnemyHpBar',
          inputs: {
            current: { expr: 'entity.ent-0.attr.vitality' },
            max: 90,
          },
        }}
        ctx={customCtx}
      />,
    )

    expect(fillWidth(container, '.ks-hud-boss-fill')).toBe('50%')
  })

  it('allows constants, state bindings, and formulas to override HUD values', () => {
    const { container } = render(
      <BattlePlayerHpBar
        overlay={{
          elementId: 'player-overrides',
          component: 'BattlePlayerHpBar',
          inputs: {
            current: 'entity.ent-player.attr.attack + var.qi',
            max: 44,
            qi: { expr: 'var.qi + 1' },
            qiMax: { expr: 'var.qi + 2' },
            label: { ref: 'entity.ent-player.name' },
          },
        }}
        ctx={ctx}
      />,
    )

    expect(fillWidth(container, '.ks-hud-hp-fill')).toBe('50%')
    expect(container.querySelector('.ks-hud-rage')?.getAttribute('aria-label')).toBe('气力 3/4')
    expect(container.querySelector('.ks-hud-hp-name')?.textContent).toBe('空藏')
  })

  it('lets current and max independently select entity properties', () => {
    const { container } = render(
      <BattlePlayerHpBar
        overlay={{
          elementId: 'player-bound-max',
          component: 'BattlePlayerHpBar',
          inputs: {
            current: { expr: 'entity.ent-player.attr.hp' },
            max: { expr: 'entity.ent-player.attr.hpMax' },
          },
        }}
        ctx={ctx}
      />,
    )

    expect(fillWidth(container, '.ks-hud-hp-fill')).toBe('50%')
  })
})
