/**
 * 伤害飘字（component id: `DamageFloatText`）—— 固定文本与动态参数直接拼接。
 */
import type { ReactNode } from 'react'
import type { ComponentManifest } from '@/runtime/schema/node-config-schema'
import type { OverlayProps } from '../../rendererRegistry'
import { animationTimingStyle, injectCss, ensureBrushFont, resolveTextAppearance, type TextAppearanceInputs } from './skinRuntime'
import { resolveTextDurationMs, resolveTextParameter, type TextParameterInputs } from './textParameter'

export const DamageFloatTextManifest: ComponentManifest = {
  id: 'DamageFloatText',
  label: '伤害飘字',
  inputs: [
    { key: 'fixedText', label: '固定文本', valueType: 'string', default: '' },
    { key: 'parameter', label: '参数', valueType: 'string', default: '-25' },
    { key: 'color', label: '字色', valueType: 'string', component: 'color', default: '#ff5a5a' },
    { key: 'fontSize', label: '字号', valueType: 'number', default: 3.5 },
    { key: 'durationMs', label: '总时长ms', valueType: 'number', default: 1100 },
  ],
  events: [],
}

export function DamageFloatText({ overlay, ctx, preview, previewTimeMs }: OverlayProps): ReactNode {
  injectCss('damage-float-text', DAMAGE_FLOAT_TEXT_CSS)
  ensureBrushFont()
  const fixedText = typeof overlay.inputs.fixedText === 'string' ? overlay.inputs.fixedText : ''
  const text = `${fixedText}${resolveTextParameter((overlay.inputs as TextParameterInputs).parameter, ctx, '-25')}`
  const textStyle = resolveTextAppearance(overlay.inputs as TextAppearanceInputs, { color: '#ff5a5a', fontSize: 3.5 })
  const durationMs = resolveTextDurationMs(overlay.inputs.durationMs)
  const frozen = preview
  return (
    <div
      className={`gv-damage-float-text${frozen ? ' is-preview-frozen' : ''}`}
      style={animationTimingStyle(durationMs, frozen ? previewTimeMs ?? 0 : undefined)}
    >
      <span data-overlay-fit-target style={textStyle}>{text}</span>
    </div>
  )
}

const DAMAGE_FLOAT_TEXT_CSS = `
.gv-damage-float-text{position:relative;inline-size:100%;block-size:100%;display:flex;align-items:center;justify-content:center;pointer-events:none}
.gv-damage-float-text span{font-family:'HYShangWei','STKaiti','KaiTi',serif;font-size:var(--gv-text-font-size,3.5cqh);font-weight:800;text-shadow:0 2px 6px rgba(0,0,0,.8);white-space:nowrap;animation:gv-damage-floatup var(--gv-animation-duration,1100ms) ease-out forwards}
.gv-damage-float-text.is-preview-frozen span{animation-play-state:paused;animation-delay:calc(0ms - var(--preview-t,0ms))}
@keyframes gv-damage-floatup{0%{opacity:0;transform:translateY(-20%) scale(.9)}15%{opacity:1;transform:translateY(-60%) scale(1.1)}100%{opacity:0;transform:translateY(-140%) scale(1)}}
`
