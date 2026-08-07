import type {
  WorkbenchExtensionContext,
  WorkbenchExtensionRouter,
  WorkbenchExtensionRouterRequest,
  WorkbenchExtensionRouterResponse,
} from '@forgeax/workbench-host/node'
import {
  createHostAssetRegistry,
  getHostStyleAxes,
  getHostDocumentSelection,
  listHostDocuments,
  readHostDocument,
  selectHostProposal,
} from '../asset-registry'
import { bundledMediaResponse, type BundledMediaResolver } from './media-routes'
import {
  createWbGameVideoService,
  getAssetIdFromArgs,
  WbServiceInputError,
} from './wb-service'
import { WB_GAME_VIDEO_POST_SERVICE_ROUTES } from './http-routes'
import type { AssetLibraryState } from '../../src/editor/assets/registry-types'

export { WB_GAME_VIDEO_HTTP_ROUTES, WB_GAME_VIDEO_POST_SERVICE_ROUTES } from './http-routes'
export type { WbGameVideoHttpRoute, WbGameVideoServiceMethod } from './http-routes'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const ASSET_MANIFEST_FILE = 'assets/manifest.json'

const EMPTY_ASSET_LIBRARY: AssetLibraryState = {
  version: 1,
  folders: [],
  placements: {},
}

function assetLibraryFromManifest(value: unknown): AssetLibraryState {
  if (!value || typeof value !== 'object') return EMPTY_ASSET_LIBRARY
  const candidate = (value as { assetLibrary?: unknown }).assetLibrary
  if (!candidate || typeof candidate !== 'object') return EMPTY_ASSET_LIBRARY
  const state = candidate as Partial<AssetLibraryState>
  if (
    state.version !== 1
    || !Array.isArray(state.folders)
    || !state.placements
    || typeof state.placements !== 'object'
  ) return EMPTY_ASSET_LIBRARY
  return state as AssetLibraryState
}

async function readManifest(context: WorkbenchExtensionContext): Promise<Record<string, unknown>> {
  const raw = await context.files.read(ASSET_MANIFEST_FILE)
  if (!raw) return { version: 2, assets: [] }
  try {
    const parsed = JSON.parse(decoder.decode(raw))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    return parsed as Record<string, unknown>
  } catch {
    throw new WbServiceInputError('assets manifest is invalid')
  }
}

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

function documentSummary(document: {
  id: string
  name: string
  updatedAt: number
  meta: { documentType: string }
}) {
  return {
    id: document.id,
    name: document.name,
    documentType: document.meta.documentType,
    updatedAt: document.updatedAt,
  }
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

/**
 * Creates the transport-neutral extension router. Framework adapters remain
 * host responsibilities and receive these status/headers/body values verbatim.
 *
 * Route inventory SSOT: `./http-routes.ts`.
 */
export function createWbGameVideoRouter(
  context: WorkbenchExtensionContext,
  options: { bundledMediaResolver?: BundledMediaResolver } = {},
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
            'kind', 'productionType', 'sceneNodeId',
          ])
          return jsonResponse(200, await service.listAssets(query))
        }
        if (method === 'GET' && path === 'documents') {
          exactQuery(request.query, [])
          return jsonResponse(200, {
            documents: (await listHostDocuments(context)).map(documentSummary),
            selection: await getHostDocumentSelection(context),
          })
        }
        if (
          method === 'GET'
          && parts.length === 2
          && parts[0] === 'documents'
        ) {
          exactQuery(request.query, [])
          const document = await readHostDocument(context, parts[1]!)
          if (!document) return notFound()
          return jsonResponse(200, {
            document: documentSummary(document.document),
            content: document.content,
            selection: await getHostDocumentSelection(context),
          })
        }
        if (method === 'POST' && path === 'documents/selection') {
          exactQuery(request.query, [])
          const body = jsonBody(request)
          if (
            !body
            || typeof body !== 'object'
            || Array.isArray(body)
            || typeof (body as { proposalId?: unknown }).proposalId !== 'string'
          ) {
            throw new WbServiceInputError('proposalId is required')
          }
          try {
            const selection = await selectHostProposal(
              context,
              (body as { proposalId: string }).proposalId,
            )
            return jsonResponse(200, { selection })
          } catch (error) {
            throw new WbServiceInputError(
              error instanceof Error ? error.message : 'Unable to select proposal',
            )
          }
        }
        if (method === 'GET' && path === 'asset-library') {
          exactQuery(request.query, [])
          const manifest = await readManifest(context)
          return jsonResponse(200, { assetLibrary: assetLibraryFromManifest(manifest) })
        }
        if (method === 'POST' && path === 'asset-library') {
          exactQuery(request.query, [])
          const body = jsonBody(request)
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw new WbServiceInputError('assetLibrary payload is invalid')
          }
          const assetLibrary = assetLibraryFromManifest(body)
          if (assetLibrary === EMPTY_ASSET_LIBRARY && (body as { assetLibrary?: unknown }).assetLibrary !== undefined) {
            throw new WbServiceInputError('assetLibrary is invalid')
          }
          const manifest = await readManifest(context)
          const next = { ...manifest, assetLibrary }
          await context.files.write(ASSET_MANIFEST_FILE, encoder.encode(JSON.stringify(next, null, 2)))
          return jsonResponse(200, { assetLibrary })
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
          const serviceMethod = WB_GAME_VIDEO_POST_SERVICE_ROUTES.get(path)
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
