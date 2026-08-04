/**
 * Compatibility-shaped UI model backed exclusively by the Host media client.
 *
 * The file name and DTO aliases remain while screens migrate, but no Kino
 * endpoint, extension route, or wb-game-video-owned media lifecycle remains.
 */
import { getWorkbenchHost } from '../../lib/workbench-host'
import {
  createHostMediaClient,
  type HostMediaAsset,
  type HostMediaClient,
  type HostMediaType,
} from './host-media-client'

export type KinoMediaType = HostMediaType | 'font'
export type KinoProviderKind = 'local' | 's3' | 'cos' | 'kino'
export type KinoUploadMime =
  | 'video/mp4'
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif'
  | 'audio/mpeg'
  | 'audio/wav'
  | 'audio/ogg'
  | 'audio/mp4'
  | 'audio/aac'
  | 'font/woff2'
  | 'font/woff'
  | 'font/ttf'
  | 'font/otf'
export interface KinoProviderCapabilities { provider: KinoProviderKind; media_types: KinoMediaType[]; upload_mimes: KinoUploadMime[] }
export type KinoResourceType = 'KEYFRAME' | 'SHOT_VIDEO' | 'CHARACTER_IMAGE' | 'CHARACTER_TURNAROUND' | 'LOCATION_IMAGE' | 'PROJECT_COVER_IMAGE' | 'UPLOAD' | 'OTHER' | 'GENERATION'
export interface KinoResourceSourceMeta { task_id?: string; prompt?: string; model?: string; seed?: number; width?: number; height?: number; duration_ms?: number; mime_type?: string; extra?: Record<string, unknown> }
export interface KinoResourceDTO { resource_id: string; game_id: string; media_type: KinoMediaType; name?: string; type?: KinoResourceType; url: string; remark?: string; source?: string; source_meta?: KinoResourceSourceMeta; created_at: number; updated_at: number }
export interface KinoResourcePage { items: KinoResourceDTO[]; total: number; page: number; page_size: number }
export interface DirectUploadInstruction { method: 'PUT'; url: string; headers: Record<string, string>; expires_at: string; chunk_size: number; chunk_count: number }
export interface DirectUploadResponse { upload: DirectUploadInstruction; object_url: string; upload_token: string }
export interface PrepareUploadInput { game_id: string; file_name?: string; mime_type: string; bytes: number; extension?: string; client_resource_id?: string; replace_existing?: boolean }
export interface CreateKinoResourceInput { game_id: string; media_type: KinoMediaType; url: string; name?: string; type?: KinoResourceType; remark?: string; source?: string; source_meta?: KinoResourceSourceMeta }
export interface UpdateKinoResourceInput extends CreateKinoResourceInput { resource_id: string }
export interface BatchCreateKinoResourcesInput { game_id: string; resources: Array<Omit<CreateKinoResourceInput, 'game_id'>> }
export interface BatchCreateKinoResourcesResult { created_count: number; skipped_count: number; items: KinoResourceDTO[] }
export interface ListKinoResourcesQuery { game_id: string; media_type?: KinoMediaType; page?: number; page_size?: number; type?: KinoResourceType }
export interface KinoRequestOptions { signal?: AbortSignal }
export class KinoClientError extends Error { constructor(message: string, readonly status: number, readonly errorCode?: string) { super(message); this.name = 'KinoClientError' } }
export const MAX_KINO_RESOURCE_PAGE_SIZE = 100
/** Host media SSOT only accepts these three kinds; font stays advertised for local/dev providers. */
const HOST_CAPABILITIES: KinoProviderCapabilities = {
  provider: 'kino',
  media_types: ['video', 'image', 'audio'],
  upload_mimes: [
    'video/mp4',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac',
  ],
}

export interface KinoVideoClient {
  capabilities(options?: KinoRequestOptions): Promise<KinoProviderCapabilities>
  prepareUpload(input: PrepareUploadInput, options?: KinoRequestOptions): Promise<DirectUploadResponse>
  list(query: ListKinoResourcesQuery, options?: KinoRequestOptions): Promise<KinoResourcePage>
  get(resourceId: string, gameId: string, options?: KinoRequestOptions): Promise<KinoResourceDTO>
  create(input: CreateKinoResourceInput, options?: KinoRequestOptions): Promise<KinoResourceDTO>
  batch(input: BatchCreateKinoResourcesInput, options?: KinoRequestOptions): Promise<BatchCreateKinoResourcesResult>
  update(resourceId: string, input: UpdateKinoResourceInput, options?: KinoRequestOptions): Promise<KinoResourceDTO>
  delete(resourceId: string, gameId: string, options?: KinoRequestOptions): Promise<void>
  playbackUrl(resourceId: string, gameId: string): string
}
export interface CreateKinoVideoClientOptions { media?: HostMediaClient }

type UploadReceipt = { readonly gameId: string; readonly replacementId?: string }
const hostMediaType = (type: KinoMediaType): HostMediaType => {
  if (type === 'font') throw new KinoClientError('Host media does not support font assets', 400, 'media_type_invalid')
  return type
}
function metadata(asset: HostMediaAsset): Record<string, unknown> { return asset.metadata ?? {} }
function dto(asset: HostMediaAsset, gameId: string): KinoResourceDTO {
  const value = metadata(asset)
  return { resource_id: asset.id, game_id: gameId, media_type: asset.type, name: asset.filename, url: asset.url, type: typeof value.type === 'string' ? value.type as KinoResourceType : undefined, remark: typeof value.remark === 'string' ? value.remark : undefined, source: typeof value.source === 'string' ? value.source : undefined, source_meta: value.source_meta && typeof value.source_meta === 'object' ? value.source_meta as KinoResourceSourceMeta : undefined, created_at: typeof value.created_at === 'number' ? value.created_at : 0, updated_at: typeof value.updated_at === 'number' ? value.updated_at : 0 }
}
function uploadId(value: string): string { const matched = /^workbench-host-upload:([^/]+)$/.exec(value); if (!matched) throw new KinoClientError('Upload was not prepared by the Host media client', 400, 'upload_invalid'); return matched[1]! }

/** Creates a transitional DTO client over the published Host HTTP media contract. */
export function createKinoVideoClient(options: CreateKinoVideoClientOptions = {}): KinoVideoClient {
  const media = options.media ?? createHostMediaClient({ ready: async () => getWorkbenchHost().ready() })
  const uploads = new Map<string, UploadReceipt>()
  return {
    async capabilities() {
      return HOST_CAPABILITIES
    },
    async prepareUpload(input, request) {
      const filename = input.file_name?.trim()
      if (!filename) throw new KinoClientError('Upload filename is required', 400, 'media_input_invalid')
      const upload = await media.createUpload({ filename, contentType: input.mime_type, sizeBytes: input.bytes, metadata: { created_at: Date.now() } }, request?.signal)
      uploads.set(upload.id, { gameId: input.game_id, replacementId: input.replace_existing ? input.client_resource_id : undefined })
      const chunkSize = 512 * 1024
      return { upload: { method: 'PUT', url: await media.uploadUrl(upload.id), headers: { 'content-type': 'application/octet-stream' }, expires_at: '', chunk_size: chunkSize, chunk_count: Math.ceil(input.bytes / chunkSize) }, object_url: `workbench-host-upload:${upload.id}`, upload_token: upload.id }
    },
    async list(query, request) {
      const assets = await media.list(query.media_type ? hostMediaType(query.media_type) : undefined, request?.signal)
      const mapped = assets.map((asset) => dto(asset, query.game_id)).filter((item) => !query.type || item.type === query.type)
      const pageSize = Math.min(query.page_size ?? MAX_KINO_RESOURCE_PAGE_SIZE, MAX_KINO_RESOURCE_PAGE_SIZE)
      const page = query.page ?? 1
      return { items: mapped.slice((page - 1) * pageSize, page * pageSize), total: mapped.length, page, page_size: pageSize }
    },
    async get(resourceId, gameId, request) {
      const item = (await media.list(undefined, request?.signal)).find((asset) => asset.id === resourceId)
      if (!item) throw new KinoClientError('Media asset was not found', 404, 'media_not_found')
      return dto(item, gameId)
    },
    async create(input, request) {
      const id = uploadId(input.url); const receipt = uploads.get(id)
      if (!receipt) throw new KinoClientError('Upload session was not found', 404, 'upload_not_found')
      const asset = await media.completeUpload(id, request?.signal)
      const renamed = await media.update(asset.id, { filename: input.name ?? asset.filename, metadata: { ...(asset.metadata ?? {}), type: input.type, remark: input.remark, source: input.source, source_meta: input.source_meta, updated_at: Date.now() } }, request?.signal)
      if (receipt.replacementId) await media.delete(receipt.replacementId, request?.signal)
      uploads.delete(id)
      return dto(renamed, input.game_id)
    },
    async batch(input, request) {
      const seen = new Set<string>(); const items: KinoResourceDTO[] = []
      for (const item of input.resources) { if (seen.has(item.url)) continue; seen.add(item.url); items.push(await this.create({ ...item, game_id: input.game_id }, request)) }
      return { created_count: items.length, skipped_count: input.resources.length - items.length, items }
    },
    async update(resourceId, input, request) { return dto(await media.update(resourceId, { filename: input.name, metadata: { type: input.type, remark: input.remark, source: input.source, source_meta: input.source_meta, updated_at: Date.now() } }, request?.signal), input.game_id) },
    async delete(resourceId, _gameId, request) { if (!await media.delete(resourceId, request?.signal)) throw new KinoClientError('Media asset was not found', 404, 'media_not_found') },
    playbackUrl(resourceId) { const context = getWorkbenchHost().context; if (!context) return ''; const endpoint = context.endpoints.gamePackage.replace(/\/package(?:[?#].*)?$/, '/media'); return `${endpoint}/${encodeURIComponent(resourceId)}` },
  }
}
