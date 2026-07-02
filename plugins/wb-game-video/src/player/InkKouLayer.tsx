import { useEffect, useRef } from 'react'
import type { BlueprintQte } from '../blueprint/blueprint-schema'
import type { QteOutcome, Scene } from '../scenario/types'
import { injectStyleOnce } from '../styles/injectStyle'

interface Props {
  qte: BlueprintQte
  onResolve: (outcome: QteOutcome) => void
}

export function isInkKouQte(scene: Scene | undefined): boolean {
  return scene?.ext?.qteUi === 'inkKou'
}

export function InkKouLayer({ qte, onResolve }: Props) {
  injectStyleOnce('ink-kou-layer', KOU_CSS)
  const resolvedRef = useRef(false)

  function finish(outcome: QteOutcome): void {
    if (resolvedRef.current) return
    resolvedRef.current = true
    onResolve(outcome)
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => finish('fail'), qte.timeoutMs ?? 1500)
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        finish('pass')
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('keydown', onKeyDown, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qte.timeoutMs])

  return (
    <div className="pvn-opts pvn-opts--kou" aria-label="叩 QTE">
      <button type="button" className="pvn-kou" onClick={() => finish('pass')}>
        <span className="pvn-kou-orn" aria-hidden />
        <span className="pvn-kou-glyph">叩</span>
        <span className="pvn-kou-hint">空格</span>
      </button>
    </div>
  )
}

const KOU_CSS = `
.pvn-opts--kou{position:absolute;left:58%;top:39%;transform:translate(-50%,-86%);z-index:6;pointer-events:auto;}
.pvn-kou{background:none;border:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;
  animation:pvnKouIn .48s cubic-bezier(.22,.92,.28,1) .12s both;}
.pvn-kou-orn{width:18px;height:28px;background:
  radial-gradient(circle at 50% 15%, #d9c7a0 0 3px, transparent 4px),
  radial-gradient(circle at 50% 85%, #d9c7a0 0 3px, transparent 4px);opacity:.85;}
.pvn-kou-glyph{font-family:'HYShangWei','STKaiti',serif;font-weight:800;font-size:clamp(2rem,5.5vw,3.2rem);
  color:#f4ead2;text-shadow:0 2px 10px rgba(0,0,0,.6);line-height:1;}
.pvn-kou-hint{font-size:.7rem;color:#cbb98f;opacity:0;animation:pvnKouHint .3s ease .5s forwards;}
@keyframes pvnKouIn{from{opacity:0;transform:translate(-50%,-80%) scale(1.1);}to{opacity:1;transform:translate(-50%,-86%) scale(1);}}
@keyframes pvnKouHint{to{opacity:1;}}
`
