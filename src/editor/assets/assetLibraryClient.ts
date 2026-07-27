import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_KINO_RESOURCE_PAGE_SIZE,
  createKinoVideoClient,
  type KinoResourceDTO,
  type KinoVideoClient,
} from './kino-api'
import { createDefaultXhrUploadTransport, type UploadTransport } from './video-upload'

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

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const AUDIO_MIME_TYPES = new Set(['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac'])
const MAX_ASSET_UPLOAD_BYTES = 100 * 1024 * 1024
const MAX_ASSET_LIBRARY_PAGES = 100

export class AssetLibraryUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssetLibraryUploadError'
  }
}

export interface CreateKinoAssetLibraryClientOptions {
  client?: KinoVideoClient
  transport?: UploadTransport
}

function mimeTypesFor(kind: ManagedAssetKind): Set<string> {
  return kind === 'image' ? IMAGE_MIME_TYPES : AUDIO_MIME_TYPES
}

function assertUploadFile(kind: ManagedAssetKind, file: File): void {
  if (!file.name.trim()) {
    throw new AssetLibraryUploadError('请选择一个具有文件名的文件')
  }
  if (!mimeTypesFor(kind).has(file.type)) {
    const supported = kind === 'image'
      ? 'PNG、JPEG、WebP 或 GIF 图片'
      : 'MP3、WAV、OGG、M4A/MP4 或 AAC 音频'
    throw new AssetLibraryUploadError(`不支持的${kind === 'image' ? '图片' : '音频'}格式；仅支持${supported}`)
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_ASSET_UPLOAD_BYTES) {
    throw new AssetLibraryUploadError('文件大小必须在 100 MB 以内')
  }
}

function extension(fileName: string): string | undefined {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName)
  return match?.[1]?.toLowerCase()
}

function displayName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName
}

function bytes(resource: KinoResourceDTO): number | undefined {
  const value = resource.source_meta?.extra?.bytes
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function toManagedAsset(
  resource: KinoResourceDTO,
  kind: ManagedAssetKind,
  client: KinoVideoClient,
): ManagedAsset {
  return {
    id: resource.resource_id,
    kind,
    name: resource.name || resource.resource_id,
    url: client.playbackUrl(resource.resource_id, resource.game_id),
    mime: resource.source_meta?.mime_type,
    bytes: bytes(resource),
    updatedAt: resource.updated_at,
    source: resource.source,
  }
}

/**
 * Production adapter for assets in Kino's provider-backed resource API.
 * Resources are always previewed through its authenticated content endpoint.
 */
export function createKinoAssetLibraryClient(
  options: CreateKinoAssetLibraryClientOptions = {},
): AssetLibraryClient {
  const client = options.client ?? createKinoVideoClient()
  const transport = options.transport ?? createDefaultXhrUploadTransport()

  return {
    async list(gameId, kind, requestOptions) {
      const resources = new Map<string, ManagedAsset>()
      for (let page = 1; page <= MAX_ASSET_LIBRARY_PAGES; page += 1) {
        const response = await client.list({
          game_id: gameId,
          media_type: kind,
          page,
          page_size: MAX_KINO_RESOURCE_PAGE_SIZE,
        }, requestOptions)
        for (const resource of response.items) {
          resources.set(resource.resource_id, toManagedAsset(resource, kind, client))
        }
        if (response.items.length === 0 || resources.size >= response.total) break
      }
      return [...resources.values()]
    },

    async upload(gameId, kind, file, requestOptions) {
      assertUploadFile(kind, file)
      const prepared = await client.prepareUpload({
        game_id: gameId,
        file_name: file.name,
        mime_type: file.type as Parameters<KinoVideoClient['prepareUpload']>[0]['mime_type'],
        bytes: file.size,
        extension: extension(file.name),
      }, requestOptions)
      await transport.put(file, prepared.upload, undefined, requestOptions?.signal)
      const resource = await client.create({
        game_id: gameId,
        media_type: kind,
        url: prepared.object_url,
        name: displayName(file.name),
        type: 'UPLOAD',
        source: 'wb-game-video',
        source_meta: {
          mime_type: file.type,
          extra: { bytes: file.size },
        },
      }, requestOptions)
      return toManagedAsset(resource, kind, client)
    },

    async rename(gameId, id, name, requestOptions) {
      const resource = await client.get(id, gameId, requestOptions)
      const updated = await client.update(id, {
        resource_id: id,
        game_id: gameId,
        media_type: resource.media_type,
        url: resource.url,
        name,
        type: resource.type,
        remark: resource.remark,
        source: resource.source,
        source_meta: resource.source_meta,
      }, requestOptions)
      if (updated.media_type !== 'image' && updated.media_type !== 'audio') {
        throw new AssetLibraryUploadError('只能重命名图片或音频资产')
      }
      return toManagedAsset(updated, updated.media_type, client)
    },

    async remove(gameId, id, requestOptions) {
      await client.delete(id, gameId, requestOptions)
    },
  }
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
