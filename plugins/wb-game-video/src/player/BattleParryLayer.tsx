import { useEffect, useRef, useState } from 'react'
import type { BlueprintQte } from '../blueprint/blueprint-schema'
import type { QteOutcome, Scene } from '../scenario/types'
import { injectStyleOnce } from '../styles/injectStyle'

interface Props {
  qte: BlueprintQte
  onResolve: (outcome: QteOutcome) => void
}

type KeyState = 'idle' | 'armed' | 'hit' | 'miss'

export function isBattleParryQte(scene: Scene | undefined): boolean {
  return scene?.ext?.qteUi === 'battleParry'
}

export function BattleParryLayer({ qte, onResolve }: Props) {
  injectStyleOnce('battle-parry-layer', PARRY_CSS)
  const resolvedRef = useRef(false)
  const hitsRef = useRef(0)
  const [keys, setKeys] = useState<[KeyState, KeyState]>(['armed', 'armed'])

  function finish(outcome: QteOutcome): void {
    if (resolvedRef.current) return
    resolvedRef.current = true
    onResolve(outcome)
  }

  function hit(index: 0 | 1): void {
    if (resolvedRef.current) return
    setKeys((prev) => {
      if (prev[index] === 'hit') return prev
      const next: [KeyState, KeyState] = [...prev] as [KeyState, KeyState]
      next[index] = 'hit'
      return next
    })
    hitsRef.current += 1
    if (hitsRef.current >= 2) {
      window.setTimeout(() => finish('pass'), 180)
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (hitsRef.current >= 2) finish('pass')
      else if (hitsRef.current === 1) finish('good')
      else {
        setKeys(['miss', 'miss'])
        window.setTimeout(() => finish('fail'), 180)
      }
    }, qte.timeoutMs ?? 2600)

    function onKeyDown(e: KeyboardEvent): void {
      const key = e.key.toLowerCase()
      if (key === 'a') {
        e.preventDefault()
        hit(0)
      } else if (key === 'b') {
        e.preventDefault()
        hit(1)
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
    <div className="pvb-parry show" aria-label="防反 QTE">
      <div className="pvb-parry-tip">防反 QTE</div>
      <div className="pvb-parry-keys">
        <ParryKey label="A" state={keys[0]} onPress={() => hit(0)} />
        <ParryKey label="B" state={keys[1]} onPress={() => hit(1)} />
      </div>
    </div>
  )
}

function ParryKey({
  label,
  state,
  onPress,
}: {
  label: 'A' | 'B'
  state: KeyState
  onPress: () => void
}) {
  return (
    <button
      type="button"
      className={`pvb-key ${state === 'armed' ? 'armed sweet' : ''} ${state === 'hit' ? 'good hit' : ''} ${state === 'miss' ? 'miss' : ''}`}
      onClick={onPress}
      disabled={state === 'hit' || state === 'miss'}
    >
      <span className="pvb-key-ring" />
      <span className="pvb-key-label">{label}</span>
      {state === 'hit' && <span className="pvb-key-spark" />}
    </button>
  )
}

const PARRY_CSS = `
.pvb-parry {
  position: absolute;
  right: 20%;
  top: 48%;
  transform: translateY(-50%);
  z-index: 46;
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
  pointer-events: auto;
}
.pvb-parry.show { display: flex; }
.pvb-parry-tip { display: none !important; }
.pvb-parry-keys { position: relative; width: 158px; height: 158px; }
.pvb-parry-keys .pvb-key:first-child { position: absolute; left: 0; bottom: 0; }
.pvb-parry-keys .pvb-key:last-child { position: absolute; right: 0; top: 0; }
.pvb-key {
  position: relative;
  width: 62px; height: 62px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: .5;
  transform: scale(.86);
  transition: opacity .14s, transform .14s, filter .14s;
  background: none;
  border: none;
  padding: 0;
}
.pvb-key::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: 52% 48% 50% 50% / 50% 52% 48% 50%;
  background: linear-gradient(180deg, #2b2620, #0c0a08);
  border: 1.5px solid rgba(239,231,214,.5);
  box-shadow: 0 2px 6px rgba(0,0,0,.5) inset, 0 2px 7px rgba(0,0,0,.6);
  transition: border-color .14s, background-color .14s;
}
.pvb-key.armed { opacity: 1; transform: scale(1.08); }
.pvb-key.armed::before {
  border-color: #5fe08a;
  box-shadow: 0 0 20px rgba(95,224,138,.8), 0 2px 6px rgba(0,0,0,.5) inset;
}
.pvb-key.good { opacity: 1; transform: scale(1.16); }
.pvb-key.good::before {
  border-color: #5fe08a;
  background: linear-gradient(180deg, #234a32, #0e2417);
  box-shadow: 0 0 22px rgba(95,224,138,.95);
}
.pvb-key.hit { animation: pvbKeyHit .4s ease; }
@keyframes pvbKeyHit {
  0% { transform: scale(1.5); }
  45% { transform: scale(.92); }
  100% { transform: scale(1.16); }
}
.pvb-key-spark {
  position: absolute;
  inset: -12px;
  border-radius: 50%;
  border: 2.5px solid #7dffae;
  pointer-events: none;
  z-index: 3;
  box-shadow: 0 0 18px rgba(125,255,174,.8);
  animation: pvbKeySpark .5s ease forwards;
}
@keyframes pvbKeySpark {
  0% { transform: scale(.45); opacity: .95; }
  100% { transform: scale(2); opacity: 0; }
}
.pvb-key.miss { opacity: .4; }
.pvb-key.miss::before {
  border-color: #ff6a5a;
  background: linear-gradient(180deg, #3a201d, #16100e);
}
.pvb-key-label {
  font-family: 'STKaiti', 'KaiTi', serif;
  font-size: 1.45rem;
  font-weight: 800;
  color: #efe7d6;
  z-index: 2;
  text-shadow: 0 2px 6px rgba(0,0,0,.85);
  pointer-events: none;
}
.pvb-key-ring {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid rgba(243,234,216,.55);
  transform: scale(2.4);
  transform-origin: center;
  pointer-events: none;
  opacity: .9;
  animation: pvbParryRing 1.1s ease-in-out infinite;
}
@keyframes pvbParryRing {
  0% { transform: scale(2.35); opacity: .25; }
  50% { transform: scale(1.08); opacity: .95; }
  100% { transform: scale(2.35); opacity: .25; }
}
`
