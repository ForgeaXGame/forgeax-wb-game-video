import { afterEach, describe, expect, it } from 'vitest'
import { registerKind, getKind, unregisterKind, deriveOutputs, getComponentManifest, type KindPlugin } from '../registry/kind-registry'
import type { GameNode, Overlay } from '../schema/graph-schema'

const qtePlugin: KindPlugin = {
  kind: 'qte',
  role: 'interaction',
  events: [{ id: 'pass' }, { id: 'good' }, { id: 'fail' }],
}

function nodeWithKinds(kinds: string[]): { node: GameNode; overlays: Record<string, Overlay> } {
  const overlays: Record<string, Overlay> = {
    'ov-n1': {
      id: 'ov-n1',
      children: kinds.map((k, i) => ({
        id: `e${i}`,
        component: k,
        trigger: { when: 'enter' as const },
        inputs: {},
      })),
    },
  }
  const node: GameNode = {
    id: 'n1',
    type: 'perf',
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    data: { name: 't', overlayNodes: [{ overlay: 'ov-n1' }] },
  }
  return { node, overlays }
}

afterEach(() => unregisterKind('qte'))

describe('kind-registry', () => {
  it('register / get', () => {
    registerKind(qtePlugin)
    expect(getKind('qte')?.role).toBe('interaction')
    expect(getKind('nope')).toBeUndefined()
  })

  it('deriveOutputs = default + interaction kind outputs (dedup)', () => {
    registerKind(qtePlugin)
    const { node, overlays } = nodeWithKinds(['qte'])
    expect(deriveOutputs(node, overlays).map((h) => h.id)).toEqual(['default', 'pass', 'good', 'fail'])
  })

  it('unregistered kind contributes no handle', () => {
    const { node, overlays } = nodeWithKinds(['unknownKind'])
    expect(deriveOutputs(node, overlays).map((h) => h.id)).toEqual(['default'])
  })

  it('manifest.inputs: explicit inputs pass through; events included', () => {
    registerKind({
      kind: 'banner',
      role: 'presentation',
      label: '横幅',
      inputs: [
        { key: 'heroName', label: '英雄名', valueType: 'string' },
        { key: 'dmg', label: '扣血', valueType: 'number' },
      ],
      events: [{ id: 'cheer', label: '加油' }],
    })
    const m = getComponentManifest('banner')!
    expect(m.inputs?.map((i) => `${i.key}:${i.valueType}`)).toEqual(['heroName:string', 'dmg:number'])
    expect(m.events.map((e) => e.id)).toEqual(['cheer'])
    unregisterKind('banner')
  })

  it('interaction 出口 = 声明的 events（皮肤自 emit，引擎无 resolve/outputs）', () => {
    registerKind({ kind: 'qteResolve', role: 'interaction', events: [{ id: 'pass' }, { id: 'fail' }] })
    expect(getComponentManifest('qteResolve')!.events.map((e) => e.id)).toEqual(['pass', 'fail'])
    unregisterKind('qteResolve')
  })
})
