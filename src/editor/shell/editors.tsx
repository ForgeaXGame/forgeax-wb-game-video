/**
 * 结构化编辑器（P4 之「可视化构造器」）—— 用**类型化输入**替代 NodeInspector 里易错的裸 JSON 框，
 * 编辑 GraphEffect[] / GraphCondition / 选项 / 常见 kind 的 params。全部纯受控组件，改动经上层 onChange
 * 不可变写回。不认识的 kind/字段仍回退到 JSON（见 NodeInspector 的 jsonArea）。
 */
import type { CSSProperties, JSX } from 'react'
import type { CmpOp, Entity, GraphClause, GraphCondition, GraphEffect, NumOrExpr, Variable } from '../../runtime/schema/graph-schema'
import { AttrPicker, EntityPicker, VariablePicker } from './scenario-pickers'
import { flowHandleDisplay } from '../../graph/flow-handle-labels'

/** choice/skill 选项形态（与 core-kinds ChoiceOption 同构；就地声明避免逻辑↔UI 耦合）。 */
export interface ChoiceOptionLike {
  key: string
  label?: string
  effects?: GraphEffect[]
}

const CMP_OPS: CmpOp[] = ['gte', 'lte', 'gt', 'lt', 'eq', 'neq']
const CMP_LABEL: Record<CmpOp, string> = { gte: '≥', lte: '≤', gt: '>', lt: '<', eq: '=', neq: '≠' }
const EFFECT_KIND_LABEL: Record<string, string> = { attr: '属性', var: '变量', flag: '标记', item: '道具' }
const OP_LABEL: Record<string, string> = { add: '增加', set: '设为', give: '给予', take: '取走' }
const CLAUSE_LABEL: Record<string, string> = {
  attrRatio: '属性比例', attr: '属性值', attrCompare: '属性比较', var: '变量', flag: '标记', visited: '到过节点', score: '分数', hasItem: '拥有道具',
}

const box: CSSProperties = { border: '1px solid #2a2a2a', borderRadius: 6, padding: 6, marginTop: 6 }
const rowStyle: CSSProperties = { display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }
const lbl: CSSProperties = { width: 52, opacity: 0.7, flexShrink: 0, fontSize: 11 }
const del: CSSProperties = { color: '#ff6b6b', marginLeft: 'auto' }

function field(label: string, node: JSX.Element): JSX.Element {
  return (
    <label style={rowStyle}>
      <span style={lbl}>{label}</span>
      {node}
    </label>
  )
}

// ── NumOrExpr（常量 / 表达式）─────────────────────────────────────────────────
export function ValueInput({ value, onChange }: { value: NumOrExpr | undefined; onChange: (v: NumOrExpr) => void }): JSX.Element {
  const isExpr = value !== undefined && typeof value === 'object'
  return (
    <span style={{ display: 'inline-flex', gap: 4, flex: 1 }}>
      <select
        value={isExpr ? 'expr' : 'num'}
        onChange={(e) =>
          onChange(e.target.value === 'expr' ? { expr: isExpr ? (value as { expr: string }).expr : '' } : typeof value === 'number' ? value : 0)
        }
      >
        <option value="num">常量</option>
        <option value="expr">表达式</option>
      </select>
      {isExpr ? (
        <input
          value={(value as { expr: string }).expr}
          onChange={(e) => onChange({ expr: e.target.value })}
          placeholder="-(entity.ent-player.attr.attack*2 - entity.ent-boss.attr.defense)"
          style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }}
        />
      ) : (
        <input type="number" value={typeof value === 'number' ? value : 0} onChange={(e) => onChange(Number(e.target.value) || 0)} style={{ width: 90 }} />
      )}
    </span>
  )
}

// ── effects ───────────────────────────────────────────────────────────────────
type EffectKind = GraphEffect['kind']
const EFFECT_KINDS: EffectKind[] = ['attr', 'var', 'flag', 'item']

function defaultEffect(kind: EffectKind): GraphEffect {
  switch (kind) {
    case 'attr':
      return { kind: 'attr', entityId: '', attr: 'hp', op: 'add', value: 0 }
    case 'var':
      return { kind: 'var', varId: '', op: 'add', value: 0 }
    case 'flag':
      return { kind: 'flag', varId: '', value: true }
    case 'item':
      return { kind: 'item', itemId: '', op: 'give', count: 1 }
  }
}

export interface EditorPickerCtx {
  entities?: Record<string, Entity>
  variables?: Record<string, Variable>
  /** 节点下拉展示；缺省用 id。 */
  nodeLabel?: (id: string) => string
}

function EffectRow({ eff, pickers, onChange, onDelete }: { eff: GraphEffect; pickers?: EditorPickerCtx; onChange: (e: GraphEffect) => void; onDelete: () => void }): JSX.Element {
  return (
    <div style={box}>
      <div style={rowStyle}>
        <select value={eff.kind} onChange={(e) => onChange(defaultEffect(e.target.value as EffectKind))}>
          {EFFECT_KINDS.map((k) => (
            <option key={k} value={k}>{EFFECT_KIND_LABEL[k] ?? k}</option>
          ))}
        </select>
        <button style={del} onClick={onDelete}>删除</button>
      </div>
      {eff.kind === 'attr' && (
        <>
          {field('实体', <EntityPicker value={eff.entityId} entities={pickers?.entities} onChange={(entityId) => onChange({ ...eff, entityId })} />)}
          {field('属性', <AttrPicker entityId={eff.entityId} value={eff.attr} entities={pickers?.entities} onChange={(attr) => onChange({ ...eff, attr })} />)}
          {field('op', (
            <select value={eff.op} onChange={(e) => onChange({ ...eff, op: e.target.value as 'add' | 'set' })}>
              <option value="add">{OP_LABEL.add}</option>
              <option value="set">{OP_LABEL.set}</option>
            </select>
          ))}
          {field('值', <ValueInput value={eff.value} onChange={(v) => onChange({ ...eff, value: v })} />)}
        </>
      )}
      {eff.kind === 'var' && (
        <>
          {field('变量', <VariablePicker value={eff.varId} variables={pickers?.variables} onChange={(varId) => onChange({ ...eff, varId })} />)}
          {field('op', (
            <select value={eff.op} onChange={(e) => onChange({ ...eff, op: e.target.value as 'add' | 'set' })}>
              <option value="add">{OP_LABEL.add}</option>
              <option value="set">{OP_LABEL.set}</option>
            </select>
          ))}
          {field('值', <ValueInput value={eff.value} onChange={(v) => onChange({ ...eff, value: v })} />)}
        </>
      )}
      {eff.kind === 'flag' && (
        <>
          {field('标记', <VariablePicker value={eff.varId} variables={pickers?.variables} onChange={(varId) => onChange({ ...eff, varId })} placeholder="flagId" />)}
          {field('值', (
            <select value={String(eff.value)} onChange={(e) => onChange({ ...eff, value: e.target.value === 'true' })}>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          ))}
        </>
      )}
      {eff.kind === 'item' && (
        <>
          {field('道具', <input value={eff.itemId} onChange={(e) => onChange({ ...eff, itemId: e.target.value })} style={{ flex: 1 }} />)}
          {field('op', (
            <select value={eff.op} onChange={(e) => onChange({ ...eff, op: e.target.value as 'give' | 'take' })}>
              <option value="give">{OP_LABEL.give}</option>
              <option value="take">{OP_LABEL.take}</option>
            </select>
          ))}
          {field('数量', <input type="number" value={eff.count} onChange={(e) => onChange({ ...eff, count: Number(e.target.value) || 0 })} style={{ width: 90 }} />)}
        </>
      )}
    </div>
  )
}

export function EffectsEditor({
  value,
  onChange,
  pickers,
}: {
  value: GraphEffect[] | undefined
  onChange: (v: GraphEffect[]) => void
  pickers?: EditorPickerCtx
}): JSX.Element {
  const list = value ?? []
  return (
    <div>
      {list.map((eff, i) => (
        <EffectRow
          key={i}
          eff={eff}
          pickers={pickers}
          onChange={(next) => onChange(list.map((e, idx) => (idx === i ? next : e)))}
          onDelete={() => onChange(list.filter((_, idx) => idx !== i))}
        />
      ))}
      <button style={{ marginTop: 4 }} onClick={() => onChange([...list, defaultEffect('attr')])}>+ 效果</button>
    </div>
  )
}

// ── condition（GraphCondition = { all: GraphClause[] }）────────────────────────
type ClauseType = GraphClause['type']
const CLAUSE_TYPES: ClauseType[] = ['attrRatio', 'attr', 'attrCompare', 'var', 'flag', 'visited', 'score', 'hasItem']

function defaultClause(type: ClauseType): GraphClause {
  switch (type) {
    case 'var':
      return { type: 'var', varId: '', op: 'gte', value: 0 }
    case 'flag':
      return { type: 'flag', varId: '', equals: true }
    case 'visited':
      return { type: 'visited', nodeId: '' }
    case 'attr':
      return { type: 'attr', entityId: '', attr: 'hp', op: 'lte', value: 0 }
    case 'attrRatio':
      return { type: 'attrRatio', entityId: '', attr: 'hp', op: 'lte', value: 0 }
    case 'attrCompare':
      return { type: 'attrCompare', left: '', right: '', attr: 'speed', op: 'gte' }
    case 'score':
      return { type: 'score', op: 'gte', value: 0 }
    case 'hasItem':
      return { type: 'hasItem', itemId: '', count: 1 }
  }
}

const opSelect = (op: CmpOp, onChange: (op: CmpOp) => void): JSX.Element => (
  <select value={op} onChange={(e) => onChange(e.target.value as CmpOp)}>
    {CMP_OPS.map((o) => (
      <option key={o} value={o}>{CMP_LABEL[o]}</option>
    ))}
  </select>
)

function ClauseRow({
  clause,
  nodeIds,
  pickers,
  onChange,
  onDelete,
}: {
  clause: GraphClause
  nodeIds: string[]
  pickers?: EditorPickerCtx
  onChange: (c: GraphClause) => void
  onDelete: () => void
}): JSX.Element {
  return (
    <div style={box}>
      <div style={rowStyle}>
        <select value={clause.type} onChange={(e) => onChange(defaultClause(e.target.value as ClauseType))}>
          {CLAUSE_TYPES.map((t) => (
            <option key={t} value={t}>{CLAUSE_LABEL[t] ?? t}</option>
          ))}
        </select>
        <button style={del} onClick={onDelete}>删除</button>
      </div>
      {(clause.type === 'attr' || clause.type === 'attrRatio') && (
        <>
          {field('实体', <EntityPicker value={clause.entityId} entities={pickers?.entities} onChange={(entityId) => onChange({ ...clause, entityId })} />)}
          {field('属性', <AttrPicker entityId={clause.entityId} value={clause.attr} entities={pickers?.entities} onChange={(attr) => onChange({ ...clause, attr })} />)}
          {field('op', opSelect(clause.op, (op) => onChange({ ...clause, op })))}
          {field('值', <input type="number" value={clause.value} onChange={(e) => onChange({ ...clause, value: Number(e.target.value) || 0 })} style={{ width: 90 }} />)}
        </>
      )}
      {clause.type === 'attrCompare' && (
        <>
          {field('左实体', <EntityPicker value={clause.left} entities={pickers?.entities} onChange={(left) => onChange({ ...clause, left })} allowEmpty />)}
          {field('右实体', <EntityPicker value={clause.right} entities={pickers?.entities} onChange={(right) => onChange({ ...clause, right })} allowEmpty />)}
          {field('属性', <AttrPicker entityId={clause.left || clause.right} value={clause.attr} entities={pickers?.entities} onChange={(attr) => onChange({ ...clause, attr })} />)}
          {field('op', opSelect(clause.op, (op) => onChange({ ...clause, op })))}
        </>
      )}
      {clause.type === 'var' && (
        <>
          {field('变量', <VariablePicker value={clause.varId} variables={pickers?.variables} onChange={(varId) => onChange({ ...clause, varId })} />)}
          {field('op', opSelect(clause.op, (op) => onChange({ ...clause, op })))}
          {field('值', <input type="number" value={clause.value} onChange={(e) => onChange({ ...clause, value: Number(e.target.value) || 0 })} style={{ width: 90 }} />)}
        </>
      )}
      {clause.type === 'flag' && (
        <>
          {field('标记', <VariablePicker value={clause.varId} variables={pickers?.variables} onChange={(varId) => onChange({ ...clause, varId })} placeholder="flagId" />)}
          {field('等于', (
            <select value={String(clause.equals)} onChange={(e) => onChange({ ...clause, equals: e.target.value === 'true' })}>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          ))}
        </>
      )}
      {clause.type === 'visited' && field('节点', (
        <select value={clause.nodeId} onChange={(e) => onChange({ ...clause, nodeId: e.target.value })} style={{ flex: 1 }}>
          <option value="">（选节点）</option>
          {nodeIds.map((id) => (
            <option key={id} value={id}>{pickers?.nodeLabel?.(id) ?? id}</option>
          ))}
        </select>
      ))}
      {clause.type === 'score' && (
        <>
          {field('op', opSelect(clause.op, (op) => onChange({ ...clause, op })))}
          {field('值', <input type="number" value={clause.value} onChange={(e) => onChange({ ...clause, value: Number(e.target.value) || 0 })} style={{ width: 90 }} />)}
        </>
      )}
      {clause.type === 'hasItem' && (
        <>
          {field('道具', <input value={clause.itemId} onChange={(e) => onChange({ ...clause, itemId: e.target.value })} style={{ flex: 1 }} />)}
          {field('数量', <input type="number" value={clause.count ?? 1} onChange={(e) => onChange({ ...clause, count: Number(e.target.value) || 0 })} style={{ width: 90 }} />)}
        </>
      )}
    </div>
  )
}

export function ConditionEditor({
  value,
  nodeIds,
  onChange,
  pickers,
}: {
  value: GraphCondition | undefined
  nodeIds: string[]
  onChange: (v: GraphCondition | undefined) => void
  pickers?: EditorPickerCtx
}): JSX.Element {
  const all = value?.all ?? []
  const set = (next: GraphClause[]) => onChange(next.length ? { all: next } : undefined)
  return (
    <div>
      {all.length === 0 && <div style={{ opacity: 0.5, fontSize: 11 }}>无条件（恒真）</div>}
      {all.map((c, i) => (
        <ClauseRow
          key={i}
          clause={c}
          nodeIds={nodeIds}
          pickers={pickers}
          onChange={(next) => set(all.map((x, idx) => (idx === i ? next : x)))}
          onDelete={() => set(all.filter((_, idx) => idx !== i))}
        />
      ))}
      <button style={{ marginTop: 4 }} onClick={() => set([...all, defaultClause('attrRatio')])}>+ 条件（AND）</button>
    </div>
  )
}

// ── 选项（choice/skill 的 options: {key,label,effects}）────────────────────────
function allocOptionKey(list: ChoiceOptionLike[]): string {
  let i = list.length
  let key = `opt${i}`
  const used = new Set(list.map((o) => o.key))
  while (used.has(key)) {
    i += 1
    key = `opt${i}`
  }
  return key
}

export function OptionsEditor({
  value,
  onChange,
  pickers,
}: {
  value: ChoiceOptionLike[] | undefined
  onChange: (v: ChoiceOptionLike[]) => void
  pickers?: EditorPickerCtx
}): JSX.Element {
  const list = value ?? []
  const patch = (i: number, p: Partial<ChoiceOptionLike>) => onChange(list.map((o, idx) => (idx === i ? { ...o, ...p } : o)))
  return (
    <div>
      <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 4 }}>
        每项对应蓝图出口 <code>opt:&lt;标识&gt;</code>；连线「何时走」请选同名出口。
      </div>
      {list.map((o, i) => (
        <div key={`${o.key}-${i}`} style={box}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }} title={`opt:${o.key}`}>
            出口 · {flowHandleDisplay(`opt:${o.key}`, o.label)}
          </div>
          {field('标识', (
            <input
              value={o.key}
              onChange={(e) => patch(i, { key: e.target.value })}
              style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }}
              title="落盘 key；出边 sourceHandle = opt:此标识"
            />
          ))}
          {field('显示文案', <input value={o.label ?? ''} onChange={(e) => patch(i, { label: e.target.value })} style={{ flex: 1 }} />)}
          <div style={{ fontSize: 11, opacity: 0.7, margin: '4px 0 2px' }}>选中时效果</div>
          <EffectsEditor value={o.effects} onChange={(effects) => patch(i, { effects })} pickers={pickers} />
          <button style={{ ...del, marginTop: 4 }} onClick={() => onChange(list.filter((_, idx) => idx !== i))}>删除选项</button>
        </div>
      ))}
      <button
        style={{ marginTop: 4 }}
        onClick={() => {
          const key = allocOptionKey(list)
          onChange([...list, { key, label: `选项 ${list.length + 1}`, effects: [] }])
        }}
      >
        + 选项
      </button>
    </div>
  )
}
