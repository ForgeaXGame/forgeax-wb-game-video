import { useState } from 'react'

import { injectStyleOnce } from '../styles/injectStyle'
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
            <div className="gc-frame" data-type={clip.type}>
              <span className="gc-badge">
                {clip.label} <em>{clip.type}</em>
              </span>
              <div className="gc-frame-center">
                <span className="gc-play-glyph" aria-hidden>
                  ▶
                </span>
                <span className="gc-frame-hint">
                  {clip.type === 'loop' ? '循环播放中…' : '演出播放中…'}
                </span>
              </div>
            </div>
            <div className="gc-meta">
              <span className="gc-meta-cell">
                <span className="gc-meta-k">类型</span>
                <span className="gc-meta-v">{clip.type}</span>
              </span>
              <span className="gc-meta-cell">
                <span className="gc-meta-k">时长</span>
                <span className="gc-meta-v">{fmtDur(clip.durMs)}</span>
              </span>
              <span className="gc-meta-cell">
                <span className="gc-meta-k">编号</span>
                <span className="gc-meta-v gc-mono">{clip.id}</span>
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
              <div className="gc-rule-head">{rule.label}</div>
              <ul className="gc-rule-list">
                {rule.lines.map((line, i) => (
                  <li key={i} className="gc-rule-item">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <EmptyPreview text="选择一条规则以查看" />
        )
      }
    />
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

.gc-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
}
.gc-empty-glyph { font-size: 38px; color: rgba(255,255,255,0.25); }
.gc-empty-text { font-size: 13px; color: rgba(255,255,255,0.5); }
`
