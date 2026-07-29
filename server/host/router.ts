import type {
  WorkbenchExtensionContext,
  WorkbenchExtensionRouter,
  WorkbenchExtensionRouterRequest,
  WorkbenchExtensionRouterResponse,
} from '@forgeax/workbench-host/node'
import { getHostStyleAxes } from '../asset-registry'
import { bundledMediaResponse } from './media-routes'
import {
  createWbGameVideoService,
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

  return {
    async handle(request) {
      try {
        const parts = pathParts(request.path)
        if (!parts) return notFound()
        const method = request.method.toUpperCase()
        const path = parts.join('/')

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
          return jsonResponse(200, await service.getAsset({
            id: parts[1]!,
            ...query,
          }))
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
          return response.status === 404 ? notFound() : response
        }
        if (method === 'GET' && path === 'style-axes') {
          const query = exactQuery(request.query, ['gameSlug'])
          assertBoundQuery(query, context.gameId)
          return jsonResponse(200, {
            styleAxes: await getHostStyleAxes(context) ?? null,
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
