import type { EntityRuntime } from '../entities'
import { hpRatio } from '../entities'

/**
 * 玩家血条 —— HUD 左下。读 EntityRuntime(只读)，按 hp/maxHp 画条。
 * 低血(<30%)变红 + 脉冲，给玩家危险反馈(纯 CSS，无运行时依赖)。
 */
export function HealthBar({
  entity,
  accent,
  energy,
}: {
  entity: EntityRuntime
  accent?: string
  energy?: { current: number; max: number }
}) {
  const ratio = hpRatio(entity)
  const low = ratio <= 0.3
  const pips = energy ? Array.from({ length: energy.max }, (_, i) => i < energy.current) : []
  return (
    <div className={`ks-hud-hp${low ? ' is-low' : ''}`} data-testid="hud-player-hp">
      <div className="ks-hud-hp-row">
        <span className="ks-hud-hp-name">{entity.name}</span>
        <span className="ks-hud-hp-num ks-mono">
          {Math.round(entity.hp)}/{entity.maxHp}
        </span>
      </div>
      <div className="ks-hud-hp-track">
        <div
          className="ks-hud-hp-fill"
          style={{ width: `${ratio * 100}%`, ...(accent ? { background: accent } : null) }}
        />
      </div>
      {energy && (
        <div className="ks-hud-rage" aria-label={`气力 ${energy.current}/${energy.max}`}>
          {pips.map((on, i) => (
            <span key={i} className={`ks-hud-pip${on ? ' on' : ''}`} aria-hidden />
          ))}
        </div>
      )}
    </div>
  )
}
