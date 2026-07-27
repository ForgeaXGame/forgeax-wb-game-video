/**
 * 应用公式 —— ValueExprEditor 第三模式的填空 UI：选一个具名公式，给它的每个留空位按类型填值
 * （实体属性：选实体+属性；数值：输入常数；变量：选变量），实时编译回 NumOrExpr。
 */
import type { CSSProperties, JSX } from 'react'
import type { Entity, NumOrExpr, Variable } from '../../runtime/schema/graph-schema'
import type { Formula, FormulaHoleBinding } from '../persist/formula-authoring'
import { AttrSelect, EntitySelect } from './editors'
import { LooseNumberInput } from './TermChainEditor'
import { VariablePicker } from './scenario-pickers'
import { compileFormula, formulaHoles, formulaPreview, missingFormulaHoles } from './formulaApply'
import { findEntity, findFormula, listAttrOptions, listFormulaOptions } from './valueExprPick'

const box: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }
const row: CSSProperties = { display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }
const hint: CSSProperties = { fontSize: 11, opacity: 0.65, lineHeight: 1.4 }
const holeLbl: CSSProperties = { fontSize: 11, opacity: 0.8, minWidth: 120 }

/** entityAttr 空位实际生效的属性 id（binding.attr 有效则用，否则约定名，否则实体第一个属性）。 */
function effectiveAttr(binding: FormulaHoleBinding | undefined, suggestAttr: string | undefined, entities: Record<string, Entity> | undefined): string {
  if (!binding || binding.kind !== 'entityAttr' || !binding.entityId) return ''
  const attrs = listAttrOptions(findEntity(entities, binding.entityId))
  if (binding.attr && attrs.some((a) => a.id === binding.attr)) return binding.attr
  if (suggestAttr && attrs.some((a) => a.id === suggestAttr)) return suggestAttr
  return attrs[0]?.id ?? ''
}

export function FormulaApplyEditor({
  formulaId,
  holeBindings,
  formulas,
  entities,
  variables,
  onChange,
}: {
  formulaId: string
  holeBindings: Record<string, FormulaHoleBinding>
  formulas: Record<string, Formula> | undefined
  entities: Record<string, Entity> | undefined
  variables: Record<string, Variable> | undefined
  onChange: (next: NumOrExpr) => void
}): JSX.Element {
  const options = listFormulaOptions(formulas)
  const formula = findFormula(formulas, formulaId)
  const holes = formula ? formulaHoles(formula) : []
  const missingHoles = formula ? missingFormulaHoles(formula, holeBindings) : []

  function pickFormula(nextId: string): void {
    const next = findFormula(formulas, nextId)
    if (!next) return
    onChange(compileFormula(next, {}, entities))
  }

  function setHole(holeId: string, binding: FormulaHoleBinding): void {
    if (!formula) return
    onChange(compileFormula(formula, { ...holeBindings, [holeId]: binding }, entities))
  }

  const compiled = formula ? compileFormula(formula, holeBindings, entities) : undefined
  const compiledLabel = compiled == null ? '' : typeof compiled === 'number' ? String(compiled) : compiled.expr

  return (
    <div style={box}>
      <div style={row} role="group" aria-label="选择公式">
        <select value={formulaId} onChange={(e) => pickFormula(e.target.value)} aria-label="公式" style={{ flex: 1, minWidth: 140 }}>
          <option value="" disabled>选择公式…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </div>
      {!formula ? (
        <p style={hint}>该公式已被删除，数值维持上次编译结果；请另选一个公式。</p>
      ) : (
        <>
          <p style={hint}>公式：{formulaPreview(formula, holeBindings)}</p>
          {holes.length === 0 ? (
            <p style={hint}>该公式没有留空位，直接应用即可。</p>
          ) : (
            holes.map((h) => {
              const binding = holeBindings[h.holeId]
              return (
                <div key={h.holeId} style={{ ...row, border: '1px solid var(--gc-accent-line, #2a2a2a)', borderRadius: 6, padding: 6 }}>
                  <span style={holeLbl}>{h.label ?? '留空位'}{h.kind === 'entityAttr' && h.suggestAttr ? `（约定：${h.suggestAttr}）` : ''}</span>
                  {h.kind === 'entityAttr' && (
                    <>
                      <EntitySelect
                        value={binding?.kind === 'entityAttr' ? binding.entityId : ''}
                        entities={entities}
                        onChange={(id) => setHole(h.holeId, { kind: 'entityAttr', entityId: id, attr: undefined })}
                      />
                      <AttrSelect
                        entityId={binding?.kind === 'entityAttr' ? binding.entityId : ''}
                        value={effectiveAttr(binding, h.suggestAttr, entities)}
                        entities={entities}
                        onChange={(attr) => setHole(h.holeId, { kind: 'entityAttr', entityId: binding?.kind === 'entityAttr' ? binding.entityId : '', attr })}
                      />
                    </>
                  )}
                  {h.kind === 'number' && (
                    <LooseNumberInput
                      value={binding?.kind === 'number' ? binding.value : 0}
                      onChange={(value) => setHole(h.holeId, { kind: 'number', value })}
                      aria-label={h.label ?? '数值'}
                      style={{ width: 120 }}
                    />
                  )}
                  {h.kind === 'var' && (
                    <VariablePicker
                      value={binding?.kind === 'var' ? binding.varId : ''}
                      variables={variables}
                      allowEmpty
                      onChange={(varId) => setHole(h.holeId, { kind: 'var', varId })}
                    />
                  )}
                </div>
              )
            })
          )}
          {missingHoles.length > 0 ? (
            <p role="alert" style={{ ...hint, color: '#ffb86c', fontWeight: 600 }}>
              还缺 {missingHoles.length} 个留空位未填。补全后才会用于结算。
            </p>
          ) : null}
          <p style={hint}>预览：{compiledLabel || '（未完成填空）'}。</p>
        </>
      )}
    </div>
  )
}
