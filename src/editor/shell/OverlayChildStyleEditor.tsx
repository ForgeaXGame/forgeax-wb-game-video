/**
 * Overlay 子组件样式编辑 —— 界面 tab 用；按 component 类型展示皮肤 / 文字预设选择。
 */
import type { CSSProperties, JSX } from 'react'
import type { GraphTextStyle, OverlayChild } from '../../runtime/schema/graph-schema'
import { baseKindOf } from '../../runtime/registry/kind-registry'
import { effectiveComponent } from '../../runtime/schema/overlay-component'
import { HUD_SKINS, INTERACTION_SKINS } from '../../runtime/skins/components'
import { GraphTextStylePicker } from './GraphTextStylePicker'

const row: CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, fontSize: 12 }
const lbl: CSSProperties = { width: 72, opacity: 0.7, flexShrink: 0, fontSize: 11 }

const COMPONENT_LABEL: Record<string, string> = {
  dialogue: '字幕',
  floatText: '飘字',
  qte: 'QTE',
  choice: '选项',
  battleHpBar: 'HUD 血条',
}

function field(label: string, node: JSX.Element): JSX.Element {
  return (
    <label style={row}>
      <span style={lbl}>{label}</span>
      {node}
    </label>
  )
}

export function OverlayChildStyleEditor({
  child,
  onPatchParams,
  onPatchComponent,
}: {
  child: OverlayChild
  onPatchParams: (patch: Record<string, unknown>) => void
  onPatchComponent: (component: string) => void
}): JSX.Element {
  const params = child.params ?? {}
  const component = effectiveComponent(child)
  const kind = baseKindOf(component)
  const title = COMPONENT_LABEL[kind] ?? kind

  if (kind === 'qte') {
    const skin = INTERACTION_SKINS.some((s) => s.id === component) ? component : ''
    const opts = INTERACTION_SKINS.filter((s) => s.target === 'qte')
    return (
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{child.id} · {title}</div>
        {field(
          '交互皮肤',
          <select value={skin} onChange={(e) => onPatchComponent(e.target.value || 'qte')} style={{ flex: 1 }}>
            <option value="">（默认按钮）</option>
            {opts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>,
        )}
      </div>
    )
  }

  if (kind === 'choice') {
    const skin = INTERACTION_SKINS.some((s) => s.id === component) ? component : ''
    const opts = INTERACTION_SKINS.filter((s) => s.target === 'choice')
    return (
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{child.id} · {title}</div>
        {field(
          '选项皮肤',
          <select value={skin} onChange={(e) => onPatchComponent(e.target.value || 'choice')} style={{ flex: 1 }}>
            <option value="">（默认清单）</option>
            {opts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>,
        )}
      </div>
    )
  }

  if (HUD_SKINS.some((s) => s.id === component) || kind === 'battleHpBar') {
    const skin = HUD_SKINS.some((s) => s.id === component) ? component : ''
    return (
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{child.id} · HUD</div>
        {field(
          'HUD 皮肤',
          <select value={skin} onChange={(e) => onPatchComponent(e.target.value)} style={{ flex: 1 }}>
            {HUD_SKINS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>,
        )}
      </div>
    )
  }

  if (kind === 'dialogue') {
    return (
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{child.id} · {title}</div>
        <div style={{ ...row, alignItems: 'flex-start' }}>
          <span style={lbl}>字幕样式</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <GraphTextStylePicker
              group="subtitle"
              value={params.style as GraphTextStyle | undefined}
              onChange={(style) => onPatchParams({ style })}
            />
          </div>
        </div>
      </div>
    )
  }

  if (kind === 'floatText') {
    return (
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{child.id} · {title}</div>
        <div style={{ ...row, alignItems: 'flex-start' }}>
          <span style={lbl}>飘字样式</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <GraphTextStylePicker
              group="overlay"
              value={params.style as GraphTextStyle | undefined}
              onChange={(style) => onPatchParams({ style })}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 6, fontSize: 11, opacity: 0.6 }}>
      {child.id} · {title}（无可编辑样式）
    </div>
  )
}
