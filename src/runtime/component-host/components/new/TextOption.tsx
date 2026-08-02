/**
 * 文字交互（component id: `TextOption`）—— 显示居中文字，并发出唯一的「交互」事件。
 * 键盘/点击等输入如何路由到该事件由外层编排；本组件仅处理直接点击与原生按钮键盘激活。
 */
import { useEffect, useRef, type ReactNode } from 'react'
import type { ComponentManifest } from '@/runtime/schema/node-config-schema'
import { usePlayerKeyGate, type OverlayProps } from '../../rendererRegistry'
import { injectCss, resolveTextAppearance, type TextAppearanceInputs } from './skinRuntime'

export const TextOptionManifest: ComponentManifest = {
  id: 'TextOption',
  label: '文字交互',
  inputs: [
    { key: 'text', label: '文字', valueType: 'string', default: '交互' },
    { key: 'color', label: '字色', valueType: 'string', component: 'color', default: '#f0f0f0' },
    { key: 'fontSize', label: '字号', valueType: 'number', default: 2.4 },
    { key: 'triggerKey', label: '触发按键', valueType: 'string', default: 'F' },
  ],
  events: [{ id: 'activate', label: '交互' }],
}

export function TextOption({ overlay, emit, preview }: OverlayProps): ReactNode {
  injectCss('text-option', TEXT_OPTION_CSS)
  const activatedRef = useRef(false)
  const keyOk = usePlayerKeyGate()
  const text = typeof overlay.inputs.text === 'string' && overlay.inputs.text ? overlay.inputs.text : '交互'
  const triggerKey = typeof overlay.inputs.triggerKey === 'string' && overlay.inputs.triggerKey.trim()
    ? overlay.inputs.triggerKey.trim()
    : 'F'
  const textStyle = resolveTextAppearance(overlay.inputs as TextAppearanceInputs, { color: '#f0f0f0', fontSize: 2.4 })

  function activate(): void {
    if (preview || activatedRef.current) return
    activatedRef.current = true
    emit?.('activate')
  }

  useEffect(() => {
    if (preview) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || !keyOk() || event.key.localeCompare(triggerKey, undefined, { sensitivity: 'accent' }) !== 0) return
      event.preventDefault()
      activate()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [emit, keyOk, preview, triggerKey])

  return (
    <div className="gv-text-option">
      <button
        type="button"
        className="gv-text-option-button"
        aria-label={`${triggerKey} ${text}`}
        data-overlay-fit-target
        disabled={preview}
        onClick={activate}
        style={textStyle}
      >
        <span className="gv-text-option-key" aria-hidden="true">{triggerKey}</span>
        <span>{text}</span>
      </button>
    </div>
  )
}

const TEXT_OPTION_CSS = `
.gv-text-option{position:relative;inline-size:100%;block-size:100%;display:flex;align-items:center;justify-content:center;pointer-events:none}
.gv-text-option-button{display:inline-flex;align-items:center;justify-content:center;gap:.35em;border:0;background:transparent;padding:0;cursor:pointer;font:inherit;font-size:var(--gv-text-font-size,2.4cqh);font-weight:700;line-height:1.5;text-align:center;text-shadow:0 2px 6px rgba(0,0,0,.7);pointer-events:auto}
.gv-text-option-key{font-family:system-ui,sans-serif;font-size:.86em;font-weight:500;letter-spacing:0}
.gv-text-option-button:hover:not(:disabled){filter:brightness(1.2)}
.gv-text-option-button:focus-visible{outline:1px solid currentColor;outline-offset:4px}
.gv-text-option-button:disabled{cursor:default}
`
