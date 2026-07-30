import { describe, it, expect } from 'vitest'
import { NODIA_DEMO_PROJECT } from '../demo'
import { MAIN_ID } from '../../persist/blueprint-project'
import demoJson from '../nodia.graph.json'
import newComponents from '../../../runtime/component-host/components/new'
import { nodeOverlayChildren } from '../../../runtime/schema/expand-overlay'

const NEW_COMPONENT_IDS = new Set(newComponents.map(({ manifest }) => manifest.id))

describe('NODIA_DEMO_PROJECT', () => {
  it('disk json is GraphLibraryDocument (manifest.packs + mainPackId, no legacy fields)', () => {
    const raw = demoJson as Record<string, unknown>
    expect(raw.version).toBe('wb-game-video.graph.v1')
    expect(raw.rng).toBeUndefined()
    expect(raw.reactions).toBeUndefined()
    expect(raw.packs).toBeUndefined()
    expect(raw.schemaVersion).toBeUndefined()
    const manifest = raw.manifest as { mainPackId: string; packs: Record<string, unknown>; version: string }
    expect(manifest.version).toBe('wb-game-video.blueprint-manifest.v1')
    expect(manifest.mainPackId).toBe(MAIN_ID)
    expect(manifest.packs[MAIN_ID]).toBeTruthy()
  })
  it('has a main blueprint in manifest', () => {
    expect(NODIA_DEMO_PROJECT.manifest.mainPackId).toBe(MAIN_ID)
    expect(NODIA_DEMO_PROJECT.manifest.packs[MAIN_ID]!.graph.nodes.length).toBeGreaterThan(0)
  })
  it('root meta carries entities; root graph mirrors main pack', () => {
    expect(NODIA_DEMO_PROJECT.entities).toBeTruthy()
    expect(NODIA_DEMO_PROJECT.graph).toEqual(NODIA_DEMO_PROJECT.manifest.packs[MAIN_ID]!.graph)
  })
  it('starts with an empty custom overlay catalog and base-backed mounts', () => {
    const overlays = NODIA_DEMO_PROJECT.ui?.overlays ?? {}
    expect(Object.keys(overlays).filter((id) => !id.startsWith('base:') && !id.startsWith('node:'))).toEqual([])
    for (const node of NODIA_DEMO_PROJECT.graph.nodes) {
      for (const mount of node.data.overlayNodes ?? []) {
        expect(mount.overlay.startsWith('base:'), `${node.id}:${mount.overlay}`).toBe(true)
        expect(NEW_COMPONENT_IDS.has(mount.overlay.slice('base:'.length)), mount.overlay).toBe(true)
      }
      for (const child of nodeOverlayChildren(NODIA_DEMO_PROJECT, node)) {
        expect(NEW_COMPONENT_IDS.has(child.component), `${node.id}:${child.component}`).toBe(true)
      }
    }
  })
  it('turn containers have lethal edge exits (replaces old scenario.reactions)', () => {
    const outs = (id: string) => NODIA_DEMO_PROJECT.graph.edges.filter((e) => e.source === id)
    expect(outs('a_my').some((e) => e.id === 'e-amy-win')).toBe(true)
    expect(outs('a_my').some((e) => e.id === 'e-amy-lose')).toBe(true)
    expect(outs('b_ai').some((e) => e.id === 'e-bai-win')).toBe(true)
    expect(outs('b_ai').some((e) => e.id === 'e-bai-lose')).toBe(true)
  })
})
