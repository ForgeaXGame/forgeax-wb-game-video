/**
 * 按 kind 注册表 form 字段渲染 overlay child params（标量 + options/effects 复合控件）。
 */
import type { CSSProperties, JSX } from 'react'
import type { FormField } from '../../runtime/registry/kind-registry'
import { getComponent } from '../../runtime/registry/kind-registry'
import { EffectsEditor, OptionsEditor, type EditorPickerCtx, type ChoiceOptionLike } from './editors'

const rowStyle: CSSProperties = { display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }
const lbl: CSSProperties = { width: 72, opacity: 0.7, flexShrink: 0, fontSize: 11 }

function field(label: string, node: JSX.Element): JSX.Element {
  return (
    <label style={rowStyle}>
      <span style={lbl}>{label}</span>
      {node}
    </label>
  )
}

function readParam(params: Record<string, unknown>, key: string): unknown {
  return params[key]
}

function patchParam(
  params: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  if (value === undefined || value === '') {
    const { [key]: _drop, ...rest } = params
    return rest
  }
  return { ...params, [key]: value }
}

function renderField(
  f: FormField,
  params: Record<string, unknown>,
  onPatch: (patch: Record<string, unknown>) => void,
  pickers?: EditorPickerCtx,
): JSX.Element | null {
  const val = readParam(params, f.key)
  switch (f.t) {
    case 'text': {
      if (f.key === 'defaultKey') {
        const options = params.options
        const keys = Array.isArray(options)
          ? options.map((o) => (typeof o === 'object' && o && 'key' in o ? String((o as { key: string }).key) : '')).filter(Boolean)
          : []
        if (keys.length) {
          const v = typeof val === 'string' ? val : ''
          return field('超时默认', (
            <select value={v} onChange={(e) => onPatch({ defaultKey: e.target.value || undefined })} style={{ flex: 1, fontSize: 12 }}>
              <option value="">（首项）</option>
              {keys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          ))
        }
      }
      return field(f.label, (
        <input
          value={typeof val === 'string' ? val : ''}
          onChange={(e) => onPatch({ [f.key]: e.target.value || undefined })}
          placeholder={f.placeholder}
          style={{ flex: 1, fontFamily: f.mono ? 'monospace' : undefined, fontSize: 12 }}
        />
      ))
    }
    case 'number':
      return field(f.label, (
        <input
          type="number"
          value={typeof val === 'number' ? val : ''}
          min={f.min}
          max={f.max}
          step={f.step}
          onChange={(e) => onPatch({ [f.key]: e.target.value === '' ? undefined : Number(e.target.value) })}
          style={{ flex: 1, fontSize: 12 }}
        />
      ))
    case 'select':
      return field(f.label, (
        <select
          value={typeof val === 'string' ? val : ''}
          onChange={(e) => onPatch({ [f.key]: e.target.value })}
          style={{ flex: 1, fontSize: 12 }}
        >
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))
    case 'checkbox':
      return field(f.label, (
        <input
          type="checkbox"
          checked={Boolean(val)}
          onChange={(e) => onPatch({ [f.key]: e.target.checked })}
        />
      ))
    case 'effects':
      return (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>{f.label}</div>
          <EffectsEditor
            value={Array.isArray(val) ? (val as never) : undefined}
            pickers={pickers}
            onChange={(effects) => onPatch({ [f.key]: effects })}
          />
        </div>
      )
    case 'options':
      return (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>{f.label}</div>
          <OptionsEditor
            value={Array.isArray(val) ? (val as ChoiceOptionLike[]) : undefined}
            pickers={pickers}
            onChange={(options) => onPatch({ [f.key]: options })}
          />
        </div>
      )
    case 'textStyle':
    case 'qteCues':
    case 'hotspots':
      return (
        <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
          {f.label}：请在「视频」轨编辑器中配置（{f.t}）
        </div>
      )
    default:
      return null
  }
}

export function KindFormFields({
  componentId,
  params,
  onChange,
  pickers,
}: {
  componentId: string
  params: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  pickers?: EditorPickerCtx
}): JSX.Element | null {
  const plugin = getComponent(componentId)
  const form = plugin?.form
  if (!form?.length) {
    return <div style={{ fontSize: 11, opacity: 0.5 }}>该组件无表单字段（component={componentId}）</div>
  }
  const onPatch = (patch: Record<string, unknown>) => {
    let next = { ...params }
    for (const [k, v] of Object.entries(patch)) next = patchParam(next, k, v)
    onChange(next)
  }
  return (
    <div>
      {form.map((f) => (
        <div key={f.key}>{renderField(f, params, onPatch, pickers)}</div>
      ))}
    </div>
  )
}
