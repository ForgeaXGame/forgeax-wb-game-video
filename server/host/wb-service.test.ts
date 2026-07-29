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
import { createHostAssetRegistry } from '../asset-registry'
import blueprint from './fixtures/nodia.blueprint.json'
import { createWbGameVideoService } from './wb-service'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const originalForgeaxServerPort = process.env.FORGEAX_SERVER_PORT

function json(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value))
}

class MemoryFiles implements BoundedGameFiles {
  readonly entries = new Map<string, Uint8Array>()
  readonly calls: string[] = []

  constructor(entries: Record<string, Uint8Array> = {}) {
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
  readonly puts: MediaWriteInput[] = []
  #sequence = 0

  async list(_gameId: string, _query?: MediaQuery): Promise<HostMediaAsset[]> {
    return []
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
    return {
      id,
      type: input.contentType.startsWith('video/') ? 'video' : 'image',
      url: `https://media.invalid/${id}`,
      contentType: input.contentType,
      sizeBytes: input.bytes.byteLength,
    }
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
  test('graph reads and writes only host-bounded game files', async () => {
    const { context, files } = createContext()
    const cwd = vi.spyOn(process, 'cwd').mockImplementation(() => {
      throw new Error('process.cwd must not be called')
    })
    const service = createWbGameVideoService(context)

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

    expect(await service.getGraph()).toMatchObject({
      project: { version: 'wb-game-video.graph.v1' },
      gameSlug: '游戏一',
    })
  })

  test('imports character and scene references through bounded files and media ids', async () => {
    const { context, media } = createContext()
    const service = createWbGameVideoService(context)

    const characters = await service.importCharacterRefs({})
    const scenes = await service.importSceneRefs({})

    expect(characters).toMatchObject({
      refs: [{
        id: 'a-charref-hero',
        productionType: 'character_ref',
        provider: { ref: '游戏一:media-1' },
      }],
    })
    expect(scenes).toMatchObject({
      refs: [{
        id: 'a-sceneref-abc123',
        productionType: 'scene_ref',
        provider: { ref: '游戏一:media-2' },
      }],
    })
    expect(JSON.stringify([characters, scenes])).not.toMatch(
      /(?:\/host\/|\/Users\/|file:\/\/|model\.invalid)/,
    )
    expect(media.puts.map((put) => put.filename)).toEqual([
      'character-hero.png',
      'scene-abc123.png',
    ])
    expect((context.files as MemoryFiles).calls).toContain('list:characters')
  })

  test('serializes concurrent manifest mutations without losing assets', async () => {
    const { context } = createContext()
    const registry = createHostAssetRegistry(context)
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
      registry.upsert(asset('concurrent-b')),
    ])

    expect((await registry.list()).map((entry) => entry.id).sort()).toEqual([
      'concurrent-a',
      'concurrent-b',
    ])
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
      .not.toMatch(/18900|FORGEAX_SERVER_PORT|model\.invalid|\/host\//)
  })

  test('rejects absolute or traversing reference selectors before file access', async () => {
    const { context, files } = createContext()
    const service = createWbGameVideoService(context)
    const callsBefore = files.calls.length

    await expect(
      service.importCharacterRefs({ characterIds: ['/tmp/secret'] }),
    ).rejects.toThrow('unsupported path')
    await expect(
      service.importSceneRefs({ files: ['../secret.png'] }),
    ).rejects.toThrow('unsupported path')
    expect(files.calls).toHaveLength(callsBefore)
  })
})
