/**
 * 叩击（component id: `InkKou`）—— 组件只发出「叩」事件。
 * 位置与显示时段由外部 Overlay 编排；组件内部只负责显示与交互。
 */
import { useEffect, useRef, useState } from 'react'
import { usePlayerKeyGate, type OverlayProps } from '../../rendererRegistry'
import type { ComponentManifest } from '@/runtime/schema/node-config-schema'
import { injectCss, ensureInkFilters, ensureBrushFont, previewTStyle } from './skinRuntime'

export const InkKouManifest: ComponentManifest = {
  id: 'InkKou',
  label: '叩击',
  events: [{ id: 'kou', label: '叩' }],
  inputs: [{ key: 'triggerKey', label: '触发按键', valueType: 'string', default: 'A' }],
}

export function InkKou({ emit, overlay, preview, previewTimeMs }: OverlayProps) {
  injectCss('ink-kou-layer', KOU_CSS)
  ensureInkFilters()
  ensureBrushFont()
  const knockedRef = useRef(false)
  const [exiting, setExiting] = useState(false)
  const keyOk = usePlayerKeyGate()
  const triggerKey = typeof overlay.inputs.triggerKey === 'string' && overlay.inputs.triggerKey.trim()
    ? overlay.inputs.triggerKey.trim()
    : 'A'

  function knock(): void {
    if (preview || knockedRef.current) return
    knockedRef.current = true
    setExiting(true)
    emit?.('kou')
  }

  useEffect(() => {
    if (preview) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || !keyOk() || event.key.localeCompare(triggerKey, undefined, { sensitivity: 'accent' }) !== 0) return
      event.preventDefault()
      knock()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [keyOk, preview, triggerKey])

  return (
    <div
      className={`pvn-opts pvn-opts--kou show${preview ? ' is-frozen' : ''}${exiting ? ' is-exiting' : ''}`}
      style={preview ? previewTStyle(previewTimeMs ?? 0) : undefined}
      aria-label="叩击"
    >
      <button type="button" className="pvn-opt pvn-opt--kou" aria-label="叩" data-overlay-fit-target disabled={preview} onClick={knock}>
        <span className="pvn-kou-orn" aria-hidden="true">
          <i className="pvn-kou-dot" />
          <i className="pvn-kou-diamond" />
          <i className="pvn-kou-dot" />
        </span>
        <span className="pvn-kou-glyph">叩</span>
        <span className="pvn-kou-hint" aria-hidden="true">
          <i className="pvn-kou-space">{triggerKey}</i>
        </span>
      </button>
    </div>
  )
}

// 「叩」字号用 cqh/cqmin（相对舞台，见 VideoOverlayStage.tsx 的 containerType:'size'）取代 vw，
// vw 相对浏览器视口，预览小窗和全屏试玩里同一份配置会呈现出完全不同的物理大小。
const KOU_CSS = `
.pvn-opts--kou{position:relative;inline-size:100%;block-size:100%;min-inline-size:72px;min-block-size:112px;z-index:6;display:flex;align-items:center;justify-content:center;pointer-events:none;}
.pvn-opts--kou.show{pointer-events:auto;}
.pvn-opts--kou.is-frozen{pointer-events:none!important;}
.pvn-opts--kou.is-exiting{pointer-events:none;animation:pvnKouExit .32s ease-in forwards;}
.pvn-opts--kou.is-frozen .pvn-kou-orn,.pvn-opts--kou.is-frozen .pvn-kou-glyph,.pvn-opts--kou.is-frozen .pvn-kou-hint{animation-play-state:paused;}
.pvn-opts--kou.is-frozen .pvn-kou-orn{animation-delay:calc(0s - var(--preview-t,0ms));}
.pvn-opts--kou.is-frozen .pvn-kou-glyph,.pvn-opts--kou.is-frozen .pvn-kou-hint{animation-delay:calc(0.12s - var(--preview-t,0ms));}
.pvn-opt--kou{border:none;background:none;cursor:pointer;padding:0;display:flex;flex-direction:column;align-items:center;gap:2px;color:#f8f4ec;}
.pvn-kou-orn{width:18px;height:28px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;opacity:.94;animation:pvnKouOrnIn .5s ease both;}
.pvn-kou-dot{width:3px;height:3px;border-radius:50%;background:rgba(255,255,255,.88);box-shadow:0 0 6px rgba(255,255,255,.35);}
.pvn-kou-diamond{width:10px;height:10px;position:relative;transform:rotate(45deg);border:1.5px solid rgba(255,255,255,.9);border-radius:1px;}
.pvn-kou-diamond::after{content:'';position:absolute;left:50%;top:50%;width:5px;height:5px;transform:translate(-50%,-50%);background:rgba(255,255,255,.92);border-radius:1px;}
.pvn-kou-glyph{font-family:'HYShangWei','STKaiti','KaiTi',serif;font-size:clamp(4cqh,6cqmin,9cqh);font-weight:800;line-height:1;letter-spacing:.08em;color:#f8f4ec;text-shadow:0 0 16px rgba(255,248,235,.28),0 0 2px rgba(255,255,255,.35);animation:pvnKouGlyphIn .48s cubic-bezier(.22,.92,.28,1) .12s both;}
.pvn-opt--kou:hover .pvn-kou-glyph{text-shadow:0 0 22px rgba(255,248,235,.38),0 0 2px rgba(255,255,255,.45);}
.pvn-kou-hint{display:flex;align-items:center;justify-content:center;margin-top:4px;pointer-events:none;animation:pvnKouGlyphIn .48s cubic-bezier(.22,.92,.28,1) .12s both;}
.pvn-kou-space{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:1.5em;height:1.5em;position:relative;background:transparent;border:1.5px solid rgba(244,239,228,.94);border-radius:50%;color:#f8f4ec;font-family:'HYShangWei','STKaiti','KaiTi',serif;font-size:1.35cqh;font-style:normal;font-weight:800;line-height:1;box-shadow:0 0 10px rgba(255,248,235,.12);}
@keyframes pvnKouOrnIn{from{opacity:0;transform:translateY(10px)}to{opacity:.94;transform:translateY(0)}}
@keyframes pvnKouGlyphIn{from{opacity:0;transform:scale(1.1) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes pvnKouExit{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(-12px) scale(.94)}}
`
