/**
 * 战斗技能条（component id: `BattleSkill`）。
 * 按键由 RuntimeComponentHost 以扁平 props 传入；此处只展示与交互。
 */
import { useEffect, useRef, useState } from 'react'
import { usePlayerKeyGate } from '../../rendererRegistry'
import type { ComponentManifest } from '@/runtime/schema/node-config-schema'
import { injectCss, ensureInkFilters, ensureBrushFont } from './skinRuntime'

export const BattleSkillManifest: ComponentManifest = {
  id: 'BattleSkill',
  label: '战斗技能条',
  events: [
    { id: 'light', label: '轻攻击' },
    { id: 'heavy', label: '重攻击' },
    { id: 'medit', label: '冥想' },
    { id: 'ult', label: '灭世' },
  ],
  inputs: [
    { key: 'lightKey', label: '轻攻击按键', valueType: 'string', default: 'X' },
    { key: 'heavyKey', label: '重攻击按键', valueType: 'string', default: 'A' },
    { key: 'meditKey', label: '冥想按键', valueType: 'string', default: 'S' },
    { key: 'ultKey', label: '灭世按键', valueType: 'string', default: 'B' },
  ],
}

export interface BattleSkillProps {
  lightKey?: string
  heavyKey?: string
  meditKey?: string
  ultKey?: string
  emit?: (key: string) => void
  preview?: boolean
}

export function BattleSkill({
  lightKey: lightKeyInput = 'X',
  heavyKey: heavyKeyInput = 'A',
  meditKey: meditKeyInput = 'S',
  ultKey: ultKeyInput = 'B',
  emit,
  preview,
}: BattleSkillProps) {
  injectCss('battle-skill-layer', SKILL_CSS)
  ensureInkFilters()
  ensureBrushFont()
  const pickedRef = useRef(false)
  const [picked, setPicked] = useState<string | null>(null)
  const keyOk = usePlayerKeyGate()
  const lightKey = resolveKey(lightKeyInput, 'X')
  const heavyKey = resolveKey(heavyKeyInput, 'A')
  const meditKey = resolveKey(meditKeyInput, 'S')
  const ultKey = resolveKey(ultKeyInput, 'B')

  function pick(id: string): void {
    if (preview || pickedRef.current) return
    pickedRef.current = true
    setPicked(id)
    emit?.(id)
  }

  useEffect(() => {
    if (preview) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || !keyOk()) return
      if (sameKey(event.key, lightKey)) pick('light')
      else if (sameKey(event.key, heavyKey)) pick('heavy')
      else if (sameKey(event.key, meditKey)) pick('medit')
      else if (sameKey(event.key, ultKey)) pick('ult')
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [heavyKey, keyOk, lightKey, meditKey, preview, ultKey])

  return (
    <div className="pvb-skills" aria-label="技能选择">
      <button type="button" className={`pvb-skill${picked === 'light' ? ' selected' : ''}`} aria-label={`轻攻击 ${lightKey}`} disabled={preview || !!picked} onClick={() => pick('light')}>
        <span className="pvb-sk-key" aria-hidden="true">{lightKey}</span>
        <span className="pvb-sk-nm">轻攻击</span>
      </button>
      <button type="button" className={`pvb-skill${picked === 'heavy' ? ' selected' : ''}`} aria-label={`重攻击 ${heavyKey}`} disabled={preview || !!picked} onClick={() => pick('heavy')}>
        <span className="pvb-sk-key" aria-hidden="true">{heavyKey}</span>
        <span className="pvb-sk-nm">重攻击</span>
      </button>
      <button type="button" className={`pvb-skill${picked === 'medit' ? ' selected' : ''}`} aria-label={`冥想 ${meditKey}`} disabled={preview || !!picked} onClick={() => pick('medit')}>
        <span className="pvb-sk-key" aria-hidden="true">{meditKey}</span>
        <span className="pvb-sk-nm">冥想</span>
      </button>
      <button type="button" className={`pvb-skill${picked === 'ult' ? ' selected' : ''}`} aria-label={`灭世 ${ultKey}`} disabled={preview || !!picked} onClick={() => pick('ult')}>
        <span className="pvb-sk-key" aria-hidden="true">{ultKey}</span>
        <span className="pvb-sk-nm">灭世</span>
      </button>
    </div>
  )
}

function resolveKey(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function sameKey(key: string, expected: string): boolean {
  return key.localeCompare(expected, undefined, { sensitivity: 'accent' }) === 0
}

const SKILL_CSS = `
.pvb-skills{position:relative;inline-size:100%;block-size:100%;z-index:44;display:flex;gap:2.4cqmin;justify-content:center;align-items:center;pointer-events:none}
.pvb-skill{display:inline-flex;align-items:center;justify-content:center;gap:.55cqh;cursor:pointer;background:none;border:none;padding:4px;color:#fbf6ec;transition:transform .14s ease,opacity .14s ease;pointer-events:auto}
.pvb-sk-key{display:flex;align-items:center;justify-content:center;inline-size:4.6cqh;block-size:4.6cqh;box-sizing:border-box;border:1.5px solid rgba(239,231,214,.5);border-radius:50%;background:linear-gradient(180deg,#2b2620,#0c0a08);box-shadow:0 2px 6px rgba(0,0,0,.5) inset,0 2px 7px rgba(0,0,0,.6);color:#efe7d6;filter:url(#inkRough);font-family:system-ui,sans-serif;font-size:1.7cqh;font-weight:600;line-height:1}
.pvb-skill:hover:not(:disabled){transform:translateY(-2px) scale(1.03)}
.pvb-skill.selected{transform:translateY(-3px) scale(1.04)}
.pvb-skill.selected .pvb-sk-key{border-color:#5fe08a;background:linear-gradient(180deg,#234a32,#0e2417);box-shadow:0 0 20px rgba(95,224,138,.8),0 2px 6px rgba(0,0,0,.5) inset}
.pvb-skill:disabled{opacity:.38;cursor:not-allowed}
.pvb-sk-nm{font-family:'HYShangWei','STKaiti','KaiTi',serif;font-size:2.1cqh;letter-spacing:.06em;text-shadow:0 2px 5px rgba(0,0,0,.85)}
`
