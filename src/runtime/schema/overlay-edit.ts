/**
 * scenario 级 overlay 编辑 —— children 住在 ui.overlays，节点挂 overlayNodes[]。
 */
import type { GameGraph, GameScenario, OverlayChild, OverlayNode } from '../schema/graph-schema'
import { overlayMountId } from '../schema/node-config-schema'

export function nodeOverlayId(nodeId: string): string {
  return `node:${nodeId}`
}

/** 设节点的 overlayNodes（本层内联，避免 runtime→graph 反向依赖）。 */
function setNodeOverlayNodes(graph: GameGraph, nodeId: string, overlayNodes: OverlayNode[]): GameGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, overlayNodes } } : n)),
  }
}

/** 节点素材编辑用的主挂载：优先 `node:<id>`，否则第一份。 */
export function primaryOverlayMount(
  node: { id: string; data: { overlayNodes?: OverlayNode[] } } | undefined,
): OverlayNode | undefined {
  const mounts = node?.data.overlayNodes ?? []
  if (!node || !mounts.length) return undefined
  return mounts.find((m) => m.overlay === nodeOverlayId(node.id)) ?? mounts[0]
}

/**
 * 写时复制（copy-on-write）：编辑节点内容前，确保其「内容 overlay」是节点专属副本 `node:<id>`。
 *
 * - 无任何挂载 → 建空 `node:<id>` 并挂上（供空节点新增素材）。
 * - 内容 mount 已是 `node:<id>` → 幂等，不重复 fork。
 * - 内容 mount 指向共享方案 → 深拷贝其 children 到 `node:<id>`，把该 mount 切到 `node:<id>`
 *   （保留 reactions 等挂载字段），其余挂载（HUD 等）原样保留、继续共享。
 *
 * 内容 mount = 时间轴读取源（优先 `node:<id>`，否则第一份），与 graphMaterialOps.overlayIdOf 一致，
 * 保证「编辑谁就 fork 谁」。
 */
export function forkSchemeForEdit(scenario: GameScenario, nodeId: string): GameScenario {
  const node = scenario.graph.nodes.find((n) => n.id === nodeId)
  if (!node) return scenario
  const overlayId = nodeOverlayId(nodeId)
  const overlays = { ...(scenario.ui?.overlays ?? {}) }
  const mounts = [...(node.data.overlayNodes ?? [])]

  // 空节点：建空副本并挂上（旧 ensureNodeOverlay 语义）。
  if (!mounts.length) {
    if (!overlays[overlayId]) overlays[overlayId] = { id: overlayId, children: [] }
    return {
      ...scenario,
      ui: { ...scenario.ui, overlays },
      graph: setNodeOverlayNodes(scenario.graph, nodeId, [{ overlay: overlayId }]),
    }
  }

  const preferIdx = mounts.findIndex((m) => m.overlay === overlayId)
  const contentIdx = preferIdx >= 0 ? preferIdx : 0
  const contentMount = mounts[contentIdx]!

  // 已是节点专属副本：幂等，仅在目录缺失时补空壳。
  if (contentMount.overlay === overlayId) {
    if (overlays[overlayId]) return scenario
    overlays[overlayId] = { id: overlayId, children: [] }
    return { ...scenario, ui: { ...scenario.ui, overlays } }
  }

  // 共享方案 → 深拷贝成节点专属副本，并把该挂载切到副本。
  const scheme = overlays[contentMount.overlay]
  overlays[overlayId] = scheme ? { ...structuredClone(scheme), id: overlayId } : { id: overlayId, children: [] }
  mounts[contentIdx] = { ...contentMount, overlay: overlayId }
  return {
    ...scenario,
    ui: { ...scenario.ui, overlays },
    graph: setNodeOverlayNodes(scenario.graph, nodeId, mounts),
  }
}

/** 语义并入 forkSchemeForEdit；保留名字供既有调用点（新增素材前确保节点已 fork 为专属副本）。 */
export function ensureNodeOverlay(scenario: GameScenario, nodeId: string): GameScenario {
  return forkSchemeForEdit(scenario, nodeId)
}

/** 某 overlay 是否被 scenario 中任一图（主图 + 子蓝图包）的节点挂载引用。 */
export function isOverlayReferenced(scenario: GameScenario, overlayId: string): boolean {
  const inGraph = (g: GameGraph): boolean =>
    g.nodes.some((n) => (n.data.overlayNodes ?? []).some((m) => m.overlay === overlayId))
  if (inGraph(scenario.graph)) return true
  return (scenario.packs ?? []).some((p) => inGraph(p.graph))
}

/** 从目录移除无人引用的节点专属副本（仅 `node:` 前缀，避免误删共享方案）。 */
export function dropOverlayIfUnreferenced(scenario: GameScenario, overlayId: string): GameScenario {
  if (!overlayId.startsWith('node:')) return scenario
  if (!scenario.ui?.overlays?.[overlayId]) return scenario
  if (isOverlayReferenced(scenario, overlayId)) return scenario
  const { [overlayId]: _drop, ...rest } = scenario.ui.overlays
  return { ...scenario, ui: { ...scenario.ui, overlays: rest } }
}

export function addOverlayChild(scenario: GameScenario, nodeId: string, child: OverlayChild): GameScenario {
  const scn = forkSchemeForEdit(scenario, nodeId)
  const overlayId = nodeOverlayId(nodeId)
  const ov = scn.ui?.overlays?.[overlayId]
  if (!ov) return scn
  return {
    ...scn,
    ui: {
      ...scn.ui,
      overlays: {
        ...scn.ui!.overlays,
        [overlayId]: { ...ov, children: [...ov.children, child] },
      },
    },
  }
}

export function removeOverlayChild(scenario: GameScenario, nodeId: string, childId: string): GameScenario {
  const scn = forkSchemeForEdit(scenario, nodeId)
  const overlayId = nodeOverlayId(nodeId)
  const ov = scn.ui?.overlays?.[overlayId]
  if (!ov) return scn
  return {
    ...scn,
    ui: {
      ...scn.ui,
      overlays: {
        ...scn.ui!.overlays,
        [overlayId]: { ...ov, children: ov.children.filter((c) => c.id !== childId) },
      },
    },
  }
}

export function patchOverlayChild(
  scenario: GameScenario,
  nodeId: string,
  childId: string,
  patch: Partial<OverlayChild>,
): GameScenario {
  const scn = forkSchemeForEdit(scenario, nodeId)
  const overlayId = nodeOverlayId(nodeId)
  const ov = scn.ui?.overlays?.[overlayId]
  if (!ov) return scn
  return {
    ...scn,
    ui: {
      ...scn.ui,
      overlays: {
        ...scn.ui!.overlays,
        [overlayId]: {
          ...ov,
          children: ov.children.map((c) =>
            c.id === childId
              ? {
                  ...c,
                  ...patch,
                  params: patch.params ? { ...c.params, ...patch.params } : c.params,
                  layout: patch.layout ? { ...c.layout, ...patch.layout } : c.layout,
                }
              : c,
          ),
        },
      },
    },
  }
}

export function patchOverlayChildParams(
  scenario: GameScenario,
  nodeId: string,
  childId: string,
  params: Record<string, unknown>,
): GameScenario {
  const scn = forkSchemeForEdit(scenario, nodeId)
  const overlayId = nodeOverlayId(nodeId)
  const child = scn.ui?.overlays?.[overlayId]?.children.find((c) => c.id === childId)
  if (!child) return scn
  return patchOverlayChild(scn, nodeId, childId, { params: { ...child.params, ...params } })
}

/** 改 ui.overlays 目录里的 child（界面 tab / 共享 overlay，不经节点挂载路由）。 */
export function patchOverlayCatalogChild(
  scenario: GameScenario,
  overlayId: string,
  childId: string,
  patch: Partial<OverlayChild>,
): GameScenario {
  const ov = scenario.ui?.overlays?.[overlayId]
  if (!ov) return scenario
  return {
    ...scenario,
    ui: {
      ...scenario.ui,
      overlays: {
        ...scenario.ui!.overlays,
        [overlayId]: {
          ...ov,
          children: ov.children.map((c) =>
            c.id === childId
              ? {
                  ...c,
                  ...patch,
                  params: patch.params ? { ...c.params, ...patch.params } : c.params,
                  layout: patch.layout ? { ...c.layout, ...patch.layout } : c.layout,
                }
              : c,
          ),
        },
      },
    },
  }
}

export function patchOverlayMount(
  scenario: GameScenario,
  nodeId: string,
  mountId: string,
  patch: Partial<OverlayNode>,
): GameScenario {
  const node = scenario.graph.nodes.find((n) => n.id === nodeId)
  if (!node) return scenario
  const mounts = (node.data.overlayNodes ?? []).map((m) =>
    overlayMountId(m) === mountId ? { ...m, ...patch } : m,
  )
  return { ...scenario, graph: setNodeOverlayNodes(scenario.graph, nodeId, mounts) }
}
