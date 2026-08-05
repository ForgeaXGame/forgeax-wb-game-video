import { describe, expect, it, vi } from 'vitest'
import type { WorkbenchExtensionContext } from '@forgeax/workbench-host/node'
import type { HostAssetRegistry } from '../asset-registry'
import type { MediaAsset } from '../../src/editor/assets/registry-types'
import { generateVideoClip, type GenerateVideoClipArgs } from './clip'

function imageAsset(id: string, overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id,
    kind: 'image',
    productionType: 'shot_image',
    status: 'ready',
    mime: 'image/png',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function createRegistry(assets: Map<string, MediaAsset>): HostAssetRegistry {
  const generatedVideo: MediaAsset = {
    id: 'video-asset',
    kind: 'video',
    productionType: 'video_clip',
    status: 'ready',
    createdAt: 1,
    updatedAt: 1,
  }
  return {
    list: vi.fn(async () => [...assets.values()]),
    get: vi.fn(async (id: string) => assets.get(id) ?? null),
    upsert: vi.fn(async (asset) => { assets.set(asset.id, asset); return asset }),
    update: vi.fn(async (id: string, patch: Partial<MediaAsset>) => {
      const current = assets.get(id)
      if (!current) return null
      const next = { ...current, ...patch }
      assets.set(id, next)
      return next
    }),
    getStyleAxes: vi.fn(async () => undefined),
    setStyleAxes: vi.fn(async (axes) => axes),
    importGameFile: vi.fn(async () => generatedVideo),
    mediaReference: vi.fn(async (id: string) => ({ assetId: `host:${id}` })),
    persistGenerated: vi.fn(async () => generatedVideo),
  }
}

function baseArgs(overrides: Partial<GenerateVideoClipArgs> = {}): GenerateVideoClipArgs {
  return {
    prompt: '  A heroine crosses a rain-soaked alley.  ',
    durationSeconds: 6,
    generateAudio: true,
    mode: 'strict',
    firstFrameAssetId: 'first',
    lastFrameAssetId: 'last',
    label: 'Rainy crossing',
    ...overrides,
  }
}

function createContext(
  generateVideo: WorkbenchExtensionContext['videoGeneration']['generateVideo'],
): WorkbenchExtensionContext {
  return {
    gameId: 'game-1',
    videoGeneration: { generateVideo } as WorkbenchExtensionContext['videoGeneration'],
  } as unknown as WorkbenchExtensionContext
}

describe('generateVideoClip', () => {
  it('persists one generating placeholder before submission, resolves host references, and marks ready', async () => {
    const assets = new Map<string, MediaAsset>([
      ['first', imageAsset('first')],
      ['last', imageAsset('last')],
    ])
    const registry = createRegistry(assets)
    const generateVideo = vi.fn(async (input: Parameters<WorkbenchExtensionContext['videoGeneration']['generateVideo']>[0]) => {
      const placeholder = [...assets.values()].find((a) => a.productionType === 'video_clip')
      expect(placeholder).toMatchObject({
        status: 'generating',
        label: 'Rainy crossing',
        sourceModule: 'wb-game-video',
        meta: expect.objectContaining({
          source: 'asset-library-generation',
          mode: 'strict',
          requestId: 'request-ready-1',
        }),
      })
      expect(input).toMatchObject({
        prompt: '  A heroine crosses a rain-soaked alley.  ',
        durationSeconds: 6,
        generateAudio: true,
        references: [
          { assetId: 'host:first', role: 'first_frame' },
          { assetId: 'host:last', role: 'last_frame' },
        ],
      })
      return { assets: [{ id: 'generated-video', type: 'video', contentType: 'video/mp4', url: 'memory://generated-video' }] }
    })
    const context = createContext(generateVideo)

    const result = await generateVideoClip(context, baseArgs({ requestId: 'request-ready-1' }), registry)

    expect(result.status).toBe('ready')
    expect(registry.persistGenerated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'generated-video' }),
      expect.objectContaining({
        registryId: result.assetId,
        productionType: 'video_clip',
        sceneNodeId: 'asset-library',
        durationMs: 6000,
      }),
    )
  })

  it('maps ref mode through mediaReference for every listed image', async () => {
    const assets = new Map<string, MediaAsset>([
      ['reference', imageAsset('reference')],
      ['first', imageAsset('first')],
    ])
    const registry = createRegistry(assets)
    const generateVideo = vi.fn(async (input: Parameters<WorkbenchExtensionContext['videoGeneration']['generateVideo']>[0]) => {
      expect(input.references).toEqual([
        { assetId: 'host:reference', role: 'reference_image' },
        { assetId: 'host:first', role: 'reference_image' },
      ])
      return { assets: [{ id: 'generated-video', type: 'video', contentType: 'video/mp4', url: 'memory://generated-video' }] }
    })
    const context = createContext(generateVideo)

    const result = await generateVideoClip(context, baseArgs({
      mode: 'ref',
      firstFrameAssetId: undefined,
      lastFrameAssetId: undefined,
      referenceImageAssetIds: ['reference', 'first'],
    }), registry)

    expect(result.status).toBe('ready')
  })

  it('updates the same placeholder to failed when the host video broker rejects the request', async () => {
    const assets = new Map<string, MediaAsset>([
      ['first', imageAsset('first')],
      ['last', imageAsset('last')],
    ])
    const registry = createRegistry(assets)
    const generateVideo = vi.fn(async () => { throw new Error('Kino generation failed') })
    const context = createContext(generateVideo)

    const result = await generateVideoClip(context, baseArgs({ requestId: 'request-failed-1' }), registry)

    expect(result).toEqual({
      assetId: result.assetId,
      status: 'failed',
      error: 'Kino generation failed',
    })
    const placeholder = assets.get(result.assetId)
    expect(placeholder).toMatchObject({ status: 'failed', error: 'Kino generation failed' })
  })

  it.each([
    ['strict without both frames', baseArgs({ lastFrameAssetId: undefined })],
    ['firstref without a first frame', baseArgs({ mode: 'firstref', firstFrameAssetId: undefined, lastFrameAssetId: undefined })],
    ['ref without reference images', baseArgs({ mode: 'ref', firstFrameAssetId: undefined, lastFrameAssetId: undefined, referenceImageAssetIds: [] })],
    ['t2v with an image', baseArgs({ mode: 't2v', lastFrameAssetId: undefined })],
    ['duration outside the public contract', baseArgs({ durationSeconds: 16 })],
    ['empty requestId', baseArgs({ requestId: '' })],
    ['requestId longer than 128 characters', baseArgs({ requestId: 'r'.repeat(129) })],
  ])('rejects %s before creating a placeholder', async (_name, args) => {
    const assets = new Map<string, MediaAsset>([
      ['first', imageAsset('first')],
      ['last', imageAsset('last')],
    ])
    const registry = createRegistry(assets)
    const generateVideo = vi.fn()
    const context = createContext(generateVideo)

    await expect(generateVideoClip(context, args, registry)).rejects.toThrow()

    expect(generateVideo).not.toHaveBeenCalled()
    expect([...assets.values()].some((a) => a.productionType === 'video_clip')).toBe(false)
  })

  it('rejects a reference absent from the registry before creating a placeholder', async () => {
    const registry = createRegistry(new Map())
    const generateVideo = vi.fn()
    const context = createContext(generateVideo)

    await expect(generateVideoClip(context, baseArgs({ firstFrameAssetId: 'missing' }), registry))
      .rejects.toThrow('参考图不存在：missing')

    expect(generateVideo).not.toHaveBeenCalled()
  })

  it('rejects invalid image metadata before creating a placeholder', async () => {
    const assets = new Map<string, MediaAsset>([
      ['first', imageAsset('first')],
      ['bad-mime', imageAsset('bad-mime', { mime: 'video/mp4' })],
    ])
    const registry = createRegistry(assets)
    const generateVideo = vi.fn()
    const context = createContext(generateVideo)

    await expect(generateVideoClip(context, baseArgs({
      mode: 'firstref',
      firstFrameAssetId: 'bad-mime',
      lastFrameAssetId: undefined,
    }), registry)).rejects.toThrow('参考图 MIME 无效：bad-mime')

    expect(generateVideo).not.toHaveBeenCalled()
  })
})
