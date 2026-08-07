/**
 * ScenarioInspector —— 场景级配置：variables / entities / overlays 目录 / formulas / 默认 BGM。
 */
import { useEffect, useState, type CSSProperties, type JSX } from 'react'
import type { AttrMeta, Entity, GameScenario, Layout, Overlay, ScalarValue, Variable } from '../../runtime/schema/graph-schema'
import type { Formula } from '../persist/formula-authoring'
import { OverlayCatalogPreview } from './OverlayCatalogPreview'
import { OverlayChildStyleEditor } from './OverlayChildStyleEditor'
import { NEW_COMPONENT_PRESETS, sortSchemeIds } from '../demo/builtin-schemes'
import { FormulaTextEditor } from './FormulaTextEditor'
import { LooseNumberInput } from './TermChainEditor'
import type { ScenarioIdRename } from '../persist/scenario-id'
import { nextUniqueOverlayTitle, overlayTitleExists } from './overlay-title'
import { injectStyleOnce } from '../../styles/injectStyle'

export type ScenarioMeta = Pick<GameScenario, 'variables' | 'entities' | 'ui'> & {
  formulas?: Record<string, Formula>
}

const box: CSSProperties = { border: '1px solid #2a2a2a', borderRadius: 6, padding: 6, marginTop: 6 }
const rowStyle: CSSProperties = { display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4, fontSize: 12 }
const lbl: CSSProperties = { width: 60, opacity: 0.7, flexShrink: 0, fontSize: 11 }
const del: CSSProperties = { color: '#ff6b6b', marginLeft: 'auto' }
const sectionTitle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: 12,
  borderTop: '1px solid #333',
  padding: '6px 0',
  position: 'sticky',
  top: 0,
  zIndex: 2,
  background: 'var(--gc-panel, #1b1713)',
}
const variableGridColumns = 'minmax(0, 0.9fr) minmax(0, 1.5fr) minmax(4rem, 0.5fr) minmax(3.5rem, 0.55fr) 2rem'
const entityAttrGrid = 'minmax(4.5rem, 0.45fr) minmax(0, 0.9fr) minmax(4rem, 0.5fr) minmax(7rem, 1.25fr) 2rem'
const FORMULA_RULES_CSS = `
.sir-formulas { min-width:0; }
.sir-formula-toolbar {
  height:44px; display:flex; align-items:center; justify-content:flex-end; gap:12px;
}
.sir-formula-create {
  height:24px; padding:0 10px; border:0; border-radius:6px;
  background:rgba(255,255,255,.08); color:rgba(255,255,255,.86);
  font-size:12px; cursor:pointer;
}
.sir-formula-search {
  box-sizing:border-box; width:190px; height:24px; padding:0 10px 0 30px;
  border:0; border-radius:6px; outline:0; color:rgba(255,255,255,.86);
  background:rgba(255,255,255,.08);
}
.sir-formula-search::placeholder { color:rgba(255,255,255,.32); }
.sir-formula-search-wrap { position:relative; display:inline-flex; }
.sir-formula-search-icon {
  position:absolute; left:10px; top:50%; width:12px; height:12px;
  transform:translateY(-50%); color:rgba(255,255,255,.88); pointer-events:none;
}
.sir-formula-row { border-bottom:1px solid rgba(255,255,255,.08); }
.sir-formula-row:first-of-type { border-top:1px solid rgba(255,255,255,.08); }
.sir-formula-head {
  min-height:64px; display:flex; align-items:center; gap:8px; position:relative;
}
.sir-formula-toggle {
  width:16px; height:20px; padding:0; border:0; background:transparent;
  display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
  color:rgba(255,255,255,.34);
}
.sir-formula-toggle.is-open { color:rgba(255,255,255,.92); }
.sir-formula-toggle svg {
  width:12px; height:12px; display:block; transition:transform .16s ease,color .16s ease;
}
.sir-formula-toggle.is-open svg { transform:rotate(-90deg); }
.sir-formula-name {
  min-width:0; width:auto; max-width:40%; padding:0; border:0; outline:0;
  background:transparent; color:rgba(255,255,255,.9); font:inherit; font-size:14px;
}
.sir-formula-id { color:rgba(255,255,255,.32); font-size:14px; }
.sir-formula-more {
  margin-left:auto; width:24px; height:24px; padding:0; border:0;
  background:transparent; color:rgba(255,255,255,.9); font-size:18px;
  line-height:18px; cursor:pointer;
}
.sir-formula-menu {
  position:absolute; z-index:3; right:0; top:46px; padding:4px;
  border:1px solid rgba(255,255,255,.1); border-radius:6px; background:#242424;
  box-shadow:0 8px 20px rgba(0,0,0,.3);
}
.sir-formula-menu button {
  min-width:72px; height:26px; border:0; border-radius:4px; background:transparent;
  color:#ff8e8e; cursor:pointer;
}
.sir-formula-menu button:hover { background:rgba(255,255,255,.08); }
.sir-formula-body { padding:0 0 14px; }
.sir-formula-field { display:grid; gap:6px; margin-bottom:10px; }
.sir-formula-field > span { color:rgba(255,255,255,.48); font-size:12px; }
.sir-formula-field > input {
  box-sizing:border-box; width:100%; height:24px; padding:0 8px;
  border:0; border-radius:6px; outline:0; background:rgba(0,0,0,.55);
  color:rgba(255,255,255,.88);
}
.sir-formula-empty { padding:20px 0; color:rgba(255,255,255,.38); }
`

function field(label: string, node: JSX.Element): JSX.Element {
  return (
    <label style={rowStyle}>
      <span style={lbl}>{label}</span>
      {node}
    </label>
  )
}

function EditableIdInput({ value, existing, rename, onRename, label }: {
  value: string
  existing: Record<string, unknown>
  rename: Omit<ScenarioIdRename, 'newId'> | { kind: 'attribute'; entityId: string; oldId: string }
  onRename: (rename: ScenarioIdRename) => { ok: true } | { ok: false; reason: 'empty_id' | 'duplicate_id' | 'not_found' }
  label: string
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  const next = draft.trim()
  const error = !next ? 'ID 不能为空' : next !== value && Object.hasOwn(existing, next) ? 'ID 已存在' : ''
  const commit = (): void => {
    if (error) { window.alert(`${label} 无法修改：${error}`); setDraft(value); return }
    if (next === value) return
    const result = onRename({ ...rename, newId: next } as ScenarioIdRename)
    if (!result.ok) { window.alert(`${label} 无法修改：ID 已存在`); setDraft(value) }
  }
  return <input value={draft} aria-label={label} aria-invalid={Boolean(error)} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur() } }} />
}

function ValueSettings({ values, onChange, label }: {
  values: Pick<AttrMeta, 'min' | 'max' | 'initial'>
  onChange: (field: 'min' | 'max' | 'initial', value: number | undefined) => void
  label: string
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const configured = (['min', 'max', 'initial'] as const).filter((field) => values[field] !== undefined)
  return (
    <div style={{ gridColumn: '1 / -1', marginTop: 2 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', color: open ? '#d0c7b7' : '#918a7e', fontSize: 11, background: 'none', border: 0, cursor: 'pointer' }}
      >
        <span style={{ width: 10, color: '#b6a78d', fontSize: 13 }}>{open ? '⌄' : '›'}</span>
        <span>高级设置</span>
        {configured.length === 0 ? <span style={{ opacity: 0.55 }}>未配置</span> : configured.map((field) => (
          <span key={field} style={{ padding: '1px 5px', borderRadius: 3, background: 'rgba(184,161,117,.14)', color: '#c9b68e' }}>
            {field === 'min' ? '最小' : field === 'max' ? '最大' : '初始'} {values[field]}
          </span>
        ))}
      </button>
      {open ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, margin: '3px 0 5px', padding: '8px 10px 10px', background: 'rgba(176,151,105,.08)', border: '1px solid rgba(184,161,117,.2)', borderLeft: '2px solid #9f875d', borderRadius: 4 }}>
          {(['min', 'max', 'initial'] as const).map((field) => (
            <label key={field} style={{ display: 'grid', gap: 5, fontSize: 10, color: '#b2aa9c' }}>
              {field === 'min' ? '最小值' : field === 'max' ? '最大值' : '初始值'}
              <div style={{ display: 'flex', gap: 3 }}>
                <OptionalNumberInput value={values[field]} label={`${label} ${field}`} onCommit={(value) => onChange(field, value)} />
                {values[field] !== undefined ? <button type="button" onClick={() => onChange(field, undefined)} title={`清空${field}`} aria-label={`清空${field}`} style={{ padding: '0 5px', color: '#aab6c7', border: 0, background: 'none' }}>×</button> : null}
              </div>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function OptionalNumberInput({ value, onCommit, label }: { value?: number; onCommit: (value: number | undefined) => void; label: string }): JSX.Element {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  useEffect(() => setDraft(value == null ? '' : String(value)), [value])
  return <input type="text" inputMode="decimal" value={draft} aria-label={label} placeholder="未设置" style={{ width: '100%', minWidth: 0, padding: '4px 6px', background: 'rgba(0,0,0,.18)', border: '1px solid rgba(255,255,255,.13)', borderRadius: 4 }} onChange={(e) => setDraft(e.target.value)} onBlur={() => {
    const raw = draft.trim()
    const parsed = Number(raw)
    onCommit(raw && Number.isFinite(parsed) ? parsed : undefined)
  }} />
}

function ScalarValueInput({ value, onChange, label, style }: {
  value: ScalarValue
  onChange: (value: ScalarValue) => void
  label: string
  style?: CSSProperties
}): JSX.Element {
  const isString = typeof value === 'string'
  return (
    <>
      <select value={isString ? 'string' : 'number'} aria-label={`${label}类型`} onChange={(event) => onChange(event.target.value === 'string' ? '' : 0)} style={{ minWidth: 0, width: '100%' }}>
        <option value="number">数值</option>
        <option value="string">字符</option>
      </select>
      {isString
        ? <input type="text" value={value} aria-label={label} onChange={(event) => onChange(event.target.value)} style={style} />
        : <LooseNumberInput value={value} aria-label={label} emptyValue={0} onChange={onChange} style={style} />}
    </>
  )
}

/** 自动分配与 Record key 对齐的 id（添加时用）。 */
function allocId(prefix: string, existing: Record<string, unknown>): string {
  let i = Object.keys(existing).length
  let id = `${prefix}${i}`
  while (existing[id]) {
    i += 1
    id = `${prefix}${i}`
  }
  return id
}

const ATTR_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/

function clampRuleValue(value: number, meta: Pick<AttrMeta, 'min' | 'max'> | undefined): number {
  let next = value
  if (meta?.min !== undefined) next = Math.max(meta.min, next)
  if (meta?.max !== undefined) next = Math.min(meta.max, next)
  return next
}

function normalizeRange<T extends Pick<AttrMeta, 'min' | 'max' | 'initial'>>(
  meta: T,
  changedField: 'min' | 'max' | 'initial',
): T {
  const next = { ...meta }
  if (next.min !== undefined && next.max !== undefined && next.min > next.max) {
    if (changedField === 'min') next.max = next.min
    else next.min = next.max
  }
  if (next.initial !== undefined) next.initial = clampRuleValue(next.initial, next)
  return next as T
}

function AttributeIdInput({
  id,
  onCommit,
}: {
  id: string
  onCommit: (nextId: string) => string | undefined
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const commit = (input: HTMLInputElement): void => {
    const nextId = draft.trim()
    if (!nextId) return
    const error = onCommit(nextId)
    if (error) {
      input.setCustomValidity(error)
      input.reportValidity()
      return
    }
    input.setCustomValidity('')
  }

  return (
    <input
      value={draft}
      placeholder={id}
      aria-label={`属性「${id}」的 id`}
      pattern="[A-Za-z_][A-Za-z0-9_-]*"
      style={{ width: 84 }}
      title="属性 id：用于 entity.<实体id>.attr.<属性id> 引用；修改已有 id 可能需要同步检查公式和绑定"
      onChange={(e) => {
        e.currentTarget.setCustomValidity('')
        setDraft(e.currentTarget.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(e.currentTarget)
        }
        if (e.key === 'Escape') {
          setDraft('')
          e.currentTarget.setCustomValidity('')
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => commit(e.currentTarget)}
    />
  )
}


/** 引用角标：被 N 个节点挂载引用；0 = 未被引用（灰）。 */
function UsageBadge({ count }: { count: number }): JSX.Element {
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

export type ScenarioSection = 'overlays' | 'variables' | 'entities' | 'formulas'

export function ScenarioInspector({
  value,
  section,
  overlayUsage,
  focusItemId,
  onChange,
  onRenameId = () => ({ ok: false, reason: 'not_found' }),
}: {
  value: ScenarioMeta
  section?: ScenarioSection
  /** overlayId → 被多少节点挂载引用（资源池「已用/未用」角标）。 */
  overlayUsage?: Record<string, number>
  /** 外侧规则树请求定位的同域条目。 */
  focusItemId?: string | null
  onChange: (next: ScenarioMeta) => void
  onRenameId?: (rename: ScenarioIdRename) => { ok: true } | { ok: false; reason: 'empty_id' | 'duplicate_id' | 'not_found' }
}): JSX.Element {
  injectStyleOnce('scenario-inspector-formulas', FORMULA_RULES_CSS)
  const show = (s: ScenarioSection) => !section || section === s
  const variables = value.variables ?? {}
  const entities = value.entities ?? {}
  const formulas = value.formulas ?? {}
  const allOverlays = value.ui?.overlays ?? {}
  // 「通用样式」= 自由方案；排除每节点自动内容 overlay（node:*，那是时间轴的内容容器）。
  // 内置方案（静态/动态组件方案）固定置顶，其余按目录原有顺序跟后，见 sortSchemeIds。
  const schemeIds = sortSchemeIds(Object.keys(allOverlays).filter((id) => !id.startsWith('node:')))
  // 标题输入本地缓存：onChange 自由输入，onBlur 时提交到 renameScheme 做重名校验。
  const [schemeLocalTitles, setSchemeLocalTitles] = useState<Record<string, string>>({})
  const [formulaSearch, setFormulaSearch] = useState('')
  useEffect(() => {
    if (section === 'formulas' && focusItemId) setFormulaSearch('')
  }, [focusItemId, section])
  useEffect(() => {
    if (!focusItemId) return
    document.getElementById(`rule-item:${focusItemId}`)?.scrollIntoView({ block: 'nearest' })
  }, [focusItemId, formulaSearch, section])
  const setOverlays = (overlays: Record<string, Overlay>) => onChange({ ...value, ui: { ...value.ui, overlays } })
  const patchOverlayChildInMeta = (
    overlayId: string,
    childId: string,
    patch: { inputs?: Record<string, unknown>; component?: string; layout?: Partial<Layout> },
  ) => {
    const ov = allOverlays[overlayId]
    if (!ov) return
    setOverlays({
      ...allOverlays,
      [overlayId]: {
        ...ov,
        children: ov.children.map((c) =>
          c.id !== childId
            ? c
            : {
                ...c,
                ...(patch.component != null ? { component: patch.component } : {}),
                inputs: patch.inputs ? { ...c.inputs, ...patch.inputs } : c.inputs,
                layout: patch.layout ? { ...c.layout, ...patch.layout } : c.layout,
              },
        ),
      },
    })
  }
  const addSchemeChild = (overlayId: string, presetId: string) => {
    const ov = allOverlays[overlayId]
    const preset = NEW_COMPONENT_PRESETS.find((p) => p.id === presetId)
    if (!ov || !preset) return
    const childId = `${presetId}-${Object.keys(ov.children).length}-${Date.now().toString(36)}`
    setOverlays({ ...allOverlays, [overlayId]: { ...ov, children: [...ov.children, preset.make(childId)] } })
  }
  const removeSchemeChild = (overlayId: string, childId: string) => {
    const ov = allOverlays[overlayId]
    if (!ov) return
    setOverlays({ ...allOverlays, [overlayId]: { ...ov, children: ov.children.filter((c) => c.id !== childId) } })
  }
  const renameScheme = (overlayId: string, title: string) => {
    const ov = allOverlays[overlayId]
    if (!ov) return
    if (overlayTitleExists(allOverlays, title, overlayId)) {
      window.alert(`界面方案名称「${title.trim()}」已存在`)
      return
    }
    setOverlays({ ...allOverlays, [overlayId]: { ...ov, title } })
  }
  const addScheme = () => {
    const id = allocId('scheme-', allOverlays)
    setOverlays({
      ...allOverlays,
      [id]: { id, title: nextUniqueOverlayTitle(allOverlays), children: [] },
    })
  }
  const removeScheme = (overlayId: string) => {
    const { [overlayId]: _drop, ...rest } = allOverlays
    setOverlays(rest)
  }
  const setVariables = (v: Record<string, Variable>) => onChange({ ...value, variables: v })
  const setEntities = (e: Record<string, Entity>) => onChange({ ...value, entities: e })
  const setFormulas = (f: Record<string, Formula>) => onChange({ ...value, formulas: f })
  const normalizedFormulaSearch = formulaSearch.trim().toLocaleLowerCase()
  const formulaEntries = Object.entries(formulas).filter(([id, formula]) => {
    if (!normalizedFormulaSearch) return true
    return [id, formula.name, formula.description]
      .some((part) => part?.toLocaleLowerCase().includes(normalizedFormulaSearch))
  })

  return (
    <div style={{ padding: 10, fontSize: 12 }}>
      {show('overlays') && (
        <>
          <div style={sectionTitle}>
            <b>通用样式 · 界面方案</b>
            <button onClick={addScheme}>+ 方案</button>
          </div>
          <div style={{ opacity: 0.55, fontSize: 11, marginBottom: 6 }}>
            自由可复用的界面方案（与节点解耦）：预览显示该方案的全部组件；节点在蓝图/挂载处引用方案。
          </div>
          {schemeIds.length === 0 ? (
            <div style={{ opacity: 0.5 }}>暂无方案</div>
          ) : (
            schemeIds.map((id) => {
              const ov = allOverlays[id]
              if (!ov) return null
              return (
                <div key={id} style={box}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <input
                      value={schemeLocalTitles[id] ?? ov.title ?? ''}
                      placeholder={id}
                      onChange={(e) => setSchemeLocalTitles((prev) => ({ ...prev, [id]: e.target.value }))}
                      onBlur={(e) => {
                        const local = schemeLocalTitles[id]
                        // 先清理本地缓存，保证聚焦后 value 回退到 ov.title
                        setSchemeLocalTitles((prev) => {
                          const next = { ...prev }
                          delete next[id]
                          return next
                        })
                        if (local !== undefined && local !== (ov.title ?? '')) {
                          renameScheme(id, local)
                          // 延迟聚焦：避免同步 blur→focus 触发重复 blur 事件
                          setTimeout(() => {
                            ;(e.target as HTMLInputElement).focus()
                          }, 0)
                        }
                      }}
                      style={{ flex: 1, fontWeight: 600 }}
                    />
                    <UsageBadge count={overlayUsage?.[id] ?? 0} />
                    <button style={del} onClick={() => removeScheme(id)}>删除</button>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 8 }}>{id}</div>
                  <OverlayCatalogPreview overlay={ov} entities={entities} variables={variables} />
                  <div style={{ marginTop: 10, borderTop: '1px solid #333', paddingTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>组件（{ov.children.length}）</span>
                      <select
                        value=""
                        onChange={(e) => { if (e.target.value) addSchemeChild(id, e.target.value) }}
                        style={{ fontSize: 11 }}
                      >
                        <option value="">+ 添加组件…</option>
                        {NEW_COMPONENT_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                    {ov.children.map((child) => (
                      <div key={child.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <OverlayChildStyleEditor
                            child={child}
                            onPatchParams={(patch) => patchOverlayChildInMeta(id, child.id, { inputs: patch })}
                            onPatchComponent={(component) => patchOverlayChildInMeta(id, child.id, { component })}
                            onPatchLayout={(patch) => patchOverlayChildInMeta(id, child.id, { layout: patch })}
                          />
                        </div>
                        <button style={{ ...del, marginTop: 6 }} onClick={() => removeSchemeChild(id, child.id)} title="移除组件">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </>
      )}

      {show('variables') && (
        <>
          <div style={sectionTitle}>
            <b>变量</b>
            <button
              onClick={() => {
                const id = allocId('var', variables)
                setVariables({ ...variables, [id]: { id, name: id, initial: 0 } })
              }}
            >
              + 变量
            </button>
          </div>
          {Object.keys(variables).length > 0 ? (
            <div
              aria-hidden
              style={{
                display: 'grid',
                gridTemplateColumns: variableGridColumns,
                gap: 8,
                padding: '0 10px',
                margin: '8px 0 2px',
                color: 'var(--gc-faint, #8c8377)',
                fontSize: 10,
                letterSpacing: '0.08em',
              }}
            >
              <span>ID</span>
              <span>名称</span>
              <span>类型</span>
              <span>初值</span>
              <span />
            </div>
          ) : null}
          {Object.entries(variables).map(([key, v]) => (
            <div
              key={key}
              id={`rule-item:${key}`}
              style={{
                ...box,
                display: 'grid',
                gridTemplateColumns: variableGridColumns,
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                background: 'rgba(255,255,255,0.025)',
              }}
            >
              <EditableIdInput value={v.id} existing={variables} rename={{ kind: 'variable', oldId: key }} onRename={onRenameId} label="变量 ID" />
              <input
                value={v.name ?? ''}
                placeholder="变量名称"
                aria-label={`${v.id} 的名称`}
                onChange={(e) => setVariables({ ...variables, [key]: { ...v, id: key, name: e.target.value } })}
                style={{ width: '100%', minWidth: 0 }}
              />
              <ScalarValueInput
                value={v.initial ?? 0}
                label={`${v.id} 的初值`}
                onChange={(initial) => setVariables({
                  ...variables,
                  [key]: {
                    ...v,
                    id: key,
                    initial: typeof initial === 'number' ? clampRuleValue(initial, v) : initial,
                  },
                })}
                style={{ width: '100%', minWidth: 0 }}
              />
              <button
                style={{ ...del, marginLeft: 0, padding: 0, width: '2rem', height: '2rem' }}
                onClick={() => {
                  const { [key]: _d, ...rest } = variables
                  setVariables(rest)
                }}
                title={`删除变量「${v.name || v.id}」`}
                aria-label={`删除变量「${v.name || v.id}」`}
              >
                ×
              </button>
              {typeof v.initial !== 'string' ? <ValueSettings values={{ min: v.min, max: v.max, initial: v.initial }} label={v.id} onChange={(field, value) => {
                const normalized = normalizeRange({
                  min: v.min,
                  max: v.max,
                  initial: typeof v.initial === 'number' ? v.initial : undefined,
                  [field]: value,
                }, field)
                setVariables({ ...variables, [key]: { ...v, ...normalized, initial: clampRuleValue(normalized.initial ?? 0, normalized) } })
              }} /> : null}
            </div>
          ))}
        </>
      )}

      {show('entities') && (
        <>
          <div style={sectionTitle}>
            <b>实体</b>
            <button
              onClick={() => {
                const id = allocId('ent-', entities)
                setEntities({ ...entities, [id]: { id, name: id, attrs: {}, attrMeta: {} } })
              }}
            >
              + 实体
            </button>
          </div>
          {Object.entries(entities).map(([key, ent]) => (
            <div key={key} id={`rule-item:${key}`}>
              <EntityRow
                entKey={key}
                ent={ent}
                entities={entities}
                onChange={(next) => setEntities({ ...entities, [key]: { ...next, id: key } })}
                onRename={onRenameId}
                onDelete={() => {
                  const { [key]: _drop, ...rest } = entities
                  setEntities(rest)
                }}
              />
            </div>
          ))}
        </>
      )}

      {show('formulas') && (
        <div className="sir-formulas">
          <div className="sir-formula-toolbar">
            <button
              className="sir-formula-create"
              onClick={() => {
                const id = allocId('formula-', formulas)
                setFormulas({
                  ...formulas,
                  [id]: {
                    id,
                    name: id,
                    ast: { t: 'num', id: 'n0', v: 0 },
                    draftEmpty: true,
                  },
                })
              }}
            >
              ＋ 新建公式
            </button>
            <span className="sir-formula-search-wrap">
              <svg className="sir-formula-search-icon" viewBox="0 0 12 12" fill="none" aria-hidden>
                <circle cx="5.25" cy="5.25" r="3.75" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8.1 8.1L10.8 10.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                className="sir-formula-search"
                aria-label="搜索公式"
                placeholder="搜索公式"
                value={formulaSearch}
                onChange={(event) => setFormulaSearch(event.target.value)}
              />
            </span>
          </div>
          <div style={{ opacity: 0.55, fontSize: 11, marginBottom: 6 }}>
            定义可复用的计算公式（如伤害公式）；条款里的「实体」可留空，蓝图/时间轴应用该公式时再选具体实体填空。
          </div>
          {formulaEntries.length === 0 ? (
            <div className="sir-formula-empty">{normalizedFormulaSearch ? '没有匹配的公式' : '暂无公式'}</div>
          ) : null}
          {formulaEntries.map(([key, f], index) => (
            <FormulaRow
              key={key}
              formulaKey={key}
              formula={f}
              entities={entities}
              variables={variables}
              defaultExpanded={index === 0 || focusItemId === key}
              focused={focusItemId === key}
              onChange={(next) => setFormulas({ ...formulas, [key]: { ...next, id: key } })}
              onDelete={() => {
                const { [key]: _drop, ...rest } = formulas
                setFormulas(rest)
              }}
            />
          ))}
        </div>
      )}

    </div>
  )
}

function EntityRow({
  entKey,
  ent,
  entities,
  onChange,
  onRename,
  onDelete,
}: {
  entKey: string
  ent: Entity
  entities: Record<string, Entity>
  onChange: (next: Entity) => void
  onRename: (rename: ScenarioIdRename) => { ok: true } | { ok: false; reason: 'empty_id' | 'duplicate_id' | 'not_found' }
  onDelete: () => void
}): JSX.Element {
  const attrs = ent.attrs ?? {}
  const attrMeta = ent.attrMeta ?? {}
  const [editableAttrIds, setEditableAttrIds] = useState<Set<string>>(() => new Set())
  const setAttrs = (a: Record<string, ScalarValue>) => onChange({ ...ent, id: entKey, attrs: a })
  const setAttrMeta = (m: Record<string, AttrMeta>) => onChange({ ...ent, id: entKey, attrMeta: m })
  const setAttrValue = (attrId: string, value: ScalarValue) => {
    const nextAttrs = { ...attrs, [attrId]: value }
    const nextMeta = { ...attrMeta }

    if (typeof value === 'string') {
      onChange({ ...ent, id: entKey, attrs: nextAttrs, attrMeta: Object.keys(nextMeta).length ? nextMeta : undefined })
      return
    }

    // `<attr>Max` is the editor's established pairing convention (hp/hpMax,
    // stamina/staminaMax, ...). Rules author both the runtime seed in attrs and
    // its template metadata, so keep both halves coherent in one edit.
    const pairedBase = attrId.endsWith('Max')
      ? attrId.slice(0, -3)
      : Object.hasOwn(nextAttrs, `${attrId}Max`)
        ? attrId
        : ''
    if (
      pairedBase
      && Object.hasOwn(nextAttrs, pairedBase)
      && Object.hasOwn(nextAttrs, `${pairedBase}Max`)
      && typeof nextAttrs[pairedBase] === 'number'
      && typeof nextAttrs[`${pairedBase}Max`] === 'number'
    ) {
      const pairedMaxValue = nextAttrs[`${pairedBase}Max`] as number
      const pairedCurrentValue = nextAttrs[pairedBase] as number
      const pairedMeta = normalizeRange({
        ...nextMeta[pairedBase],
        max: pairedMaxValue,
      }, 'max')
      nextAttrs[`${pairedBase}Max`] = pairedMeta.max ?? pairedMaxValue
      nextAttrs[pairedBase] = clampRuleValue(pairedCurrentValue, pairedMeta)
      nextMeta[pairedBase] = {
        ...pairedMeta,
        initial: nextAttrs[pairedBase],
      }
    } else if (nextMeta[attrId]?.initial !== undefined) {
      nextAttrs[attrId] = clampRuleValue(value, nextMeta[attrId])
      nextMeta[attrId] = { ...nextMeta[attrId], initial: nextAttrs[attrId] }
    } else {
      nextAttrs[attrId] = clampRuleValue(value, nextMeta[attrId])
    }

    onChange({
      ...ent,
      id: entKey,
      attrs: nextAttrs,
      attrMeta: Object.keys(nextMeta).length ? nextMeta : undefined,
    })
  }
  const renameAttr = (currentId: string, nextId: string): string | undefined => {
    const id = nextId.trim()
    if (!id) return '属性 id 不能为空'
    if (!ATTR_ID_PATTERN.test(id)) return '属性 id 需以字母或下划线开头，仅可包含字母、数字、下划线和短横线'
    if (id !== currentId && Object.hasOwn(attrs, id)) return `属性 id「${id}」已存在`
    if (id === currentId) return undefined

    const nextAttrs = Object.fromEntries(
      Object.entries(attrs).map(([key, value]) => [key === currentId ? id : key, value]),
    )
    const nextMeta = Object.fromEntries(
      Object.entries(attrMeta).map(([key, value]) => [key === currentId ? id : key, value]),
    )
    onChange({
      ...ent,
      id: entKey,
      attrs: nextAttrs,
      attrMeta: Object.keys(nextMeta).length ? nextMeta : undefined,
    })
    return undefined
  }
  const removeAttr = (ak: string) => {
    const { [ak]: _a, ...restAttrs } = attrs
    const { [ak]: _m, ...restMeta } = attrMeta
    onChange({ ...ent, id: entKey, attrs: restAttrs, attrMeta: Object.keys(restMeta).length ? restMeta : undefined })
  }

  return (
    <div style={box}>
      {field('id', <EditableIdInput value={ent.id} existing={entities} rename={{ kind: 'entity', oldId: entKey }} onRename={onRename} label="实体 ID" />)}
      {field(
        '名称',
        <input
          value={ent.name ?? ''}
          onChange={(e) => onChange({ ...ent, id: entKey, name: e.target.value })}
          style={{ flex: 1 }}
        />,
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 2px' }}>
        <span style={{ fontSize: 11, opacity: 0.7 }}>attrs（公式里 entity.{entKey}.attr.&lt;名&gt; 引用）</span>
        <button
          style={{ fontSize: 11 }}
          onClick={() => {
            const id = allocId('attr', attrs)
            setEditableAttrIds((current) => new Set(current).add(id))
            setAttrs({ ...attrs, [id]: 0 })
          }}
        >
          + 属性
        </button>
      </div>
      {Object.entries(attrs).map(([ak, av]) => (
        <div key={ak} style={{ ...rowStyle, display: 'grid', gridTemplateColumns: entityAttrGrid, gap: 8, flexWrap: 'nowrap', marginBottom: 6, padding: '5px 0 7px', borderBottom: '1px solid rgba(255,255,255,.055)' }}>
          <EditableIdInput value={ak} existing={attrs} rename={{ kind: 'attribute', entityId: entKey, oldId: ak }} onRename={onRename} label={`${ent.id} 的属性 ID`} />
          <input
            value={attrMeta[ak]?.label ?? ''}
            placeholder="显示名"
            onChange={(e) => setAttrMeta({ ...attrMeta, [ak]: { ...attrMeta[ak], label: e.target.value || undefined } })}
            style={{ minWidth: 0, width: '100%' }}
          />
          <ScalarValueInput
            value={av}
            label={`属性「${ak}」的数值`}
            onChange={(value) => setAttrValue(ak, value)}
            style={{ minWidth: 0, width: '100%' }}
          />
          <button style={del} onClick={() => removeAttr(ak)} title="删除该属性">×</button>
          {typeof av !== 'string' ? <ValueSettings values={attrMeta[ak] ?? {}} label={`${ent.id} 的 ${ak}`} onChange={(field, value) => {
            const current = { ...attrMeta[ak] }
            if (value === undefined) delete current[field]
            else current[field] = value
            const normalized = normalizeRange(current, field)
            const nextMeta = { ...attrMeta }
            const nextAttrs = { ...attrs }
            if (Object.keys(normalized).length === 0) delete nextMeta[ak]
            else nextMeta[ak] = normalized
            if (typeof nextAttrs[ak] === 'number') nextAttrs[ak] = clampRuleValue(nextAttrs[ak], normalized)
            onChange({
              ...ent,
              id: entKey,
              attrs: nextAttrs,
              attrMeta: Object.keys(nextMeta).length ? nextMeta : undefined,
            })
          }} /> : null}
        </div>
      ))}
      {Object.keys(attrs).length === 0 ? <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>暂无属性</div> : null}
      <button style={{ ...del, marginTop: 6 }} onClick={onDelete}>
        删除实体
      </button>
    </div>
  )
}

function FormulaRow({
  formulaKey,
  formula,
  entities,
  variables,
  defaultExpanded,
  focused,
  onChange,
  onDelete,
}: {
  formulaKey: string
  formula: Formula
  entities: Record<string, Entity>
  variables: Record<string, Variable>
  defaultExpanded: boolean
  focused: boolean
  onChange: (next: Formula) => void
  onDelete: () => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    if (focused) setExpanded(true)
  }, [focused])
  return (
    <div id={`rule-item:${formulaKey}`} className="sir-formula-row">
      <div className="sir-formula-head">
        <button
          type="button"
          className={`sir-formula-toggle${expanded ? ' is-open' : ''}`}
          aria-label={`${expanded ? '折叠' : '展开'}公式 ${formula.name || formulaKey}`}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <svg viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <input
          className="sir-formula-name"
          aria-label={`公式 ${formulaKey} 名称`}
          value={formula.name ?? ''}
          onChange={(e) => onChange({ ...formula, id: formulaKey, name: e.target.value })}
        />
        <span className="sir-formula-id">id:{formulaKey}</span>
        <button
          type="button"
          className="sir-formula-more"
          aria-label={`${formula.name || formulaKey}更多操作`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          ⋯
        </button>
        {menuOpen ? (
          <div className="sir-formula-menu" role="menu">
            <button type="button" onClick={onDelete}>删除公式</button>
          </div>
        ) : null}
      </div>
      {expanded ? (
        <div className="sir-formula-body">
          <label className="sir-formula-field">
            <span>描述</span>
            <input
              value={formula.description ?? ''}
              placeholder="如：伤害 = 攻击力 × 倍率 - 防御力"
              onChange={(e) => onChange({ ...formula, id: formulaKey, description: e.target.value || undefined })}
            />
          </label>
          <div className="sir-formula-field">
            <span>公式</span>
            <FormulaTextEditor
              ast={formula.ast}
              empty={formula.draftEmpty}
              entities={entities}
              variables={variables}
              onEmpty={formula.draftEmpty
                ? () => onChange({ ...formula, id: formulaKey, draftEmpty: true })
                : undefined}
              onChange={(ast) => onChange({
                ...formula,
                id: formulaKey,
                ast,
                draftEmpty: undefined,
              })}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
