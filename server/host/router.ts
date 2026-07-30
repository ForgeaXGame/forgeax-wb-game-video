import type {
  WorkbenchExtensionContext,
  WorkbenchExtensionRouter,
  WorkbenchExtensionRouterRequest,
  WorkbenchExtensionRouterResponse,
} from '@forgeax/workbench-host/node'
import { createHostAssetRegistry, getHostStyleAxes } from '../asset-registry'
import {
  browserMediaType,
  createBrowserMediaService,
  UploadConflictError,
} from './browser-media'
import { bundledMediaResponse, type BundledMediaResolver } from './media-routes'
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

function parsePositiveInteger(value: string | undefined, label: string, allowZero = false): number {
  if (value === undefined || !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new WbServiceInputError(`${label} is invalid`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || (allowZero ? parsed < 0 : parsed < 1)) {
    throw new WbServiceInputError(`${label} is invalid`)
  }
  return parsed
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
  options: { bundledMediaResolver?: BundledMediaResolver } = {},
): WorkbenchExtensionRouter {
  const service = createWbGameVideoService(context)
  const browserMedia = createBrowserMediaService(context)

  return {
    async handle(request) {
      try {
        const parts = pathParts(request.path)
        if (!parts) return notFound()
        const method = request.method.toUpperCase()
        const path = parts.join('/')

        if (method === 'POST' && path === 'media/image-assets/upload') {
          exactQuery(request.query, [])
          return mediaResponse(await browserMedia.prepareUpload(jsonBody(request)))
        }
        if (
          method === 'PUT'
          && parts.length === 3
          && parts[0] === 'media'
          && parts[1] === 'uploads'
        ) {
          const query = exactQuery(request.query, ['chunk_index', 'chunk_count'])
          const chunkIndex = parsePositiveInteger(query.chunk_index, 'chunk_index', true)
          const chunkCount = parsePositiveInteger(query.chunk_count, 'chunk_count')
          const result = await browserMedia.putChunk(
            parts[2]!,
            chunkIndex,
            chunkCount,
            header(request, 'content-type'),
            request.body,
          )
          if (result === 'missing') return notFound()
          return { status: 204, headers: { 'content-length': '0' }, body: new Uint8Array() }
        }
        if (method === 'GET' && path === 'media/resources') {
          const query = exactQuery(request.query, ['media_type', 'page', 'page_size', 'type'])
          const type = query.media_type === undefined ? undefined : browserMediaType(query.media_type)
          const items = await browserMedia.list(type, query.type)
          const page = query.page === undefined ? 1 : Number(query.page)
          const pageSize = query.page_size === undefined
            ? Math.min(100, Math.max(1, items.length))
            : Number(query.page_size)
          if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
            throw new WbServiceInputError('page must be positive and page_size must be between 1 and 100')
          }
          const offset = (page - 1) * pageSize
          return mediaResponse({ items: items.slice(offset, offset + pageSize), total: items.length, page, page_size: pageSize })
        }
        if (method === 'POST' && path === 'media/resources') {
          exactQuery(request.query, [])
          const requestContentType = header(request, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase()
          if (requestContentType === 'application/json') {
            return mediaResponse(await browserMedia.create(jsonBody(request)))
          }
          const name = header(request, 'x-workbench-media-name')
          const type = browserMediaType(header(request, 'x-workbench-media-type'))
          const contentType = header(request, 'content-type')
          if (!name || !contentType || request.body.byteLength === 0) {
            throw new WbServiceInputError('Media upload requires name, type, content type, and body')
          }
          return mediaResponse(await browserMedia.directUpload(
            name,
            type,
            contentType,
            request.body,
            header(request, 'x-workbench-idempotency-key'),
          ))
        }
        if (method === 'POST' && path === 'media/resources/batch') {
          exactQuery(request.query, [])
          return mediaResponse(await browserMedia.batch(jsonBody(request)))
        }
        if (parts.length === 3 && parts[0] === 'media' && parts[1] === 'resources') {
          const id = parts[2]!
          if (method === 'GET') {
            exactQuery(request.query, [])
            const value = await browserMedia.get(id)
            return value ? mediaResponse(value) : notFound()
          }
          if (method === 'PUT') {
            exactQuery(request.query, [])
            const value = await browserMedia.update(id, jsonBody(request))
            return value ? mediaResponse(value) : notFound()
          }
          if (method === 'DELETE') {
            exactQuery(request.query, [])
            if (!await browserMedia.remove(id)) return notFound()
            return { status: 204, headers: { 'content-length': '0' }, body: new Uint8Array() }
          }
        }
        if (parts.length === 4 && parts[0] === 'media' && parts[1] === 'resources' && parts[3] === 'content' && method === 'GET') {
          exactQuery(request.query, [])
          const body = await browserMedia.content(parts[2]!)
          return body ? binaryResponse(body.contentType, body.bytes) : notFound()
        }
        if (parts.length === 3 && parts[0] === 'media' && parts[1] === 'assets' && method === 'GET') {
          exactQuery(request.query, [])
          const body = await createHostAssetRegistry(context).readMedia(parts[2]!)
          return body ? binaryResponse(body.contentType, body.bytes) : notFound()
        }

        if (method === 'GET' && path === 'assets') {
          const query = exactQuery(request.query, [
            'kind', 'productionType', 'sceneNodeId',
          ])
          return jsonResponse(200, await service.listAssets(query))
        }
        if (
          method === 'GET'
          && parts.length === 2
          && parts[0] === 'assets'
        ) {
          exactQuery(request.query, [])
          const id = getAssetIdFromArgs({ id: parts[1]! })
          return jsonResponse(200, await service.getAsset(id))
        }
        if (
          method === 'GET'
          && parts.length === 3
          && parts[0] === 'media'
          && parts[1] === 'bundled'
        ) {
          exactQuery(request.query, [])
          const response = await bundledMediaResponse(
            parts[2]!,
            header(request, 'range'),
            { resolveAsset: options.bundledMediaResolver },
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
          exactQuery(request.query, [])
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
        if (error instanceof UploadConflictError) {
          return jsonResponse(409, {
            ok: false,
            error: {
              code: 'upload_conflict',
              target: 'wb-game-video',
              message: error.message,
              retryable: false,
            },
          })
        }
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
