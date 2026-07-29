import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZHANDOU_VIDEOS } from '../../assets/catalog'
import { requestGenerateVideo, resolveMediaSrc } from '../media'

const client = {
  extension: { fetch: vi.fn() },
  tool: { call: vi.fn() },
}

vi.mock('../../../lib/workbench-host', () => ({
  getWorkbenchHost: () => client,
}))

afterEach(() => {
  client.extension.fetch.mockReset()
  client.tool.call.mockReset()
})

describe('resolveMediaSrc', () => {
  it('keeps bundled videos ahead of remote resolvers, including m- refs', () => {
    expect(resolveMediaSrc('idle01', 'demo')).toBe(ZHANDOU_VIDEOS.idle01)
    expect(resolveMediaSrc('m-idle01', 'demo')).toBe(ZHANDOU_VIDEOS.idle01)
  })

  it('routes generated a-vid resources through the registry playback endpoint', () => {
    expect(resolveMediaSrc('a-vid-generated', 'demo game')).toBe(
      '/__gva__/media/a-vid-generated?game=demo%20game',
    )
  })

  it('routes registry audio ids through the same media endpoint as video (BGM 决策 A)', () => {
    // Kino 只认视频；床轨 id 必须落回 assets/manifest 的 /__gva__/media/<id>，别按 kind 分叉。
    expect(resolveMediaSrc('a-aud-bgm-battle', 'demo game')).toBe(
      '/__gva__/media/a-aud-bgm-battle?game=demo%20game',
    )
  })

  it('routes stable Kino ids through the Kino content endpoint', () => {
    expect(resolveMediaSrc('res/123', 'demo game')).toBe(
      '/api/v1/kino/resources/res%2F123/content?game_id=demo%20game',
    )
  })

  it('delegates generation to the host tool instead of constructing an API request', async () => {
    client.tool.call.mockResolvedValue({ asset: { id: 'generated-1' } })

    await expect(requestGenerateVideo('query-game', {
      sceneNodeId: 'node-1',
      nodeName: 'Opening',
      characterRefIds: ['character-1'],
      sceneRefIds: ['scene-1'],
    })).resolves.toEqual({ asset: { id: 'generated-1' } })

    expect(client.tool.call).toHaveBeenCalledWith('wb-game-video:generate-video', expect.objectContaining({
      sceneNodeId: 'node-1',
    }))
    expect(client.extension.fetch).not.toHaveBeenCalled()
  })
})
