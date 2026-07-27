import { describe, it, expect } from 'vitest'
import { serializeExpr, type Node } from '../../../runtime/engine/expr'
import { parseExprToFormulaAst, lowerFormulaAst, type FormulaAstNode } from '../../persist/formula-authoring'
import { __chainInternals } from '../FormulaAstEditor'

const { flattenChain, foldChain } = __chainInternals

/** 编辑器 AST（全具体，无 hole）→ expr 串，用于比对语义等价。 */
function ser(ast: FormulaAstNode): string {
  const lowered = lowerFormulaAst(ast, {})
  if (!lowered) throw new Error('lower failed')
  return serializeExpr(lowered as Node)
}

function astOf(src: string): FormulaAstNode {
  return parseExprToFormulaAst(src)
}

describe('公式平铺 flatten/fold round-trip', () => {
  const cases = [
    'a * b * c / d', // 连续 ×÷ 同级链
    'a + b - c + d', // 连续 +− 同级链
    'floor(1 * entity.ent-player.attr.attack * 100 / (100 + entity.ent-boss.attr.defense))', // 含括号低优先级子树
    '(a + b) * c', // 括号项在乘法链里
    'a * (b + c) * d', // 中间项是低优先级子树
  ]

  for (const src of cases) {
    it(`round-trip 保语义: ${src}`, () => {
      const ast = astOf(src)
      // 找到顶层 bin（若是 call/unary 包着，递归进第一个 bin 子树来测链）
      const findBin = (n: FormulaAstNode): Extract<FormulaAstNode, { t: 'bin' }> | null => {
        if (n.t === 'bin') return n
        if (n.t === 'call') { for (const a of n.args) { const r = findBin(a); if (r) return r } }
        if (n.t === 'unary') return findBin(n.x)
        return null
      }
      const bin = findBin(ast)
      if (!bin) return // 无 bin 可测
      const { terms, ops } = flattenChain(bin)
      expect(terms.length).toBe(ops.length + 1) // 结构不变式
      const refolded = foldChain(terms, ops)
      // 展平再折回，序列化必须与原 bin 一致（语义 + 括号都不丢）
      expect(ser(refolded)).toBe(ser(bin))
    })
  }

  it('低优先级子树作为整体项，不被拆进乘法链', () => {
    const bin = flattenChain(parseExprToFormulaAst('a * (b + c) * d') as Extract<FormulaAstNode, { t: 'bin' }>)
    // a * (b+c) * d → 3 项 2 运算符，中间项是一个 bin(+)
    expect(bin.terms.length).toBe(3)
    expect(bin.ops).toEqual(['*', '*'])
    expect(bin.terms[1]?.t).toBe('bin') // (b+c) 整体作为一项
  })

  it('折回后括号自动正确（低优先级项加括号）', () => {
    const ast = parseExprToFormulaAst('a * (b + c)') as Extract<FormulaAstNode, { t: 'bin' }>
    const { terms, ops } = flattenChain(ast)
    expect(ser(foldChain(terms, ops))).toContain('(') // 括号必须保留
  })
})
