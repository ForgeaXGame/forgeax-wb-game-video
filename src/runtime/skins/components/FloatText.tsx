/**
 * 花字/飘字（component id: `floatText`）—— 契约 + 渲染同文件。
 */
import type { ReactNode } from 'react'
import type { ComponentDef } from '../../registry/component-registry'
import type { FloatTextParams } from '../../registry/core-components'
import { evalExpr } from '../../engine/expr'
import type { OverlayProps } from '../rendererRegistry'

function signed(v: number): string {
  return v > 0 ? `+${v}` : String(v)
}

function ensureFloatStyle(): void {
  if (typeof document === 'undefined' || document.getElementById('gv-float-style')) return
  const s = document.createElement('style')
  s.id = 'gv-float-style'
  s.textContent =
    '@keyframes gv-floatup{0%{opacity:0;transform:translate(-50%,-20%) scale(0.9)}15%{opacity:1;transform:translate(-50%,-60%) scale(1.1)}100%{opacity:0;transform:translate(-50%,-140%) scale(1)}}'
  document.head.appendChild(s)
}

/** 组件的注册契约（引擎/编辑器识别用）——与渲染同文件，经 EXTRA_COMPONENTS 注册。 */
export const floatTextComponent: ComponentDef<FloatTextParams> = {
  role: 'presentation',
  stageRelative: true,
  label: '花字/飘字',
  inputs: [
    { key: 'text', label: '文案', valueType: 'string', default: '' },
    { key: 'expr', label: '表达式', valueType: 'string' },
    { key: 'style', label: '样式', valueType: 'string', component: 'textStyle' },
    { key: 'x', label: 'x', valueType: 'number', default: 0.5 },
    { key: 'y', label: 'y', valueType: 'number', default: 0.45 },
    { key: 'durationMs', label: '时长ms', valueType: 'number' },
    { key: 'color', label: '兜底色', valueType: 'string', component: 'color' },
  ],
  validate: (p) => (p.text || p.expr ? [] : ['floatText 需要 text 或 expr']),
  render: (ctx, p) => {
    let display = p.text ?? ''
    if (p.expr) {
      const v = evalExpr(p.expr, ctx.state)
      display = p.text ? p.text.replace('{v}', signed(v)) : signed(v)
    }
    return [
      {
        type: 'renderOverlay',
        nodeId: ctx.nodeId,
        elementId: ctx.elementId ?? 'float',
        component: 'floatText',
        inputs: {
          text: display,
          x: p.x,
          y: p.y,
          color: p.color,
          style: p.style,
          durationMs: p.durationMs,
          enter: p.enter,
          exit: p.exit,
          float: true,
        },
      },
    ]
  },
}

export function FloatTextOverlay({ overlay }: OverlayProps): ReactNode {
  ensureFloatStyle()
  const p = overlay.inputs as { text?: string; x?: number; y?: number; color?: string; durationMs?: number }
  const dur = p.durationMs ?? 1100
  const neg = typeof p.text === 'string' && p.text.trim().startsWith('-')
  return (
    <div
      className="gv-float-text"
      style={{
        position: 'absolute',
        left: `${(p.x ?? 0.5) * 100}%`,
        top: `${(p.y ?? 0.42) * 100}%`,
        color: p.color ?? (neg ? '#ff5a5a' : '#ffd54a'),
        fontWeight: 800,
        fontSize: 28,
        textShadow: '0 2px 6px rgba(0,0,0,0.8)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        animation: `gv-floatup ${dur}ms ease-out forwards`,
      }}
    >
      {p.text}
    </div>
  )
}
