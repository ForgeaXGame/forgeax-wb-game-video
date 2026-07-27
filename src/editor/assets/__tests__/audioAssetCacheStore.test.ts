/**
 * 音频资产缓存 —— 与 `kinoVideoCacheStore` 同款契约：
 *   1. 缓存里存**原始 `MediaAsset`**（展示形状由壳层派生），多个消费者共用一次拉取；
 *   2. 端点失败留 `error`，**不**退化成一个看着正常的空结果；
 *   3. `refresh()` 是未来「音频上传成功后回灌」的入口，且失败不清空手上已有的资产。
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioAssetCache, useAudioAssets } from '../audioAssetCacheStore'
import type { MediaAsset } from '../registry-types'

const fetchRegistryAssets = vi.hoisted(() => vi.fn())

vi.mock('../registry-assets', () => ({ fetchRegistryAssets }))

function asset(id: string, label?: string): MediaAsset {
  return {
    id,
    kind: 'audio',
    productionType: 'video_clip',
    status: 'ready',
    ...(label ? { label } : {}),
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('audioAssetCacheStore', () => {
  beforeEach(() => {
    useAudioAssetCache.setState({ byGame: {} })
    fetchRegistryAssets.mockReset()
  })

  // 存原始资产（而不是已经拼好中文 label 的候选）：未来的音频素材库 UI 要 status / url /
  // durationMs，展示形状在壳层派生 —— 与视频侧（缓存存 KinoResourceDTO）同分工。
  it('两个消费者共用一次拉取（ensure 去重），缓存里是原始 MediaAsset', async () => {
    fetchRegistryAssets.mockResolvedValue([asset('a-aud-1', '战斗床')])

    const first = renderHook(() => useAudioAssets('project-a'))
    const second = renderHook(() => useAudioAssets('project-a'))

    await waitFor(() => expect(first.result.current.assets).toHaveLength(1))
    expect(first.result.current.assets[0]).toEqual(asset('a-aud-1', '战斗床'))
    expect(second.result.current.assets).toEqual(first.result.current.assets)
    expect(fetchRegistryAssets).toHaveBeenCalledTimes(1)
    expect(fetchRegistryAssets).toHaveBeenCalledWith('project-a', 'audio')

    first.unmount()
    second.unmount()
  })

  it('只拉自己 game 的资产，别的项目桶不受影响', async () => {
    fetchRegistryAssets.mockResolvedValue([asset('a-aud-1')])

    const hook = renderHook(() => useAudioAssets('project-a'))
    await waitFor(() => expect(hook.result.current.assets).toHaveLength(1))

    expect(useAudioAssetCache.getState().byGame['project-b']).toBeUndefined()
    hook.unmount()
  })

  // 查不到与「库里真没音频」必须分得开：吞掉错误的话，离线的 studio 与健康的空库长得一模一样，
  // 面板会照着「候选为空」的分支告诉作者「素材库暂无音频资产」—— 那是句假话。
  it('端点失败留 error，而不是一个看着正常的空结果', async () => {
    fetchRegistryAssets.mockRejectedValue(new Error('HTTP 500'))

    const hook = renderHook(() => useAudioAssets('project-a'))

    await waitFor(() => expect(hook.result.current.error).toBe('HTTP 500'))
    expect(hook.result.current.assets).toEqual([])
    expect(hook.result.current.loading).toBe(false)
    hook.unmount()
  })

  // 上传链路（未来）落一条 audio 资产后就调这个，所有挂着该 game 的表面同时看到新曲子。
  it('refresh() 重新拉取并回灌所有消费者', async () => {
    fetchRegistryAssets.mockResolvedValue([])
    const first = renderHook(() => useAudioAssets('project-a'))
    const second = renderHook(() => useAudioAssets('project-a'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))

    fetchRegistryAssets.mockResolvedValue([asset('a-aud-new', '新上传')])
    await act(() => first.result.current.refresh())

    await waitFor(() => expect(second.result.current.assets).toHaveLength(1))
    expect(first.result.current.assets[0]?.id).toBe('a-aud-new')

    first.unmount()
    second.unmount()
  })

  it('refresh 成功后清掉上一次的 error（重试能把面板从失败态救回来）', async () => {
    fetchRegistryAssets.mockRejectedValueOnce(new Error('HTTP 500'))
    const hook = renderHook(() => useAudioAssets('project-a'))
    await waitFor(() => expect(hook.result.current.error).toBe('HTTP 500'))

    fetchRegistryAssets.mockResolvedValue([asset('a-aud-1')])
    await act(() => hook.result.current.refresh())

    await waitFor(() => expect(hook.result.current.error).toBeNull())
    expect(hook.result.current.assets).toHaveLength(1)
    hook.unmount()
  })

  // 刷新失败不该把作者正在用的候选清光（那等于让一次网络抖动清空整个选择器）。
  // 壳层据此把警告说成「候选可能不是最新的」而不是「候选不可用」——两句话的真假不同。
  it('刷新失败保留上一轮资产，只挂 error', async () => {
    fetchRegistryAssets.mockResolvedValue([asset('a-aud-1', '战斗床')])
    const hook = renderHook(() => useAudioAssets('project-a'))
    await waitFor(() => expect(hook.result.current.assets).toHaveLength(1))

    fetchRegistryAssets.mockRejectedValue(new Error('HTTP 503'))
    await act(() => hook.result.current.refresh())

    expect(hook.result.current.error).toBe('HTTP 503')
    expect(hook.result.current.assets.map((a) => a.id)).toEqual(['a-aud-1'])
    expect(hook.result.current.loading).toBe(false)
    hook.unmount()
  })

  // 后来者优先：并发两轮时慢的那轮回来得晚，不能把新结果盖回旧数据（generation 守卫）。
  it('迟到的应答不覆盖更新一轮的结果', async () => {
    let releaseSlow: (assets: MediaAsset[]) => void = () => {}
    const slow = new Promise<MediaAsset[]>((resolve) => { releaseSlow = resolve })
    fetchRegistryAssets.mockReturnValueOnce(slow)
    fetchRegistryAssets.mockResolvedValueOnce([asset('a-aud-new')])

    const cache = useAudioAssetCache.getState()
    const firstRound = cache.refresh('project-a')   // 慢
    await cache.refresh('project-a')                // 快，先落地
    expect(useAudioAssetCache.getState().byGame['project-a']?.assets.map((a) => a.id)).toEqual(['a-aud-new'])

    releaseSlow([asset('a-aud-stale')])
    await firstRound

    expect(useAudioAssetCache.getState().byGame['project-a']?.assets.map((a) => a.id)).toEqual(['a-aud-new'])
  })

  // 迟到的**失败**同样不能把新结果换成一条错误。
  it('迟到的失败不覆盖更新一轮的结果', async () => {
    let rejectSlow: (e: Error) => void = () => {}
    const slow = new Promise<MediaAsset[]>((_, reject) => { rejectSlow = reject })
    fetchRegistryAssets.mockReturnValueOnce(slow)
    fetchRegistryAssets.mockResolvedValueOnce([asset('a-aud-new')])

    const cache = useAudioAssetCache.getState()
    const firstRound = cache.refresh('project-a')
    await cache.refresh('project-a')

    rejectSlow(new Error('HTTP 500'))
    await firstRound

    const entry = useAudioAssetCache.getState().byGame['project-a']
    expect(entry?.error).toBeNull()
    expect(entry?.assets.map((a) => a.id)).toEqual(['a-aud-new'])
  })

  it('enabled=false 不拉（表面没有音乐字段就别打端点）', () => {
    renderHook(() => useAudioAssets('project-a', false))
    expect(fetchRegistryAssets).not.toHaveBeenCalled()
  })
})
