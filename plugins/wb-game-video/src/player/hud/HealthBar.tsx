import type { EntityRuntime } from '../entities'
import { hpRatio } from '../entities'

/**
 * 玩家血条 —— HUD 左下。读 EntityRuntime(只读)，按 hp/maxHp 画条。
 * 低血(<30%)变红 + 脉冲，给玩家危险反馈(纯 CSS，无运行时依赖)。
 */
export function HealthBar({ entity, accent }: { entity: EntityRuntime; accent?: string }) {
  const ratio = hpRatio(entity)
  const low = ratio <= 0.3
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
    </div>
  )
}
