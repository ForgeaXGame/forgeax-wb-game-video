import type { Scenario } from '../scenario/types'
import type { VarState } from './conditionEval'
import { injectStyleOnce } from '../styles/injectStyle'

const STAT_IDS = ['lizhi', 'foxing', 'yezhang', 'chi'] as const

export function NarrativeStatsLayer({ scenario, vars }: { scenario: Scenario; vars: VarState }) {
  const defs = STAT_IDS.map((id) => scenario.variables?.[id])
  if (defs.some((d) => !d)) return null
  injectStyleOnce('narrative-stats-layer', STATS_CSS)
  return (
    <div className="pvm-stats" aria-label="四维属性">
      {STAT_IDS.map((id) => {
        const def = scenario.variables![id]!
        const v = vars[id] ?? def.initial
        return (
          <div key={id} className="pvm-stat" data-stat={id}>
            <span className="pvm-stat-l">{def.name}</span>
            <span className="pvm-stat-v">{v}</span>
          </div>
        )
      })}
    </div>
  )
}

const STATS_CSS = `
.pvm-stats{position:absolute;top:14px;left:14px;z-index:6;display:flex;flex-direction:column;gap:4px;pointer-events:none;}
.pvm-stat{display:flex;align-items:center;gap:8px;padding:3px 10px;border-radius:8px;
  background:rgba(12,10,8,.72);border:1px solid rgba(217,199,160,.35);}
.pvm-stat-l{font-family:'HYShangWei','STKaiti',serif;font-size:.82rem;color:#d9c7a0;}
.pvm-stat-v{font-weight:800;font-size:.9rem;color:#f4ead2;min-width:1.2em;text-align:right;}
.pvm-stat--pulse-up .pvm-stat-v{animation:pvmUp 1.28s ease;}
.pvm-stat--pulse-down .pvm-stat-v{animation:pvmDown 1.28s ease;}
@keyframes pvmUp{0%,100%{color:#f4ead2;}20%{color:#7ee0a0;transform:scale(1.25);}}
@keyframes pvmDown{0%,100%{color:#f4ead2;}20%{color:#e07a6a;transform:scale(1.25);}}
`
