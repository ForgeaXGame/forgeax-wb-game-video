import { useMemo } from 'react'
import type { Branch, Scene } from '../scenario/types'
import { injectStyleOnce } from '../styles/injectStyle'
import { isBranchAvailable, type EntityHpView, type ItemState, type VarState } from './conditionEval'

interface Props {
  scene: Scene
  onPick: (b: Branch) => void
  vars?: VarState
  visitedSceneIds?: string[]
  ownedItems?: ItemState
  entities?: Record<string, EntityHpView>
  score?: number
}

const KEY_HINTS = ['E', 'Q'] as const // 應 / 默

export function isInkYingMoChoice(scene: Scene | undefined): boolean {
  return scene?.ext?.choiceUi === 'inkYingMo'
}

export function InkYingMoLayer({ scene, onPick, vars, visitedSceneIds, ownedItems, entities, score }: Props) {
  injectStyleOnce('ink-yingmo-layer', YINGMO_CSS)
  const ctx = useMemo(() => ({
    vars: vars ?? {}, visitedSceneIds: new Set(visitedSceneIds ?? []),
    ownedItems: ownedItems ?? {}, entities: entities ?? {}, score: score ?? 0,
  }), [vars, visitedSceneIds, ownedItems, entities, score])
  const choices = useMemo(
    () => scene.branches.filter((b) => b.kind === 'choice' && isBranchAvailable(b, ctx)),
    [scene.branches, ctx],
  )
  return (
    <div className="pvn-opts pvn-opts--yingmo" aria-label="应默抉择">
      {choices.map((b, i) => (
        <button key={b.id} type="button" className="pvn-ym-key" onClick={() => onPick(b)}>
          <span className="pvn-ym-glyph">{b.label}</span>
          <span className="pvn-ym-hint">{KEY_HINTS[i] ?? ''}</span>
        </button>
      ))}
    </div>
  )
}

const YINGMO_CSS = `
.pvn-opts--yingmo{position:absolute;left:50%;bottom:12%;transform:translateX(-50%);z-index:6;
  display:flex;gap:14px;pointer-events:auto;}
.pvn-ym-key{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 22px;
  background:rgba(12,10,8,.82);border:1px solid rgba(217,199,160,.5);border-radius:10px;cursor:pointer;
  transition:transform .12s ease,border-color .12s ease;}
.pvn-ym-key:hover{transform:translateY(-2px);border-color:rgba(240,180,120,.85);}
.pvn-ym-glyph{font-family:'HYShangWei','STKaiti',serif;font-weight:800;font-size:1.6rem;color:#f4ead2;}
.pvn-ym-hint{font-size:.66rem;color:#cbb98f;}
`
