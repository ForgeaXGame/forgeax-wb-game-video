import type { GameGraph, GraphLibraryDocument } from '../../src/runtime/schema/graph-schema'
import { normalizeDocument } from '../../src/editor/persist/blueprint-project'
import { patchNodeData } from '../../src/graph/edit/graph-edit'

export type PatchGraphInput = {
  blueprintId?: string
  ops: Array<Record<string, unknown>>
}

export type PatchGraphApplyResult =
  | { ok: true; document: GraphLibraryDocument; applied: number }
  | { ok: false; errors: string[]; failedOpIndex?: number }

function resolvePackId(doc: GraphLibraryDocument, blueprintId?: string): string {
  return blueprintId ?? doc.manifest.mainPackId
}

function withPackGraph(
  doc: GraphLibraryDocument,
  packId: string,
  nextGraph: GameGraph,
): GraphLibraryDocument {
  const pack = doc.manifest.packs[packId]
  if (!pack) throw new Error(`blueprint not found: ${packId}`)
  const packs = {
    ...doc.manifest.packs,
    [packId]: { ...pack, graph: nextGraph },
  }
  return normalizeDocument({
    ...doc,
    manifest: { ...doc.manifest, packs },
  })
}

export function applyPatchGraphOps(
  inputDoc: GraphLibraryDocument,
  input: PatchGraphInput,
): PatchGraphApplyResult {
  if (!Array.isArray(input.ops) || input.ops.length === 0) {
    return { ok: false, errors: ['ops must be a non-empty array'] }
  }

  let doc = normalizeDocument(structuredClone(inputDoc))
  const packId = resolvePackId(doc, input.blueprintId)
  if (!doc.manifest.packs[packId]) {
    return { ok: false, errors: [`blueprint not found: ${packId}`], failedOpIndex: 0 }
  }

  for (let i = 0; i < input.ops.length; i++) {
    const op = input.ops[i]!
    const kind = String(op.op)
    try {
      let graph = doc.manifest.packs[packId]!.graph
      if (kind === 'set-node-field') {
        const nodeId = String(op.nodeId ?? '')
        const field = String(op.field ?? '')
        if (!nodeId || !field) throw new Error(`op[${i}] missing nodeId/field`)
        const node = graph.nodes.find((n) => n.id === nodeId)
        if (!node) throw new Error(`node not found: ${nodeId}`)
        if (field === 'name') {
          graph = patchNodeData(graph, nodeId, { name: String(op.value) })
        } else if (field === 'type') {
          graph = {
            ...graph,
            nodes: graph.nodes.map((n) =>
              n.id === nodeId ? { ...n, type: String(op.value) as typeof n.type } : n,
            ),
          }
        } else if (field === 'position') {
          const pos = op.value as { x: number; y: number }
          graph = {
            ...graph,
            nodes: graph.nodes.map((n) =>
              n.id === nodeId ? { ...n, position: { x: pos.x, y: pos.y } } : n,
            ),
          }
        } else {
          throw new Error(`unsupported field: ${field}`)
        }
        doc = withPackGraph(doc, packId, graph)
      } else {
        throw new Error(`unsupported op: ${kind}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        ok: false,
        errors: [message],
        failedOpIndex: i,
      }
    }
  }

  return { ok: true, document: doc, applied: input.ops.length }
}
