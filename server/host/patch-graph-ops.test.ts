import { describe, expect, test } from 'vitest'
import blueprint from './fixtures/nodia.blueprint.json'
import { applyPatchGraphOps } from './patch-graph-ops'
import type { GraphLibraryDocument } from '../../src/runtime/schema/graph-schema'
import { normalizeDocument } from '../../src/editor/persist/blueprint-project'

describe('applyPatchGraphOps', () => {
  test('renames a node on the main pack and keeps root graph in sync', () => {
    const doc = normalizeDocument(blueprint as GraphLibraryDocument)
    const nodeId = doc.graph.nodes[0]!.id
    const result = applyPatchGraphOps(doc, {
      ops: [{ op: 'set-node-field', nodeId, field: 'name', value: '过桥' }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.applied).toBe(1)
    const renamed = result.document.graph.nodes.find((n) => n.id === nodeId)
    expect(renamed?.data.name ?? (renamed as { name?: string }).name).toBeDefined()
    // set-node-field name writes node.data.name when field==='name' OR top-level name —
    // implement as: field 'name' → patchNodeData({ name: value })
    expect(result.document.graph.nodes.find((n) => n.id === nodeId)!.data.name).toBe('过桥')
    const mainId = result.document.manifest.mainPackId
    expect(result.document.manifest.packs[mainId]!.graph.nodes.find((n) => n.id === nodeId)!.data.name).toBe('过桥')
  })

  test('rolls back entire batch when a later op fails', () => {
    const doc = normalizeDocument(structuredClone(blueprint) as GraphLibraryDocument)
    const nodeId = doc.graph.nodes[0]!.id
    const before = JSON.stringify(doc)
    const result = applyPatchGraphOps(doc, {
      ops: [
        { op: 'set-node-field', nodeId, field: 'name', value: '临时名' },
        { op: 'set-node-field', nodeId: 'missing-node', field: 'name', value: 'x' },
      ],
    })
    expect(result).toMatchObject({ ok: false, failedOpIndex: 1 })
    expect(JSON.stringify(doc)).toBe(before) // input doc not mutated
  })

  test('rejects empty ops', () => {
    const doc = normalizeDocument(blueprint as GraphLibraryDocument)
    expect(applyPatchGraphOps(doc, { ops: [] }).ok).toBe(false)
  })
})
