import { describe, expect, test, vi } from 'vitest'
import { createHostGenerationOrchestrator } from './orchestrate'
import type { HostAssetRegistry } from '../asset-registry'
import type { MediaAsset } from '../../src/editor/assets/registry-types'
import type { WorkbenchExtensionContext } from '@forgeax/workbench-host/node'

function createRegistry(): HostAssetRegistry {
  const generated: MediaAsset = {
    id: 'video-asset',
    kind: 'video',
    productionType: 'video_clip',
    status: 'ready',
    createdAt: 1,
    updatedAt: 1,
  }
  return {
    list: vi.fn(async () => []),
    get: vi.fn(async () => null),
    upsert: vi.fn(async (asset) => asset),
    update: vi.fn(async () => null),
    readMedia: vi.fn(async () => null),
    getStyleAxes: vi.fn(async () => undefined),
    setStyleAxes: vi.fn(async (axes) => axes),
    importGameFile: vi.fn(async () => generated),
    mediaReference: vi.fn(async (id) => ({ assetId: `host:${id}` })),
    persistGenerated: vi.fn(async () => generated),
  }
}

describe('host-backed generation references', () => {
  test('preserves dialogueLine and voiceover fields from generated shot scripts', async () => {
    const generateText = vi.fn(async () => ({
      text: JSON.stringify({
        shots: [{
          shotNumber: 2,
          durationSeconds: 3,
          seedancePrompt: '  slow push-in  ',
          dialogueLine: '  你来了。 ',
          voiceover: ' 旁白进入。 ',
        }],
      }),
    }))
    const context = { models: { generateText } } as unknown as WorkbenchExtensionContext
    const orchestrator = createHostGenerationOrchestrator(context, createRegistry())

    await expect(orchestrator.generateShotScript({
      nodeName: '开场',
      storyText: '主角走进房间',
      durationSeconds: 4,
    })).resolves.toEqual([{
      shotNumber: 2,
      durationSeconds: 3,
      seedancePrompt: 'slow push-in',
      dialogueLine: '你来了。',
      voiceover: '旁白进入。',
    }])
  })

  test('omits blank optional shot text while accepting direct shot arrays', async () => {
    const generateText = vi.fn(async () => ({
      text: JSON.stringify([{
        seedancePrompt: 'wide shot',
        dialogueLine: '   ',
        voiceover: null,
      }]),
    }))
    const context = { models: { generateText } } as unknown as WorkbenchExtensionContext
    const orchestrator = createHostGenerationOrchestrator(context, createRegistry())

    await expect(orchestrator.generateShotScript({
      nodeName: '空镜',
      storyText: '风吹过树林',
      durationSeconds: 5,
    })).resolves.toEqual([{
      shotNumber: 1,
      durationSeconds: 5,
      seedancePrompt: 'wide shot',
    }])
  })

  test('passes uploaded references through the host media contract', async () => {
    const registry = createRegistry()
    const generateVideo = vi.fn(async () => ({
      assets: [{
        id: 'generated-video',
        type: 'video' as const,
        contentType: 'video/mp4',
        url: 'memory://generated-video',
        sizeBytes: 3,
      }],
      model: 'test',
    }))
    const context = {
      models: { generateVideo },
    } as unknown as WorkbenchExtensionContext
    const orchestrator = createHostGenerationOrchestrator(context, registry)

    await expect(orchestrator.generateVideo({
      sceneNodeId: 'shot-1',
      nodeName: '开场',
      durationSeconds: 4,
      characterRefIds: ['character-1'],
      sceneRefIds: ['scene-1'],
    })).resolves.toEqual(expect.objectContaining({ id: 'video-asset' }))

    expect(registry.mediaReference).toHaveBeenNthCalledWith(1, 'character-1')
    expect(registry.mediaReference).toHaveBeenNthCalledWith(2, 'scene-1')
    expect(generateVideo).toHaveBeenCalledWith(expect.objectContaining({
      references: [
        { assetId: 'host:character-1' },
        { assetId: 'host:scene-1' },
      ],
      durationSeconds: 4,
    }))
  })

  test('fails before calling the host when references are missing', async () => {
    const registry = createRegistry()
    const generateVideo = vi.fn()
    const context = { models: { generateVideo } } as unknown as WorkbenchExtensionContext
    const orchestrator = createHostGenerationOrchestrator(context, registry)

    await expect(orchestrator.generateVideo({
      sceneNodeId: 'shot-1',
      nodeName: '开场',
      durationSeconds: 4,
      characterRefIds: [],
      sceneRefIds: ['scene-1'],
    })).rejects.toThrow('视频生成缺必传参考图')
    expect(generateVideo).not.toHaveBeenCalled()
  })
})
