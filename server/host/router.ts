import type {
  WorkbenchExtensionContext,
  WorkbenchExtensionRouter,
  WorkbenchExtensionRouterRequest,
  WorkbenchExtensionRouterResponse,
} from '@forgeax/workbench-host/node'
import { createHostAssetRegistry, getHostStyleAxes } from '../asset-registry'
import { bundledMediaResponse } from './media-routes'
import {
  createWbGameVideoService,
  getAssetIdFromArgs,
  WbServiceInputError,
} from './wb-service'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function jsonResponse(
  status: number,
  value: unknown,
): WorkbenchExtensionRouterResponse {
  const body = encoder.encode(JSON.stringify(value))
  return {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-length': String(body.byteLength),
      'content-type': 'application/json; charset=utf-8',
    },
    body,
  }
}

function mediaResponse(value: unknown): WorkbenchExtensionRouterResponse {
  return jsonResponse(200, { code: 0, message: 'ok', data: value })
}

function binaryResponse(contentType: string, body: Uint8Array): WorkbenchExtensionRouterResponse {
  return {
    status: 200,
    headers: { 'content-length': String(body.byteLength), 'content-type': contentType },
    body,
  }
}

function notFound(): WorkbenchExtensionRouterResponse {
  return jsonResponse(404, {
    ok: false,
    error: {
      code: 'not_found',
      target: 'wb-game-video',
      message: 'Not Found',
      retryable: false,
    },
  })
}

function header(
  request: WorkbenchExtensionRouterRequest,
  name: string,
): string | undefined {
  const target = name.toLowerCase()
  for (const [key, values] of Object.entries(request.headers)) {
    if (key.toLowerCase() === target) return values[0]
  }
  return undefined
}

function pathParts(rawPath: string): string[] | null {
  const path = rawPath.replace(/^\/+|\/+$/g, '')
  if (!path) return []
  const parts: string[] = []
  for (const rawPart of path.split('/')) {
    let part: string
    try {
      part = decodeURIComponent(rawPart)
    } catch {
      return null
    }
    if (
      !part
      || part === '.'
      || part === '..'
      || part.includes('/')
      || part.includes('\\')
    ) {
      return null
    }
    parts.push(part)
  }
  return parts
}

function jsonBody(request: WorkbenchExtensionRouterRequest): unknown {
  if (request.body.byteLength === 0) return {}
  const contentType = header(request, 'content-type')
  const mediaType = contentType?.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType !== 'application/json') {
    throw new WbServiceInputError('Request body must be application/json')
  }
  try {
    return JSON.parse(decoder.decode(request.body)) as unknown
  } catch {
    throw new WbServiceInputError('Request body is invalid JSON')
  }
}

function exactQuery(
  query: Readonly<Record<string, readonly string[]>>,
  allowed: readonly string[],
): Record<string, string> {
  const allowedKeys = new Set(allowed)
  const result: Record<string, string> = {}
  for (const [name, values] of Object.entries(query)) {
    if (!allowedKeys.has(name)) {
      throw new WbServiceInputError(`Query contains unsupported key: ${name}`)
    }
    if (values.length !== 1 || values[0] === undefined) {
      throw new WbServiceInputError(`Query key must have exactly one value: ${name}`)
    }
    result[name] = values[0]
  }
  return result
}

function assertBoundQuery(
  query: Record<string, string>,
  gameId: string,
): void {
  if (query.gameSlug !== undefined && query.gameSlug !== gameId) {
    throw new WbServiceInputError(
      'gameSlug does not match the host-bound game',
    )
  }
}

type BrowserMediaType = 'audio' | 'image' | 'video' | 'font'
type BrowserMediaRecord = {
  readonly resource_id: string
  readonly host_id: string
  readonly media_type: BrowserMediaType
  readonly url: string
  name: string
  readonly created_at: number
  updated_at: number
  deleted: boolean
}

function browserMediaType(value: string | undefined): BrowserMediaType {
  if (value === 'audio' || value === 'image' || value === 'video' || value === 'font') return value
  throw new WbServiceInputError('x-workbench-media-type is invalid')
}

function resource(record: BrowserMediaRecord) {
  return {
    resource_id: record.resource_id,
    game_id: '',
    media_type: record.media_type,
    name: record.name,
    url: record.url,
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}

type ServiceMethod =
  | 'importCharacterRefs'
  | 'importSceneRefs'
  | 'generateShotScript'
  | 'generateKeyframe'
  | 'generateVideo'
  | 'generateNodeVideo'

const POST_ROUTES = new Map<string, ServiceMethod>([
  ['references/characters/import', 'importCharacterRefs'],
  ['references/scenes/import', 'importSceneRefs'],
  ['generation/shot-script', 'generateShotScript'],
  ['generation/keyframe', 'generateKeyframe'],
  ['generation/video', 'generateVideo'],
  ['generation/node-video', 'generateNodeVideo'],
])

/**
 * Creates the transport-neutral extension router. Framework adapters remain
 * host responsibilities and receive these status/headers/body values verbatim.
 */
export function createWbGameVideoRouter(
  context: WorkbenchExtensionContext,
): WorkbenchExtensionRouter {
  const service = createWbGameVideoService(context)
  const browserMedia = new Map<string, BrowserMediaRecord>()

  return {
    async handle(request) {
      try {
        const parts = pathParts(request.path)
        if (!parts) return notFound()
        const method = request.method.toUpperCase()
        const path = parts.join('/')

        if (method === 'GET' && path === 'media/resources') {
          const query = exactQuery(request.query, ['media_type', 'page', 'page_size', 'type'])
          const type = query.media_type === undefined ? undefined : browserMediaType(query.media_type)
          const items = [...browserMedia.values()]
            .filter((record) => !record.deleted && (!type || record.media_type === type))
            .map(resource)
          const page = query.page === undefined ? 1 : Number(query.page)
          const pageSize = query.page_size === undefined ? Math.max(1, items.length) : Number(query.page_size)
          if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1) {
            throw new WbServiceInputError('page and page_size must be positive integers')
          }
          const offset = (page - 1) * pageSize
          return mediaResponse({ items: items.slice(offset, offset + pageSize), total: items.length, page, page_size: pageSize })
        }
        if (method === 'POST' && path === 'media/resources') {
          exactQuery(request.query, [])
          const name = header(request, 'x-workbench-media-name')
          const type = browserMediaType(header(request, 'x-workbench-media-type'))
          const contentType = header(request, 'content-type')
          if (!name || !contentType || request.body.byteLength === 0) {
            throw new WbServiceInputError('Media upload requires name, type, content type, and body')
          }
          const hosted = await context.media.put(context.gameId, {
            filename: name,
            contentType,
            bytes: request.body,
            metadata: { source: 'wb-game-video-browser' },
          })
          const now = Date.now()
          const record: BrowserMediaRecord = {
            resource_id: hosted.id,
            host_id: hosted.id,
            media_type: type,
            url: hosted.url,
            name,
            created_at: now,
            updated_at: now,
            deleted: false,
          }
          browserMedia.set(record.resource_id, record)
          return mediaResponse(resource(record))
        }
        if (parts.length === 3 && parts[0] === 'media' && parts[1] === 'resources') {
          const id = parts[2]!
          const record = browserMedia.get(id)
          if (!record || record.deleted) return notFound()
          if (method === 'GET') {
            const body = await context.media.read(context.gameId, record.host_id)
            if (!body) return notFound()
            return mediaResponse(resource(record))
          }
          if (method === 'PUT') {
            exactQuery(request.query, [])
            const input = jsonBody(request)
            if (!input || typeof input !== 'object' || Array.isArray(input) || typeof (input as { name?: unknown }).name !== 'string') {
              throw new WbServiceInputError('Media rename requires name')
            }
            record.name = (input as { name: string }).name
            record.updated_at = Date.now()
            return mediaResponse(resource(record))
          }
          if (method === 'DELETE') {
            exactQuery(request.query, [])
            record.deleted = true
            return { status: 204, headers: { 'content-length': '0' }, body: new Uint8Array() }
          }
        }
        if (parts.length === 4 && parts[0] === 'media' && parts[1] === 'resources' && parts[3] === 'content' && method === 'GET') {
          const record = browserMedia.get(parts[2]!)
          if (!record || record.deleted) return notFound()
          const body = await context.media.read(context.gameId, record.host_id)
          return body ? binaryResponse(body.contentType, body.bytes) : notFound()
        }
        if (parts.length === 3 && parts[0] === 'media' && parts[1] === 'assets' && method === 'GET') {
          const assetResult = await service.getAsset(parts[2]!) as { asset?: { provider?: { ref?: string }; file?: string; mime?: string } | null }
          const asset = assetResult.asset
          if (!asset) return notFound()
          if (asset.provider?.ref) {
            const body = await context.media.read(context.gameId, asset.provider.ref)
            return body ? binaryResponse(asset.mime ?? body.contentType, body.bytes) : notFound()
          }
          const bytes = asset.file ? await context.files.read(`assets/${asset.file}`) : null
          return bytes ? binaryResponse(asset.mime ?? 'application/octet-stream', bytes) : notFound()
        }

        if (method === 'GET' && path === 'assets') {
          const query = exactQuery(request.query, [
            'gameSlug', 'kind', 'productionType', 'sceneNodeId',
          ])
          return jsonResponse(200, await service.listAssets(query))
        }
        if (
          method === 'GET'
          && parts.length === 2
          && parts[0] === 'assets'
        ) {
          const query = exactQuery(request.query, ['gameSlug'])
          const id = getAssetIdFromArgs({
            id: parts[1]!,
            ...query,
          }, context.gameId)
          return jsonResponse(200, await service.getAsset(id))
        }
        if (
          method === 'GET'
          && parts.length === 3
          && parts[0] === 'media'
          && parts[1] === 'bundled'
        ) {
          const query = exactQuery(request.query, ['gameSlug'])
          assertBoundQuery(query, context.gameId)
          const response = await bundledMediaResponse(
            parts[2]!,
            header(request, 'range'),
          )
          if (response.status === 404) return notFound()
          if (response.status === 416) {
            const normalized = jsonResponse(416, {
              ok: false,
              error: {
                code: 'range_not_satisfiable',
                target: 'wb-game-video',
                message: 'Range Not Satisfiable',
                retryable: false,
              },
            })
            return {
              ...normalized,
              headers: {
                ...normalized.headers,
                'accept-ranges': response.headers?.['accept-ranges'] ?? 'bytes',
                'content-range': response.headers?.['content-range'] ?? 'bytes */0',
              },
            }
          }
          return response
        }
        if (method === 'GET' && path === 'style-axes') {
          const query = exactQuery(request.query, ['gameSlug'])
          assertBoundQuery(query, context.gameId)
          return jsonResponse(200, {
            styleAxes: await getHostStyleAxes(context) ?? null,
          })
        }
        if (method === 'POST' && path === 'style-axes') {
          exactQuery(request.query, [])
          const axes = jsonBody(request)
          if (!axes || typeof axes !== 'object' || Array.isArray(axes)) {
            throw new WbServiceInputError('styleAxes must be an object')
          }
          return jsonResponse(200, {
            styleAxes: await createHostAssetRegistry(context).setStyleAxes(
              axes as Parameters<ReturnType<typeof createHostAssetRegistry>['setStyleAxes']>[0],
            ),
          })
        }
        if (method === 'POST') {
          const serviceMethod = POST_ROUTES.get(path)
          if (serviceMethod) {
            exactQuery(request.query, [])
            return jsonResponse(
              200,
              await service[serviceMethod](jsonBody(request)),
            )
          }
        }
        return notFound()
      } catch (error) {
        if (error instanceof WbServiceInputError) {
          return jsonResponse(400, {
            ok: false,
            error: {
              code: error.code,
              target: 'wb-game-video',
              message: error.message,
              retryable: false,
            },
          })
        }
        return jsonResponse(500, {
          ok: false,
          error: {
            code: 'internal_error',
            target: 'wb-game-video',
            message: 'Internal Server Error',
            retryable: false,
          },
        })
      }
    },
  }
}
