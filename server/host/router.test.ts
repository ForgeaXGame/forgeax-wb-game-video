import type { WorkbenchExtensionContext } from '@forgeax/workbench-host/node'
import {
  InMemoryMediaCapability,
  InMemoryModelGateway,
} from '@forgeax/workbench-host/testing'
import { describe, expect, test } from 'vitest'
import { createWbGameVideoRouter } from './router'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function createContext(): WorkbenchExtensionContext {
  const state = new Map<string, Uint8Array>([
    ['assets/manifest.json', encoder.encode(JSON.stringify({
      version: 2,
      assets: [{
        id: 'asset-1',
        kind: 'image',
        productionType: 'shot_image',
        status: 'ready',
        createdAt: 1,
        updatedAt: 1,
      }],
      styleAxes: { artMedia: 'ink' },
    }))],
  ])
  return {
    gameId: 'router-game',
    gameRoot: '/host/router-game',
    files: {
      async list(path) {
        expect(path).not.toMatch(/^(?:\/|[A-Za-z]:[\\/])/)
        return []
      },
      async read(path) {
        expect(path).not.toMatch(/^(?:\/|[A-Za-z]:[\\/])/)
        const bytes = state.get(path)
        return bytes ? new Uint8Array(bytes) : null
      },
      async write(path, bytes) {
        expect(path).not.toMatch(/^(?:\/|[A-Za-z]:[\\/])/)
        state.set(path, new Uint8Array(bytes))
      },
    },
    media: new InMemoryMediaCapability(),
    models: new InMemoryModelGateway(),
  }
}

function request(
  path: string,
  options: {
    method?: string
    headers?: Record<string, readonly string[]>
    query?: Record<string, readonly string[]>
    json?: unknown
  } = {},
) {
  return {
    gameId: 'router-game',
    runtimeId: 'wb-game-video',
    path,
    query: options.query ?? {},
    method: options.method ?? 'GET',
    headers: options.headers ?? {},
    body: options.json === undefined
      ? new Uint8Array()
      : encoder.encode(JSON.stringify(options.json)),
  }
}

function bodyJson(response: { body?: Uint8Array }): unknown {
  return JSON.parse(decoder.decode(response.body))
}

describe('createWbGameVideoRouter', () => {
  test('routes asset and style reads through the shared context service', async () => {
    const router = createWbGameVideoRouter(createContext())

    const assets = await router.handle(request('assets'))
    const asset = await router.handle(request('/assets/asset-1'))
    const axes = await router.handle(request('style-axes'))

    expect(assets.status).toBe(200)
    expect(bodyJson(assets)).toMatchObject({ assets: [{ id: 'asset-1' }] })
    expect(bodyJson(asset)).toMatchObject({ asset: { id: 'asset-1' } })
    expect(bodyJson(axes)).toEqual({ styleAxes: { artMedia: 'ink' } })
  })

  test('preserves raw request headers and binary body semantics for bundled ranges', async () => {
    const router = createWbGameVideoRouter(createContext())
    const response = await router.handle(request('media/bundled/dazhao', {
      headers: { range: ['bytes=0-3'] },
    }))

    expect(response.status).toBe(206)
    expect(response.body).toHaveLength(4)
    expect(response.headers?.['content-range']).toMatch(/^bytes 0-3\/\d+$/)
  })

  test('normalizes an invalid bundled range without losing range headers', async () => {
    const router = createWbGameVideoRouter(createContext())
    const response = await router.handle(request('media/bundled/dazhao', {
      headers: { range: ['bytes=999999999-'] },
    }))

    expect(response.status).toBe(416)
    expect(response.headers).toMatchObject({
      'accept-ranges': 'bytes',
      'content-range': expect.stringMatching(/^bytes \*\/\d+$/),
      'content-type': 'application/json; charset=utf-8',
    })
    expect(bodyJson(response)).toEqual({
      ok: false,
      error: {
        code: 'range_not_satisfiable',
        target: 'wb-game-video',
        message: 'Range Not Satisfiable',
        retryable: false,
      },
    })
  })

  test.each([
    'media/bundled/../dazhao',
    'media/bundled/%2e%2e',
    'media/bundled/not-present',
    'not-a-route',
  ])('returns one normalized 404 for unsafe or unknown route %s', async (path) => {
    const router = createWbGameVideoRouter(createContext())
    const response = await router.handle(request(path))

    expect(response.status).toBe(404)
    expect(bodyJson(response)).toEqual({
      ok: false,
      error: {
        code: 'not_found',
        target: 'wb-game-video',
        message: 'Not Found',
        retryable: false,
      },
    })
  })

  test('rejects public absolute paths without passing them to bounded files', async () => {
    const router = createWbGameVideoRouter(createContext())
    const response = await router.handle(request('references/characters/import', {
      method: 'POST',
      headers: { 'content-type': ['application/json'] },
      json: { characterIds: ['/private/secret'] },
    }))

    expect(response.status).toBe(400)
    expect(bodyJson(response)).toMatchObject({
      ok: false,
      error: { code: 'invalid_input' },
    })
    expect(JSON.stringify(bodyJson(response))).not.toContain('/private/secret')
  })

  test.each([
    ['generation/shot-script', {
      nodeName: 'Opening',
      storyText: 'Hero enters',
      durationSeconds: 61,
    }],
    ['generation/keyframe', {
      sceneNodeId: 'node-1',
      nodeName: 'Opening',
      beat: 'Hero enters',
      cwd: '/private/secret',
    }],
    ['generation/video', {
      sceneNodeId: 'node-1',
      nodeName: 'Opening',
      characterRefIds: ['character'],
      sceneRefIds: ['scene'],
      durationSeconds: 61,
    }],
    ['generation/node-video', {
      sceneNodeId: 'node-1',
      nodeName: 'Opening',
      characterRefIds: ['character'],
      sceneRefIds: ['scene'],
      durationSeconds: 121,
    }],
  ])('rejects out-of-contract POST input for %s', async (path, input) => {
    const router = createWbGameVideoRouter(createContext())
    const response = await router.handle(request(path, {
      method: 'POST',
      headers: { 'content-type': ['application/json'] },
      json: input,
    }))
    expect(response.status).toBe(400)
    expect(bodyJson(response)).toMatchObject({
      ok: false,
      error: { code: 'invalid_input' },
    })
  })

  test('requires an exact JSON media type', async () => {
    const router = createWbGameVideoRouter(createContext())
    const response = await router.handle(request('references/scenes/import', {
      method: 'POST',
      headers: { 'content-type': ['application/jsonp'] },
      json: {},
    }))
    expect(response.status).toBe(400)
  })

  test.each([
    ['assets', { unknown: ['value'] }],
    ['assets', { kind: ['image', 'video'] }],
    ['assets/asset-1', { productionType: ['shot_image'] }],
    ['style-axes', { kind: ['image'] }],
    ['media/bundled/dazhao', { range: ['bytes=0-3'] }],
  ])('rejects unknown or repeated GET query keys for %s', async (path, query) => {
    const router = createWbGameVideoRouter(createContext())
    const response = await router.handle(request(path, { query }))

    expect(response.status).toBe(400)
    expect(bodyJson(response)).toEqual({
      ok: false,
      error: {
        code: 'invalid_input',
        target: 'wb-game-video',
        message: expect.any(String),
        retryable: false,
      },
    })
  })

  test('accepts the published GET filters and rejects a mismatched gameSlug', async () => {
    const router = createWbGameVideoRouter(createContext())
    const accepted = await router.handle(request('assets', {
      query: {
        gameSlug: ['router-game'],
        kind: ['image'],
        productionType: ['shot_image'],
        sceneNodeId: ['node-1'],
      },
    }))
    const rejected = await router.handle(request('assets/asset-1', {
      query: { gameSlug: ['another-game'] },
    }))

    expect(accepted.status).toBe(200)
    expect(rejected.status).toBe(400)
    expect(bodyJson(rejected)).toMatchObject({
      error: {
        code: 'invalid_input',
        target: 'wb-game-video',
        retryable: false,
      },
    })
  })

  test('rejects query keys on POST routes', async () => {
    const router = createWbGameVideoRouter(createContext())
    const response = await router.handle(request('generation/shot-script', {
      method: 'POST',
      query: { debug: ['true'] },
      headers: { 'content-type': ['application/json'] },
      json: { nodeName: 'Opening', storyText: 'Hero enters' },
    }))

    expect(response.status).toBe(400)
    expect(bodyJson(response)).toMatchObject({
      error: {
        code: 'invalid_input',
        target: 'wb-game-video',
        retryable: false,
      },
    })
  })

  test('normalizes internal failures with target and retryability metadata', async () => {
    const context = createContext()
    const router = createWbGameVideoRouter({
      ...context,
      files: {
        ...context.files,
        async read() {
          throw new Error('secret host failure')
        },
      },
    })
    const response = await router.handle(request('assets'))

    expect(response.status).toBe(500)
    expect(bodyJson(response)).toEqual({
      ok: false,
      error: {
        code: 'internal_error',
        target: 'wb-game-video',
        message: 'Internal Server Error',
        retryable: false,
      },
    })
  })

  test.each([
    [
      'references/characters/import',
      {},
      { refs: [] },
    ],
    [
      'references/scenes/import',
      {},
      { refs: [] },
    ],
    [
      'generation/shot-script',
      { nodeName: 'Opening', storyText: 'Hero enters' },
      { shots: [{ seedancePrompt: expect.any(String) }] },
    ],
    [
      'generation/keyframe',
      { sceneNodeId: 'node-1', nodeName: 'Opening', beat: 'Hero enters' },
      { asset: null, error: expect.any(String) },
    ],
    [
      'generation/video',
      {
        sceneNodeId: 'node-1',
        nodeName: 'Opening',
        characterRefIds: ['character'],
        sceneRefIds: ['scene'],
      },
      { asset: null, error: expect.any(String) },
    ],
    [
      'generation/node-video',
      {
        sceneNodeId: 'node-1',
        nodeName: 'Opening',
        characterRefIds: ['character'],
        sceneRefIds: ['scene'],
      },
      { assets: [{ status: 'failed', error: expect.any(String) }] },
    ],
  ])('maps POST %s to its shared service operation', async (path, input, expected) => {
    const router = createWbGameVideoRouter(createContext())
    const response = await router.handle(request(path, {
      method: 'POST',
      headers: { 'content-type': ['application/json'] },
      json: input,
    }))

    expect(response.status).toBe(200)
    expect(bodyJson(response)).toMatchObject(expected)
  })
})
