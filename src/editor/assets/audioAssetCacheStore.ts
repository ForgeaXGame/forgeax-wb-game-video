import { useCallback, useEffect } from 'react'
import type { KinoResourceDTO } from './kino-api'
import { createKinoAssetLibraryClient, type ManagedAsset } from './assetLibraryClient'
import { EMPTY_ASSET_CACHE_ENTRY, useProjectAssetCache } from './projectAssetCacheStore'

export interface AudioAssets {
  items: KinoResourceDTO[]
  total: number
  loading: boolean
  error: string | null
  generation: number
  refresh: () => Promise<void>
}

export function useAudioAssets(gameId: string, enabled = true): AudioAssets {
  const entry = useProjectAssetCache((state) => state.byGame[gameId]?.audio ?? EMPTY_ASSET_CACHE_ENTRY)
  const ensure = useProjectAssetCache((state) => state.ensure)
  const refreshCache = useProjectAssetCache((state) => state.refresh)

  useEffect(() => {
    if (!enabled) return
    void ensure(gameId, 'audio', kinoAssetLibraryClient)
  }, [enabled, ensure, gameId])

  const refresh = useCallback(() => refreshCache(gameId, 'audio', kinoAssetLibraryClient), [gameId, refreshCache])
  return {
    items: entry.items.map((asset) => toKinoResource(asset, gameId)),
    total: entry.items.length,
    loading: entry.loading,
    error: entry.error,
    generation: entry.generation,
    refresh,
  }
}

function toKinoResource(asset: ManagedAsset, gameId: string): KinoResourceDTO {
  return {
    resource_id: asset.id,
    game_id: gameId,
    media_type: 'audio',
    name: asset.name,
    url: asset.url ?? '',
    source: asset.source,
    source_meta: {
      mime_type: asset.mime,
      extra: asset.bytes === undefined ? undefined : { bytes: asset.bytes },
    },
    created_at: asset.updatedAt ?? 0,
    updated_at: asset.updatedAt ?? 0,
  }
}

const kinoAssetLibraryClient = createKinoAssetLibraryClient()
