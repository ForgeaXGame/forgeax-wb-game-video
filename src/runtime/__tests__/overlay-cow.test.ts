/**
 * overlay 写时复制（copy-on-write）—— 编辑挂共享方案的节点时自动 fork 为 `node:<id>` 专属副本，
 * 不污染共享方案、不影响其它挂同方案的节点；卸载副本后可清理孤儿。
 */
import { describe, expect, it } from 'vitest'
import type { GameScenario, Overlay } from '../schema/graph-schema'
import { node, scnOf } from './test-fixtures'
import {
  addOverlayChild,
  dropOverlayIfUnreferenced,
  forkSchemeForEdit,
  isOverlayReferenced,
  nodeOverlayId,
  patchOverlayChild,
  removeOverlayChild,
} from '../schema/overlay-edit'

const SCHEME: Overlay = {
  id: 'scheme-static',
  title: '静态组件方案',
  children: [
    { id: 'line', component: 'dialogue', trigger: { when: 'enter' }, params: { text: 'orig' } },
    { id: 'hp', component: 'battleHpBar', trigger: { when: 'enter' }, params: { bind: 'ent-player' } },
  ],
}
const HUD: Overlay = {
  id: 'battleHud',
  title: 'HUD',
  children: [{ id: 'bar', component: 'battleHpBar', trigger: { when: 'enter' }, params: { bind: 'ent-boss' } }],
}

/** 两个节点 a/b 都挂共享方案 scheme-static。 */
function seedShared(over: Record<string, unknown> = {}): GameScenario {
  const a = node('a', { overlayNodes: [{ overlay: 'scheme-static' }], ...over })
  const b = node('b', { overlayNodes: [{ overlay: 'scheme-static' }] })
  return scnOf({ nodes: [a, b], edges: [] }, { ui: { overlays: { 'scheme-static': structuredClone(SCHEME), battleHud: structuredClone(HUD) } } })
}

function mountsOf(s: GameScenario, id: string) {
  return s.graph.nodes.find((n) => n.id === id)!.data.overlayNodes ?? []
}

describe('overlay copy-on-write', () => {
  it('编辑共享方案节点 → fork 成 node:<id> 深拷贝副本，切挂载，且不污染共享方案', () => {
    const s = seedShared()
    const next = patchOverlayChild(s, 'a', 'line', { params: { text: 'edited' } })

    const copy = next.ui!.overlays![nodeOverlayId('a')]!
    expect(copy.children).toHaveLength(2) // 深拷贝了整方案 children
    expect((copy.children.find((c) => c.id === 'line')!.params as { text: string }).text).toBe('edited')

    // 共享方案本体不变。
    const shared = next.ui!.overlays!['scheme-static']!
    expect((shared.children.find((c) => c.id === 'line')!.params as { text: string }).text).toBe('orig')

    // a 的内容挂载切到副本；b 仍挂共享方案。
    expect(mountsOf(next, 'a')).toEqual([{ overlay: nodeOverlayId('a') }])
    expect(mountsOf(next, 'b')).toEqual([{ overlay: 'scheme-static' }])
  })

  it('两节点挂同方案，编辑其一不影响另一（核心防污染）', () => {
    let s = seedShared()
    s = patchOverlayChild(s, 'a', 'line', { params: { text: 'A改' } })
    s = patchOverlayChild(s, 'b', 'line', { params: { text: 'B改' } })
    expect((s.ui!.overlays![nodeOverlayId('a')]!.children.find((c) => c.id === 'line')!.params as { text: string }).text).toBe('A改')
    expect((s.ui!.overlays![nodeOverlayId('b')]!.children.find((c) => c.id === 'line')!.params as { text: string }).text).toBe('B改')
    expect((s.ui!.overlays!['scheme-static']!.children.find((c) => c.id === 'line')!.params as { text: string }).text).toBe('orig')
  })

  it('多挂载：只 fork 内容方案（mounts[0]），HUD 保持共享引用不动', () => {
    const s = seedShared({ overlayNodes: [{ overlay: 'scheme-static' }, { overlay: 'battleHud' }] })
    const next = patchOverlayChild(s, 'a', 'line', { params: { text: 'edited' } })
    const mounts = mountsOf(next, 'a')
    expect(mounts[0]!.overlay).toBe(nodeOverlayId('a'))
    expect(mounts[1]!.overlay).toBe('battleHud')
    // HUD overlay 对象引用未被复制/改动。
    expect(next.ui!.overlays!['battleHud']).toBe(s.ui!.overlays!['battleHud'])
  })

  it('fork 保留挂载上的 reactions', () => {
    const reactions = [{ when: { type: 'event', id: 'pass' }, do: [{ kind: 'effect', effects: [] }] }]
    const s = seedShared({ overlayNodes: [{ overlay: 'scheme-static', reactions }] })
    const next = forkSchemeForEdit(s, 'a')
    const mount = mountsOf(next, 'a')[0]!
    expect(mount.overlay).toBe(nodeOverlayId('a'))
    expect(mount.reactions).toHaveLength(1)
  })

  it('幂等：已是 node:<id> 副本时再 fork 不重复复制（返回同引用）', () => {
    const once = forkSchemeForEdit(seedShared(), 'a')
    const twice = forkSchemeForEdit(once, 'a')
    expect(twice).toBe(once)
  })

  it('空节点新增素材：建 node:<id> 且不误 fork 任何方案', () => {
    const e = node('e')
    const s = scnOf({ nodes: [e], edges: [] })
    const out = addOverlayChild(s, 'e', { id: 'c1', component: 'dialogue', trigger: { when: 'enter' }, params: { text: 'hi' } })
    expect(out.ui!.overlays![nodeOverlayId('e')]!.children).toHaveLength(1)
    expect(mountsOf(out, 'e')).toEqual([{ overlay: nodeOverlayId('e') }])
  })

  it('删除 child 也走 fork：从副本删，不动共享方案', () => {
    const s = seedShared()
    const next = removeOverlayChild(s, 'a', 'line')
    expect(next.ui!.overlays![nodeOverlayId('a')]!.children.map((c) => c.id)).toEqual(['hp'])
    expect(next.ui!.overlays!['scheme-static']!.children.map((c) => c.id)).toEqual(['line', 'hp'])
  })

  it('dropOverlayIfUnreferenced：卸载后清孤儿，仍被引用则保留，且不碰共享方案', () => {
    const forked = forkSchemeForEdit(seedShared(), 'a')
    // 仍挂着 → 保留。
    expect(dropOverlayIfUnreferenced(forked, nodeOverlayId('a')).ui!.overlays![nodeOverlayId('a')]).toBeDefined()
    expect(isOverlayReferenced(forked, nodeOverlayId('a'))).toBe(true)

    // 模拟卸载 a 的副本挂载 → 清孤儿。
    const unmounted: GameScenario = {
      ...forked,
      graph: {
        ...forked.graph,
        nodes: forked.graph.nodes.map((n) => (n.id === 'a' ? { ...n, data: { ...n.data, overlayNodes: undefined } } : n)),
      },
    }
    expect(dropOverlayIfUnreferenced(unmounted, nodeOverlayId('a')).ui!.overlays![nodeOverlayId('a')]).toBeUndefined()

    // 非 node: 前缀（共享方案）永不删，返回同引用。
    expect(dropOverlayIfUnreferenced(forked, 'scheme-static')).toBe(forked)
  })

  it('引用判断覆盖子蓝图包：仅被 pack 图引用的副本不误删', () => {
    // 主图无节点挂 node:p，但某子蓝图包的节点挂着它。
    const packNode = node('p', { overlayNodes: [{ overlay: nodeOverlayId('p') }] })
    const s: GameScenario = {
      schemaVersion: 't',
      graph: { nodes: [], edges: [] },
      packs: [
        {
          schemaVersion: 'wb-game-video.pack.v1',
          id: 'pk',
          version: '1',
          entry: 'p',
          graph: { nodes: [packNode], edges: [] },
        },
      ],
      ui: { overlays: { [nodeOverlayId('p')]: { id: nodeOverlayId('p'), children: [] } } },
    }
    expect(isOverlayReferenced(s, nodeOverlayId('p'))).toBe(true)
    expect(dropOverlayIfUnreferenced(s, nodeOverlayId('p'))).toBe(s) // 被 pack 引用 → 不删
  })
})
