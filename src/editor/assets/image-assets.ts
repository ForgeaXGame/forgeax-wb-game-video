import type { MediaAsset } from './registry-types'

const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export type ImageReferenceType = 'character' | 'scene'

export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageUploadError'
  }
}

function assertImageFile(file: File): void {
  if (!IMAGE_MIME_TYPES.has(file.type)) {
    throw new ImageUploadError('仅支持 PNG、JPEG、WebP 或 GIF 图片')
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new ImageUploadError('图片大小必须在 20 MB 以内')
  }
}

async function parseResponse(response: Response): Promise<MediaAsset> {
  const payload = await response.json().catch(() => null) as { asset?: MediaAsset; error?: string } | null
  if (!response.ok || !payload?.asset) {
    throw new ImageUploadError(payload?.error || `图片上传失败（HTTP ${response.status}）`)
  }
  return payload.asset
}

export async function uploadReferenceImage(
  game: string,
  file: File,
  referenceType: ImageReferenceType,
  onProgress?: (percent: number) => void,
): Promise<MediaAsset> {
  assertImageFile(file)
  const body = new FormData()
  body.set('file', file)
  body.set('reference_type', referenceType)

  return new Promise<MediaAsset>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', `/api/gva/images?game=${encodeURIComponent(game)}`)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
    }
    request.onerror = () => reject(new ImageUploadError('图片上传网络错误'))
    request.onload = () => {
      const response = new Response(request.responseText, {
        status: request.status,
        headers: { 'content-type': request.getResponseHeader('content-type') ?? 'application/json' },
      })
      void parseResponse(response)
        .then((asset) => {
          onProgress?.(100)
          resolve(asset)
        })
        .catch(reject)
    }
    request.send(body)
  })
}

export async function deleteReferenceImage(game: string, assetId: string): Promise<void> {
  const response = await fetch(
    `/api/gva/assets/${encodeURIComponent(assetId)}?game=${encodeURIComponent(game)}`,
    { method: 'DELETE' },
  )
  if (response.ok) {
    return
  }
  const payload = await response.json().catch(() => null) as { error?: string } | null
  throw new ImageUploadError(payload?.error || `图片删除失败（HTTP ${response.status}）`)
}

export function gvaImageUrl(assetId: string, game: string, updatedAt?: number): string {
  const query = new URLSearchParams({ game })
  if (updatedAt !== undefined) {
    query.set('v', String(updatedAt))
  }
  return `/api/gva/media/${encodeURIComponent(assetId)}?${query}`
}
