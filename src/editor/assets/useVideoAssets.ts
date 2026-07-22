import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createKinoVideoClient,
  KinoClientError,
  type KinoResourceDTO,
  type KinoVideoClient,
} from './kino-api'
import {
  completePreparedVideoUpload,
  uploadVideoResource,
  VideoUploadError,
  type PreparedVideoUpload,
} from './video-upload'

export const DEFAULT_VIDEO_PAGE_SIZE = 20

export interface VideoAssetListItem {
  id: string
  label: string
  url: string
  durMs?: number
  type?: string
  updatedAt?: number
}

export interface VideoAssetsController {
  loading: boolean
  error: string | null
  items: VideoAssetListItem[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  uploadProgress: number | null
  uploadError: string | null
  canRetryComplete: boolean
  uploading: boolean
  mutating: boolean
  refresh: () => Promise<void>
  loadPage: (page: number) => Promise<void>
  loadMore: () => Promise<void>
  upload: (file: File) => Promise<KinoResourceDTO | undefined>
  retryComplete: () => Promise<KinoResourceDTO | undefined>
  rename: (resourceId: string, name: string) => Promise<void>
  deleteResource: (resourceId: string) => Promise<void>
}

export interface UseVideoAssetsOptions {
  client?: KinoVideoClient
  initialPage?: number
  pageSize?: number
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof KinoClientError || error instanceof VideoUploadError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Unexpected error'
}

function toListItem(dto: KinoResourceDTO, client: KinoVideoClient): VideoAssetListItem {
  return {
    id: dto.resource_id,
    label: dto.name?.trim() || dto.resource_id,
    url: client.playbackUrl(dto.resource_id, dto.game_id),
    durMs: dto.source_meta?.duration_ms,
    type: dto.type,
    updatedAt: dto.updated_at,
  }
}

function mergeUniqueItems(
  existing: VideoAssetListItem[],
  incoming: VideoAssetListItem[],
): VideoAssetListItem[] {
  const byId = new Map(existing.map((item) => [item.id, item]))
  for (const item of incoming) {
    byId.set(item.id, item)
  }
  return [...byId.values()]
}

export function useVideoAssets(
  gameId: string,
  options: UseVideoAssetsOptions = {},
): VideoAssetsController {
  const pageSize = options.pageSize ?? DEFAULT_VIDEO_PAGE_SIZE
  const initialPage = options.initialPage ?? 1
  const client = useMemo(
    () => options.client ?? createKinoVideoClient(),
    [options.client],
  )

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<VideoAssetListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(initialPage)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [retryPrepared, setRetryPrepared] = useState<PreparedVideoUpload | null>(null)
  const [uploading, setUploading] = useState(false)
  const [mutating, setMutating] = useState(false)

  const listGeneration = useRef(0)
  const uploadGeneration = useRef(0)
  const crudGeneration = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    abortRef.current = new AbortController()
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  const fetchPage = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      const generation = ++listGeneration.current
      setLoading(true)
      setError(null)
      try {
        const result = await client.list({
          game_id: gameId,
          media_type: 'video',
          page: targetPage,
          page_size: pageSize,
        }, { signal: abortRef.current?.signal })
        if (!mountedRef.current || generation !== listGeneration.current) {
          return
        }
        const mapped = result.items.map((dto) => toListItem(dto, client))
        setItems((prev) => (
          mode === 'append'
            ? mergeUniqueItems(prev, mapped)
            : mergeUniqueItems([], mapped)
        ))
        setTotal(result.total)
        setPage(result.page)
      } catch (err) {
        if (!mountedRef.current || generation !== listGeneration.current) {
          return
        }
        setError(safeErrorMessage(err))
      } finally {
        if (mountedRef.current && generation === listGeneration.current) {
          setLoading(false)
        }
      }
    },
    [client, gameId, pageSize],
  )

  const refresh = useCallback(async () => {
    await fetchPage(1, 'replace')
  }, [fetchPage])

  const loadPage = useCallback(
    async (targetPage: number) => {
      await fetchPage(targetPage, 'replace')
    },
    [fetchPage],
  )

  const loadMore = useCallback(async () => {
    if (items.length >= total) {
      return
    }
    await fetchPage(page + 1, 'append')
  }, [fetchPage, items.length, page, total])

  useEffect(() => {
    void fetchPage(initialPage, 'replace')
  }, [fetchPage, gameId, initialPage])

  const upload = useCallback(
    async (file: File): Promise<KinoResourceDTO | undefined> => {
      const generation = ++uploadGeneration.current
      setUploading(true)
      setUploadError(null)
      setUploadProgress(0)
      setRetryPrepared(null)
      try {
        const resource = await uploadVideoResource({
          client,
          gameId,
          file,
          onProgress: (value) => {
            if (mountedRef.current && generation === uploadGeneration.current) {
              setUploadProgress(value)
            }
          },
          signal: abortRef.current?.signal,
        })
        if (!mountedRef.current || generation !== uploadGeneration.current) {
          return undefined
        }
        await refresh()
        return resource
      } catch (err) {
        if (!mountedRef.current || generation !== uploadGeneration.current) {
          return undefined
        }
        setUploadError(safeErrorMessage(err))
        if (err instanceof VideoUploadError && err.retryState) {
          setRetryPrepared(err.retryState)
        }
        return undefined
      } finally {
        if (mountedRef.current && generation === uploadGeneration.current) {
          setUploading(false)
          setUploadProgress(null)
        }
      }
    },
    [client, gameId, refresh],
  )

  const retryComplete = useCallback(async (): Promise<KinoResourceDTO | undefined> => {
    if (!retryPrepared) {
      return undefined
    }
    const generation = ++uploadGeneration.current
    setUploading(true)
    setUploadError(null)
    setUploadProgress(99)
    try {
      const resource = await completePreparedVideoUpload({
        client,
        prepared: retryPrepared,
        onProgress: (value) => {
          if (mountedRef.current && generation === uploadGeneration.current) {
            setUploadProgress(value)
          }
        },
        signal: abortRef.current?.signal,
      })
      if (!mountedRef.current || generation !== uploadGeneration.current) {
        return undefined
      }
      setRetryPrepared(null)
      await refresh()
      return resource
    } catch (err) {
      if (!mountedRef.current || generation !== uploadGeneration.current) {
        return undefined
      }
      setUploadError(safeErrorMessage(err))
      if (err instanceof VideoUploadError && err.retryState) {
        setRetryPrepared(err.retryState)
      }
      return undefined
    } finally {
      if (mountedRef.current && generation === uploadGeneration.current) {
        setUploading(false)
        setUploadProgress(null)
      }
    }
  }, [client, refresh, retryPrepared])

  const rename = useCallback(
    async (resourceId: string, name: string) => {
      const generation = ++crudGeneration.current
      setMutating(true)
      setError(null)
      try {
        const current = await client.get(resourceId, gameId, {
          signal: abortRef.current?.signal,
        })
        if (!mountedRef.current || generation !== crudGeneration.current) {
          return
        }
        const updated = await client.update(resourceId, {
          resource_id: resourceId,
          game_id: gameId,
          media_type: current.media_type,
          url: current.url,
          name: name.trim() || resourceId,
          type: current.type,
          remark: current.remark,
          source: current.source,
          source_meta: current.source_meta,
        }, {
          signal: abortRef.current?.signal,
        })
        if (!mountedRef.current || generation !== crudGeneration.current) {
          return
        }
        const next = toListItem(updated, client)
        setItems((currentItems) =>
          currentItems.map((item) => (item.id === resourceId ? next : item)))
        void refresh()
      } catch (err) {
        if (!mountedRef.current || generation !== crudGeneration.current) {
          return
        }
        setError(safeErrorMessage(err))
        throw err
      } finally {
        if (mountedRef.current && generation === crudGeneration.current) {
          setMutating(false)
        }
      }
    },
    [client, gameId, refresh],
  )

  const deleteResource = useCallback(
    async (resourceId: string) => {
      const generation = ++crudGeneration.current
      setMutating(true)
      setError(null)
      try {
        await client.delete(resourceId, gameId, {
          signal: abortRef.current?.signal,
        })
        if (!mountedRef.current || generation !== crudGeneration.current) {
          return
        }
        setItems((currentItems) =>
          currentItems.filter((item) => item.id !== resourceId))
        setTotal((currentTotal) => Math.max(0, currentTotal - 1))
        void refresh()
      } catch (err) {
        if (!mountedRef.current || generation !== crudGeneration.current) {
          return
        }
        setError(safeErrorMessage(err))
        throw err
      } finally {
        if (mountedRef.current && generation === crudGeneration.current) {
          setMutating(false)
        }
      }
    },
    [client, gameId, refresh],
  )

  const hasMore = items.length < total

  return {
    loading,
    error,
    items,
    total,
    page,
    pageSize,
    hasMore,
    uploadProgress,
    uploadError,
    canRetryComplete: retryPrepared != null,
    uploading,
    mutating,
    refresh,
    loadPage,
    loadMore,
    upload,
    retryComplete,
    rename,
    deleteResource,
  }
}
