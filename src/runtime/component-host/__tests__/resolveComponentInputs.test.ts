import { describe, expect, it } from 'vitest'
import type { ComponentManifest } from '../../schema/node-config-schema'
import type { SkinCtx } from '../rendererRegistry'
import { resolveComponentInputs } from '../resolveComponentInputs'

const manifest: ComponentManifest = {
  id: 'BattleEnemyHpBar',
  inputs: [
    { key: 'bind', label: '实体', valueType: 'string', component: 'entity' },
    { key: 'attr', label: '属性', valueType: 'string', component: 'attr' },
    { key: 'label', label: '显示名', valueType: 'string', default: '敌方', component: 'numberExpr' },
    { key: 'current', label: '血量', valueType: 'number', component: 'numberExpr' },
    { key: 'max', label: '血量上限', valueType: 'number', component: 'numberExpr' },
  ],
  events: [],
}

const ctx: SkinCtx = {
  hud: {
    entities: {
      'ent-boss': {
        name: '小怪',
        hp: 650,
        maxHp: 700,
        attrs: { hp: 650, hpMax: 700 },
        attrMax: { hp: 700, hpMax: 700 },
      },
    },
    vars: {},
    flags: {},
    score: 0,
  },
}

describe('resolveComponentInputs', () => {
  it('resolves numberExpr and drops bind/attr from flat props', () => {
    const resolved = resolveComponentInputs(
      manifest,
      {
        bind: 'ent-boss',
        attr: 'hp',
        label: '小怪',
        current: { expr: 'entity.ent-boss.attr.hp' },
        max: 700,
      },
      ctx,
    )

    expect(resolved.bind).toBeUndefined()
    expect(resolved.attr).toBeUndefined()
    expect(resolved.label).toBe('小怪')
    expect(resolved.current).toBe(650)
    expect(resolved.max).toBe(700)
  })

  it('resolves parameter formulas into display strings', () => {
    const floatManifest: ComponentManifest = {
      id: 'DamageFloatText',
      inputs: [
        { key: 'fixedText', valueType: 'string', default: '' },
        { key: 'parameter', valueType: 'string', default: '-25' },
        { key: 'durationMs', valueType: 'number', default: 1100 },
      ],
      events: [],
    }
    const resolved = resolveComponentInputs(
      floatManifest,
      { parameter: { expr: '-(entity.ent-boss.attr.hp - 600)' } },
      ctx,
    )
    expect(resolved.parameter).toBe('-50')
    expect(resolved.durationMs).toBe(1100)
  })

  it('applies bind/attr baseline for literal current (nodia-style)', () => {
    const boundCtx: SkinCtx = {
      hud: {
        entities: {
          'ent-boss': {
            hp: 350,
            maxHp: 700,
            attrs: { hp: 350 },
            attrMax: { hp: 700 },
            initialAttrs: { hp: 700 },
          },
        },
        vars: {},
        flags: {},
        score: 0,
      },
    }
    const resolved = resolveComponentInputs(
      manifest,
      { bind: 'ent-boss', attr: 'hp', current: 700, max: 700 },
      boundCtx,
    )
    expect(resolved.current).toBe(350)
    expect(resolved.max).toBe(700)
  })
})
