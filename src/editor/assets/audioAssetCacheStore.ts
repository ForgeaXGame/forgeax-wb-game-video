/**
 * 音频资产（BGM 候选的料）查询 —— 与 `kinoVideoCacheStore`（「视频」字段那条路）同款结构：
 * 按 game 分桶的共享缓存 + 显式 hydration，缓存里存**原始 `MediaAsset`**。
 *
 * 存原始资产而不是拼好的下拉候选：展示形状（`名字 (id)` 这类中文 label）是壳层的事，而未来的
 * 音频素材库 UI 要的 `status` / `url` / `durationMs` 一旦在写入时被映射掉就再也拿不回来 ——
 * 视频侧同理（缓存存 `KinoResourceDTO`，`GraphStudio` 才把它拼成下拉项）。
 *
 * 为什么是共享缓存而不是每个表面一个 useEffect：
 *  1. **`refresh()` 得是全局的**。音频上传链路（未来）落一条 audio 资产后调它，所有挂着该 game
 *     的表面立刻看到新曲子；每表面各存一份 state 的话，refresh 只救得了发起上传的那个表面。
 *  2. 跨视图存活：蓝图页与配置页互斥渲染（见 GraphApp），切来切去不必重打端点。
 *  3. 与视频侧同构，读代码的人只需持有一套心智。
 */
import { useCallback, useEffect } from 'react'
import { create } from 'zustand'
import { fetchRegistryAssets } from './registry-assets'
import type { MediaAsset } from './registry-types'

export interface AudioAssetCacheEntry {
  assets: MediaAsset[]
  loading: boolean
  /** 非 null = 这次查询失败了（≠「库里没有音频」）；壳层据此报警并收回「库是空的」那句话。 */
  error: string | null
  generation: number
}

export interface AudioAssets extends AudioAssetCacheEntry {
  /** 重新拉一遍（未来「音频上传成功」后的回灌口）。 */
  refresh: () => Promise<void>
}

interface AudioAssetCacheStore {
  byGame: Record<string, AudioAssetCacheEntry | undefined>
  refresh: (gameId: string) => Promise<void>
  ensure: (gameId: string) => Promise<void>
}

const EMPTY: AudioAssetCacheEntry = { assets: [], loading: false, error: null, generation: 0 }

function message(error: unknown): string {
  return error instanceof Error ? error.message : '无法加载音频素材'
}

export const useAudioAssetCache = create<AudioAssetCacheStore>((set, get) => ({
  byGame: {},

  async refresh(gameId) {
    const current = get().byGame[gameId] ?? EMPTY
    const generation = current.generation + 1
    set((state) => ({
      byGame: { ...state.byGame, [gameId]: { ...current, loading: true, error: null, generation } },
    }))
    try {
      const assets = await fetchRegistryAssets(gameId, 'audio')
      // 后来者优先：慢应答回来时若已开了更新一轮查询，丢弃本次结果（别把新资产盖回旧的）。
      if ((get().byGame[gameId]?.generation ?? 0) !== generation) return
      set((state) => ({
        byGame: { ...state.byGame, [gameId]: { assets, loading: false, error: null, generation } },
      }))
    } catch (error) {
      if ((get().byGame[gameId]?.generation ?? 0) !== generation) return
      set((state) => ({
        byGame: {
          ...state.byGame,
          // 失败保留上一轮资产：一次网络抖动不该把作者正在用的候选清光。
          [gameId]: { ...(state.byGame[gameId] ?? EMPTY), loading: false, error: message(error), generation },
        },
      }))
    }
  },

  async ensure(gameId) {
    if (get().byGame[gameId]) return
    await get().refresh(gameId)
  },
}))

/**
 * 项目级音频资产消费者：自己负责首次 hydration，表面只读状态。
 * `enabled=false` = 本表面没有音乐字段，别打端点（也别认领缓存里别处留下的东西，见 GraphConfigView）。
 */
export function useAudioAssets(gameId: string, enabled = true): AudioAssets {
  const entry = useAudioAssetCache((state) => state.byGame[gameId])
  const ensure = useAudioAssetCache((state) => state.ensure)
  const refreshCache = useAudioAssetCache((state) => state.refresh)

  useEffect(() => {
    if (!enabled) return
    void ensure(gameId)
  }, [enabled, ensure, gameId])

  const refresh = useCallback(() => refreshCache(gameId), [gameId, refreshCache])
  return { ...(entry ?? EMPTY), refresh }
}
