import type {
  BoundedGameFiles,
  WorkbenchExtensionContext,
} from '@forgeax/workbench-host/node'
import type {
  ImageGenerationInput,
  MediaAsset as HostMediaAsset,
  MediaBody,
  MediaCapability,
  MediaQuery,
  MediaWriteInput,
  ModelGateway,
  TextGenerationInput,
  VideoGenerationInput,
} from '@forgeax/workbench-host/contracts'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createHostAssetRegistry,
  sanitizePublicText,
} from '../asset-registry'
import blueprint from './fixtures/nodia.blueprint.json'
import {
  createWbGameVideoService,
  getAssetIdFromArgs,
} from './wb-service'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const originalForgeaxServerPort = process.env.FORGEAX_SERVER_PORT

function json(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('Timed out waiting for test condition')
}

class MemoryFiles implements BoundedGameFiles {
  readonly entries: Map<string, Uint8Array>
  readonly calls: string[] = []

  constructor(
    entries: Record<string, Uint8Array> = {},
    backing = new Map<string, Uint8Array>(),
  ) {
    this.entries = backing
    for (const [path, bytes] of Object.entries(entries)) {
      this.entries.set(path, new Uint8Array(bytes))
    }
  }

  async read(path: string): Promise<Uint8Array | null> {
    expect(path).not.toMatch(/^(?:\/|[A-Za-z]:[\\/])/)
    expect(path).not.toContain('..')
    this.calls.push(`read:${path}`)
    const bytes = this.entries.get(path)
    return bytes ? new Uint8Array(bytes) : null
  }

  async write(path: string, contents: Uint8Array): Promise<void> {
    expect(path).not.toMatch(/^(?:\/|[A-Za-z]:[\\/])/)
    expect(path).not.toContain('..')
    this.calls.push(`write:${path}`)
    this.entries.set(path, new Uint8Array(contents))
  }

  async list(path: string): Promise<string[]> {
    expect(path).not.toMatch(/^(?:\/|[A-Za-z]:[\\/])/)
    expect(path).not.toContain('..')
    this.calls.push(`list:${path}`)
    const prefix = `${path.replace(/\/+$/, '')}/`
    return [...new Set(
      [...this.entries.keys()]
        .filter((entry) => entry.startsWith(prefix))
        .map((entry) => entry.slice(prefix.length).split('/', 1)[0]!)
        .filter(Boolean),
    )].sort()
  }
}

class MemoryMedia implements MediaCapability {
  readonly bodies = new Map<string, MediaBody>()
  readonly assets = new Map<string, HostMediaAsset>()
  readonly puts: MediaWriteInput[] = []
  #sequence = 0

  async list(_gameId: string, query?: MediaQuery): Promise<HostMediaAsset[]> {
    let assets = [...this.assets.values()]
    if (query?.type) {
      assets = assets.filter((asset) => asset.type === query.type)
    }
    return assets.map((asset) => structuredClone(asset))
  }

  async read(_gameId: string, assetId: string): Promise<MediaBody | null> {
    const body = this.bodies.get(assetId)
    return body
      ? { contentType: body.contentType, bytes: new Uint8Array(body.bytes) }
      : null
  }

  async put(gameId: string, input: MediaWriteInput): Promise<HostMediaAsset> {
    this.puts.push({
      ...input,
      bytes: new Uint8Array(input.bytes),
      metadata: input.metadata ? structuredClone(input.metadata) : undefined,
    })
    const id = `${gameId}:media-${++this.#sequence}`
    this.bodies.set(id, {
      contentType: input.contentType,
      bytes: new Uint8Array(input.bytes),
    })
    const asset: HostMediaAsset = {
      id,
      type: input.contentType.startsWith('video/') ? 'video' : 'image',
      url: `https://media.invalid/${id}`,
      contentType: input.contentType,
      sizeBytes: input.bytes.byteLength,
      ...(input.metadata ? {
        metadata: structuredClone(input.metadata),
      } : {}),
    }
    this.assets.set(id, structuredClone(asset))
    return asset
  }
}

class MemoryModels implements ModelGateway {
  readonly textInputs: TextGenerationInput[] = []
  readonly imageInputs: ImageGenerationInput[] = []
  readonly videoInputs: VideoGenerationInput[] = []

  constructor(private readonly media: MemoryMedia) {}

  async generateText(input: TextGenerationInput) {
    this.textInputs.push(structuredClone(input))
    return {
      text: JSON.stringify([
        { shotNumber: 1, durationSeconds: 8, seedancePrompt: 'A bounded shot' },
      ]),
      model: 'memory-text',
    }
  }

  async generateImage(input: ImageGenerationInput) {
    this.imageInputs.push(structuredClone(input))
    const id = 'model:keyframe'
    this.media.bodies.set(id, {
      contentType: 'image/png',
      bytes: new Uint8Array([1, 2, 3, 4]),
    })
    return {
      assets: [{
        id,
        type: 'image' as const,
        url: 'https://model.invalid/private-keyframe.png',
        contentType: 'image/png',
        sizeBytes: 4,
      }],
      model: 'memory-image',
    }
  }

  async generateVideo(input: VideoGenerationInput) {
    this.videoInputs.push(structuredClone(input))
    const id = `model:video-${this.videoInputs.length}`
    this.media.bodies.set(id, {
      contentType: 'video/mp4',
      bytes: new Uint8Array([5, 6, 7, 8]),
    })
    return {
      assets: [{
        id,
        type: 'video' as const,
        url: 'https://model.invalid/private-video.mp4',
        contentType: 'video/mp4',
        sizeBytes: 4,
      }],
      model: 'memory-video',
    }
  }
}

function createContext() {
  const files = new MemoryFiles({
    'blueprint.json': json(blueprint),
    'project.json': json({
      id: '游戏一',
      platform: 'wb-game-video',
      entry: { blueprint: 'blueprint.json', components: 'dist/components' },
    }),
    'assets/manifest.json': json({ version: 2, assets: [] }),
    'characters/hero/manifest.json': json({
      charId: 'hero',
      name: 'Hero',
      portrait: { front: 'portrait/front.png' },
    }),
    'characters/hero/portrait/front.png': new Uint8Array([10, 11, 12]),
    'textures/index.json': json([{
      assetName: 'Courtyard',
      assetType: 'scene',
      sha256: 'abc123',
      file: 'blobs/abc123.png',
      mimeType: 'image/png',
    }]),
    'textures/blobs/abc123.png': new Uint8Array([20, 21, 22]),
  })
  const media = new MemoryMedia()
  const models = new MemoryModels(media)
  const context: WorkbenchExtensionContext = {
    gameId: '游戏一',
    gameRoot: '/host/injected/game-root',
    files,
    media,
    models,
  }
  return { context, files, media, models }
}

afterEach(() => {
  vi.restoreAllMocks()
  if (originalForgeaxServerPort === undefined) {
    delete process.env.FORGEAX_SERVER_PORT
  } else {
    process.env.FORGEAX_SERVER_PORT = originalForgeaxServerPort
  }
})

describe('createWbGameVideoService', () => {
  test('preserves logical namespaces while redacting locator-shaped public text', () => {
    const logicalIdentifiers = [
      'scene:opening',
      'entity:boss',
      'camera:close-up',
      'base:battleHpBar',
      'urn:forgeax:component:qte',
    ]
    const locators = [
      'https://host.invalid/secret',
      's3://bucket/private',
      'custom+provider://secret/item',
      'file:/private/secret',
      'javascript:alert(1)',
      'data:text/html,unsafe',
      '/private/secret',
      '\\\\server\\share\\secret',
      'C:\\secret\\file.png',
    ]

    expect(logicalIdentifiers.map(sanitizePublicText)).toEqual(logicalIdentifiers)
    expect(locators.map(sanitizePublicText)).toEqual([
      '[redacted]',
      '[redacted]',
      '[redacted]',
      '[redacted]',
      '[redacted]',
      '[redacted]',
      '[redacted]',
      '[redacted]',
      '[redacted]',
    ])
  })

  test('graph reads and writes only host-bounded game files', async () => {
    const { context, files } = createContext()
    const cwd = vi.spyOn(process, 'cwd').mockImplementation(() => {
      throw new Error('process.cwd must not be called')
    })
    const service = createWbGameVideoService(context)

    // Tool calls pass {}, while internal read-only callers may omit the
    // argument; both are the same published empty object input.
    expect(await service.getGraph()).toMatchObject({
      project: { version: 'wb-game-video.graph.v1' },
      gameSlug: '游戏一',
    })
    expect(await service.saveGraph({ project: blueprint, title: 'ignored' })).toEqual({
      ok: true,
      versions: [],
      gameSlug: '游戏一',
    })
    expect(JSON.parse(decoder.decode(files.entries.get('blueprint.json')))).toMatchObject({
      version: 'wb-game-video.graph.v1',
    })
    expect(cwd).not.toHaveBeenCalled()
  })

  test('keeps an authoritative blueprint readable when project metadata is corrupt', async () => {
    const { context, files } = createContext()
    files.entries.set('project.json', encoder.encode('{broken'))
    const service = createWbGameVideoService(context)

    expect(await service.getGraph({})).toMatchObject({
      project: { version: 'wb-game-video.graph.v1' },
      gameSlug: '游戏一',
    })
  })

  test('imports character and scene references through bounded files and media ids', async () => {
    const { context, media } = createContext()
    const service = createWbGameVideoService(context)

    const characters = await service.importCharacterRefs({}) as {
      refs: Array<Record<string, unknown>>
    }
    const scenes = await service.importSceneRefs({}) as {
      refs: Array<Record<string, unknown>>
    }

    expect(characters).toMatchObject({
      refs: [{
        id: 'a-charref-hero',
        productionType: 'character_ref',
        url: 'https://media.invalid/游戏一:media-1',
        meta: {
          hostMedia: {
            provenance: 'workbench-media-capability',
            assetId: '游戏一:media-1',
            locator: 'https://media.invalid/游戏一:media-1',
          },
        },
      }],
    })
    expect(scenes).toMatchObject({
      refs: [{
        id: 'a-sceneref-abc123',
        productionType: 'scene_ref',
        url: 'https://media.invalid/游戏一:media-2',
        meta: {
          hostMedia: {
            provenance: 'workbench-media-capability',
            assetId: '游戏一:media-2',
            locator: 'https://media.invalid/游戏一:media-2',
          },
        },
      }],
    })
    expect(characters.refs[0]).not.toHaveProperty('provider')
    expect(scenes.refs[0]).not.toHaveProperty('provider')
    expect(JSON.stringify([characters, scenes])).not.toMatch(
      /(?:\/host\/|\/Users\/|file:\/\/|model\.invalid)/,
    )
    expect(media.puts.map((put) => put.filename)).toEqual([
      'character-hero.png',
      'scene-abc123.png',
    ])
    expect((context.files as MemoryFiles).calls).toContain('list:characters')
  })

  test('continues character and scene batches after malformed records', async () => {
    const { context, files, media } = createContext()
    files.entries.set('characters/bad/manifest.json', json({
      charId: 'bad',
      name: 'Bad',
      portrait: { front: '../private.png' },
    }))
    files.entries.set('textures/index.json', json([
      {
        assetName: 'Bad scene',
        assetType: 'scene',
        sha256: 'bad',
        file: '../private.png',
        mimeType: 'image/png',
      },
      {
        assetName: 'Courtyard',
        assetType: 'scene',
        sha256: 'abc123',
        file: 'blobs/abc123.png',
        mimeType: 'image/png',
      },
    ]))
    const service = createWbGameVideoService(context)

    const characters = await service.importCharacterRefs({}) as {
      refs: Array<{ id: string }>
    }
    const scenes = await service.importSceneRefs({}) as {
      refs: Array<{ id: string }>
    }

    expect(characters.refs.map((asset) => asset.id)).toEqual([
      'a-charref-hero',
    ])
    expect(scenes.refs.map((asset) => asset.id)).toEqual([
      'a-sceneref-abc123',
    ])
    expect(media.puts).toHaveLength(2)
  })

  test('serializes manifest mutations across separate host contexts for one game', async () => {
    const { context, files } = createContext()
    const secondFiles = new MemoryFiles({}, files.entries)
    const secondContext: WorkbenchExtensionContext = {
      ...context,
      files: secondFiles,
    }
    const registry = createHostAssetRegistry(context)
    const secondRegistry = createHostAssetRegistry(secondContext)
    const asset = (id: string) => ({
      id,
      kind: 'image' as const,
      productionType: 'shot_image' as const,
      status: 'ready' as const,
      sourceModule: 'wb-game-video',
      createdAt: 1,
      updatedAt: 1,
    })

    await Promise.all([
      registry.upsert(asset('concurrent-a')),
      secondRegistry.upsert(asset('concurrent-b')),
    ])

    expect((await registry.list()).map((entry) => entry.id).sort()).toEqual([
      'concurrent-a',
      'concurrent-b',
    ])
    expect(files).not.toBe(secondFiles)
  })

  test('continues the shared manifest mutation queue after a rejected operation', async () => {
    const { context, files } = createContext()
    files.entries.set('assets/manifest.json', json({
      version: 2,
      assets: [{
        id: 'foreign',
        kind: 'image',
        productionType: 'shot_image',
        provider: { kind: 'remote', ref: 'secret' },
        sourceModule: 'another-domain',
        status: 'ready',
        createdAt: 1,
        updatedAt: 1,
      }],
    }))
    const secondContext: WorkbenchExtensionContext = {
      ...context,
      files: new MemoryFiles({}, files.entries),
    }
    const first = createHostAssetRegistry(context)
    const second = createHostAssetRegistry(secondContext)
    const asset = (id: string) => ({
      id,
      kind: 'image' as const,
      productionType: 'shot_image' as const,
      status: 'ready' as const,
      sourceModule: 'wb-game-video',
      createdAt: 1,
      updatedAt: 1,
    })

    await expect(first.upsert(asset('foreign'))).rejects.toThrow(
      'owned by another asset domain',
    )
    await expect(second.upsert(asset('after-rejection'))).resolves.toMatchObject({
      id: 'after-rejection',
    })
  })

  test('deeply sanitizes legacy manifest records while preserving trusted host media locators', async () => {
    const { context, files, media } = createContext()
    files.entries.set('assets/manifest.json', json({
      version: 2,
      assets: [{
        id: 'legacy',
        kind: 'image',
        productionType: 'shot_image',
        status: 'ready',
        file: 'media/legacy.png',
        externalPath: '/private/legacy.png',
        url: 'https://model.invalid/legacy.png',
        provider: { kind: 'remote', ref: 'https://provider.invalid/secret' },
        label: 'Legacy /home/test/label [/opt/secret] \\\\server\\share C:\\secret s3://bucket/key',
        prompt: 'use https://model.invalid/prompt and /Users/test/prompt.txt',
        error: 'failed at file:///private/error.log and /etc/passwd (/root/.ssh/key)',
        sourceUrl: 'https://source.invalid/top-level',
        legacyDetails: {
          providerUrl: 'https://provider.invalid/top-level-nested',
        },
        sourceModule: 'wb-game-video',
        meta: {
          sourceUrl: 'https://source.invalid/private',
          nested: {
            path: '/Users/test/secret.png',
            safe: 'kept',
            deeper: { providerUrl: 'https://provider.invalid/deeper' },
          },
          values: [
            'safe-value',
            'scene:opening',
            'entity:boss',
            'camera:close-up',
            'file:///private/secret',
            '/Users/test/secret',
            'https://model.invalid/private',
            '/home/test/secret',
            '/var/lib/private',
            '\\\\server\\share\\secret',
            'C:\\secret\\file.png',
            's3://bucket/private',
            'custom+provider://secret/item',
            {
              sourceUrl: 'https://provider.invalid/array-item',
              nestedSafe: 'kept-in-array',
            },
          ],
        },
        createdAt: 1,
        updatedAt: 1,
      }],
    }))
    const manifest = JSON.parse(
      decoder.decode(files.entries.get('assets/manifest.json')),
    ) as { assets: unknown[]; version: 2 }
    manifest.assets.push({
      id: 'forged-host-media',
      kind: 'image',
      productionType: 'shot_image',
      status: 'ready',
      url: 'javascript:alert(1)',
      provider: { kind: 'local', ref: 'forged-provider-id' },
      sourceModule: 'wb-game-video',
      meta: {
        hostMedia: {
          provenance: 'workbench-media-capability',
          assetId: 'forged-provider-id',
          locator: 'javascript:alert(1)',
        },
      },
      createdAt: 1,
      updatedAt: 1,
    })
    media.assets.set('unsafe-host-id', {
      id: 'unsafe-host-id',
      type: 'image',
      url: 'data:text/html,unsafe',
      contentType: 'image/png',
    })
    manifest.assets.push({
      id: 'unsafe-host-media',
      kind: 'image',
      productionType: 'shot_image',
      status: 'ready',
      url: 'data:text/html,unsafe',
      provider: { kind: 'local', ref: 'unsafe-host-id' },
      sourceModule: 'wb-game-video',
      meta: {
        hostMedia: {
          provenance: 'workbench-media-capability',
          assetId: 'unsafe-host-id',
          locator: 'data:text/html,unsafe',
        },
      },
      createdAt: 1,
      updatedAt: 1,
    })
    media.assets.set('real-model-provider-id', {
      id: 'real-model-provider-id',
      type: 'image',
      url: 'https://media.invalid/real-provider-item.png',
      contentType: 'image/png',
    })
    manifest.assets.push({
      id: 'forged-model-provider',
      kind: 'image',
      productionType: 'shot_image',
      status: 'ready',
      url: 's3://forged-provider/real-provider-item.png',
      provider: { kind: 'local', ref: 'real-model-provider-id' },
      sourceModule: 'wb-game-video',
      meta: {
        hostMedia: {
          provenance: 'workbench-media-capability',
          assetId: 'real-model-provider-id',
          locator: 's3://forged-provider/real-provider-item.png',
        },
      },
      createdAt: 1,
      updatedAt: 1,
    })
    files.entries.set('assets/manifest.json', json(manifest))
    const service = createWbGameVideoService(context)

    const listed = await service.listAssets({}) as {
      assets: Array<Record<string, unknown>>
    }
    const fetched = await service.getAsset('legacy')
    const serialized = JSON.stringify([listed, fetched])

    expect(serialized).not.toMatch(
      /(?:externalPath|sourceUrl|providerUrl|file:\/\/|\/private\/|\/Users\/|model\.invalid|provider\.invalid|source\.invalid)/,
    )
    expect(serialized).not.toMatch(
      /javascript:|data:text|forged-provider-id|unsafe-host-id|s3:\/\/|custom\+provider:|\/home\/|\/etc\/|\/opt\/|\/root\/|\/var\/|\\\\server\\|C:\\/,
    )
    expect(listed.assets.find((asset) => asset.id === 'legacy')).toMatchObject({
      id: 'legacy',
      meta: {
        nested: { safe: 'kept' },
        values: [
          'safe-value',
          'scene:opening',
          'entity:boss',
          'camera:close-up',
          { nestedSafe: 'kept-in-array' },
        ],
      },
    })
    expect(
      listed.assets.find((asset) => asset.id === 'forged-host-media'),
    ).not.toHaveProperty('url')
    expect(
      listed.assets.find((asset) => asset.id === 'forged-host-media'),
    ).not.toHaveProperty('meta.hostMedia')
    expect(fetched).toMatchObject({
      asset: { id: 'legacy', meta: { nested: { safe: 'kept' } } },
    })
  })

  test('attests every legacy provider kind by game-scoped media membership before model calls', async () => {
    const { context, files, media, models } = createContext()
    const providerRefs = (['local', 's3', 'cos', 'kino'] as const)
      .map((kind) => ({
        kind,
        registryId: `trusted-${kind}-ref`,
        mediaId: `metadata-free-${kind}-media`,
      }))
    for (const ref of providerRefs) {
      media.assets.set(ref.mediaId, {
        id: ref.mediaId,
        type: 'image',
        url: `memory://游戏一/${ref.mediaId}`,
        contentType: 'image/png',
      })
    }
    files.entries.set('assets/manifest.json', json({
      version: 2,
      assets: [
        ...providerRefs.map((ref) => ({
          id: ref.registryId,
          kind: 'image',
          productionType: 'character_ref',
          status: 'ready',
          url: `memory://游戏一/${ref.mediaId}`,
          provider: { kind: ref.kind, ref: ref.mediaId },
          sourceModule: 'wb-character',
          ...(ref.kind === 'local'
            ? {
              meta: {
                hostMedia: {
                  provenance: 'workbench-media-capability',
                  assetId: ref.mediaId,
                  locator: `memory://游戏一/${ref.mediaId}`,
                },
              },
            }
            : {}),
          createdAt: 1,
          updatedAt: 1,
        })),
        {
          id: 'forged-ref',
          kind: 'image',
          productionType: 'scene_ref',
          status: 'ready',
          provider: { kind: 'kino', ref: 'foreign-provider-id' },
          sourceModule: 'wb-scene',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }))
    const service = createWbGameVideoService(context)

    expect(await service.getAsset('trusted-local-ref')).toMatchObject({
      asset: {
        id: 'trusted-local-ref',
        url: 'memory://游戏一/metadata-free-local-media',
      },
    })
    const trusted = await service.generateKeyframe({
      sceneNodeId: 'node-1',
      nodeName: 'Opening',
      beat: 'Hero enters',
      refAssetIds: providerRefs.map((ref) => ref.registryId),
    })
    const callsAfterTrusted = models.imageInputs.length
    const forged = await service.generateKeyframe({
      sceneNodeId: 'node-2',
      nodeName: 'Forged',
      beat: 'Must not call model',
      refAssetIds: ['forged-ref'],
    })
    const forgedVideo = await service.generateVideo({
      sceneNodeId: 'node-3',
      nodeName: 'Forged video',
      characterRefIds: ['trusted-local-ref'],
      sceneRefIds: ['forged-ref'],
    })

    expect(trusted).toMatchObject({ asset: { status: 'ready' } })
    expect(models.imageInputs[0]?.references).toEqual(
      providerRefs.map((ref) => ({ assetId: ref.mediaId })),
    )
    expect(forged).toMatchObject({
      asset: null,
      error: expect.any(String),
    })
    expect(forgedVideo).toMatchObject({
      asset: null,
      error: expect.any(String),
    })
    expect(models.imageInputs).toHaveLength(callsAfterTrusted)
    expect(models.videoInputs).toHaveLength(0)
  })

  test('keyframe and video generation use model and media capabilities without environment URLs', async () => {
    const { context, media, models } = createContext()
    const cwd = vi.spyOn(process, 'cwd').mockImplementation(() => {
      throw new Error('process.cwd must not be called')
    })
    process.env.FORGEAX_SERVER_PORT = 'poison-port-must-not-be-read'
    const service = createWbGameVideoService(context)
    const { refs: characterRefs } = await service.importCharacterRefs({}) as {
      refs: Array<{ id: string }>
    }
    const { refs: sceneRefs } = await service.importSceneRefs({}) as {
      refs: Array<{ id: string }>
    }

    const keyframe = await service.generateKeyframe({
      sceneNodeId: 'node-1',
      nodeName: 'Opening',
      beat: 'Hero enters',
      refAssetIds: [characterRefs[0]!.id, sceneRefs[0]!.id],
    })
    const video = await service.generateVideo({
      sceneNodeId: 'node-1',
      nodeName: 'Opening',
      seedancePrompt: 'Hero enters',
      durationSeconds: 8,
      characterRefIds: [characterRefs[0]!.id],
      sceneRefIds: [sceneRefs[0]!.id],
    })
    const shotScript = await service.generateShotScript({
      nodeName: 'Opening',
      storyText: 'Hero enters',
      durationSeconds: 8,
    })
    const nodeVideo = await service.generateNodeVideo({
      sceneNodeId: 'node-1',
      nodeName: 'Opening',
      seedancePrompt: 'Hero enters',
      durationSeconds: 16,
      characterRefIds: [characterRefs[0]!.id],
      sceneRefIds: [sceneRefs[0]!.id],
    })
    const assets = await service.listAssets({ kind: 'video' }) as {
      assets: Array<{ id: string }>
    }
    const firstVideo = assets.assets[0]
    expect(firstVideo).toBeDefined()
    expect(await service.getAsset(firstVideo!.id)).toMatchObject({
      asset: { id: firstVideo!.id },
    })

    expect(models.imageInputs[0]?.references).toEqual([
      { assetId: '游戏一:media-1' },
      { assetId: '游戏一:media-2' },
    ])
    expect(models.videoInputs[0]?.references).toEqual([
      { assetId: '游戏一:media-1' },
      { assetId: '游戏一:media-2' },
    ])
    expect(models.videoInputs).toHaveLength(3)
    expect(media.puts).toHaveLength(6)
    expect(keyframe).toMatchObject({
      asset: { kind: 'image', productionType: 'shot_image', status: 'ready' },
    })
    expect(video).toMatchObject({
      asset: {
        kind: 'video',
        productionType: 'video_clip',
        status: 'ready',
        url: expect.stringMatching(/^https:\/\/media\.invalid\//),
      },
    })
    expect(shotScript).toMatchObject({
      shots: [{ seedancePrompt: 'A bounded shot' }],
    })
    expect(nodeVideo).toMatchObject({
      assets: [
        { productionType: 'video_clip', status: 'ready' },
        { productionType: 'video_clip', status: 'ready' },
      ],
    })
    expect(cwd).not.toHaveBeenCalled()
    expect(JSON.stringify([
      keyframe,
      video,
      nodeVideo,
      models.textInputs,
      models.imageInputs,
      models.videoInputs,
    ]))
      .not.toMatch(/18900|FORGEAX_SERVER_PORT|model\.invalid|\/host\/|\bkino\b/i)
  })

  test('publishes one stable keyframe id from generating through ready', async () => {
    const { context, media, models } = createContext()
    const generation = deferred<
      Awaited<ReturnType<MemoryModels['generateImage']>>
    >()
    models.generateImage = async (input) => {
      models.imageInputs.push(structuredClone(input))
      return generation.promise
    }
    const service = createWbGameVideoService(context)
    const pending = service.generateKeyframe({
      sceneNodeId: 'node-1',
      nodeName: 'Opening',
      beat: 'Hero enters',
    })
    await waitUntil(() => models.imageInputs.length === 1)

    const during = await service.listAssets({ kind: 'image' }) as {
      assets: Array<{ id: string; status: string; createdAt: number }>
    }
    const generating = during.assets.find((asset) => asset.status === 'generating')
    expect(generating).toBeDefined()

    media.bodies.set('model:delayed-keyframe', {
      contentType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
    })
    generation.resolve({
      assets: [{
        id: 'model:delayed-keyframe',
        type: 'image',
        url: 'https://model.invalid/secret-keyframe.png',
        contentType: 'image/png',
        sizeBytes: 3,
      }],
      model: 'delayed-image',
    })

    const completed = await pending as {
      asset: { id: string; status: string; url: string; createdAt: number }
    }
    expect(completed.asset).toMatchObject({
      id: generating!.id,
      status: 'ready',
      url: expect.stringMatching(/^https:\/\/media\.invalid\//),
    })
    expect(completed.asset.createdAt).toBe(generating!.createdAt)
  })

  test('publishes one stable video id from generating through ready', async () => {
    const { context, media, models } = createContext()
    const service = createWbGameVideoService(context)
    const { refs: characterRefs } = await service.importCharacterRefs({}) as {
      refs: Array<{ id: string }>
    }
    const { refs: sceneRefs } = await service.importSceneRefs({}) as {
      refs: Array<{ id: string }>
    }
    const generation = deferred<
      Awaited<ReturnType<MemoryModels['generateVideo']>>
    >()
    models.generateVideo = async (input) => {
      models.videoInputs.push(structuredClone(input))
      return generation.promise
    }
    const pending = service.generateVideo({
      sceneNodeId: 'node-1',
      nodeName: 'Opening',
      durationSeconds: 8,
      characterRefIds: [characterRefs[0]!.id],
      sceneRefIds: [sceneRefs[0]!.id],
    })
    await waitUntil(() => models.videoInputs.length === 1)

    const during = await service.listAssets({ kind: 'video' }) as {
      assets: Array<{ id: string; status: string; createdAt: number }>
    }
    const generating = during.assets.find((asset) => asset.status === 'generating')
    expect(generating).toBeDefined()

    media.bodies.set('model:delayed-video', {
      contentType: 'video/mp4',
      bytes: new Uint8Array([5, 6, 7]),
    })
    generation.resolve({
      assets: [{
        id: 'model:delayed-video',
        type: 'video',
        url: 'https://model.invalid/secret-video.mp4',
        contentType: 'video/mp4',
        sizeBytes: 3,
      }],
      model: 'delayed-video',
    })

    const completed = await pending as {
      asset: { id: string; status: string; createdAt: number }
    }
    expect(completed.asset).toMatchObject({
      id: generating!.id,
      status: 'ready',
    })
    expect(completed.asset.createdAt).toBe(generating!.createdAt)
  })

  test('keeps completed node segments and exposes a sanitized failed segment', async () => {
    const { context, media, models } = createContext()
    const service = createWbGameVideoService(context)
    const { refs: characterRefs } = await service.importCharacterRefs({}) as {
      refs: Array<{ id: string }>
    }
    const { refs: sceneRefs } = await service.importSceneRefs({}) as {
      refs: Array<{ id: string }>
    }
    let call = 0
    models.generateVideo = async (input) => {
      models.videoInputs.push(structuredClone(input))
      call++
      if (call === 2) {
        throw new Error(
          'provider failed at https://model.invalid/task using /Users/test/secret',
        )
      }
      const id = 'model:first-segment'
      media.bodies.set(id, {
        contentType: 'video/mp4',
        bytes: new Uint8Array([5, 6, 7]),
      })
      return {
        assets: [{
          id,
          type: 'video',
          url: 'https://model.invalid/first.mp4',
          contentType: 'video/mp4',
          sizeBytes: 3,
        }],
        model: 'segmented-video',
      }
    }

    const result = await service.generateNodeVideo({
      sceneNodeId: 'node-1',
      nodeName: 'Opening',
      durationSeconds: 16,
      characterRefIds: [characterRefs[0]!.id],
      sceneRefIds: [sceneRefs[0]!.id],
    }) as {
      assets: Array<{ id: string; status: string; error?: string }>
      error?: string
    }
    const listed = await service.listAssets({ kind: 'video' }) as {
      assets: Array<{ id: string; status: string; error?: string }>
    }

    expect(result.assets.map((asset) => asset.status)).toEqual([
      'ready',
      'failed',
    ])
    expect(result.assets.map((asset) => asset.id)).toEqual(
      listed.assets.map((asset) => asset.id),
    )
    expect(result.error).toBeUndefined()
    expect(listed.assets.map((asset) => asset.status).sort()).toEqual([
      'failed',
      'ready',
    ])
    expect(JSON.stringify([result, listed])).not.toMatch(
      /(?:model\.invalid|\/Users\/|file:\/\/)/,
    )
  })

  test('rejects invalid published-schema inputs before any model call', async () => {
    const { context, models } = createContext()
    const service = createWbGameVideoService(context)

    await expect(service.generateShotScript({
      nodeName: 'Opening',
      storyText: 'Hero enters',
      interactive: 'yes',
    })).rejects.toThrow()
    await expect(service.generateKeyframe({
      sceneNodeId: 'node-1',
      nodeName: 'Opening',
      beat: 'Hero enters',
      styleAxes: { artMedia: 'ink', sourceUrl: 'https://secret.invalid' },
    })).rejects.toThrow()
    await expect(service.generateVideo({
      sceneNodeId: 'node-1',
      nodeName: 'Opening',
      characterRefIds: ['character'],
      sceneRefIds: ['scene'],
      generateAudio: 'yes',
    })).rejects.toThrow()
    await expect(service.generateNodeVideo({
      sceneNodeId: 'node-1',
      nodeName: 'Opening',
      characterRefIds: ['character'],
      sceneRefIds: ['scene'],
      durationSeconds: 121,
    })).rejects.toThrow()

    expect(models.textInputs).toHaveLength(0)
    expect(models.imageInputs).toHaveLength(0)
    expect(models.videoInputs).toHaveLength(0)
  })

  test('applies published schemas to graph, asset, and intake operations', async () => {
    const { context } = createContext()
    const service = createWbGameVideoService(context)

    await expect(service.getGraph({
      cwd: '/private/secret',
    })).rejects.toThrow('additional properties')
    await expect(service.saveGraph({
      project: blueprint,
      extra: true,
    })).rejects.toThrow('additional properties')
    await expect(service.listAssets({ kind: 'audio' })).rejects.toThrow(
      'allowed values',
    )
    expect(getAssetIdFromArgs({
      id: 'asset-1',
      gameSlug: '游戏一',
    }, context.gameId)).toBe('asset-1')
    expect(() => getAssetIdFromArgs({
      id: 'asset-1',
      gameSlug: 'another-game',
    }, context.gameId)).toThrow('does not match')
    expect(() => getAssetIdFromArgs({
      id: 'asset-1',
      extra: true,
    }, context.gameId)).toThrow('additional properties')
    await expect(service.getAsset('asset-1')).resolves.toEqual({ asset: null })
    await expect(service.importCharacterRefs({
      characterIds: ['hero'],
    })).rejects.toThrow('additional properties')
    await expect(service.importSceneRefs({
      files: ['scene.png'],
    })).rejects.toThrow('additional properties')
  })

  test('rejects absolute or traversing reference selectors before file access', async () => {
    const { context, files } = createContext()
    const service = createWbGameVideoService(context)
    const callsBefore = files.calls.length

    await expect(
      service.importCharacterRefs({ characterIds: ['/tmp/secret'] }),
    ).rejects.toThrow('additional properties')
    await expect(
      service.importSceneRefs({ files: ['../secret.png'] }),
    ).rejects.toThrow('additional properties')
    expect(files.calls).toHaveLength(callsBefore)
  })
})
