/**
 * FormulaAstEditor —— 通用逻辑公式编辑器（规则 → 公式）。
 *
 * 单一 SSOT = 一棵 `FormulaAstNode`（对齐运行时 expr.ts 文法 + hole 留空位）。两种视图共享同一棵树：
 *  · 结构模式：递归节点编辑（数字 / 引用 / 运算 / 一元 / 函数 / 留空位），节点可原地变形（改成运算=把
 *    当前子树塞进左操作数，改成函数=塞进第一个参数，「就地包裹」）。
 *  · 文本模式：直接写 expr 串，`parseExpr` 实时校验 + `tryEvalExpr`（样例值）实时预览；合法即
 *    `parseExprToFormulaAst` 反解回结构树。二者经 parse / serialize 双向同步。
 *
 * 反向解析（expr 串 → 可编辑树）复用运行时 `parseExpr`；正向序列化复用 `serializeExpr`
 * （经 formula-authoring 的 previewFormula）。编辑器不另起第二套解析/序列化。
 */
import { useMemo, useState, type CSSProperties, type JSX } from 'react'
import type { Entity, Variable } from '../../runtime/schema/graph-schema'
import { parseExpr, tryEvalExpr, type EvalCtx } from '../../runtime/engine/expr'
import { createRng } from '../../runtime/engine/rng'
import type { FormulaAstNode, FormulaHoleKind, FormulaRef } from '../persist/formula-authoring'
import { parseExprToFormulaAst, previewFormula } from '../persist/formula-authoring'
import { AttrPicker, EntityPicker, VariablePicker } from './scenario-pickers'
import { LooseNumberInput } from './TermChainEditor'

// 统一缩进步长：所有嵌套子树、折叠壳内容共用同一套 gap / 缩进，层级视觉一致。
const INDENT = 8
// box/row 加 boxSizing + minWidth:0：嵌套时 width:100% 把 padding/margin 算进去、且允许在 flex 父里收缩，避免深层控件右溢出。
const box: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, width: '100%', minWidth: 0, boxSizing: 'border-box' }
const row: CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', minWidth: 0, boxSizing: 'border-box' }
const hint: CSSProperties = { fontSize: 11, opacity: 0.65, lineHeight: 1.4 }
const nested: CSSProperties = { borderLeft: '2px solid var(--gc-accent-line, #2a2a2a)', paddingLeft: INDENT, boxSizing: 'border-box' }
// 折叠态头部行内的子树公式预览串（沿用顶部 code 样式）。
const previewCode: CSSProperties = { fontSize: 11, opacity: 0.8, wordBreak: 'break-all' }
// 迷你按钮不撑满整行（在 flex column 里默认会被拉满）。
const compactBtn: CSSProperties = { alignSelf: 'flex-start', width: 'fit-content' }
// 折叠三角，无原生 marker。
const caret: CSSProperties = { cursor: 'pointer', userSelect: 'none', fontSize: 11, opacity: 0.7, listStyle: 'none' }

// expr.ts eval 支持的函数（名 → 参数个数提示；min/max 变长）。
const FUNCTIONS: Array<{ name: string; arity: number | 'var' }> = [
  { name: 'floor', arity: 1 },
  { name: 'round', arity: 1 },
  { name: 'abs', arity: 1 },
  { name: 'min', arity: 'var' },
  { name: 'max', arity: 'var' },
  { name: 'chance', arity: 1 },
  { name: 'rand', arity: 0 },
  { name: 'randInt', arity: 2 },
]
const BIN_OPS = ['+', '-', '*', '/', '%', '>', '>=', '<', '<=', '==', '!=', '&&', '||']
const OP_LABEL: Record<string, string> = { '*': '×', '/': '÷', '&&': 'AND', '||': 'OR' }

// 优先级分组（对齐 expr.ts）：同组连续运算可平铺成一行。仅 ×÷% 与 +− 参与平铺，其余（比较/逻辑）少用，留原样。
const PREC_GROUPS: string[][] = [['*', '/', '%'], ['+', '-']]
function groupOf(op: string): string[] | null {
  return PREC_GROUPS.find((g) => g.includes(op)) ?? null
}

/** 展平：把「node 及其左子树中同优先级组的连续 bin」拍平成 [项0 op1 项1 op2 项2 ...]。非同组子树作为整体项。 */
function flattenChain(node: Extract<FormulaAstNode, { t: 'bin' }>): { group: string[]; terms: FormulaAstNode[]; ops: string[] } {
  const group = groupOf(node.op) ?? [node.op]
  const terms: FormulaAstNode[] = []
  const ops: string[] = []
  const walk = (n: FormulaAstNode): void => {
    if (n.t === 'bin' && group.includes(n.op)) {
      walk(n.a) // 左结合：先递归左子树
      ops.push(n.op)
      terms.push(n.b)
    } else {
      terms.push(n) // 链的最左项 / 非同组整体项
    }
  }
  walk(node)
  return { group, terms, ops } // terms.length === ops.length + 1
}

/** 折回：左结合把平铺链重建成 bin AST。terms.length === ops.length + 1。 */
function foldChain(terms: FormulaAstNode[], ops: string[]): FormulaAstNode {
  let acc = terms[0] ?? num0()
  for (let i = 0; i < ops.length; i++) {
    acc = { t: 'bin', id: newId(), op: ops[i] ?? '+', a: acc, b: terms[i + 1] ?? num0() }
  }
  return acc
}

let uidCounter = 0
function newId(): string {
  uidCounter += 1
  return `e${uidCounter}_${Math.floor(Math.random() * 1e6)}`
}
function freshHoleId(): string {
  return `hole_${Math.floor(Math.random() * 1e6)}`
}

const num0 = (): FormulaAstNode => ({ t: 'num', id: newId(), v: 0 })

/** 有子树的节点（unary/bin/call）用可折叠壳包住子节点；折叠态在头部行显示该子树公式预览。 */
function Collapsible({ node, children }: { node: FormulaAstNode; children: JSX.Element }): JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} style={box}>
      <summary style={caret}>
        {open ? '▾ 收起' : <span>▸ <code style={previewCode}>{previewFormula(node)}</code></span>}
      </summary>
      {children}
    </details>
  )
}

/** 变形为新节点类型：运算/一元/函数「就地包裹」当前子树，叶子类型则新建。 */
function morph(cur: FormulaAstNode, kind: FormulaAstNode['t'], allowHoles: boolean): FormulaAstNode {
  if (cur.t === kind) return cur
  switch (kind) {
    case 'num':
      return num0()
    case 'ref':
      return { t: 'ref', id: newId(), ref: { kind: 'entityAttr', entityId: '', attr: '' } }
    case 'hole':
      return { t: 'hole', id: newId(), holeId: freshHoleId(), kind: 'number', label: '' }
    case 'bin':
      return { t: 'bin', id: newId(), op: '+', a: cur, b: num0() }
    case 'unary':
      return { t: 'unary', id: newId(), op: '-', x: cur }
    case 'call':
      return { t: 'call', id: newId(), name: 'floor', args: [cur] }
  }
}

function RefEditor({
  value: ref,
  entities,
  variables,
  onChange,
}: {
  value: FormulaRef
  entities?: Record<string, Entity>
  variables?: Record<string, Variable>
  onChange: (ref: FormulaRef) => void
}): JSX.Element {
  return (
    <span style={{ ...row, flex: 1 }}>
      <select
        value={ref.kind}
        aria-label="引用类型"
        onChange={(e) => {
          const k = e.target.value as FormulaRef['kind']
          if (k === 'entityAttr') onChange({ kind: 'entityAttr', entityId: '', attr: '' })
          else if (k === 'var') onChange({ kind: 'var', varId: '' })
          else onChange({ kind: 'score' })
        }}
      >
        <option value="entityAttr">实体属性</option>
        <option value="var">变量</option>
        <option value="score">局面分</option>
      </select>
      {ref.kind === 'entityAttr' && (
        <>
          <EntityPicker value={ref.entityId} entities={entities} allowEmpty onChange={(entityId) => onChange({ ...ref, entityId })} />
          <AttrPicker entityId={ref.entityId} value={ref.attr} entities={entities} onChange={(attr) => onChange({ ...ref, attr })} />
        </>
      )}
      {ref.kind === 'var' && (
        <VariablePicker value={ref.varId} variables={variables} allowEmpty onChange={(varId) => onChange({ kind: 'var', varId })} />
      )}
    </span>
  )
}

function NodeEditor({
  node,
  entities,
  variables,
  allowHoles,
  onChange,
  depth = 0,
}: {
  node: FormulaAstNode
  entities?: Record<string, Entity>
  variables?: Record<string, Variable>
  allowHoles: boolean
  onChange: (n: FormulaAstNode) => void
  depth?: number
}): JSX.Element {
  const kindSelect = (
    <select
      value={node.t}
      aria-label="节点类型"
      onChange={(e) => onChange(morph(node, e.target.value as FormulaAstNode['t'], allowHoles))}
    >
      <option value="num">数字</option>
      <option value="ref">引用</option>
      <option value="bin">运算</option>
      <option value="unary">一元</option>
      <option value="call">函数</option>
      {allowHoles && <option value="hole">留空位</option>}
    </select>
  )

  // bin 且 op 属于可平铺组（×÷% 或 +−）→ 整条同级链平铺成一行，替代逐层嵌套。
  if (node.t === 'bin' && groupOf(node.op)) {
    return (
      <div style={{ ...box, ...(depth > 0 ? nested : {}) }}>
        <div style={row}>
          {kindSelect}
          <span style={{ fontSize: 11, opacity: 0.55 }}>运算链</span>
        </div>
        <ChainEditor node={node} entities={entities} variables={variables} allowHoles={allowHoles} depth={depth} onChange={onChange} />
      </div>
    )
  }

  return (
    <div style={{ ...box, ...(depth > 0 ? nested : {}) }}>
      <div style={row}>
        {kindSelect}
        {node.t === 'num' && (
          <LooseNumberInput value={node.v} onChange={(v) => onChange({ ...node, v })} aria-label="数值" style={{ width: 90 }} />
        )}
        {node.t === 'ref' && (
          <RefEditor value={node.ref} entities={entities} variables={variables} onChange={(ref) => onChange({ ...node, ref })} />
        )}
        {node.t === 'unary' && (
          <select value={node.op} aria-label="一元运算符" onChange={(e) => onChange({ ...node, op: e.target.value as '-' | '!' })}>
            <option value="-">−（取负）</option>
            <option value="!">!（逻辑非）</option>
          </select>
        )}
        {node.t === 'bin' && (
          <select value={node.op} aria-label="运算符" onChange={(e) => onChange({ ...node, op: e.target.value })}>
            {BIN_OPS.map((o) => (
              <option key={o} value={o}>{OP_LABEL[o] ?? o}</option>
            ))}
          </select>
        )}
        {node.t === 'call' && (
          <select
            value={node.name}
            aria-label="函数名"
            onChange={(e) => {
              const fn = FUNCTIONS.find((f) => f.name === e.target.value)
              const wantArgs = fn && fn.arity !== 'var' ? fn.arity : node.args.length
              const args = node.args.slice(0, wantArgs)
              while (args.length < wantArgs) args.push(num0())
              onChange({ ...node, name: e.target.value, args })
            }}
          >
            {FUNCTIONS.map((f) => (
              <option key={f.name} value={f.name}>{f.name}()</option>
            ))}
          </select>
        )}
        {node.t === 'hole' && (
          <>
            <select
              value={node.kind}
              aria-label="空位类型"
              onChange={(e) => onChange({ ...node, kind: e.target.value as FormulaHoleKind })}
            >
              <option value="number">数值</option>
              <option value="entityAttr">实体属性</option>
              <option value="var">变量</option>
            </select>
            <input
              value={node.label ?? ''}
              placeholder="空位名（如 系数）"
              aria-label="空位名"
              style={{ flex: 1, minWidth: 60, fontSize: 12, boxSizing: 'border-box' }}
              onChange={(e) => onChange({ ...node, label: e.target.value || undefined })}
            />
            {node.kind === 'entityAttr' && (
              <input
                value={node.suggestAttr ?? ''}
                placeholder="约定属性（如 attack）"
                aria-label="约定属性"
                style={{ flex: 1, minWidth: 90, maxWidth: 130, fontSize: 12, boxSizing: 'border-box' }}
                onChange={(e) => onChange({ ...node, suggestAttr: e.target.value || undefined })}
              />
            )}
          </>
        )}
      </div>

      {node.t === 'unary' && (
        <Collapsible node={node}>
          <NodeEditor node={node.x} entities={entities} variables={variables} allowHoles={allowHoles} depth={depth + 1} onChange={(x) => onChange({ ...node, x })} />
        </Collapsible>
      )}
      {node.t === 'bin' && (
        <Collapsible node={node}>
          <div style={box}>
            <NodeEditor node={node.a} entities={entities} variables={variables} allowHoles={allowHoles} depth={depth + 1} onChange={(a) => onChange({ ...node, a })} />
            <NodeEditor node={node.b} entities={entities} variables={variables} allowHoles={allowHoles} depth={depth + 1} onChange={(b) => onChange({ ...node, b })} />
          </div>
        </Collapsible>
      )}
      {node.t === 'call' && (
        <Collapsible node={node}>
          <div style={{ ...box, ...nested }}>
            {node.args.map((arg, i) => (
              <div key={arg.id} style={box}>
                <div style={{ fontSize: 10, opacity: 0.6 }}>
                  参数 {i + 1}
                  <button
                    type="button"
                    className="gc-mini-danger"
                    style={{ marginLeft: 6 }}
                    onClick={() => onChange({ ...node, args: node.args.filter((_, idx) => idx !== i) })}
                  >
                    删除参数
                  </button>
                </div>
                <NodeEditor
                  node={arg}
                  entities={entities}
                  variables={variables}
                  allowHoles={allowHoles}
                  depth={depth + 1}
                  onChange={(next) => onChange({ ...node, args: node.args.map((a, idx) => (idx === i ? next : a)) })}
                />
              </div>
            ))}
            <button type="button" className="gc-mini-action" style={compactBtn} onClick={() => onChange({ ...node, args: [...node.args, num0()] })}>
              ＋ 添加参数
            </button>
          </div>
        </Collapsible>
      )}
    </div>
  )
}

/** 平铺运算链编辑器：把同优先级连续 bin 展成 [项 op 项 op 项]，从左到右横排（flex-wrap），末尾可加项。 */
function ChainEditor({
  node,
  entities,
  variables,
  allowHoles,
  depth,
  onChange,
}: {
  node: Extract<FormulaAstNode, { t: 'bin' }>
  entities?: Record<string, Entity>
  variables?: Record<string, Variable>
  allowHoles: boolean
  depth: number
  onChange: (n: FormulaAstNode) => void
}): JSX.Element {
  const { group, terms, ops } = flattenChain(node)
  const commit = (nextTerms: FormulaAstNode[], nextOps: string[]): void => {
    onChange(foldChain(nextTerms, nextOps))
  }
  const chainRow: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 6, minWidth: 0, boxSizing: 'border-box' }
  const opSel: CSSProperties = { fontSize: 13, fontWeight: 700, alignSelf: 'center' }
  return (
    <div style={{ ...box, ...nested }}>
      <div style={chainRow}>
        {terms.map((term, i) => (
          <span key={term.id} style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {i > 0 && (
              <select
                aria-label={`运算符${i}`}
                value={ops[i - 1]}
                style={opSel}
                onChange={(e) => commit(terms, ops.map((o, idx) => (idx === i - 1 ? e.target.value : o)))}
              >
                {group.map((o) => (
                  <option key={o} value={o}>{OP_LABEL[o] ?? o}</option>
                ))}
              </select>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 4, minWidth: 0 }}>
              <NodeEditor
                node={term}
                entities={entities}
                variables={variables}
                allowHoles={allowHoles}
                depth={depth + 1}
                onChange={(next) => commit(terms.map((t, idx) => (idx === i ? next : t)), ops)}
              />
              {terms.length > 2 && (
                <button
                  type="button"
                  className="gc-mini-danger"
                  aria-label={`删除项${i + 1}`}
                  title="删除此项"
                  onClick={() => {
                    // 删项 i：同时去掉与它相邻的一个运算符（i>0 去 ops[i-1]，否则去 ops[0]）。
                    const nt = terms.filter((_, idx) => idx !== i)
                    const dropOp = i > 0 ? i - 1 : 0
                    const no = ops.filter((_, idx) => idx !== dropOp)
                    commit(nt, no)
                  }}
                >
                  ×
                </button>
              )}
            </span>
          </span>
        ))}
        <button
          type="button"
          className="gc-mini-action"
          style={{ alignSelf: 'center' }}
          onClick={() => commit([...terms, num0()], [...ops, group[0] ?? '+'])}
        >
          ＋ 项
        </button>
      </div>
    </div>
  )
}

/** 样例求值上下文：实体 attrs 原样、变量取 initial、rng 固定种子——供文本模式实时预览。 */
function sampleCtx(entities?: Record<string, Entity>, variables?: Record<string, Variable>): EvalCtx {
  const ents: EvalCtx['entities'] = {}
  for (const [id, e] of Object.entries(entities ?? {})) ents[id] = { attrs: e.attrs ?? {} }
  const vars: Record<string, number> = {}
  for (const [id, v] of Object.entries(variables ?? {})) vars[id] = v.initial ?? 0
  return { entities: ents, vars, flags: {}, score: 0, rng: createRng(1) }
}

export function FormulaAstEditor({
  ast,
  entities,
  variables,
  allowHoles = true,
  onChange,
}: {
  ast: FormulaAstNode
  entities?: Record<string, Entity>
  variables?: Record<string, Variable>
  /** 定义模式开留空位；应用/内联场景可关。 */
  allowHoles?: boolean
  onChange: (ast: FormulaAstNode) => void
}): JSX.Element {
  const [view, setView] = useState<'struct' | 'text'>('struct')
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const previewStr = previewFormula(ast)
  const ctx = useMemo(() => sampleCtx(entities, variables), [entities, variables])
  const hasHole = previewStr.includes('❓')
  const sampleValue = hasHole ? null : tryEvalExpr(previewStr, ctx)

  return (
    <div style={box}>
      <div style={row} role="group" aria-label="公式视图">
        <button type="button" className={view === 'struct' ? 'gc-mini-action is-on' : 'gc-mini-action'} onClick={() => setView('struct')}>
          结构
        </button>
        <button type="button" className={view === 'text' ? 'gc-mini-action is-on' : 'gc-mini-action'} onClick={() => { setDraft(previewStr); setError(null); setView('text') }}>
          文本
        </button>
        <code style={{ fontSize: 11, opacity: 0.8, flex: 1, wordBreak: 'break-all' }}>{previewStr}</code>
        {sampleValue != null && <span style={{ fontSize: 11, opacity: 0.6 }}>≈ {sampleValue}</span>}
      </div>

      {view === 'struct' ? (
        <NodeEditor node={ast} entities={entities} variables={variables} allowHoles={allowHoles} onChange={onChange} />
      ) : (
        <div style={box}>
          <textarea
            value={draft ?? previewStr}
            aria-label="公式表达式"
            rows={3}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
            onChange={(e) => {
              const next = e.target.value
              setDraft(next)
              try {
                parseExpr(next)
                setError(null)
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              }
            }}
            onBlur={() => {
              const src = (draft ?? '').trim()
              if (!src) return
              try {
                const nextAst = parseExprToFormulaAst(src)
                setError(null)
                onChange(nextAst)
                setDraft(null)
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              }
            }}
          />
          {error ? (
            <p style={{ ...hint, color: 'var(--gc-danger, #e66)' }}>解析失败：{error}</p>
          ) : (
            <p style={hint}>失焦时反解回结构树。可用：数字 / var.&lt;id&gt; / entity.&lt;id&gt;.attr.&lt;名&gt; / floor·chance·rand 等函数。文本模式不含留空位。</p>
          )}
        </div>
      )}
    </div>
  )
}

/** 测试专用导出：平铺/折回纯函数（供 __tests__ round-trip 校验，不供业务代码使用）。 */
export const __chainInternals = { flattenChain, foldChain }
