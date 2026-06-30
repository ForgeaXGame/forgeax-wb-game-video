import type { EntityRuntime } from '../entities'
import { hpRatio } from '../entities'

/**
 * Boss 血条 —— HUD 顶部居中，宽条 + Boss 名。Boss 战(scene.kind='battle')时出现。
 * 只读展示，按 hp/maxHp 画条；M5 接回合结算后 hp 实时变化即可。
 */
export function BossBar({ entity }: { entity: EntityRuntime }) {
  const ratio = hpRatio(entity)
  return (
    <div className="ks-hud-boss" data-testid="hud-boss-hp">
      <div className="ks-hud-boss-name">{entity.name}</div>
      <div className="ks-hud-boss-track">
        <div className="ks-hud-boss-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}
