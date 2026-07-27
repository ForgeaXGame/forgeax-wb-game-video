import { useCallback, useEffect, useRef, useState } from 'react'

export type ManagedAssetKind = 'image' | 'audio'

export interface ManagedAsset {
  id: string
  kind: ManagedAssetKind
  name: string
  url?: string
  mime?: string
  bytes?: number
  updatedAt?: number
  source?: string
}

export interface AssetLibraryClient {
  list(gameId: string, kind: ManagedAssetKind, options?: { signal?: AbortSignal }): Promise<ManagedAsset[]>
  upload(gameId: string, kind: ManagedAssetKind, file: File, options?: { signal?: AbortSignal }): Promise<ManagedAsset>
  rename(gameId: string, id: string, name: string, options?: { signal?: AbortSignal }): Promise<ManagedAsset>
  remove(gameId: string, id: string, options?: { signal?: AbortSignal }): Promise<void>
}

export interface AssetLibraryController {
  available: boolean
  loading: boolean
  error: string | null
  uploading: ManagedAssetKind | null
  mutating: boolean
  items: ManagedAsset[]
  refresh(): Promise<void>
  upload(kind: ManagedAssetKind, file: File): Promise<ManagedAsset | undefined>
  rename(id: string, name: string): Promise<ManagedAsset | undefined>
  remove(id: string): Promise<void>
}

const UNAVAILABLE_MESSAGE = '图片与 BGM 资源 API 尚未启用'

function message(error: unknown): string {
  return error instanceof Error ? error.message : '资产操作失败'
}

export function useAssetLibrary(gameId: string, client?: AssetLibraryClient): AssetLibraryController {
  const [items, setItems] = useState<ManagedAsset[]>([])
  const [loading, setLoading] = useState(Boolean(client))
  const [error, setError] = useState<string | null>(client ? null : UNAVAILABLE_MESSAGE)
  const [uploading, setUploading] = useState<ManagedAssetKind | null>(null)
  const [mutating, setMutating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (!client) {
      setItems([])
      setLoading(false)
      setError(UNAVAILABLE_MESSAGE)
      return
    }
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    setLoading(true)
    setError(null)
    try {
      const results = await Promise.all([
        client.list(gameId, 'image', { signal: abort.signal }),
        client.list(gameId, 'audio', { signal: abort.signal }),
      ])
      if (!abort.signal.aborted) setItems(results.flat())
    } catch (cause) {
      if (!abort.signal.aborted) setError(message(cause))
    } finally {
      if (!abort.signal.aborted) setLoading(false)
    }
  }, [client, gameId])

  useEffect(() => {
    void refresh()
    return () => abortRef.current?.abort()
  }, [refresh])

  const upload = useCallback(async (kind: ManagedAssetKind, file: File) => {
    if (!client) {
      setError(UNAVAILABLE_MESSAGE)
      return undefined
    }
    setUploading(kind)
    setError(null)
    try {
      const asset = await client.upload(gameId, kind, file)
      setItems((current) => [asset, ...current.filter((item) => item.id !== asset.id)])
      return asset
    } catch (cause) {
      setError(message(cause))
      return undefined
    } finally {
      setUploading(null)
    }
  }, [client, gameId])

  const rename = useCallback(async (id: string, name: string) => {
    if (!client) {
      setError(UNAVAILABLE_MESSAGE)
      return undefined
    }
    const nextName = name.trim()
    if (!nextName) return undefined
    setMutating(true)
    setError(null)
    try {
      const asset = await client.rename(gameId, id, nextName)
      setItems((current) => current.map((item) => item.id === id ? asset : item))
      return asset
    } catch (cause) {
      setError(message(cause))
      return undefined
    } finally {
      setMutating(false)
    }
  }, [client, gameId])

  const remove = useCallback(async (id: string) => {
    if (!client) {
      setError(UNAVAILABLE_MESSAGE)
      return
    }
    setMutating(true)
    setError(null)
    try {
      await client.remove(gameId, id)
      setItems((current) => current.filter((item) => item.id !== id))
    } catch (cause) {
      setError(message(cause))
      throw cause
    } finally {
      setMutating(false)
    }
  }, [client, gameId])

  return { available: Boolean(client), loading, error, uploading, mutating, items, refresh, upload, rename, remove }
}
