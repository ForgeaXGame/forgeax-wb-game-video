import { useCallback, useEffect } from 'react'
import { create } from 'zustand'
import {
  createKinoVideoClient,
  MAX_KINO_RESOURCE_PAGE_SIZE,
  type KinoResourceDTO,
  type KinoVideoClient,
} from './kino-api'

export interface KinoVideoCacheEntry {
  items: KinoResourceDTO[]
  total: number
  loading: boolean
  error: string | null
  generation: number
}

export interface KinoVideoResources extends KinoVideoCacheEntry {
  refresh: () => Promise<void>
}

interface KinoVideoCacheStore {
  byGame: Record<string, KinoVideoCacheEntry | undefined>
  refresh: (gameId: string, client?: KinoVideoClient) => Promise<void>
  ensure: (gameId: string, client?: KinoVideoClient) => Promise<void>
  upsert: (gameId: string, item: KinoResourceDTO) => void
  remove: (gameId: string, resourceId: string) => void
  watch: (gameId: string) => () => void
}

const EMPTY: KinoVideoCacheEntry = {
  items: [],
  total: 0,
  loading: false,
  error: null,
  generation: 0,
}

const eventSources = new Map<string, { source: EventSource; refs: number }>()
let defaultClient: KinoVideoClient | undefined

function clientOf(client?: KinoVideoClient): KinoVideoClient {
  defaultClient ??= createKinoVideoClient()
  return client ?? defaultClient
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load Kino videos'
}

export const useKinoVideoCache = create<KinoVideoCacheStore>((set, get) => ({
  byGame: {},

  async refresh(gameId, client) {
    const current = get().byGame[gameId] ?? EMPTY
    const generation = current.generation + 1
    set((state) => ({
      byGame: {
        ...state.byGame,
        [gameId]: { ...current, loading: true, error: null, generation },
      },
    }))
    try {
      const kino = clientOf(client)
      const items: KinoResourceDTO[] = []
      let total = 0
      for (let page = 1; page <= 100; page += 1) {
        const result = await kino.list({
          game_id: gameId,
          media_type: 'video',
          page,
          page_size: MAX_KINO_RESOURCE_PAGE_SIZE,
        })
        items.push(...result.items)
        total = result.total
        if (result.items.length === 0 || items.length >= total) break
      }
      if ((get().byGame[gameId]?.generation ?? 0) !== generation) return
      set((state) => ({
        byGame: {
          ...state.byGame,
          [gameId]: { items, total, loading: false, error: null, generation },
        },
      }))
    } catch (error) {
      if ((get().byGame[gameId]?.generation ?? 0) !== generation) return
      set((state) => ({
        byGame: {
          ...state.byGame,
          [gameId]: { ...state.byGame[gameId] ?? EMPTY, loading: false, error: message(error), generation },
        },
      }))
    }
  },

  async ensure(gameId, client) {
    if (get().byGame[gameId]) return
    await get().refresh(gameId, client)
  },

  upsert(gameId, item) {
    set((state) => {
      const cache = state.byGame[gameId] ?? EMPTY
      const existing = cache.items.findIndex((entry) => entry.resource_id === item.resource_id)
      const items = existing < 0
        ? [item, ...cache.items]
        : cache.items.map((entry, index) => index === existing ? item : entry)
      return {
        byGame: {
          ...state.byGame,
          [gameId]: { ...cache, items, total: existing < 0 ? cache.total + 1 : cache.total },
        },
      }
    })
  },

  remove(gameId, resourceId) {
    set((state) => {
      const cache = state.byGame[gameId] ?? EMPTY
      const items = cache.items.filter((item) => item.resource_id !== resourceId)
      return {
        byGame: {
          ...state.byGame,
          [gameId]: { ...cache, items, total: Math.min(cache.total, items.length) },
        },
      }
    })
  },

  watch(gameId) {
    if (typeof EventSource === 'undefined') return () => {}
    const existing = eventSources.get(gameId)
    if (existing) {
      existing.refs += 1
      return () => {
        if (--existing.refs === 0) {
          existing.source.close()
          eventSources.delete(gameId)
        }
      }
    }
    const source = new EventSource(`/api/v1/kino/resources/events?game_id=${encodeURIComponent(gameId)}`)
    source.addEventListener('video-resource', () => {
      void get().refresh(gameId)
    })
    eventSources.set(gameId, { source, refs: 1 })
    return () => {
      const active = eventSources.get(gameId)
      if (active && --active.refs === 0) {
        active.source.close()
        eventSources.delete(gameId)
      }
    }
  },
}))

/**
 * Project-scoped Kino resource consumer. It owns initial cache hydration and
 * the shared SSE subscription so editor surfaces only consume resource state.
 */
export function useKinoVideoResources(gameId: string, enabled = true): KinoVideoResources {
  const entry = useKinoVideoCache((state) => state.byGame[gameId])
  const ensure = useKinoVideoCache((state) => state.ensure)
  const watch = useKinoVideoCache((state) => state.watch)
  const refreshCache = useKinoVideoCache((state) => state.refresh)

  useEffect(() => {
    if (!enabled) return
    void ensure(gameId)
    return watch(gameId)
  }, [enabled, ensure, gameId, watch])

  const refresh = useCallback(() => refreshCache(gameId), [gameId, refreshCache])
  return { ...(entry ?? EMPTY), refresh }
}
