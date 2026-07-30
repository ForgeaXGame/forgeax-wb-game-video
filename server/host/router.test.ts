import type { WorkbenchExtensionContext } from '@forgeax/workbench-host/node'
import {
  InMemoryMediaCapability,
  InMemoryModelGateway,
} from '@forgeax/workbench-host/testing'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { createWbGameVideoRouter } from './router'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
let bundledDirectory = ''
let bundledFile = ''

beforeAll(async () => {
  bundledDirectory = await mkdtemp(join(tmpdir(), 'wb-game-video-router-media-'))
  bundledFile = join(bundledDirectory, 'dazhao.mp4')
  await writeFile(bundledFile, new Uint8Array([0, 1, 2, 3, 4, 5]))
})

afterAll(async () => {
  await rm(bundledDirectory, { recursive: true, force: true })
})

function createRouter(context = createContext()) {
  return createWbGameVideoRouter(context, {
    bundledMediaResolver: async (id) => id === 'dazhao' ? pathToFileURL(bundledFile) : null,
  })
}

type ContextOptions = {
  readonly state?: Map<string, Uint8Array>
  readonly media?: WorkbenchExtensionContext['media']
  readonly onList?: (path: string) => void
  readonly onRead?: (path: string) => void
  readonly beforeWrite?: (path: string, bytes: Uint8Array) => void | Promise<void>
}

function createFileState(): Map<string, Uint8Array> {
  return new Map<string, Uint8Array>([
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
}

function createContext(options: ContextOptions = {}): WorkbenchExtensionContext {
  const state = options.state ?? createFileState()
  return {
    gameId: 'router-game',
    gameRoot: '/host/router-game',
    files: {
      async list(path) {
        expect(path).not.toMatch(/^(?:\/|[A-Za-z]:[\\/])/)
        options.onList?.(path)
        const prefix = `${path.replace(/\/+$/, '')}/`
        return [...new Set(
          [...state.keys()]
            .filter((key) => key.startsWith(prefix))
            .map((key) => key.slice(prefix.length).split('/')[0]!)
            .filter(Boolean),
        )].sort()
      },
      async read(path) {
        expect(path).not.toMatch(/^(?:\/|[A-Za-z]:[\\/])/)
        options.onRead?.(path)
        const bytes = state.get(path)
        return bytes ? new Uint8Array(bytes) : null
      },
      async write(path, bytes) {
        expect(path).not.toMatch(/^(?:\/|[A-Za-z]:[\\/])/)
        await options.beforeWrite?.(path, new Uint8Array(bytes))
        state.set(path, new Uint8Array(bytes))
      },
    },
    media: options.media ?? new InMemoryMediaCapability(),
    models: new InMemoryModelGateway(),
  }
}

async function uploadSessionPath(
  context: WorkbenchExtensionContext,
  uploadId: string,
): Promise<string> {
  for (const slot of await context.files.list('assets/.wb-game-video-uploads/slots')) {
    const path = `assets/.wb-game-video-uploads/slots/${slot}/session.json`
    const bytes = await context.files.read(path)
    if (!bytes) continue
    const value = JSON.parse(decoder.decode(bytes)) as { id?: unknown }
    if (value.id === uploadId) return path
  }
  throw new Error(`Upload session was not found: ${uploadId}`)
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

function uploadPrepareRequest(
  bytes: number,
  overrides: Record<string, unknown> = {},
) {
  return request('media/image-assets/upload', {
    method: 'POST',
    headers: { 'content-type': ['application/json'] },
    json: {
      game_id: 'router-game',
      file_name: 'large.png',
      mime_type: 'image/png',
      bytes,
      extension: 'png',
      ...overrides,
    },
  })
}

type PreparedImageUpload = {
  readonly upload_token: string
  readonly object_url: string
  readonly upload: {
    readonly url: string
    readonly chunk_count: number
    readonly chunk_size?: number
  }
}

async function prepareImageUpload(
  context: WorkbenchExtensionContext,
  bytes: number,
  overrides: Record<string, unknown> = {},
): Promise<PreparedImageUpload> {
  const response = await createWbGameVideoRouter(context).handle(
    uploadPrepareRequest(bytes, overrides),
  )
  return (bodyJson(response) as { data: PreparedImageUpload }).data
}

function putPreparedImage(
  context: WorkbenchExtensionContext,
  prepared: PreparedImageUpload,
  body: Uint8Array,
) {
  return createWbGameVideoRouter(context).handle({
    ...request(prepared.upload.url, {
      method: 'PUT',
      query: {
        chunk_index: ['0'],
        chunk_count: [String(prepared.upload.chunk_count)],
      },
      headers: { 'content-type': ['image/png'] },
    }),
    body,
  })
}

function finalizePreparedImage(
  context: WorkbenchExtensionContext,
  prepared: PreparedImageUpload,
  name = 'uploaded',
) {
  return createWbGameVideoRouter(context).handle(request('media/resources', {
    method: 'POST',
    headers: { 'content-type': ['application/json'] },
    json: {
      game_id: 'router-game',
      media_type: 'image',
      url: prepared.object_url,
      name,
    },
  }))
}

function directImageUpload(
  context: WorkbenchExtensionContext,
  name: string,
  body: Uint8Array,
) {
  return createWbGameVideoRouter(context).handle({
    ...request('media/resources', {
      method: 'POST',
      headers: {
        'content-type': ['image/png'],
        'x-workbench-media-name': [name],
        'x-workbench-media-type': ['image'],
      },
    }),
    body,
  })
}

function responseResourceId(response: { body?: Uint8Array }): string {
  return (bodyJson(response) as { data: { resource_id: string } }).data.resource_id
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
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

  test('persists style-axis updates through the shared host context', async () => {
    const router = createWbGameVideoRouter(createContext())

    const response = await router.handle(request('style-axes', {
      method: 'POST',
      headers: { 'content-type': ['application/json'] },
      json: { director: 'wong-kar-wai' },
    }))

    expect(response.status).toBe(200)
    expect(bodyJson(response)).toEqual({
      styleAxes: { artMedia: 'ink', director: 'wong-kar-wai' },
    })
  })

  test('maps browser media list, write, read, rename and delete to the host context', async () => {
    const router = createWbGameVideoRouter(createContext())
    const created = await router.handle({
      ...request('media/resources', {
        method: 'POST',
        headers: {
          'content-type': ['image/png'],
          'x-workbench-media-name': ['cover.png'],
          'x-workbench-media-type': ['image'],
        },
      }),
      body: encoder.encode('cover'),
    })
    const createdBody = bodyJson(created) as { data: { resource_id: string } }
    const id = createdBody.data.resource_id

    const listed = await router.handle(request('media/resources', {
      query: { media_type: ['image'] },
    }))
    const renamed = await router.handle(request(`media/resources/${id}`, {
      method: 'PUT',
      headers: { 'content-type': ['application/json'] },
      json: { name: 'renamed' },
    }))
    const fetched = await router.handle(request(`media/resources/${id}`))
    const removed = await router.handle(request(`media/resources/${id}`, { method: 'DELETE' }))
    const afterDelete = await router.handle(request('media/resources'))

    expect(created.status).toBe(200)
    expect(bodyJson(listed)).toMatchObject({ data: { items: [{ resource_id: id, media_type: 'image' }] } })
    expect(bodyJson(renamed)).toMatchObject({ data: { resource_id: id, name: 'renamed' } })
    expect(bodyJson(fetched)).toMatchObject({ data: { resource_id: id, name: 'renamed' } })
    expect(removed.status).toBe(204)
    expect(bodyJson(afterDelete)).toMatchObject({ data: { items: [], total: 0 } })
  })

  test('persists uploaded media metadata and tombstones across router instances', async () => {
    const context = createContext()
    const firstRouter = createWbGameVideoRouter(context)
    const created = await firstRouter.handle({
      ...request('media/resources', {
        method: 'POST',
        headers: {
          'content-type': ['image/png'],
          'x-workbench-media-name': ['cover.png'],
          'x-workbench-media-type': ['image'],
        },
      }),
      body: encoder.encode('cover'),
    })
    const id = (bodyJson(created) as { data: { resource_id: string } }).data.resource_id

    const secondRouter = createWbGameVideoRouter(context)
    const listed = await secondRouter.handle(request('media/resources', { query: { media_type: ['image'] } }))
    const fetched = await secondRouter.handle(request(`media/resources/${id}`))
    const content = await secondRouter.handle(request(`media/resources/${id}/content`))
    const renamed = await secondRouter.handle(request(`media/resources/${id}`, {
      method: 'PUT', headers: { 'content-type': ['application/json'] }, json: { name: 'renamed' },
    }))
    const removed = await secondRouter.handle(request(`media/resources/${id}`, { method: 'DELETE' }))

    const thirdRouter = createWbGameVideoRouter(context)
    const afterDelete = await thirdRouter.handle(request('media/resources'))
    expect(bodyJson(listed)).toMatchObject({ data: { items: [{ resource_id: id, name: 'cover.png' }] } })
    expect(bodyJson(fetched)).toMatchObject({ data: { resource_id: id } })
    expect(decoder.decode(content.body)).toBe('cover')
    expect(bodyJson(renamed)).toMatchObject({ data: { name: 'renamed' } })
    expect(removed.status).toBe(204)
    expect(bodyJson(afterDelete)).toMatchObject({ data: { items: [] } })
  })

  test('serializes browser media index mutations across concurrent router instances', async () => {
    const context = createContext()
    const upload = (name: string) => createWbGameVideoRouter(context).handle({
      ...request('media/resources', {
        method: 'POST',
        headers: {
          'content-type': ['image/png'],
          'x-workbench-media-name': [name],
          'x-workbench-media-type': ['image'],
        },
      }),
      body: encoder.encode(name),
    })

    const responses = await Promise.all([upload('first.png'), upload('second.png')])
    const listed = await createWbGameVideoRouter(context).handle(request('media/resources'))

    expect(responses.map((response) => response.status)).toEqual([200, 200])
    expect(bodyJson(listed)).toMatchObject({ data: { total: 2 } })
  })

  test('stores same-named direct uploads as distinct resources without overwriting the first body', async () => {
    const context = createContext()
    const first = await directImageUpload(context, 'same.png', encoder.encode('first-body'))
    const firstId = responseResourceId(first)
    const second = await directImageUpload(context, 'same.png', encoder.encode('second-body'))
    const firstContent = await createWbGameVideoRouter(context).handle(
      request(`media/resources/${encodeURIComponent(firstId)}/content`),
    )

    expect(first.status).toBe(200)
    expect(decoder.decode(firstContent.body)).toBe('first-body')
    expect(second.status).toBe(200)
    const secondId = responseResourceId(second)
    const secondContent = await createWbGameVideoRouter(context).handle(
      request(`media/resources/${encodeURIComponent(secondId)}/content`),
    )
    expect(secondId).not.toBe(firstId)
    expect(decoder.decode(secondContent.body)).toBe('second-body')
  })

  test('keeps browser resource ids separate from authoritative host media ids', async () => {
    const context = createContext()
    const created = await directImageUpload(context, 'logical.png', encoder.encode('body'))
    const resourceId = responseResourceId(created)
    const hosted = await context.media.list(context.gameId)

    expect(created.status).toBe(200)
    expect(hosted).toHaveLength(1)
    expect(resourceId).not.toBe(hosted[0]!.id)
  })

  test('uploads a file larger than 1 MiB in bounded chunks and finalizes it across router instances', async () => {
    const context = createContext()
    const bytes = new Uint8Array(1024 * 1024 + 17)
    bytes.forEach((_value, index) => {
      bytes[index] = index % 251
    })

    const prepared = await createWbGameVideoRouter(context).handle(
      uploadPrepareRequest(bytes.byteLength),
    )
    const preparation = (bodyJson(prepared) as {
      data: {
        upload: { url: string; chunk_size: number; chunk_count: number }
        object_url: string
        upload_token: string
      }
    }).data
    expect(preparation.upload.url).toMatch(/^media\/uploads\/[0-9a-f]{32}$/)
    expect(preparation.upload.chunk_size).toBeLessThan(1024 * 1024)
    expect(preparation.upload.chunk_count).toBe(3)

    for (let index = 0; index < preparation.upload.chunk_count; index += 1) {
      const start = index * preparation.upload.chunk_size
      const chunk = bytes.slice(start, Math.min(bytes.byteLength, start + preparation.upload.chunk_size))
      expect(chunk.byteLength).toBeLessThan(1024 * 1024)
      const uploaded = await createWbGameVideoRouter(context).handle({
        ...request(preparation.upload.url, {
          method: 'PUT',
          query: {
            chunk_index: [String(index)],
            chunk_count: [String(preparation.upload.chunk_count)],
          },
          headers: { 'content-type': ['image/png'] },
        }),
        body: chunk,
      })
      expect(uploaded.status).toBe(204)
    }

    const finalized = await createWbGameVideoRouter(context).handle(request('media/resources', {
      method: 'POST',
      headers: { 'content-type': ['application/json'] },
      json: {
        game_id: 'router-game',
        media_type: 'image',
        url: preparation.object_url,
        name: 'large',
        type: 'UPLOAD',
        source: 'wb-game-video',
        source_meta: { mime_type: 'image/png', extra: { bytes: bytes.byteLength } },
      },
    }))
    const resourceId = (bodyJson(finalized) as { data: { resource_id: string } }).data.resource_id
    const content = await createWbGameVideoRouter(context).handle(
      request(`media/resources/${encodeURIComponent(resourceId)}/content`),
    )

    expect(finalized.status).toBe(200)
    expect(content.status).toBe(200)
    expect(content.body).toEqual(bytes)
    expect((await context.media.list(context.gameId)).some((item) => item.id === resourceId)).toBe(false)
    const tombstone = await context.files.read(
      await uploadSessionPath(context, preparation.upload_token),
    )
    expect(tombstone).not.toBeNull()
    expect(JSON.parse(decoder.decode(tombstone!))).toMatchObject({
      status: 'finalized',
      resourceId,
      nextIndex: preparation.upload.chunk_count,
    })
  })

  test('rejects out-of-order, conflicting duplicate, mismatched, and incomplete upload sessions', async () => {
    const context = createContext()
    const chunkSize = 512 * 1024
    const preparationResponse = await createWbGameVideoRouter(context).handle(
      uploadPrepareRequest(chunkSize + 1),
    )
    const preparation = (bodyJson(preparationResponse) as {
      data: {
        upload: { url: string; chunk_size: number; chunk_count: number }
        object_url: string
      }
    }).data
    const chunk = new Uint8Array(preparation.upload.chunk_size)

    const outOfOrder = await createWbGameVideoRouter(context).handle({
      ...request(preparation.upload.url, {
        method: 'PUT',
        query: { chunk_index: ['1'], chunk_count: ['2'] },
        headers: { 'content-type': ['image/png'] },
      }),
      body: new Uint8Array([1]),
    })
    const first = await createWbGameVideoRouter(context).handle({
      ...request(preparation.upload.url, {
        method: 'PUT',
        query: { chunk_index: ['0'], chunk_count: ['2'] },
        headers: { 'content-type': ['image/png'] },
      }),
      body: chunk,
    })
    const duplicate = await createWbGameVideoRouter(context).handle({
      ...request(preparation.upload.url, {
        method: 'PUT',
        query: { chunk_index: ['0'], chunk_count: ['2'] },
        headers: { 'content-type': ['image/png'] },
      }),
      body: chunk,
    })
    const conflict = await createWbGameVideoRouter(context).handle({
      ...request(preparation.upload.url, {
        method: 'PUT',
        query: { chunk_index: ['0'], chunk_count: ['2'] },
        headers: { 'content-type': ['image/png'] },
      }),
      body: new Uint8Array(chunk.byteLength).fill(1),
    })
    const mismatched = await createWbGameVideoRouter(context).handle({
      ...request(preparation.upload.url, {
        method: 'PUT',
        query: { chunk_index: ['1'], chunk_count: ['3'] },
        headers: { 'content-type': ['image/png'] },
      }),
      body: new Uint8Array([1]),
    })
    const incomplete = await createWbGameVideoRouter(context).handle(request('media/resources', {
      method: 'POST',
      headers: { 'content-type': ['application/json'] },
      json: {
        game_id: 'router-game',
        media_type: 'image',
        url: preparation.object_url,
        name: 'incomplete',
      },
    }))
    const invented = await createWbGameVideoRouter(context).handle({
      ...request(`media/uploads/${'f'.repeat(32)}`, {
        method: 'PUT',
        query: { chunk_index: ['0'], chunk_count: ['1'] },
        headers: { 'content-type': ['image/png'] },
      }),
      body: new Uint8Array([1]),
    })

    expect(outOfOrder.status).toBe(400)
    expect(first.status).toBe(204)
    expect(duplicate.status).toBe(204)
    expect(conflict.status).toBe(409)
    expect(mismatched.status).toBe(400)
    expect(incomplete.status).toBe(400)
    expect(invented.status).toBe(404)
  })

  test('tombstones and rejects expired upload sessions', async () => {
    const context = createContext()
    const preparedResponse = await createWbGameVideoRouter(context).handle(uploadPrepareRequest(1))
    const prepared = (bodyJson(preparedResponse) as {
      data: { upload_token: string; upload: { url: string; chunk_count: number } }
    }).data
    const sessionPath = await uploadSessionPath(context, prepared.upload_token)
    const sessionBytes = await context.files.read(sessionPath)
    const session = JSON.parse(decoder.decode(sessionBytes!))
    await context.files.write(sessionPath, encoder.encode(JSON.stringify({
      ...session,
      expiresAt: Date.now() - 1,
    })))

    const response = await createWbGameVideoRouter(context).handle({
      ...request(prepared.upload.url, {
        method: 'PUT',
        query: { chunk_index: ['0'], chunk_count: [String(prepared.upload.chunk_count)] },
        headers: { 'content-type': ['image/png'] },
      }),
      body: new Uint8Array([1]),
    })
    const tombstone = JSON.parse(decoder.decode((await context.files.read(sessionPath))!))

    expect(response.status).toBe(409)
    expect(tombstone).toMatchObject({ status: 'expired' })
  })

  test('retries expired chunk cleanup before persisting the terminal session state', async () => {
    const state = createFileState()
    let failNextClear = false
    const context = createContext({
      state,
      beforeWrite(path, bytes) {
        if (failNextClear && path.includes('/chunks/') && bytes.byteLength === 0) {
          failNextClear = false
          throw new Error('injected chunk clear failure')
        }
      },
    })
    const prepared = await prepareImageUpload(context, 1)
    const firstChunk = await putPreparedImage(context, prepared, new Uint8Array([7]))
    const sessionPath = await uploadSessionPath(context, prepared.upload_token)
    const chunkPath = sessionPath.replace('/session.json', '/chunks/0.bin')
    const session = JSON.parse(decoder.decode(state.get(sessionPath)!))
    state.set(sessionPath, encoder.encode(JSON.stringify({
      ...session,
      expiresAt: Date.now() - 1,
    })))

    failNextClear = true
    const failedCleanup = await putPreparedImage(context, prepared, new Uint8Array([7]))
    const afterFailure = JSON.parse(decoder.decode(state.get(sessionPath)!))
    const chunkAfterFailure = state.get(chunkPath)
    const retriedCleanup = await putPreparedImage(context, prepared, new Uint8Array([7]))
    const afterRetry = JSON.parse(decoder.decode(state.get(sessionPath)!))

    expect(firstChunk.status).toBe(204)
    expect(failedCleanup.status).toBe(500)
    expect(afterFailure).toMatchObject({ status: 'open' })
    expect(chunkAfterFailure).toEqual(new Uint8Array([7]))
    expect(retriedCleanup.status).toBe(409)
    expect(afterRetry).toMatchObject({ status: 'expired' })
    expect(state.get(chunkPath)).toEqual(new Uint8Array())
  })

  test('retries finalized chunk cleanup before persisting the terminal session state', async () => {
    const state = createFileState()
    let failNextClear = false
    const context = createContext({
      state,
      beforeWrite(path, bytes) {
        if (failNextClear && path.includes('/chunks/') && bytes.byteLength === 0) {
          failNextClear = false
          throw new Error('injected finalization clear failure')
        }
      },
    })
    const prepared = await prepareImageUpload(context, 1)
    await putPreparedImage(context, prepared, new Uint8Array([9]))
    const sessionPath = await uploadSessionPath(context, prepared.upload_token)
    const chunkPath = sessionPath.replace('/session.json', '/chunks/0.bin')
    const finalizeRequest = () => finalizePreparedImage(context, prepared, 'retry-cleanup')

    failNextClear = true
    const failed = await finalizeRequest()
    const afterFailure = JSON.parse(decoder.decode(state.get(sessionPath)!))
    const hostedAfterFailure = await context.media.list(context.gameId)
    const retried = await finalizeRequest()
    const afterRetry = JSON.parse(decoder.decode(state.get(sessionPath)!))
    const listed = await createWbGameVideoRouter(context).handle(request('media/resources'))
    const hostedAfterRetry = await context.media.list(context.gameId)

    expect(failed.status).toBe(500)
    expect(afterFailure).toMatchObject({ status: 'finalizing', resourceId: expect.any(String) })
    expect(hostedAfterFailure).toHaveLength(1)
    expect(retried.status).toBe(200)
    expect(afterRetry).toMatchObject({ status: 'finalized', resourceId: afterFailure.resourceId })
    expect(state.get(chunkPath)).toEqual(new Uint8Array())
    expect(bodyJson(listed)).toMatchObject({ data: { total: 1 } })
    expect(hostedAfterRetry.map((item) => item.id)).toEqual(
      hostedAfterFailure.map((item) => item.id),
    )
  })

  test('retires an expired uncommitted finalizing upload without retrying media storage', async () => {
    const state = createFileState()
    const media = new InMemoryMediaCapability()
    const putSpy = vi.spyOn(media, 'put')
      .mockRejectedValueOnce(new Error('injected media put failure'))
    const context = createContext({ state, media })
    const prepared = await prepareImageUpload(context, 1)
    await putPreparedImage(context, prepared, new Uint8Array([3]))
    const sessionPath = await uploadSessionPath(context, prepared.upload_token)
    const chunkPath = sessionPath.replace('/session.json', '/chunks/0.bin')

    const failed = await finalizePreparedImage(context, prepared, 'uncommitted')
    const afterFailure = JSON.parse(decoder.decode(state.get(sessionPath)!))
    state.set(sessionPath, encoder.encode(JSON.stringify({
      ...afterFailure,
      expiresAt: Date.now() - 1,
    })))
    const retried = await finalizePreparedImage(context, prepared, 'uncommitted')
    const afterRetry = JSON.parse(decoder.decode(state.get(sessionPath)!))
    const listed = await createWbGameVideoRouter(context).handle(request('media/resources'))

    expect(failed.status).toBe(500)
    expect(afterFailure).toMatchObject({
      status: 'finalizing',
      resourceId: expect.any(String),
    })
    expect(retried.status).toBe(409)
    expect(afterRetry).toMatchObject({ status: 'expired' })
    expect(state.get(chunkPath)).toEqual(new Uint8Array())
    expect(await media.list(context.gameId)).toHaveLength(0)
    expect(bodyJson(listed)).toMatchObject({ data: { total: 0 } })
    expect(putSpy).toHaveBeenCalledTimes(1)
  })

  test('cleans an expired committed finalizing upload without a duplicate media put', async () => {
    const state = createFileState()
    const media = new InMemoryMediaCapability()
    const putSpy = vi.spyOn(media, 'put')
    let failNextClear = false
    const context = createContext({
      state,
      media,
      beforeWrite(path, bytes) {
        if (failNextClear && path.includes('/chunks/') && bytes.byteLength === 0) {
          failNextClear = false
          throw new Error('injected finalization clear failure')
        }
      },
    })
    const prepared = await prepareImageUpload(context, 1)
    await putPreparedImage(context, prepared, new Uint8Array([4]))
    const sessionPath = await uploadSessionPath(context, prepared.upload_token)
    const chunkPath = sessionPath.replace('/session.json', '/chunks/0.bin')

    failNextClear = true
    const failed = await finalizePreparedImage(context, prepared, 'committed')
    const afterFailure = JSON.parse(decoder.decode(state.get(sessionPath)!))
    state.set(sessionPath, encoder.encode(JSON.stringify({
      ...afterFailure,
      expiresAt: Date.now() - 1,
    })))
    const retried = await finalizePreparedImage(context, prepared, 'committed')
    const afterRetry = JSON.parse(decoder.decode(state.get(sessionPath)!))
    const listed = await createWbGameVideoRouter(context).handle(request('media/resources'))

    expect(failed.status).toBe(500)
    expect(afterFailure).toMatchObject({
      status: 'finalizing',
      resourceId: expect.any(String),
    })
    expect(retried.status).toBe(200)
    expect(afterRetry).toMatchObject({
      status: 'finalized',
      resourceId: afterFailure.resourceId,
    })
    expect(state.get(chunkPath)).toEqual(new Uint8Array())
    expect(await media.list(context.gameId)).toHaveLength(1)
    expect(bodyJson(listed)).toMatchObject({ data: { total: 1 } })
    expect(putSpy).toHaveBeenCalledTimes(1)
  })

  test('serializes expiry cleanup behind an in-flight PUT so a chunk cannot revive the session', async () => {
    const state = createFileState()
    let now = 1_000
    let blockChunkWrite = true
    let cleanupRequested = false
    let cleanupRead = false
    let sessionPath = ''
    let resolveChunkWriteStarted!: () => void
    let releaseChunkWrite!: () => void
    const chunkWriteStarted = new Promise<void>((resolve) => {
      resolveChunkWriteStarted = resolve
    })
    const chunkWriteReleased = new Promise<void>((resolve) => {
      releaseChunkWrite = resolve
    })
    const context = createContext({
      state,
      onRead(path) {
        if (cleanupRequested && path === sessionPath) cleanupRead = true
      },
      async beforeWrite(path, bytes) {
        if (blockChunkWrite && path.includes('/chunks/') && bytes.byteLength > 0) {
          blockChunkWrite = false
          resolveChunkWriteStarted()
          await chunkWriteReleased
        }
      },
    })
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      const prepared = await prepareImageUpload(context, 1)
      sessionPath = await uploadSessionPath(context, prepared.upload_token)
      const chunkPath = sessionPath.replace('/session.json', '/chunks/0.bin')
      const session = JSON.parse(decoder.decode(state.get(sessionPath)!))
      state.set(sessionPath, encoder.encode(JSON.stringify({ ...session, expiresAt: now + 1 })))

      const inFlightPut = putPreparedImage(context, prepared, new Uint8Array([5]))
      await chunkWriteStarted
      now += 2
      cleanupRequested = true
      const cleanup = createWbGameVideoRouter(context).handle(
        uploadPrepareRequest(1, { file_name: 'after-expiry.png' }),
      )
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(cleanupRead).toBe(false)
      releaseChunkWrite()
      const [putResponse, cleanupResponse] = await Promise.all([inFlightPut, cleanup])
      const retired = await putPreparedImage(context, prepared, new Uint8Array([5]))

      expect(putResponse.status).toBe(204)
      expect(cleanupResponse.status).toBe(200)
      expect(cleanupRead).toBe(true)
      expect(retired.status).toBe(404)
      expect(state.get(chunkPath)).toEqual(new Uint8Array())
    } finally {
      nowSpy.mockRestore()
      releaseChunkWrite()
    }
  })

  test.each([
    [{ bytes: 20 * 1024 * 1024 + 1 }, 'image size above its 20 MiB limit'],
    [{ file_name: '../escape.png' }, 'unsafe file name'],
    [{ game_id: 'another-game' }, 'unbound game id'],
    [{ mime_type: 'application/octet-stream' }, 'unsupported media type'],
    [{
      file_name: 'large.mp4',
      mime_type: 'video/mp4',
      extension: 'mp4',
      bytes: 100 * 1024 * 1024 + 1,
    }, 'video size above its 100 MiB limit'],
  ])('rejects upload preparation with %s (%s)', async (overrides, _label) => {
    const response = await createWbGameVideoRouter(createContext()).handle(
      uploadPrepareRequest(1, overrides),
    )

    expect(response.status).toBe(400)
    expect(bodyJson(response)).toMatchObject({
      error: { code: 'invalid_input', target: 'wb-game-video', retryable: false },
    })
  })

  test('implements the exact Kino batch, update, delete, and playback contracts', async () => {
    const context = createContext()
    const prepare = async (name: string, byte: number) => {
      const prepared = await createWbGameVideoRouter(context).handle(
        uploadPrepareRequest(1, { file_name: name }),
      )
      const value = (bodyJson(prepared) as {
        data: { upload: { url: string; chunk_count: number }; object_url: string }
      }).data
      const uploaded = await createWbGameVideoRouter(context).handle({
        ...request(value.upload.url, {
          method: 'PUT',
          query: { chunk_index: ['0'], chunk_count: [String(value.upload.chunk_count)] },
          headers: { 'content-type': ['image/png'] },
        }),
        body: new Uint8Array([byte]),
      })
      expect(uploaded.status).toBe(204)
      return value.object_url
    }
    const firstUrl = await prepare('first.png', 1)
    const secondUrl = await prepare('second.png', 2)

    const batch = await createWbGameVideoRouter(context).handle(request('media/resources/batch', {
      method: 'POST',
      headers: { 'content-type': ['application/json'] },
      json: {
        game_id: 'router-game',
        resources: [
          { media_type: 'image', url: firstUrl, name: 'first', type: 'UPLOAD' },
          { media_type: 'image', url: secondUrl, name: 'second', type: 'UPLOAD' },
        ],
      },
    }))
    const batchData = (bodyJson(batch) as {
      data: { created_count: number; skipped_count: number; items: Array<{ resource_id: string }> }
    }).data
    const uploadList = await createWbGameVideoRouter(context).handle(request('media/resources', {
      query: { media_type: ['image'], type: ['UPLOAD'] },
    }))
    const otherList = await createWbGameVideoRouter(context).handle(request('media/resources', {
      query: { media_type: ['image'], type: ['GENERATION'] },
    }))
    const id = batchData.items[0]!.resource_id
    const fetched = await createWbGameVideoRouter(context).handle(request(`media/resources/${encodeURIComponent(id)}`))
    const current = (bodyJson(fetched) as {
      data: {
        resource_id: string
        game_id: string
        media_type: string
        url: string
        type?: string
        source?: string
        source_meta?: Record<string, unknown>
      }
    }).data
    const updated = await createWbGameVideoRouter(context).handle(request(`media/resources/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': ['application/json'] },
      json: {
        resource_id: current.resource_id,
        game_id: current.game_id,
        media_type: current.media_type,
        url: current.url,
        name: 'renamed',
        type: current.type,
        source: current.source,
        source_meta: current.source_meta,
      },
    }))
    const playback = await createWbGameVideoRouter(context).handle(
      request(`media/resources/${encodeURIComponent(id)}/content`),
    )
    const removed = await createWbGameVideoRouter(context).handle(
      request(`media/resources/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    )

    expect(batchData).toMatchObject({ created_count: 2, skipped_count: 0 })
    expect(batchData.items).toHaveLength(2)
    expect(bodyJson(uploadList)).toMatchObject({ data: { total: 2 } })
    expect(bodyJson(otherList)).toMatchObject({ data: { total: 0 } })
    expect(bodyJson(updated)).toMatchObject({ data: { resource_id: id, name: 'renamed' } })
    expect(playback.body).toEqual(new Uint8Array([1]))
    expect(removed).toMatchObject({ status: 204, body: new Uint8Array() })
  })

  test('deduplicates repeated prepared uploads in a batch and caps page_size at 100', async () => {
    const context = createContext()
    const preparedResponse = await createWbGameVideoRouter(context).handle(uploadPrepareRequest(1))
    const prepared = (bodyJson(preparedResponse) as {
      data: { upload: { url: string; chunk_count: number }; object_url: string }
    }).data
    await createWbGameVideoRouter(context).handle({
      ...request(prepared.upload.url, {
        method: 'PUT',
        query: { chunk_index: ['0'], chunk_count: [String(prepared.upload.chunk_count)] },
        headers: { 'content-type': ['image/png'] },
      }),
      body: new Uint8Array([1]),
    })
    const batch = await createWbGameVideoRouter(context).handle(request('media/resources/batch', {
      method: 'POST',
      headers: { 'content-type': ['application/json'] },
      json: {
        game_id: 'router-game',
        resources: [
          { media_type: 'image', url: prepared.object_url, name: 'first' },
          { media_type: 'image', url: prepared.object_url, name: 'duplicate' },
        ],
      },
    }))
    const oversizedPage = await createWbGameVideoRouter(context).handle(request('media/resources', {
      query: { page_size: ['101'] },
    }))

    expect(bodyJson(batch)).toMatchObject({
      data: { created_count: 1, skipped_count: 1, items: [expect.any(Object)] },
    })
    expect(oversizedPage.status).toBe(400)
  })

  test('preserves the logical resource id for an authorized replacement', async () => {
    const context = createContext()
    const original = await createWbGameVideoRouter(context).handle({
      ...request('media/resources', {
        method: 'POST',
        headers: {
          'content-type': ['image/png'],
          'x-workbench-media-name': ['original.png'],
          'x-workbench-media-type': ['image'],
        },
      }),
      body: encoder.encode('old'),
    })
    const id = (bodyJson(original) as { data: { resource_id: string } }).data.resource_id
    const preparedResponse = await createWbGameVideoRouter(context).handle(uploadPrepareRequest(3, {
      file_name: 'replacement.png',
      client_resource_id: id,
      replace_existing: true,
    }))
    const prepared = (bodyJson(preparedResponse) as {
      data: { upload: { url: string; chunk_count: number }; object_url: string }
    }).data
    await createWbGameVideoRouter(context).handle({
      ...request(prepared.upload.url, {
        method: 'PUT',
        query: { chunk_index: ['0'], chunk_count: [String(prepared.upload.chunk_count)] },
        headers: { 'content-type': ['image/png'] },
      }),
      body: encoder.encode('new'),
    })
    const replaced = await createWbGameVideoRouter(context).handle(request('media/resources', {
      method: 'POST',
      headers: { 'content-type': ['application/json'] },
      json: {
        game_id: 'router-game',
        media_type: 'image',
        url: prepared.object_url,
        name: 'replacement',
      },
    }))
    const listed = await createWbGameVideoRouter(context).handle(request('media/resources'))
    const renamed = await createWbGameVideoRouter(context).handle(request(
      `media/resources/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        headers: { 'content-type': ['application/json'] },
        json: { name: 'replacement-renamed' },
      },
    ))
    const content = await createWbGameVideoRouter(context).handle(
      request(`media/resources/${encodeURIComponent(id)}/content`),
    )
    const missing = await createWbGameVideoRouter(context).handle(uploadPrepareRequest(1, {
      client_resource_id: 'missing',
      replace_existing: true,
    }))

    expect(bodyJson(replaced)).toMatchObject({ data: { resource_id: id } })
    expect(bodyJson(listed)).toMatchObject({ data: { total: 1 } })
    expect(renamed.status).toBe(200)
    expect(bodyJson(renamed)).toMatchObject({
      data: { resource_id: id, name: 'replacement-renamed' },
    })
    expect(decoder.decode(content.body)).toBe('new')
    expect(missing.status).toBe(400)
  })

  test('does not alias a replacement upload to another same-named host resource', async () => {
    const state = createFileState()
    const context = createContext({ state })
    const original = await directImageUpload(
      context,
      'original.png',
      encoder.encode('original-body'),
    )
    const replacedId = responseResourceId(original)
    const protectedHosted = await context.media.put(context.gameId, {
      filename: 'alias.png',
      contentType: 'image/png',
      bytes: encoder.encode('protected-body'),
    })
    const indexPath = 'assets/wb-game-video-media.json'
    const index = JSON.parse(decoder.decode(state.get(indexPath)!)) as Array<Record<string, unknown>>
    index.push({
      resource_id: protectedHosted.id,
      media_type: 'image',
      name: 'alias.png',
      created_at: 1,
      updated_at: 1,
      deleted: false,
    })
    state.set(indexPath, encoder.encode(JSON.stringify(index)))
    const protectedId = protectedHosted.id
    const prepared = await prepareImageUpload(context, 8, {
      file_name: 'alias.png',
      client_resource_id: replacedId,
      replace_existing: true,
    })
    const chunk = await putPreparedImage(context, prepared, encoder.encode('new-body'))
    const replaced = await finalizePreparedImage(context, prepared, 'replacement')
    const protectedContent = await createWbGameVideoRouter(context).handle(
      request(`media/resources/${encodeURIComponent(protectedId)}/content`),
    )
    const replacementContent = await createWbGameVideoRouter(context).handle(
      request(`media/resources/${encodeURIComponent(replacedId)}/content`),
    )

    expect(chunk.status).toBe(204)
    expect(replaced.status).toBe(200)
    expect(bodyJson(replaced)).toMatchObject({ data: { resource_id: replacedId } })
    expect(decoder.decode(protectedContent.body)).toBe('protected-body')
    expect(decoder.decode(replacementContent.body)).toBe('new-body')
  })

  test('revalidates a replacement under the index lock before creating host media', async () => {
    const context = createContext()
    const original = await directImageUpload(
      context,
      'original.png',
      encoder.encode('original-body'),
    )
    const id = responseResourceId(original)
    const prepared = await prepareImageUpload(context, 8, {
      file_name: 'replacement.png',
      client_resource_id: id,
      replace_existing: true,
    })
    await putPreparedImage(context, prepared, encoder.encode('new-body'))
    const removed = await createWbGameVideoRouter(context).handle(
      request(`media/resources/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    )
    const before = await context.media.list(context.gameId)
    const finalized = await finalizePreparedImage(context, prepared, 'replacement')
    const after = await context.media.list(context.gameId)
    const originalBody = await context.media.read(context.gameId, before[0]!.id)

    expect(removed.status).toBe(204)
    expect(finalized.status).toBe(400)
    expect(after.map((item) => item.id)).toEqual(before.map((item) => item.id))
    expect(decoder.decode(originalBody!.bytes)).toBe('original-body')
  })

  test('caps active upload sessions and their declared per-game size', async () => {
    const context = createContext()
    const statuses: number[] = []
    for (let index = 0; index < 17; index += 1) {
      const response = await createWbGameVideoRouter(context).handle(
        uploadPrepareRequest(1, { file_name: `upload-${index}.png` }),
      )
      statuses.push(response.status)
    }

    expect(statuses.slice(0, 16)).toEqual(new Array(16).fill(200))
    expect(statuses[16]).toBe(400)
  })

  test('reuses bounded upload files and keeps preparation scans constant across sequential uploads', async () => {
    const state = createFileState()
    let countPreparationReads = false
    let preparationReads = 0
    const context = createContext({
      state,
      onRead(path) {
        if (countPreparationReads && path.startsWith('assets/.wb-game-video-uploads/')) {
          preparationReads += 1
        }
      },
    })
    const readCounts: number[] = []

    for (let index = 0; index < 40; index += 1) {
      preparationReads = 0
      countPreparationReads = true
      const prepared = await prepareImageUpload(
        context,
        1,
        { file_name: `sequential-${index}.png` },
      )
      countPreparationReads = false
      readCounts.push(preparationReads)
      const uploaded = await putPreparedImage(context, prepared, new Uint8Array([index]))
      const finalized = await finalizePreparedImage(
        context,
        prepared,
        `sequential-${index}`,
      )
      expect(uploaded.status).toBe(204)
      expect(finalized.status).toBe(200)
    }

    const uploadPaths = [...state.keys()]
      .filter((path) => path.startsWith('assets/.wb-game-video-uploads/'))
    expect(uploadPaths.length).toBeLessThanOrEqual(18)
    expect(Math.max(...readCounts) - Math.min(...readCounts)).toBeLessThanOrEqual(1)
  })

  test('treats a token from a reused upload slot as retired instead of corrupt state', async () => {
    const context = createContext()
    const first = await prepareImageUpload(context, 1)
    await putPreparedImage(context, first, new Uint8Array([1]))
    await finalizePreparedImage(context, first, 'first')
    await prepareImageUpload(context, 1, { file_name: 'second.png' })

    const retired = await putPreparedImage(context, first, new Uint8Array([1]))

    expect(retired.status).toBe(404)
  })

  test('prevents a retired token from clearing a new upload in the reused slot', async () => {
    const state = createFileState()
    const newSessionWrite = deferred()
    const releaseNewSessionWrite = deferred()
    const releaseRetiredClear = deferred()
    let firstUploadId = ''
    let gateNewSessionWrite = false
    let gateRetiredClear = false
    const context = createContext({
      state,
      async beforeWrite(path, bytes) {
        if (gateNewSessionWrite && path.endsWith('/session.json')) {
          const session = JSON.parse(decoder.decode(bytes)) as { id?: unknown; status?: unknown }
          if (session.id !== firstUploadId && session.status === 'open') {
            gateNewSessionWrite = false
            newSessionWrite.resolve()
            await releaseNewSessionWrite.promise
          }
        }
        if (gateRetiredClear && path.includes('/chunks/') && bytes.byteLength === 0) {
          gateRetiredClear = false
          await releaseRetiredClear.promise
        }
      },
    })
    try {
      const first = await prepareImageUpload(context, 1, { file_name: 'first.png' })
      firstUploadId = first.upload_token
      await putPreparedImage(context, first, new Uint8Array([1]))
      const firstFinalized = await finalizePreparedImage(context, first, 'first')
      expect(firstFinalized.status).toBe(200)

      gateNewSessionWrite = true
      const preparingSecond = prepareImageUpload(context, 1, { file_name: 'second.png' })
      await newSessionWrite.promise
      gateRetiredClear = true
      const retiredRetry = finalizePreparedImage(context, first, 'first')
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      releaseNewSessionWrite.resolve()
      const second = await preparingSecond
      const secondPut = await putPreparedImage(context, second, encoder.encode('B'))
      releaseRetiredClear.resolve()
      await retiredRetry
      const secondFinalized = await finalizePreparedImage(context, second, 'second')
      const secondId = secondFinalized.status === 200
        ? responseResourceId(secondFinalized)
        : 'missing'
      const secondContent = await createWbGameVideoRouter(context).handle(
        request(`media/resources/${encodeURIComponent(secondId)}/content`),
      )

      expect(secondPut.status).toBe(204)
      expect(secondFinalized.status).toBe(200)
      expect(decoder.decode(secondContent.body)).toBe('B')
    } finally {
      releaseNewSessionWrite.resolve()
      releaseRetiredClear.resolve()
    }
  })

  test('serves a generated registry asset through its trusted media reference', async () => {
    const context = createContext()
    const hosted = await context.media.put(context.gameId, {
      filename: 'generated.png', contentType: 'image/png', bytes: encoder.encode('generated'),
    })
    await context.files.write('assets/manifest.json', encoder.encode(JSON.stringify({
      version: 2,
      assets: [{
        id: 'generated-1', kind: 'image', productionType: 'shot_image', status: 'ready',
        provider: { kind: 'local', ref: hosted.id },
        meta: { hostMedia: { provenance: 'workbench-media-capability', assetId: hosted.id } },
        createdAt: 1, updatedAt: 1,
      }],
    })))
    const router = createWbGameVideoRouter(context)

    const response = await router.handle(request('media/assets/generated-1'))

    expect(response.status).toBe(200)
    expect(response.headers?.['content-type']).toBe('image/png')
    expect(decoder.decode(response.body)).toBe('generated')
  })

  test('rejects a forged generated registry media reference', async () => {
    const context = createContext()
    const hosted = await context.media.put(context.gameId, {
      filename: 'private.png', contentType: 'image/png', bytes: encoder.encode('private'),
    })
    await context.files.write('assets/manifest.json', encoder.encode(JSON.stringify({
      version: 2,
      assets: [{
        id: 'forged', kind: 'image', productionType: 'shot_image', status: 'ready',
        provider: { kind: 'local', ref: hosted.id },
        meta: {
          hostMedia: {
            provenance: 'workbench-media-capability',
            assetId: 'different-id',
          },
        },
        createdAt: 1, updatedAt: 1,
      }],
    })))

    const response = await createWbGameVideoRouter(context).handle(request('media/assets/forged'))

    expect(response.status).toBe(404)
  })

  test('preserves raw request headers and binary body semantics for bundled ranges', async () => {
    const router = createRouter()
    const response = await router.handle(request('media/bundled/dazhao', {
      headers: { range: ['bytes=0-3'] },
    }))

    expect(response.status).toBe(206)
    expect(response.body).toHaveLength(4)
    expect(response.headers?.['content-range']).toMatch(/^bytes 0-3\/\d+$/)
  })

  test('normalizes an invalid bundled range without losing range headers', async () => {
    const router = createRouter()
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
