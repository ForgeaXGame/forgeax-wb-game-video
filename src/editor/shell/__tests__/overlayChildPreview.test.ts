/**
 * 回归：时间轴预览必须能画挂载方案里的新规格组件。
 * 表现层统一走 overlay 表 + skinCtx 绘制时 resolve。
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createCoreSkinRegistry, registerCoreSkins } from '../../../runtime/component-host/components'
import { renderOverlayChildPreview } from '../overlayChildPreview'
import type { SkinCtx } from '../../../runtime/component-host/rendererRegistry'
import type { OverlayChild } from '../../../runtime/schema/graph-schema'

beforeAll(() => {
    registerCoreSkins()
})

function hudEnt(hp: number, maxHp: number) {
  return { hp, maxHp, attrs: { hp }, attrMax: { hp: maxHp } }
}

const ctx: SkinCtx = {
  hud: {
    entities: {
      'ent-player': hudEnt(72, 100),
      'ent-boss': hudEnt(58, 100),
    },
    vars: { qi: 3 },
    flags: {},
    score: 0,
  },
}

describe('overlayChildPreview · 时间轴预览', () => {
  it('我方新规格血条能渲出 DOM', () => {
    const reg = createCoreSkinRegistry()
    const child: OverlayChild = {
      id: 'hp-player',
      component: 'battlePlayerHpBar',
      inputs: { current: 72, max: 100, label: '我方', qi: 3, qiMax: 5 },
    }
    const html = renderToStaticMarkup(
      renderOverlayChildPreview(child, reg, ctx, 0) as ReactElement,
    )
    expect(html).toContain('ks-hud-hp')
    expect(html).toContain('我方')
  })

  it('敌方血条同样可预览', () => {
    const reg = createCoreSkinRegistry()
    const child: OverlayChild = {
      id: 'hp-boss',
      component: 'battleEnemyHpBar',
      inputs: { current: 58, max: 100, label: '敌方' },
    }
    const html = renderToStaticMarkup(
      renderOverlayChildPreview(child, reg, ctx, 0) as ReactElement,
    )
    expect(html).toContain('ks-hud-boss')
    expect(html).toContain('敌方')
  })

  it('伤害与增益飘字预览使用稳定 fit target 且不播放位移动画', () => {
    const reg = createCoreSkinRegistry()
    for (const component of ['damageFloatText', 'gainFloatText']) {
      const child: OverlayChild = { id: component, component, inputs: {} }
      const html = renderToStaticMarkup(
        renderOverlayChildPreview(child, reg, ctx, 400) as ReactElement,
      )
      expect(html).toContain('is-preview')
      expect(html).toContain('data-overlay-fit-target')
    }
  })
})

describe('overlayChildPreview · 泛用预览时钟（preview/previewTimeMs 透传）', () => {
  it('新规格 inkYingMo 预览冻结交互且按钮禁用', () => {
    const reg = createCoreSkinRegistry()
    const child: OverlayChild = { id: 'c1', component: 'inkYingMo', inputs: {}, window: { startMs: 1000 } }
    // 播放头 1300ms、child 于 1000ms 进场 → localMs = 300ms。
    const html = renderToStaticMarkup(
      renderOverlayChildPreview(child, reg, ctx, 1300) as ReactElement,
    )
    expect(html).toContain('is-frozen')
    expect(html).toContain('--preview-t:300ms')
    expect(html).toContain('disabled=""')
  })

  it('新规格 inkKou 预览冻结交互', () => {
    const reg = createCoreSkinRegistry()
    const child: OverlayChild = { id: 'c2', component: 'inkKou', inputs: {} }
    const html = renderToStaticMarkup(
      renderOverlayChildPreview(child, reg, ctx, 400) as ReactElement,
    )
    expect(html).toContain('is-frozen')
    expect(html).toContain('--preview-t:400ms')
    expect(html).toContain('disabled=""')
  })
})
