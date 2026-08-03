import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const gatewayMocks = vi.hoisted(() => ({
  genVideoAndWait: vi.fn(),
}))

vi.mock('./gateway-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./gateway-client')>()),
  genVideoAndWait: gatewayMocks.genVideoAndWait,
}))

import { listAssets, upsertAsset, writeMediaFile } from '../asset-registry'
import { buildSeedanceVideoPrompt } from '../engine'
import { generateNodeVideo, type OrchestrateCtx } from './orchestrate'

const roots: string[] = []

function makeAssetsDir(): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'wb-game-video-continuity-'))
  roots.push(dir)
  return dir
}

function addImageRef(
  dir: string,
  id: string,
  productionType: 'character_ref' | 'scene_ref',
): void {
  const file = writeMediaFile(dir, id, 'png', Uint8Array.from([1, 2, 3]))
  upsertAsset(dir, {
    id,
    kind: 'image',
    productionType,
    status: 'ready',
    label: id,
    file,
    mime: 'image/png',
    createdAt: 1,
    updatedAt: 1,
  })
}

beforeEach(() => {
  gatewayMocks.genVideoAndWait.mockReset()
  gatewayMocks.genVideoAndWait.mockImplementation(async () => ({
    bytes: Uint8Array.from([0, 0, 0, 1]),
    mime: 'video/mp4',
    sourceUrl: '/__ce-api__/video-file/generated',
    taskId: 'task-generated',
  }))
})

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('multi-segment video tail-frame continuity', () => {
  test('extracts every completed segment tail and binds it as the next first_frame', async () => {
    const dir = makeAssetsDir()
    addImageRef(dir, 'character-1', 'character_ref')
    addImageRef(dir, 'scene-1', 'scene_ref')
    let extracted = 0
    const tailFrameExtractor = vi.fn(async (videoPath: string) => {
      void videoPath
      return {
        bytes: Uint8Array.from([201 + extracted++]),
        mime: 'image/jpeg' as const,
      }
    })
    const ctx: OrchestrateCtx = { dir, gameId: 'demo', tailFrameExtractor }

    const videos = await generateNodeVideo(ctx, {
      sceneNodeId: 'node-1',
      nodeName: '追逐',
      storyText: '角色冲过走廊。',
      durationSeconds: 31,
      characterRefIds: ['character-1'],
      sceneRefIds: ['scene-1'],
    })

    expect(videos).toHaveLength(3)
    expect(tailFrameExtractor).toHaveBeenCalledTimes(2)
    expect(tailFrameExtractor.mock.calls[0]?.[0]).toContain(videos[0]!.id)
    expect(tailFrameExtractor.mock.calls[1]?.[0]).toContain(videos[1]!.id)

    const secondInput = gatewayMocks.genVideoAndWait.mock.calls[1]?.[1]
    const thirdInput = gatewayMocks.genVideoAndWait.mock.calls[2]?.[1]
    expect(secondInput.imageWithRoles[0]).toEqual({
      role: 'first_frame',
      url: 'data:image/jpeg;base64,yQ==',
    })
    expect(thirdInput.imageWithRoles[0]).toEqual({
      role: 'first_frame',
      url: 'data:image/jpeg;base64,yg==',
    })
    expect(secondInput.prompt).toContain('@图片1（上一段视频的真实尾帧）')
    expect(secondInput.prompt).not.toContain('@视频1')

    const tailFrames = listAssets(dir, { productionType: 'shot_image' })
      .filter((asset) => asset.meta?.keyframeRole === 'continuity_tail_frame')
    expect(tailFrames).toHaveLength(2)
    expect(tailFrames.map((asset) => asset.meta?.sourceVideoAssetId)).toEqual([
      videos[0]!.id,
      videos[1]!.id,
    ])
  })

  test('stops instead of generating a prompt-only continuation when tail extraction fails', async () => {
    const dir = makeAssetsDir()
    addImageRef(dir, 'character-1', 'character_ref')
    addImageRef(dir, 'scene-1', 'scene_ref')
    const ctx: OrchestrateCtx = {
      dir,
      gameId: 'demo',
      tailFrameExtractor: vi.fn(async () => {
        throw new Error('decoder unavailable')
      }),
    }

    await expect(generateNodeVideo(ctx, {
      sceneNodeId: 'node-1',
      nodeName: '追逐',
      durationSeconds: 20,
      characterRefIds: ['character-1'],
      sceneRefIds: ['scene-1'],
    })).rejects.toThrow('真实尾帧闭环失败：decoder unavailable')

    expect(gatewayMocks.genVideoAndWait).toHaveBeenCalledTimes(1)
    const failedTail = listAssets(dir, { productionType: 'shot_image' })
      .find((asset) => asset.meta?.keyframeRole === 'continuity_tail_frame')
    expect(failedTail).toMatchObject({ status: 'failed', error: 'decoder unavailable' })
  })

  test('rejects an extend prompt that has no real continuity input', () => {
    expect(() => buildSeedanceVideoPrompt({
      storyText: '继续前进',
      nodeName: '下一段',
      durationSeconds: 8,
      refs: [],
      extend: true,
    })).toThrow('缺少上一段视频或真实尾帧锚点')
  })
})
