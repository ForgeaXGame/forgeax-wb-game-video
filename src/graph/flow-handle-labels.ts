/**
 * 流程出口 handle 的人类可读标签（画布引脚 / 节点配置「出边」下拉共用）。
 * 落盘仍用机器 id（out / opt:ying / cond:0 …）；UI 只展示中文或组件提供的 label。
 */
import type { NodeHandle } from '../runtime/schema/graph-schema'

const BUILTIN: Record<string, string> = {
  out: '默认推进',
  else: '否则',
  pass: '成功',
  fail: '失败',
  good: '良好',
  miss: '失手',
  A: '按键 A',
  B: '按键 B',
}

/** 将 sourceHandle 转成展示文案。 */
export function flowHandleDisplay(id: string, label?: string): string {
  if (label && label !== id) return label
  if (BUILTIN[id]) return BUILTIN[id]
  if (id.startsWith('cond:')) {
    const n = Number(id.slice(5))
    return Number.isFinite(n) ? `条件分支 ${n + 1}` : `条件 · ${id.slice(5)}`
  }
  if (id.startsWith('opt:')) return `选项 · ${id.slice(4)}`
  if (id.startsWith('hs:')) return `热点 · ${id.slice(3)}`
  return id
}

export function flowHandleOption(h: NodeHandle): { value: string; label: string } {
  return { value: h.id, label: flowHandleDisplay(h.id, h.label) }
}

/** 合并 deriveOutputs + 边上已用到的 handle，去重保序。 */
export function mergeFlowHandles(
  derived: NodeHandle[],
  extraIds: Iterable<string>,
): Array<{ value: string; label: string }> {
  const seen = new Set<string>()
  const out: Array<{ value: string; label: string }> = []
  const push = (id: string, label?: string) => {
    if (seen.has(id)) return
    seen.add(id)
    out.push({ value: id, label: flowHandleDisplay(id, label) })
  }
  for (const h of derived) push(h.id, h.label)
  for (const id of extraIds) push(id)
  return out
}
