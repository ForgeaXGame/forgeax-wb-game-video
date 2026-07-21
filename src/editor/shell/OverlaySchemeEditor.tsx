/**
 * OverlaySchemeEditor —— 单个「界面方案」（overlay）的展示 + 编辑。
 * 从 ScenarioInspector 的 overlays 分支抽出：标题 / 引用角标 / 删除 / 预览 / 组件列表。
 * 纯展示组件——所有增删改经回调交给持有 scenario.ui.overlays 的上层（GraphConfigView）。
 */
import type { CSSProperties, JSX } from 'react'
import type { Entity, Layout, Overlay, Variable } from '../../runtime/schema/graph-schema'
import { OverlayCatalogPreview } from './OverlayCatalogPreview'
import { OverlayChildStyleEditor } from './OverlayChildStyleEditor'
import { NEW_COMPONENT_PRESETS } from '../demo/builtin-schemes'

const del: CSSProperties = { color: '#ff6b6b', marginLeft: 'auto' }
/** 移除组件的 × 按钮——比默认删除文案更醒目、点击区更大。 */
const removeChildBtn: CSSProperties = {
  flex: 'none',
  marginTop: 2,
  color: '#ff6b6b',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 20,
  lineHeight: 1,
  padding: '2px 8px',
}

/** 引用角标：被 N 个节点挂载引用；0 = 未被引用（灰）。 */
export function UsageBadge({ count }: { count: number }): JSX.Element {
  const used = count > 0
  return (
    <span
      style={{
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 8,
        whiteSpace: 'nowrap',
        background: used ? 'rgba(80,180,120,0.16)' : 'rgba(255,255,255,0.06)',
        color: used ? '#7fdda6' : '#8a8a8a',
        border: `1px solid ${used ? 'rgba(80,180,120,0.4)' : 'rgba(255,255,255,0.12)'}`,
      }}
      title={used ? `被 ${count} 个节点的 overlayNodes 引用` : '资源池里的闲置界面包（可保留）'}
    >
      {used ? `被 ${count} 个节点引用` : '未被引用'}
    </span>
  )
}

export interface OverlaySchemeEditorProps {
  overlayId: string
  overlay: Overlay
  entities: Record<string, Entity>
  variables: Record<string, Variable>
  usageCount: number
  onRename: (title: string) => void
  onRemove: () => void
  onAddChild: (presetId: string) => void
  onRemoveChild: (childId: string) => void
  onPatchChild: (
    childId: string,
    patch: { inputs?: Record<string, unknown>; component?: string; layout?: Partial<Layout> },
  ) => void
}

export function OverlaySchemeEditor({
  overlayId,
  overlay,
  entities,
  variables,
  usageCount,
  onRename,
  onRemove,
  onAddChild,
  onRemoveChild,
  onPatchChild,
}: OverlaySchemeEditorProps): JSX.Element {
  return (
    <div style={{ padding: 12, overflow: 'auto', fontSize: 12, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
        <input
          value={overlay.title ?? ''}
          placeholder={overlayId}
          onChange={(e) => onRename(e.target.value)}
          style={{ flex: 1, fontWeight: 600 }}
        />
        <UsageBadge count={usageCount} />
        <button style={del} onClick={onRemove}>删除</button>
      </div>
      <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 8 }}>{overlayId}</div>
      <OverlayCatalogPreview overlay={overlay} entities={entities} variables={variables} />
      <div style={{ marginTop: 10, borderTop: '1px solid #333', paddingTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600 }}>组件（{overlay.children.length}）</span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onAddChild(e.target.value)
            }}
            style={{ fontSize: 11 }}
          >
            <option value="">+ 添加组件…</option>
            {NEW_COMPONENT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {overlay.children.map((child) => (
          <div key={child.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <OverlayChildStyleEditor
                child={child}
                onPatchParams={(patch) => onPatchChild(child.id, { inputs: patch })}
                onPatchComponent={(component) => onPatchChild(child.id, { component })}
                onPatchLayout={(patch) => onPatchChild(child.id, { layout: patch })}
              />
            </div>
            <button style={removeChildBtn} onClick={() => onRemoveChild(child.id)} title="移除组件">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
