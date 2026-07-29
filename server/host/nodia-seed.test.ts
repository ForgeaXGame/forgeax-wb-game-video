import { describe, expect, it } from 'vitest'
import { createNodiaSeed, validateNodiaSeed } from './nodia-seed'

function collectMediaRefs(value: unknown, refs: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectMediaRefs(item, refs)
    return refs
  }
  if (!value || typeof value !== 'object') return refs

  const record = value as Record<string, unknown>
  const media = record.media
  if (media && typeof media === 'object') {
    const ref = (media as Record<string, unknown>).ref
    if (typeof ref === 'string') refs.push(ref)
  }
  for (const child of Object.values(record)) collectMediaRefs(child, refs)
  return refs
}

describe('Nodia game package seed', () => {
  it('creates a portable, complete game package from extension-owned fixtures', async () => {
    const seed = await createNodiaSeed()

    expect(seed.project).toMatchObject({
      platform: 'wb-game-video',
      entry: {
        blueprint: 'blueprint.json',
        components: 'dist/components',
      },
    })
    expect(seed.blueprint.manifest.mainPackId).toBeTruthy()
    expect(seed.assetsManifest.version).toBe(2)
    expect(seed.assetsManifest.assets).toHaveLength(31)
    expect(() => validateNodiaSeed(seed)).not.toThrow()

    const assetIds = new Set(seed.assetsManifest.assets.map((asset) => asset.id))
    for (const ref of collectMediaRefs(seed.blueprint)) {
      expect(assetIds.has(ref), `missing seeded asset for media.ref '${ref}'`).toBe(true)
    }
    for (const asset of seed.assetsManifest.assets) {
      expect(asset.id).toMatch(/^[^/\\.]+$/)
      expect(asset.file).toEqual({
        provider: 'extension',
        key: `zhandou/${asset.id}.mp4`,
        mime: 'video/mp4',
      })
    }

    expect(JSON.stringify(seed)).not.toMatch(/\/Users\/|\/workspace\/|\.forgeax\/games|file:\/\//)
  })

  it('returns isolated fixture copies and rejects invalid references', async () => {
    const first = await createNodiaSeed()
    const second = await createNodiaSeed()
    first.assetsManifest.assets[0]!.id = 'mutated'
    expect(second.assetsManifest.assets[0]!.id).not.toBe('mutated')

    second.blueprint.graph.nodes[0]!.data.media = { kind: 'video', ref: 'not-seeded' }
    second.blueprint.manifest.packs[second.blueprint.manifest.mainPackId]!.graph.nodes[0]!.data.media = {
      kind: 'video', ref: 'not-seeded',
    }
    expect(() => validateNodiaSeed(second)).toThrow(/media\.ref.*not-seeded/)
  })

  it('rejects cyclic subflow traversal', async () => {
    const seed = await createNodiaSeed()
    const main = seed.blueprint.manifest.packs[seed.blueprint.manifest.mainPackId]!
    ;(main.graph.nodes[0]!.data as unknown as { subFlowPack?: unknown }).subFlowPack = { id: main.id }
    ;(seed.blueprint.graph.nodes[0]!.data as unknown as { subFlowPack?: unknown }).subFlowPack = { id: main.id }

    expect(() => validateNodiaSeed(seed)).toThrow(/subflow reference cycle/)
  })
})
