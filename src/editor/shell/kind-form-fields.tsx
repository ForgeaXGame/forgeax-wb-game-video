/**
 * 按 kind 注册表 form / inputs 渲染 overlay child params。
 * valueType bind/attr 复用 scenario-pickers（实体·属性下拉），不手写 id。
 */
import type { CSSProperties, JSX } from 'react'
import type { FormField } from '../../runtime/registry/kind-registry'
import { getComponent, getComponentManifest } from '../../runtime/registry/kind-registry'
import type { ComponentInput } from '../../runtime/schema/node-config-schema'
import { EffectsEditor, EventsEditor, type EditorPickerCtx, type ComponentEventLike } from './editors'
import { AttrPicker, EntityPicker } from './scenario-pickers'

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
      if (f.key === 'defaultEvent') {
        const events = params.events
        const ids = Array.isArray(events)
          ? events.map((e) => (typeof e === 'object' && e && 'id' in e ? String((e as { id: string }).id) : '')).filter(Boolean)
          : []
        if (ids.length) {
          const v = typeof val === 'string' ? val : ''
          return field('超时默认', (
            <select value={v} onChange={(e) => onPatch({ defaultEvent: e.target.value || undefined })} style={{ flex: 1, fontSize: 12 }}>
              <option value="">（首项）</option>
              {ids.map((k) => <option key={k} value={k}>{k}</option>)}
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
    case 'number': {
      if (f.slider) {
        const v = typeof val === 'number' ? val : (f.min ?? 0)
        return field(`${f.label} ${v.toFixed(2)}`, (
          <input
            type="range"
            min={f.min ?? 0}
            max={f.max ?? 1}
            step={f.step ?? 0.05}
            value={v}
            onChange={(e) => onPatch({ [f.key]: Number(e.target.value) })}
            style={{ flex: 1 }}
          />
        ))
      }
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
    }
    case 'select':
      return field(f.label, (
        <select
          value={typeof val === 'string' && val ? val : (f.fallback ?? '')}
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
    case 'color':
      return field(f.label, (
        <input
          type="color"
          value={typeof val === 'string' && val ? val : (f.placeholder || '#5fbf7f')}
          onChange={(e) => onPatch({ [f.key]: e.target.value || undefined })}
          style={{ width: 42, height: 28, padding: 0, border: 'none', background: 'transparent' }}
          title={typeof val === 'string' ? val : f.placeholder}
        />
      ))
    case 'bind':
      return field(f.label, (
        <EntityPicker
          value={typeof val === 'string' ? val : ''}
          entities={pickers?.entities}
          onChange={(id) => onPatch({ [f.key]: id || undefined })}
          allowEmpty
        />
      ))
    case 'attr': {
      const entityKey = f.entityKey ?? 'bind'
      const entityId = typeof params[entityKey] === 'string' ? (params[entityKey] as string) : ''
      return field(f.label, (
        <AttrPicker
          entityId={entityId}
          value={typeof val === 'string' ? val : ''}
          entities={pickers?.entities}
          onChange={(a) => onPatch({ [f.key]: a || undefined })}
        />
      ))
    }
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
    case 'events':
      return (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>{f.label}</div>
          <EventsEditor
            value={Array.isArray(val) ? (val as ComponentEventLike[]) : undefined}
            variant={f.variant ?? 'plain'}
            pickers={pickers}
            onChange={(events) => onPatch({ [f.key]: events })}
          />
        </div>
      )
    case 'textStyle':
    case 'qteCues':
      return (
        <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
          {f.label}：请在「视频」轨编辑器中配置（{f.t}）
        </div>
      )
    default:
      return null
  }
}

function inputToField(inp: ComponentInput): FormField {
  const label = inp.label?.trim() || inp.key
  if (inp.valueType === 'number') return { t: 'number', key: inp.key, label }
  if (inp.valueType === 'boolean') return { t: 'checkbox', key: inp.key, label }
  if (inp.valueType === 'color') return { t: 'color', key: inp.key, label }
  if (inp.valueType === 'bind') return { t: 'bind', key: inp.key, label }
  if (inp.valueType === 'attr') return { t: 'attr', key: inp.key, label, entityKey: inp.entityKey ?? 'bind' }
  if (inp.valueType === 'string' && inp.options?.length) {
    return { t: 'select', key: inp.key, label, options: inp.options }
  }
  return { t: 'text', key: inp.key, label }
}

export function KindFormFields({
  componentId,
  params,
  onChange,
  pickers,
  excludeKeys,
}: {
  componentId: string
  params: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  pickers?: EditorPickerCtx
  /**
   * 排除某些字段——已有专属编辑器接管时用（如 x/y 走 PositionEditor、
   * speaker 走「显示说话人前缀」开关、events 走结算区自带的分支编辑）。
   */
  excludeKeys?: string[]
}): JSX.Element | null {
  const plugin = getComponent(componentId)
  const form = plugin?.form
  const inputs = getComponentManifest(componentId)?.inputs ?? []
  // form 优先（含 events/effects 等复合控件）；无 form 时由 inputs（含 bind/attr）派生。
  const allFields: FormField[] = form?.length ? form : inputs.map(inputToField)
  const fields = excludeKeys?.length ? allFields.filter((f) => !excludeKeys.includes(f.key)) : allFields
  if (!fields.length) {
    return <div style={{ fontSize: 11, opacity: 0.5 }}>该组件无配置字段（component={componentId}）</div>
  }
  const onPatch = (patch: Record<string, unknown>) => {
    let next = { ...params }
    for (const [k, v] of Object.entries(patch)) next = patchParam(next, k, v)
    onChange(next)
  }
  return (
    <div>
      {fields.map((f) => (
        <div key={f.key}>{renderField(f, params, onPatch, pickers)}</div>
      ))}
    </div>
  )
}
