import { useState } from 'react'

import { injectStyleOnce } from '../styles/injectStyle'
import { useScenarioStore } from '../scenario/scenarioStore'
import { applyCombatRules, readCombatRules, type CombatRulesPatch } from '../scenario/combatRules'
import {
  VIDEO_CLIPS,
  UI_SCHEMES,
  GAME_RULES,
  type VideoClip,
  type UiScheme,
  type GameRule,
} from '../scenario/gameAssetCatalog'

/**
 * 视频 / 界面 / 规则 三个 tab 的内容面板 —— 统一「列表 + 预览」形态：
 *
 *   左栏：固定资产条目列表（带 ✓ 标记，选中项 amber 高亮）；
 *   右栏：点中那一条的预览 —— 视频=播放框（占位）、界面/规则=数据展示。
 *
 * 数据全部来自 gameAssetCatalog（内置固定数据），与蓝图节点配置面板的「演出编号 /
 * HUD 方案」下拉同源。样式对齐 `视频交互原型.html` 的左栏栏目 + 预览框。
 */

function fmtDur(ms: number): string {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/* ── 通用外壳 ─────────────────────────────────────────── */

interface CatalogItem {
  id: string
  label: string
}

function CatalogShell<T extends CatalogItem>({
  icon,
  title,
  items,
  selectedId,
  onSelect,
  renderPreview,
}: {
  icon: string
  title: string
  items: readonly T[]
  selectedId: string
  onSelect: (id: string) => void
  renderPreview: (item: T | undefined) => React.ReactNode
}) {
  injectStyleOnce('game-catalog', CATALOG_CSS)
  const selected = items.find((i) => i.id === selectedId)
  return (
    <div className="gc-tab">
      <aside className="gc-list" aria-label={title}>
        <div className="gc-list-head">
          <span className="gc-list-ico" aria-hidden>
            {icon}
          </span>
          <span className="gc-list-title">{title}</span>
          <span className="gc-list-count">{items.length}</span>
        </div>
        <div className="gc-list-body">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              className={`gc-row${it.id === selectedId ? ' is-on' : ''}`}
              onClick={() => onSelect(it.id)}
            >
              <span className="gc-row-mark" aria-hidden>
                ✓
              </span>
              <span className="gc-row-label">{it.label}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="gc-preview">{renderPreview(selected)}</section>
    </div>
  )
}

/* ── 视频 ─────────────────────────────────────────────── */

export function VideoCatalogTab() {
  const [selectedId, setSelectedId] = useState<string>(VIDEO_CLIPS[0]?.id ?? '')
  return (
    <CatalogShell<VideoClip>
      icon="🎥"
      title="视频"
      items={VIDEO_CLIPS}
      selectedId={selectedId}
      onSelect={setSelectedId}
      renderPreview={(clip) =>
        clip ? (
          <div className="gc-stage">
            <div className="gc-frame" data-type={clip.type ?? 'video'}>
              <span className="gc-badge">
                {clip.label}
                {clip.type ? <em>{clip.type}</em> : null}
              </span>
              <video
                key={clip.id}
                className="gc-video"
                src={clip.url}
                controls
                autoPlay
                muted
                playsInline
                loop={clip.type === 'loop'}
              />
            </div>
            <div className="gc-meta">
              {clip.type ? (
                <span className="gc-meta-cell">
                  <span className="gc-meta-k">类型</span>
                  <span className="gc-meta-v">{clip.type}</span>
                </span>
              ) : null}
              {typeof clip.durMs === 'number' ? (
                <span className="gc-meta-cell">
                  <span className="gc-meta-k">时长</span>
                  <span className="gc-meta-v">{fmtDur(clip.durMs)}</span>
                </span>
              ) : null}
              <span className="gc-meta-cell">
                <span className="gc-meta-k">编号</span>
                <span className="gc-meta-v gc-mono">{clip.id}</span>
              </span>
              <span className="gc-meta-cell gc-meta-cell--wide">
                <span className="gc-meta-k">直链</span>
                <span className="gc-meta-v gc-mono">{clip.url}</span>
              </span>
            </div>
          </div>
        ) : (
          <EmptyPreview text="选择一条视频以播放" />
        )
      }
    />
  )
}

/* ── 界面 ─────────────────────────────────────────────── */

export function UiCatalogTab() {
  const [selectedId, setSelectedId] = useState<string>(UI_SCHEMES[0]?.id ?? '')
  return (
    <CatalogShell<UiScheme>
      icon="🗔"
      title="界面"
      items={UI_SCHEMES}
      selectedId={selectedId}
      onSelect={setSelectedId}
      renderPreview={(ui) =>
        ui ? (
          <div className="gc-stage">
            <div className="gc-frame" data-type="ui">
              <span className="gc-badge">{ui.label}</span>
              <div className="gc-hud-mock" data-hud={ui.id}>
                {ui.id !== 'hidden' && (
                  <>
                    <div className="gc-hud-bar gc-hud-bar--player" />
                    {ui.id === 'battle' && <div className="gc-hud-bar gc-hud-bar--boss" />}
                    {ui.id === 'explore' && <div className="gc-hud-chip">背包</div>}
                  </>
                )}
              </div>
            </div>
            <div className="gc-meta">
              <span className="gc-meta-cell gc-meta-cell--wide">
                <span className="gc-meta-k">说明</span>
                <span className="gc-meta-v">{ui.desc}</span>
              </span>
              <span className="gc-meta-cell">
                <span className="gc-meta-k">方案</span>
                <span className="gc-meta-v gc-mono">{ui.id}</span>
              </span>
            </div>
          </div>
        ) : (
          <EmptyPreview text="选择一个界面以预览" />
        )
      }
    />
  )
}

/* ── 规则 ─────────────────────────────────────────────── */

export function RuleCatalogTab() {
  const [selectedId, setSelectedId] = useState<string>(GAME_RULES[0]?.id ?? '')
  const scenario = useScenarioStore((s) => s.scenario)
  const applyExternalScenario = useScenarioStore((s) => s.applyExternalScenario)
  const rules = readCombatRules(scenario)

  function patchRules(patch: CombatRulesPatch): void {
    applyExternalScenario(applyCombatRules(scenario, patch))
  }

  return (
    <CatalogShell<GameRule>
      icon="📜"
      title="规则"
      items={GAME_RULES}
      selectedId={selectedId}
      onSelect={setSelectedId}
      renderPreview={(rule) =>
        rule ? (
          <div className="gc-stage">
            <div className="gc-rule-card">
              <div className="gc-rule-head">{rule.label} 属性</div>
              <RuleEditor ruleId={rule.id} rules={rules} onPatch={patchRules} />
            </div>
          </div>
        ) : (
          <EmptyPreview text="选择一条规则以查看" />
        )
      }
    />
  )
}

function RuleEditor({
  ruleId,
  rules,
  onPatch,
}: {
  ruleId: string
  rules: ReturnType<typeof readCombatRules>
  onPatch: (patch: CombatRulesPatch) => void
}) {
  switch (ruleId) {
    case 'r-player':
      return (
        <div className="gc-rule-form">
          <div className="gc-rule-section">基础属性</div>
          <RuleSliderField label="生命值" value={rules.playerMaxHp} max={15000} onChange={(playerMaxHp) => onPatch({ playerMaxHp })} />
          <RuleSliderField label="攻击力" value={rules.playerAttack} max={150} onChange={(playerAttack) => onPatch({ playerAttack })} />
          <RuleSliderField label="防御力" value={rules.playerDefense} max={100} onChange={(playerDefense) => onPatch({ playerDefense })} />
          <RuleSliderField label="暴击率" value={rules.playerCritRate} max={50} unit="%" onChange={(playerCritRate) => onPatch({ playerCritRate })} />
          <RuleSliderField label="气力上限" value={rules.qiMax} max={5} onChange={(qiMax) => onPatch({ qiMax })} />
          <div className="gc-rule-section">出手 / 先手</div>
          <RuleSliderField label="出手速度" value={rules.playerSpeed} max={50} onChange={(playerSpeed) => onPatch({ playerSpeed })} />
          <RuleSelectField label="先手判定" value="speed" options={['出手速度大者先手']} />
          <RuleSelectField label="速度相等时" value="player" options={['空藏先手']} />
        </div>
      )
    case 'r-enemy':
      return (
        <div className="gc-rule-form">
          <div className="gc-rule-section">基础属性</div>
          <RuleSliderField label="生命值" value={rules.bossMaxHp} max={15000} onChange={(bossMaxHp) => onPatch({ bossMaxHp })} />
          <RuleSliderField label="攻击力" value={rules.bossAttack} max={150} onChange={(bossAttack) => onPatch({ bossAttack })} />
          <RuleSliderField label="防御力" value={rules.bossDefense} max={100} onChange={(bossDefense) => onPatch({ bossDefense })} />
          <RuleSliderField label="暴击率" value={rules.bossCritRate} max={50} unit="%" onChange={(bossCritRate) => onPatch({ bossCritRate })} />
          <RuleSliderField label="进攻欲望" value={rules.bossAggression} max={1} step={0.1} onChange={(bossAggression) => onPatch({ bossAggression })} />
          <div className="gc-rule-section">出手 / 先手</div>
          <RuleSliderField label="出手速度" value={rules.bossSpeed} max={50} onChange={(bossSpeed) => onPatch({ bossSpeed })} />
          <RuleSelectField label="先手判定" value="speed" options={['出手速度大者先手']} />
        </div>
      )
    default:
      return null
  }
}

function RuleSliderField({
  label,
  value,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string
  value: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <label className="gc-paramrow gc-paramrow--slider">
      <span className="gc-param-label">{label}</span>
      <span className="gc-rule-slider">
        <span className="gc-rule-slider-fill" style={{ width: `${pct}%` }} />
        <span className="gc-rule-slider-knob" style={{ left: `${pct}%` }} />
        <input
          className="gc-rule-range"
          type="range"
          min={0}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
      </span>
      <input
        className="gc-rule-value"
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      {unit && <span className="gc-rule-unit">{unit}</span>}
    </label>
  )
}

function RuleSelectField({
  label,
  value,
  options,
}: {
  label: string
  value: string
  options: string[]
}) {
  return (
    <label className="gc-paramrow gc-paramrow--select">
      <span className="gc-param-label">{label}</span>
      <select className="gc-rule-select" value={value} disabled>
        {options.map((opt) => (
          <option key={opt} value={value}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  )
}

function EmptyPreview({ text }: { text: string }) {
  return (
    <div className="gc-empty">
      <span className="gc-empty-glyph" aria-hidden>
        ◇
      </span>
      <span className="gc-empty-text">{text}</span>
    </div>
  )
}

const CATALOG_CSS = `
.gc-tab {
  flex: 1; min-height: 0; min-width: 0;
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
  background: var(--color-background-base, #161616);
  color: var(--color-text-primary, #fff);
}
/* ── 左栏列表 ── */
.gc-list {
  display: flex; flex-direction: column; min-height: 0;
  background: #14161c;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  overflow: hidden;
}
.gc-list-head {
  flex: none;
  display: flex; align-items: center; gap: 8px;
  padding: 11px 13px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  background: rgba(255,255,255,0.02);
}
.gc-list-ico { font-size: 14px; }
.gc-list-title { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; }
.gc-list-count {
  margin-left: auto;
  font-size: 11px; font-variant-numeric: tabular-nums;
  color: rgba(255,255,255,0.5);
  background: rgba(255,255,255,0.06);
  border-radius: 999px; padding: 1px 8px;
}
.gc-list-body { flex: 1; min-height: 0; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px; }
.gc-row {
  all: unset; box-sizing: border-box;
  display: flex; align-items: center; gap: 9px;
  padding: 8px 10px; border-radius: 8px; cursor: pointer;
  border: 1px solid transparent;
  font-size: 12.5px; color: rgba(255,255,255,0.78);
  transition: background .12s, color .12s, border-color .12s;
}
.gc-row:hover { background: rgba(255,255,255,0.045); color: #fff; }
.gc-row.is-on {
  background: rgba(224,121,95,0.12);
  border-color: rgba(224,121,95,0.55);
  color: #fff;
}
.gc-row-mark {
  flex: none; width: 14px; text-align: center;
  font-size: 11px; color: #5fbf7f;
}
.gc-row-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── 右栏预览 ── */
.gc-preview {
  display: flex; min-height: 0; min-width: 0;
  background: #14161c;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  overflow: auto;
}
.gc-stage { flex: 1; display: flex; flex-direction: column; gap: 14px; padding: 18px; min-width: 0; }
.gc-frame {
  position: relative;
  width: 100%; aspect-ratio: 16 / 9;
  max-height: 62vh;
  background: radial-gradient(120% 120% at 50% 30%, #15161b 0%, #050507 100%);
  border: 1px solid rgba(224,121,95,0.35);
  border-radius: 12px;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.gc-badge {
  position: absolute; top: 14px; left: 14px;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 9px;
  font-size: 13px; font-weight: 700; color: #f0b48f;
  background: rgba(0,0,0,0.55);
  border: 1px solid rgba(224,121,95,0.6);
}
.gc-badge em { font-style: normal; font-weight: 700; color: #cfd6dd; opacity: 0.85; }
.gc-video { width: 100%; height: 100%; object-fit: contain; background: #000; }
.gc-frame-center { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.gc-play-glyph {
  width: 64px; height: 64px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px; color: #fff; padding-left: 4px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.22);
  animation: gcPulse 2.2s ease-in-out infinite;
}
@keyframes gcPulse { 0%,100% { transform: scale(1); opacity: .85; } 50% { transform: scale(1.06); opacity: 1; } }
.gc-frame-hint { font-size: 12px; color: rgba(255,255,255,0.5); letter-spacing: 0.08em; }

.gc-meta { display: flex; flex-wrap: wrap; gap: 10px; }
.gc-meta-cell {
  display: flex; flex-direction: column; gap: 3px;
  padding: 8px 12px; border-radius: 8px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  min-width: 96px;
}
.gc-meta-cell--wide { flex: 1; min-width: 200px; }
.gc-meta-k { font-size: 10.5px; letter-spacing: 0.1em; color: rgba(255,255,255,0.45); }
.gc-meta-v { font-size: 13px; color: #fff; }
.gc-mono { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; }

/* HUD 预览（界面 tab 的迷你示意） */
.gc-hud-mock { position: absolute; inset: 0; pointer-events: none; }
.gc-hud-bar { position: absolute; height: 10px; border-radius: 5px; }
.gc-hud-bar--player { left: 16px; bottom: 16px; width: 38%; background: linear-gradient(90deg,#5fbf7f,#3a7d52); }
.gc-hud-bar--boss { right: 16px; top: 16px; width: 42%; background: linear-gradient(90deg,#b5453a,#e0795f); }
.gc-hud-chip {
  position: absolute; right: 16px; bottom: 16px;
  padding: 4px 10px; border-radius: 7px; font-size: 11px; color: #fff;
  background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.25);
}

/* 规则卡片 */
.gc-rule-card {
  width: 100%;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  overflow: hidden;
}
.gc-rule-head {
  padding: 12px 16px; font-size: 14px; font-weight: 700; color: #fff;
  background: rgba(224,121,95,0.14);
  border-bottom: 1px solid rgba(224,121,95,0.3);
}
.gc-rule-list { list-style: none; margin: 0; padding: 8px 0; }
.gc-rule-item {
  padding: 10px 16px; font-size: 13px; color: rgba(255,255,255,0.82);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.gc-rule-item:last-child { border-bottom: none; }
.gc-rule-form {
  display: flex;
  flex-direction: column;
  padding: 12px 0 8px;
}
.gc-rule-section {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255,255,255,0.78);
  padding: 12px 18px 6px;
  letter-spacing: 0.03em;
}
.gc-paramrow {
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px 12px;
  margin: 0;
  padding: 10px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  min-height: 24px;
}
.gc-paramrow:hover { background: rgba(255,255,255,0.03); }
.gc-paramrow--select { grid-template-columns: 108px minmax(120px, 220px); }
.gc-param-label {
  font-size: 13px;
  color: rgba(255,255,255,0.56);
}
.gc-rule-slider {
  position: relative;
  height: 5px;
  border-radius: 3px;
  background: rgba(255,255,255,0.1);
}
.gc-rule-slider-fill {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  border-radius: 3px;
  background: linear-gradient(90deg, #e86f20, #f08840);
}
.gc-rule-slider-knob {
  position: absolute;
  top: 50%;
  width: 14px; height: 14px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: #fff;
  box-shadow: 0 0 0 4px rgba(240,136,64,.95), 0 1px 4px rgba(0,0,0,.4);
  pointer-events: none;
}
.gc-rule-range {
  position: absolute;
  inset: -8px 0;
  width: 100%;
  opacity: 0;
  cursor: grab;
}
.gc-rule-value {
  min-width: 54px;
  width: 128px;
  box-sizing: border-box;
  padding: 4px 10px;
  border-radius: 7px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  color: #fff;
  font: inherit;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.gc-rule-unit {
  color: rgba(255,255,255,0.5);
  font-size: 12px;
}
.gc-rule-select {
  width: 100%;
  padding: 6px 10px;
  border-radius: 7px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  color: #ddd;
}

.gc-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
}
.gc-empty-glyph { font-size: 38px; color: rgba(255,255,255,0.25); }
.gc-empty-text { font-size: 13px; color: rgba(255,255,255,0.5); }
`
