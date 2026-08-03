/**
 * Browser boundary for the Host media API introduced by workbench-host 2878f36.
 *
 * The registry-pinned 0.2.0 package does not yet export the browser media
 * client. Keep this structural adapter isolated until that release is
 * available; it intentionally speaks only the documented Host HTTP contract
 * and never falls back to extension-owned media routes.
 */
export type HostMediaType = 'audio' | 'image' | 'video'

export interface HostMediaAsset {
  id: string
  filename?: string
  type: HostMediaType
  url: string
  contentType: string
  sizeBytes?: number
  metadata?: Record<string, unknown>
}

export interface HostMediaUpload {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
  offset: number
  state: 'uploading' | 'completed'
  metadata?: Record<string, unknown>
}

export interface HostMediaClient {
  list(type?: HostMediaType, signal?: AbortSignal): Promise<HostMediaAsset[]>
  contentUrl(assetId: string): Promise<string>
  uploadUrl(uploadId: string): Promise<string>
  update(assetId: string, input: { filename?: string, metadata?: Record<string, unknown> }, signal?: AbortSignal): Promise<HostMediaAsset>
  delete(assetId: string, signal?: AbortSignal): Promise<boolean>
  createUpload(input: { filename: string, contentType: string, sizeBytes: number, metadata?: Record<string, unknown>, idempotencyKey?: string }, signal?: AbortSignal): Promise<HostMediaUpload>
  getUpload(uploadId: string, signal?: AbortSignal): Promise<HostMediaUpload | null>
  writeUploadChunk(uploadId: string, offset: number, bytes: Uint8Array, signal?: AbortSignal): Promise<HostMediaUpload>
  completeUpload(uploadId: string, signal?: AbortSignal): Promise<HostMediaAsset>
}

export interface HandshakeMediaContext {
  readonly gameId: string
  readonly endpoints: { readonly gamePackage: string }
}

export interface CreateHostMediaClientOptions {
  readonly ready: () => Promise<HandshakeMediaContext>
  readonly fetch?: typeof globalThis.fetch
}

const syntheticOrigin = 'https://workbench.invalid'

function endpointForMedia(packageEndpoint: string): string {
  const relative = !/^[a-z][a-z\d+.-]*:/iu.test(packageEndpoint)
  const url = new URL(packageEndpoint, syntheticOrigin)
  if (!url.pathname.endsWith('/package')) {
    throw new TypeError('Handshake game package endpoint does not end in /package')
  }
  url.pathname = `${url.pathname.slice(0, -'/package'.length)}/media`
  url.search = ''
  url.hash = ''
  return relative ? `${url.pathname}${url.search}` : url.toString()
}

function assetEndpoint(base: string, assetId: string): string {
  return `${base}/${encodeURIComponent(assetId)}`
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Workbench media request failed with ${response.status}`)
  return response.json() as Promise<T>
}

/**
 * Creates a media client from the nonce-bound handshake. `0.2.0` has no
 * `media` browser export, so this is the only compatibility seam to remove
 * when the Host release containing 2878f36 is published and pinned.
 */
export function createHostMediaClient(options: CreateHostMediaClientOptions): HostMediaClient {
  const fetcher = options.fetch ?? globalThis.fetch
  if (typeof fetcher !== 'function') throw new TypeError('A fetch implementation is required')
  const endpoint = async (): Promise<string> => {
    const context = await options.ready()
    if (!context.gameId) throw new TypeError('Handshake gameId is required')
    return endpointForMedia(context.endpoints.gamePackage)
  }

  return Object.freeze({
    async list(type?: HostMediaType, signal?: AbortSignal) {
      const base = await endpoint()
      const query = type ? `?${new URLSearchParams({ type }).toString()}` : ''
      return json<HostMediaAsset[]>(await fetcher(`${base}${query}`, { signal }))
    },
    async contentUrl(assetId: string) {
      return assetEndpoint(await endpoint(), assetId)
    },
    async uploadUrl(uploadId: string) {
      return `${await endpoint()}/uploads/${encodeURIComponent(uploadId)}`
    },
    async update(assetId: string, input: { filename?: string, metadata?: Record<string, unknown> }, signal?: AbortSignal) {
      return json<HostMediaAsset>(await fetcher(assetEndpoint(await endpoint(), assetId), {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal,
      }))
    },
    async delete(assetId: string, signal?: AbortSignal) {
      const response = await fetcher(assetEndpoint(await endpoint(), assetId), { method: 'DELETE', signal })
      if (response.status === 404) return false
      if (!response.ok) throw new Error(`Workbench media request failed with ${response.status}`)
      return true
    },
    async createUpload(input: { filename: string, contentType: string, sizeBytes: number, metadata?: Record<string, unknown>, idempotencyKey?: string }, signal?: AbortSignal) {
      return json<HostMediaUpload>(await fetcher(`${await endpoint()}/uploads`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal,
      }))
    },
    async getUpload(uploadId: string, signal?: AbortSignal) {
      const response = await fetcher(`${await endpoint()}/uploads/${encodeURIComponent(uploadId)}`, { signal })
      if (response.status === 404) return null
      return json<HostMediaUpload>(response)
    },
    async writeUploadChunk(uploadId: string, offset: number, bytes: Uint8Array, signal?: AbortSignal) {
      return json<HostMediaUpload>(await fetcher(`${await endpoint()}/uploads/${encodeURIComponent(uploadId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream', 'upload-offset': String(offset) },
        body: bytes as unknown as BodyInit,
        signal,
      }))
    },
    async completeUpload(uploadId: string, signal?: AbortSignal) {
      return json<HostMediaAsset>(await fetcher(`${await endpoint()}/uploads/${encodeURIComponent(uploadId)}/complete`, {
        method: 'POST', signal,
      }))
    },
  })
}
