/**
 * 按组件 `ComponentManifest.inputs` 渲染 overlay child 的输入：
 * 有 `component`（color/entity/events/effects/textStyle/qteCues…）优先用对应输入组件；否则按 `valueType`
 * （string/number/boolean + `options`→select）出标量控件。
 *
 * 复合输入（`component: textStyle/effects/events/qteCues`，或 valueType='json'）：events/effects 出结构化编辑器，
 * textStyle/qteCues 暂交「视频」轨编辑器（见 docs/inputs-ssot.md）。填了 `component` 优先用它，否则按 valueType。
 * `component: 'entity'`：场景实体下拉（复用 EffectsEditor 同源的 EntitySelect，见 editors.tsx / metaCatalog.ts）。
 */
import type { CSSProperties, JSX } from 'react'
import type { ComponentInput } from '../../runtime/schema/node-config-schema'
import { baseKindOf, getComponentManifest } from '../../runtime/registry/kind-registry'
import { EffectsEditor, EntitySelect, EventsEditor, type ComponentEventLike, type EditorPickerCtx } from './editors'

/**
 * events 编辑器的 variant 由组件（解析别名后的）基础隶属家族在编辑器侧推导——**不写进 schema**：
 * hotspot=画面锚点 x/y；choice/skill=可配门控 condition；其余（qte…）=纯出口目录。
 * 隶属判断统一走 `baseKindOf`（唯一官方分类入口）——不要直接读 `KindPlugin.kind`，
 * 以后若要换成别的归类方式，只需改这一个函数体，不影响其它读 inputs/events 的逻辑。
 */
function eventsVariantFor(componentId: string): 'plain' | 'choice' | 'hotspot' {
  const base = baseKindOf(componentId)
  if (base === 'hotspot') return 'hotspot'
  if (base === 'choice' || base === 'skill') return 'choice'
  return 'plain'
}

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

function patchValue(
  values: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  if (value === undefined || value === '') {
    const { [key]: _drop, ...rest } = values
    return rest
  }
  return { ...values, [key]: value }
}

function renderInput(
  componentId: string,
  inp: ComponentInput,
  values: Record<string, unknown>,
  onPatch: (key: string, value: unknown) => void,
  pickers?: EditorPickerCtx,
): JSX.Element | null {
  const val = values[inp.key]
  const label = inp.label ?? inp.key
  // 有 component 优先用它渲染（复合编辑器）；events / effects 直接出结构化子编辑器，textStyle / qteCues 暂交「视频」轨。
  if (inp.component === 'events') {
    return (
      <div key={inp.key} style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>{label}</div>
        <EventsEditor
          value={Array.isArray(val) ? (val as ComponentEventLike[]) : undefined}
          variant={eventsVariantFor(componentId)}
          pickers={pickers}
          onChange={(events) => onPatch(inp.key, events)}
        />
      </div>
    )
  }
  if (inp.component === 'effects') {
    return (
      <div key={inp.key} style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>{label}</div>
        <EffectsEditor
          value={Array.isArray(val) ? (val as never) : undefined}
          pickers={pickers}
          onChange={(effs) => onPatch(inp.key, effs)}
        />
      </div>
    )
  }
  if (inp.component === 'color') {
    return field(label, (
      <input
        value={typeof val === 'string' ? val : ''}
        placeholder="#ffffff"
        onChange={(e) => onPatch(inp.key, e.target.value || undefined)}
        style={{ flex: 1, fontSize: 12, fontFamily: 'monospace' }}
      />
    ))
  }
  if (inp.component === 'entity') {
    return field(label, (
      <EntitySelect
        value={typeof val === 'string' ? val : ''}
        entities={pickers?.entities}
        onChange={(id) => onPatch(inp.key, id || undefined)}
      />
    ))
  }
  if (inp.component) {
    // 其它输入组件（textStyle / qteCues / 未接入的）暂交「视频」轨编辑器。
    return (
      <div key={inp.key} style={{ fontSize: 11, opacity: 0.55, marginBottom: 4 }}>
        {label}：请用「{inp.component}」编辑器（暂在「视频」轨配置）
      </div>
    )
  }
  if (inp.options) {
    return field(label, (
      <select
        value={typeof val === 'string' ? val : ''}
        onChange={(e) => onPatch(inp.key, e.target.value || undefined)}
        style={{ flex: 1, fontSize: 12 }}
      >
        <option value="">（未选）</option>
        {inp.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ))
  }
  switch (inp.valueType) {
    case 'number':
      return field(label, (
        <input
          type="number"
          value={typeof val === 'number' ? val : ''}
          onChange={(e) => onPatch(inp.key, e.target.value === '' ? undefined : Number(e.target.value))}
          style={{ flex: 1, fontSize: 12 }}
        />
      ))
    case 'boolean':
      return field(label, (
        <input type="checkbox" checked={Boolean(val)} onChange={(e) => onPatch(inp.key, e.target.checked)} />
      ))
    case 'string':
    default:
      return field(label, (
        <input
          value={typeof val === 'string' ? val : ''}
          onChange={(e) => onPatch(inp.key, e.target.value || undefined)}
          style={{ flex: 1, fontSize: 12 }}
        />
      ))
  }
}

/** 由组件 manifest.inputs 驱动的通用配置面板（标量 + select；复合项提示跳过）。 */
export function KindFormFields({
  componentId,
  values,
  onChange,
  pickers,
  excludeKeys,
}: {
  componentId: string
  values: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  pickers?: EditorPickerCtx
  /**
   * 排除某些字段——已有专属编辑器接管时用（如 x/y 走 PositionEditor、
   * speaker 走「显示说话人前缀」开关、events 走结算区自带的分支编辑）。
   */
  excludeKeys?: string[]
}): JSX.Element | null {
  const allInputs = getComponentManifest(componentId)?.inputs ?? []
  const inputs = excludeKeys?.length ? allInputs.filter((inp) => !excludeKeys.includes(inp.key)) : allInputs
  if (!inputs.length) {
    return <div style={{ fontSize: 11, opacity: 0.5 }}>该组件无可配 inputs（component={componentId}）</div>
  }
  const onPatch = (key: string, value: unknown) => onChange(patchValue(values, key, value))
  return (
    <div>
      {inputs.map((inp) => renderInput(componentId, inp, values, onPatch, pickers))}
    </div>
  )
}
