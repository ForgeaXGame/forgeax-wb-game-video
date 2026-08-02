/**
 * 增益飘字（component id: `GainFloatText`）。
 * value 由 RuntimeComponentHost 解析；此处只负责增益符号与展示。
 */
import type { ReactNode } from 'react'
import type { ComponentManifest } from '@/runtime/schema/node-config-schema'
import { animationTimingStyle, injectCss, ensureBrushFont, resolveTextAppearance, type TextAppearanceInputs } from './skinRuntime'

export const GainFloatTextManifest: ComponentManifest = {
  id: 'GainFloatText',
  label: '增益飘字',
  inputs: [
    { key: 'value', label: '数值', valueType: 'number', component: 'numberExpr', default: 50 },
    { key: 'color', label: '字色', valueType: 'string', component: 'color', default: '#ffd54a' },
    { key: 'fontSize', label: '字号', valueType: 'number', default: 3.5 },
    { key: 'durationMs', label: '总时长ms', valueType: 'number', default: 1100 },
  ],
  events: [],
}

export interface GainFloatTextProps {
  value?: number
  color?: string
  fontSize?: number
  durationMs?: number
  preview?: boolean
  previewTimeMs?: number
  previewPlaying?: boolean
}

export function GainFloatText({
  value = 50,
  color,
  fontSize,
  durationMs = 1100,
  preview,
  previewTimeMs,
  previewPlaying,
}: GainFloatTextProps): ReactNode {
  injectCss('gain-float-text', GAIN_FLOAT_TEXT_CSS)
  ensureBrushFont()
  const text = signedText(value)
  const textStyle = resolveTextAppearance({ color, fontSize } as TextAppearanceInputs, { color: '#ffd54a', fontSize: 3.5 })
  const frozen = preview && !previewPlaying
  return (
    <div
      className={`gv-gain-float-text${frozen ? ' is-preview-frozen' : ''}`}
      style={animationTimingStyle(durationMs, frozen ? previewTimeMs ?? 0 : undefined)}
    >
      <span data-overlay-fit-target style={textStyle}>{text}</span>
    </div>
  )
}

function signedText(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value
  return normalized > 0 ? `+${normalized}` : String(normalized)
}

const GAIN_FLOAT_TEXT_CSS = `
.gv-gain-float-text{position:relative;inline-size:100%;block-size:100%;display:flex;align-items:center;justify-content:center;pointer-events:none}
.gv-gain-float-text span{font-family:'HYShangWei','STKaiti','KaiTi',serif;font-size:var(--gv-text-font-size,3.5cqh);font-weight:800;text-shadow:0 2px 6px rgba(0,0,0,.8);white-space:nowrap;animation:gv-gain-floatup var(--gv-animation-duration,1100ms) ease-out forwards}
.gv-gain-float-text.is-preview-frozen span{animation-play-state:paused;animation-delay:calc(0ms - var(--preview-t,0ms))}
@keyframes gv-gain-floatup{0%{opacity:0;transform:translateY(-20%) scale(.9)}15%{opacity:1;transform:translateY(-60%) scale(1.1)}100%{opacity:0;transform:translateY(-140%) scale(1)}}
`
