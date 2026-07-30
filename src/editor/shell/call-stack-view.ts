/**
 * 试玩「蓝图」浮层：调用栈 → 面包屑 / pinned 高亮（编辑器调试 UI 专用）。
 * runtime 只暴露 SessionSnapshot.activeBlueprintId + callStack；折叠规则不住引擎。
 */
import { getSubFlow, type GameGraph } from '../../runtime/schema/graph-schema'

export interface BlueprintCrumb {
  blueprintId: string
  title: string
}

/** 外→内：root + 栈中每次换蓝图的帧 + 当前 active（去重连续相同 id） */
export function blueprintBreadcrumbs(
  rootBlueprintId: string,
  rootTitle: string,
  callStack: ReadonlyArray<{ blueprintId: string; title?: string }>,
  activeBlueprintId: string,
  activeTitle: string,
): BlueprintCrumb[] {
  const out: BlueprintCrumb[] = [{ blueprintId: rootBlueprintId, title: rootTitle || rootBlueprintId }]
  for (const f of callStack) {
    const last = out[out.length - 1]
    if (last && last.blueprintId === f.blueprintId) continue
    out.push({ blueprintId: f.blueprintId, title: f.title || f.blueprintId })
  }
  const last = out[out.length - 1]
  if (!last || last.blueprintId !== activeBlueprintId) {
    out.push({ blueprintId: activeBlueprintId, title: activeTitle || activeBlueprintId })
  } else {
    last.title = activeTitle || last.title
  }
  return out
}

/** pinned 到某蓝图时：该 id 在栈上最深一帧的 caller；若 pinned===active 则 null（改用 currentNodeId） */
export function deepestCallerOnBlueprint(
  callStack: ReadonlyArray<{ blueprintId: string; callerNodeId: string }>,
  pinnedBlueprintId: string,
  activeBlueprintId: string,
): string | null {
  if (pinnedBlueprintId === activeBlueprintId) return null
  for (let i = callStack.length - 1; i >= 0; i--) {
    if (callStack[i]!.blueprintId === pinnedBlueprintId) return callStack[i]!.callerNodeId
  }
  return null
}

/** 从同图子流程入口沿普通边收集成员；子流程返回由调用栈完成，不会沿边串回父流程。 */
export function subflowMembers(graph: GameGraph, entryId: string): Set<string> {
  const adjacency = new Map<string, string[]>()
  for (const edge of graph.edges) {
    const targets = adjacency.get(edge.source) ?? []
    targets.push(edge.target)
    adjacency.set(edge.source, targets)
  }

  const members = new Set<string>([entryId])
  const queue = [entryId]
  while (queue.length > 0) {
    const source = queue.shift()!
    for (const target of adjacency.get(source) ?? []) {
      if (members.has(target)) continue
      members.add(target)
      queue.push(target)
    }
  }
  return members
}

/** 根视图只展示父流程和容器；下钻后只展示当前容器拥有的节点。 */
export function visibleSubflowNodeIds(graph: GameGraph, drillPath: readonly string[]): Set<string> {
  if (drillPath.length > 0) {
    const container = graph.nodes.find((node) => node.id === drillPath[drillPath.length - 1])
    const entry = container ? getSubFlow(container.data) : undefined
    if (entry) return subflowMembers(graph, entry)
  }

  const hidden = new Set<string>()
  for (const node of graph.nodes) {
    const entry = getSubFlow(node.data)
    if (!entry) continue
    for (const member of subflowMembers(graph, entry)) hidden.add(member)
  }
  return new Set(graph.nodes.map((node) => node.id).filter((id) => !hidden.has(id)))
}

/** 当前蓝图里仍在栈上的同图子流程容器，按外到内顺序组成跟随下钻路径。 */
export function activeSubflowPath(
  graph: GameGraph,
  callStack: ReadonlyArray<{ blueprintId: string; callerNodeId: string }>,
  activeBlueprintId: string,
): string[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  return callStack.flatMap((frame) => {
    if (frame.blueprintId !== activeBlueprintId) return []
    const node = nodes.get(frame.callerNodeId)
    return node && getSubFlow(node.data) ? [frame.callerNodeId] : []
  })
}
