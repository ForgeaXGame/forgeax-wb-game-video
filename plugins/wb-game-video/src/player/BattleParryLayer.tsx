import { useEffect, useRef, useState } from 'react'
import type { BlueprintQte } from '../blueprint/blueprint-schema'
import type { QteOutcome, Scene } from '../scenario/types'
import { injectStyleOnce } from '../styles/injectStyle'

interface Props {
  qte: BlueprintQte
  onResolve: (outcome: QteOutcome) => void
}

type KeyState = 'idle' | 'armed' | 'hit' | 'miss'

/**
 * 只显示 A、B 两个按钮。C（fail）是玩家不操作时的默认结局——超时即 finish('fail')，
 * 无需在画面上给一个"主动选失败"的按钮。
 */
const PARRY_OPTIONS: Array<{ key: 'A' | 'B'; outcome: QteOutcome }> = [
  { key: 'A', outcome: 'pass' },
  { key: 'B', outcome: 'good' },
]

export function isBattleParryQte(scene: Scene | undefined): boolean {
  return scene?.ext?.qteUi === 'battleParry'
}

export function BattleParryLayer({ qte, onResolve }: Props) {
  injectStyleOnce('battle-parry-layer', PARRY_CSS)
  const resolvedRef = useRef(false)
  const [keys, setKeys] = useState<KeyState[]>(PARRY_OPTIONS.map(() => 'armed'))

  function finish(outcome: QteOutcome): void {
    if (resolvedRef.current) return
    resolvedRef.current = true
    onResolve(outcome)
  }

  function hit(index: number): void {
    if (resolvedRef.current) return
    setKeys((prev) => {
      if (prev[index] === 'hit') return prev
      const next = [...prev]
      next[index] = 'hit'
      return next
    })
    window.setTimeout(() => finish(PARRY_OPTIONS[index]?.outcome ?? 'fail'), 180)
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setKeys(PARRY_OPTIONS.map(() => 'miss'))
      window.setTimeout(() => finish('fail'), 180)
    }, qte.timeoutMs ?? 2600)

    function onKeyDown(e: KeyboardEvent): void {
      const index = PARRY_OPTIONS.findIndex((option) => option.key.toLowerCase() === e.key.toLowerCase())
      if (index < 0) return
      e.preventDefault()
      hit(index)
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
        {PARRY_OPTIONS.map((option, index) => (
          <ParryKey
            key={option.key}
            label={option.key}
            text={qte.outcomeLabels?.[option.outcome]}
            state={keys[index] ?? 'armed'}
            onPress={() => hit(index)}
          />
        ))}
      </div>
    </div>
  )
}

function ParryKey({
  label,
  text,
  state,
  onPress,
}: {
  label: 'A' | 'B'
  text?: string
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
      <span className="pvb-key-label">{label}</span>
      {text && <span className="pvb-key-text">{text}</span>}
      {state === 'hit' && <span className="pvb-key-spark" />}
    </button>
  )
}

const PARRY_CSS = `
.pvb-parry {
  position: absolute;
  right: 8%;
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
.pvb-parry-keys { position: relative; width: 190px; height: 158px; }
.pvb-parry-keys .pvb-key:nth-child(1) { position: absolute; left: 0; bottom: 0; animation-delay: 0s; }
.pvb-parry-keys .pvb-key:nth-child(2) { position: absolute; right: 0; top: 0; animation-delay: -1.6s; }
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
/*
 * armed 键改为「自身缓慢变大变小」代替原来的光圈脉冲。完整循环 3.2s（2 键各占 1.6s）：
 * 每键只在自己那半个循环里放大再收回，另一半静止，靠 nth-child 的负 delay 错开 → A、B 依次
 * 呼吸循环，任一时刻只有一个在动。
 */
.pvb-key.armed { opacity: 1; animation: pvbParryPulse 3.2s ease-in-out infinite; }
@keyframes pvbParryPulse {
  0%   { transform: scale(1);    }
  25%  { transform: scale(1.22); }
  50%  { transform: scale(1);    }
  100% { transform: scale(1);    }
}
.pvb-key.armed::before {
  border-color: #ffd9a8;
  box-shadow: 0 0 16px rgba(255,200,120,.5), 0 2px 6px rgba(0,0,0,.5) inset;
}
.pvb-key.sweet { transform: scale(1.08); }
.pvb-key.sweet::before {
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
.pvb-key-text {
  position: absolute;
  top: 68px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 11px;
  font-weight: 700;
  color: rgba(239,231,214,.9);
  text-shadow: 0 2px 5px rgba(0,0,0,.9);
  pointer-events: none;
}
`
