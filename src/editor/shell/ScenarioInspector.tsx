/**
 * ScenarioInspector —— 场景级配置：variables / entities / overlays 目录 / rng / reactions。
 */
import type { CSSProperties, JSX } from 'react'
import type { AttrMeta, Entity, GameScenario, Overlay, OverlayChild, Reaction, Variable } from '../../runtime/schema/graph-schema'
import { ConditionEditor, type EditorPickerCtx } from './editors'
import { KindFormFields } from './kind-form-fields'
import { getComponentManifest, getComponent, listKinds } from '../../runtime/registry/kind-registry'

export type ScenarioMeta = Pick<GameScenario, 'variables' | 'entities' | 'ui' | 'rng' | 'reactions'>

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
  paddingTop: 6,
}

function field(label: string, node: JSX.Element): JSX.Element {
  return (
    <label style={rowStyle}>
      <span style={lbl}>{label}</span>
      {node}
    </label>
  )
}

/** 自动分配与 Record key 对齐的 id（添加时用；用户不可手填）。 */
function allocId(prefix: string, existing: Record<string, unknown>): string {
  let i = Object.keys(existing).length
  let id = `${prefix}${i}`
  while (existing[id]) {
    i += 1
    id = `${prefix}${i}`
  }
  return id
}

/** overlay 内 child id：以 component 名为基，撞名加序号。 */
function allocChildId(component: string, children: OverlayChild[]): string {
  const has = (x: string) => children.some((c) => c.id === x)
  if (!has(component)) return component
  let i = 1
  while (has(`${component}${i}`)) i += 1
  return `${component}${i}`
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

export type ScenarioSection = 'scene' | 'overlays' | 'variables' | 'entities' | 'rules'

export function ScenarioInspector({
  value,
  nodeIds,
  nodeLabel,
  section,
  overlayUsage,
  onChange,
}: {
  value: ScenarioMeta
  nodeIds: string[]
  /** 节点下拉展示；缺省用 id。 */
  nodeLabel?: (id: string) => string
  section?: ScenarioSection
  /** overlayId → 被多少节点挂载引用（资源池「已用/未用」角标）。 */
  overlayUsage?: Record<string, number>
  onChange: (next: ScenarioMeta) => void
}): JSX.Element {
  const show = (s: ScenarioSection) => !section || section === s
  const variables = value.variables ?? {}
  const entities = value.entities ?? {}
  const reactions = value.reactions ?? []
  const seed = value.rng?.seed ?? 0
  const overlayIds = Object.keys(value.ui?.overlays ?? {})
  const pickers: EditorPickerCtx = { entities, variables, nodeLabel }
  // ── overlay 资源池 CRUD（目录 = ui.overlays，与节点使用解耦）────────────────────
  const setOverlays = (overlays: Record<string, Overlay>) =>
    onChange({ ...value, ui: { ...value.ui, overlays } })
  const addOverlay = () => {
    const overlays = value.ui?.overlays ?? {}
    const id = allocId('overlay', overlays)
    setOverlays({ ...overlays, [id]: { id, title: '', children: [] } })
  }
  const deleteOverlay = (id: string) => {
    const { [id]: _drop, ...rest } = value.ui?.overlays ?? {}
    setOverlays(rest)
  }
  const patchOverlay = (id: string, patch: Partial<Overlay>) => {
    const overlays = value.ui?.overlays ?? {}
    const ov = overlays[id]
    if (!ov) return
    setOverlays({ ...overlays, [id]: { ...ov, ...patch } })
  }
  const addChild = (id: string, component: string) => {
    const ov = value.ui?.overlays?.[id]
    if (!ov || !component) return
    const defaults = getComponent(component)?.defaults?.() as Record<string, unknown> | undefined
    const child: OverlayChild = {
      id: allocChildId(component, ov.children),
      component,
      trigger: { when: 'enter' },
      params: defaults ?? {},
    }
    patchOverlay(id, { children: [...ov.children, child] })
  }
  const removeChild = (id: string, childId: string) => {
    const ov = value.ui?.overlays?.[id]
    if (!ov) return
    patchOverlay(id, { children: ov.children.filter((c) => c.id !== childId) })
  }
  const kindOptions = listKinds()
    .map((k) => ({ value: k.kind, label: k.label ? `${k.label} (${k.kind})` : k.kind }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const setVariables = (v: Record<string, Variable>) => onChange({ ...value, variables: v })
  const setEntities = (e: Record<string, Entity>) => onChange({ ...value, entities: e })
  const setReactions = (r: Reaction[]) => onChange({ ...value, reactions: r.length ? r : undefined })
  const patchReaction = (i: number, p: Partial<Reaction>) => setReactions(reactions.map((r, idx) => (idx === i ? { ...r, ...p } : r)))

  return (
    <div style={{ padding: 10, overflow: 'auto', fontSize: 12 }}>
      {show('scene') &&
        field(
          '随机种子',
          <input
            type="number"
            value={seed}
            onChange={(e) => onChange({ ...value, rng: { seed: Number(e.target.value) || 0 } })}
            style={{ width: 120 }}
          />,
        )}

      {show('overlays') && (
        <>
          <div style={sectionTitle}>
            <b>全局 HUD / Overlays</b>
            <button onClick={addOverlay}>+ 界面包</button>
          </div>
          <div style={{ opacity: 0.55, fontSize: 11, marginBottom: 6 }}>
            可复用界面包目录（资源池）；节点经 overlayNodes 挂载引用。可自由新建，未被引用也会保留。
          </div>
          {overlayIds.length === 0 ? (
            <div style={{ opacity: 0.5 }}>暂无 overlays（点右上「+ 界面包」新建）</div>
          ) : (
            overlayIds.map((id) => {
              const ov = value.ui?.overlays?.[id]
              const patchChildParams = (childId: string, nextParams: Record<string, unknown>) => {
                if (!ov) return
                patchOverlay(id, {
                  children: ov.children.map((c) => (c.id === childId ? { ...c, params: nextParams } : c)),
                })
              }
              return (
                <div key={id} style={box}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{id}</b>
                    <span style={{ opacity: 0.5, fontWeight: 400, flexShrink: 0 }}>
                      {ov?.children.length ?? 0} 组件
                    </span>
                    <UsageBadge count={overlayUsage?.[id] ?? 0} />
                    <button
                      style={{ ...del, flexShrink: 0 }}
                      onClick={() => {
                        if (confirm(`删除界面包「${ov?.title?.trim() || id}」？引用它的节点挂载将失效。`)) deleteOverlay(id)
                      }}
                    >
                      删除
                    </button>
                  </div>
                  {field(
                    '标题',
                    <input
                      value={ov?.title ?? ''}
                      onChange={(e) => patchOverlay(id, { title: e.target.value })}
                      placeholder="可选：中文名，仅展示"
                      style={{ flex: 1 }}
                    />,
                  )}
                  {(ov?.children ?? []).map((c) => (
                    <OverlayChildEditor
                      key={c.id}
                      child={c}
                      pickers={pickers}
                      onParamsChange={(params) => patchChildParams(c.id, params)}
                      onRemove={() => removeChild(id, c.id)}
                    />
                  ))}
                  <label style={{ ...rowStyle, marginTop: 6 }}>
                    <span style={lbl}>+ 组件</span>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) addChild(id, e.target.value)
                      }}
                      style={{ flex: 1 }}
                      title="向该界面包添加一个组件（child）"
                    >
                      <option value="">（选组件类型）</option>
                      {kindOptions.map((k) => (
                        <option key={k.value} value={k.value}>{k.label}</option>
                      ))}
                    </select>
                  </label>
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
          {Object.entries(variables).map(([key, v]) => (
            <div key={key} style={box}>
              {field('id', <input value={v.id} readOnly style={{ flex: 1, opacity: 0.7 }} />)}
              {field(
                '名称',
                <input
                  value={v.name ?? ''}
                  onChange={(e) => setVariables({ ...variables, [key]: { ...v, id: key, name: e.target.value } })}
                  style={{ flex: 1 }}
                />,
              )}
              {field(
                '初值',
                <input
                  type="number"
                  value={v.initial ?? 0}
                  onChange={(e) => setVariables({ ...variables, [key]: { ...v, id: key, initial: Number(e.target.value) || 0 } })}
                  style={{ width: 90 }}
                />,
              )}
              <button
                style={del}
                onClick={() => {
                  const { [key]: _d, ...rest } = variables
                  setVariables(rest)
                }}
              >
                删除
              </button>
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
            <EntityRow
              key={key}
              entKey={key}
              ent={ent}
              onChange={(next) => setEntities({ ...entities, [key]: { ...next, id: key } })}
              onDelete={() => {
                const { [key]: _drop, ...rest } = entities
                setEntities(rest)
              }}
            />
          ))}
        </>
      )}

      {show('rules') && (
        <>
          <div style={sectionTitle}>
            <b>局级 reactions（即时判负/胜）</b>
            <button
              onClick={() =>
                setReactions([
                  ...reactions,
                  {
                    when: { type: 'state', condition: { all: [] } },
                    do: [{ kind: 'goto', targetNodeId: nodeIds[0] ?? '' }],
                  },
                ])
              }
            >
              + 规则
            </button>
          </div>
          {reactions.map((r, i) => {
            const cond = r.when.type === 'state' ? r.when.condition : { all: [] }
            const goto = r.do.find((a) => a.kind === 'goto')
            return (
              <div key={i} style={box}>
                {field(
                  '跳转到',
                  <select
                    value={goto && goto.kind === 'goto' ? goto.targetNodeId : ''}
                    onChange={(e) =>
                      patchReaction(i, {
                        when: { type: 'state', condition: cond },
                        do: [{ kind: 'goto', targetNodeId: e.target.value }],
                      })
                    }
                    style={{ flex: 1 }}
                  >
                    <option value="">（选节点）</option>
                    {nodeIds.map((nid) => (
                      <option key={nid} value={nid}>
                        {nodeLabel?.(nid) ?? nid}
                      </option>
                    ))}
                  </select>,
                )}
                <ConditionEditor
                  value={cond}
                  nodeIds={nodeIds}
                  pickers={pickers}
                  onChange={(when) =>
                    patchReaction(i, {
                      when: { type: 'state', condition: when ?? { all: [] } },
                      do: r.do,
                    })
                  }
                />
                <button style={{ ...del, marginTop: 4 }} onClick={() => setReactions(reactions.filter((_, idx) => idx !== i))}>
                  删除规则
                </button>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function OverlayChildEditor({
  child,
  pickers,
  onParamsChange,
  onRemove,
}: {
  child: OverlayChild
  pickers?: EditorPickerCtx
  onParamsChange: (params: Record<string, unknown>) => void
  onRemove?: () => void
}): JSX.Element {
  const compLabel = getComponentManifest(child.component)?.label ?? child.component
  const params = child.params ?? {}
  return (
    <div style={{ borderTop: '1px solid #333', marginTop: 6, paddingTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 4 }}>
        <b>{compLabel}</b>
        <span style={{ opacity: 0.5 }}>{child.id}</span>
        {onRemove ? (
          <button style={del} onClick={onRemove} title="从界面包移除该组件">移除</button>
        ) : null}
      </div>
      <KindFormFields
        componentId={child.component}
        params={params}
        pickers={pickers}
        onChange={(next) => onParamsChange(next)}
      />
    </div>
  )
}

function EntityRow({
  entKey,
  ent,
  onChange,
  onDelete,
}: {
  entKey: string
  ent: Entity
  onChange: (next: Entity) => void
  onDelete: () => void
}): JSX.Element {
  const attrs = ent.attrs ?? {}
  const attrMeta = ent.attrMeta ?? {}
  const setAttrs = (a: Record<string, number>) => onChange({ ...ent, id: entKey, attrs: a })
  const setAttrMeta = (m: Record<string, AttrMeta>) => onChange({ ...ent, id: entKey, attrMeta: m })

  return (
    <div style={box}>
      {field('id', <input value={ent.id} readOnly style={{ flex: 1, opacity: 0.7 }} />)}
      {field(
        '名称',
        <input
          value={ent.name ?? ''}
          onChange={(e) => onChange({ ...ent, id: entKey, name: e.target.value })}
          style={{ flex: 1 }}
        />,
      )}
      <div style={{ fontSize: 11, opacity: 0.7, margin: '4px 0 2px' }}>attrs</div>
      {Object.entries(attrs).map(([ak, av]) => (
        <div key={ak} style={rowStyle}>
          <input value={ak} readOnly style={{ flex: 1 }} />
          <input
            type="number"
            value={av}
            onChange={(e) => setAttrs({ ...attrs, [ak]: Number(e.target.value) || 0 })}
            style={{ width: 90 }}
          />
        </div>
      ))}
      <button style={{ ...del, marginTop: 6 }} onClick={onDelete}>
        删除实体
      </button>
      {/* silence unused */}
      <span style={{ display: 'none' }}>{Object.keys(attrMeta).length}{setAttrMeta.length}</span>
    </div>
  )
}
