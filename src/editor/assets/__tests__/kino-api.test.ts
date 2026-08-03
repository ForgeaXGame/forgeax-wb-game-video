import { describe, expect, it, vi } from 'vitest'
import {
  createKinoVideoClient,
  KinoClientError,
  type KinoResourceDTO,
  type WorkbenchHostMediaClient,
} from '../kino-api'

const FIXTURE_BYTES = 6

function envelope<T>(data: T) {
  return { code: 0, message: 'ok', data }
}

function makeFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>,
) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(input, init)),
  ) as typeof fetch
}

function makeHost(
  fetch: WorkbenchHostMediaClient['extension']['fetch'],
  url: WorkbenchHostMediaClient['extension']['url'] = (path) => `https://host.test/${path}`,
): WorkbenchHostMediaClient {
  return { extension: { fetch, url } }
}

function dto(overrides: Partial<KinoResourceDTO> = {}): KinoResourceDTO {
  return {
    resource_id: 'res-1',
    game_id: 'demo',
    media_type: 'video',
    url: 'https://host.test/media/resources/res-1/content',
    created_at: 1,
    updated_at: 2,
    ...overrides,
  }
}

describe('createKinoVideoClient', () => {
  it('uses Host media routes and does not send a game selector', async () => {
    const fetchImpl = makeFetch((input, init) => {
      expect(init?.credentials).toBe('include')
      expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' })
      expect(String(input)).toBe('media/resources?media_type=video&page=1&page_size=20')
      return new Response(JSON.stringify(envelope({
        items: [dto({ game_id: undefined as never })],
        total: 1,
        page: 1,
        page_size: 20,
      })), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const client = createKinoVideoClient({ fetch: fetchImpl })

    const result = await client.list({ game_id: 'demo', page: 1, page_size: 20 })
    expect(result.items[0]?.game_id).toBe('demo')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('uses the handshake-bound host client by default', async () => {
    const hostFetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('media/resources/res-1')
      return new Response(JSON.stringify(envelope(dto())), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const url = vi.fn((path: string) => `https://host.test/${path}`)
    const client = createKinoVideoClient({ host: makeHost(hostFetch, url) })

    expect(client.playbackUrl('res-1', 'demo')).toBe('https://host.test/media/resources/res-1/content')
    expect(url).toHaveBeenCalledWith('media/resources/res-1/content')
    await client.get('res-1', 'demo')
    expect(hostFetch).toHaveBeenCalledOnce()
  })

  it('prepares uploads without game_id and preserves Host chunk metadata', async () => {
    const fetchImpl = makeFetch((_input, init) => {
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        file_name: 'clip.mp4',
        mime_type: 'video/mp4',
        bytes: FIXTURE_BYTES,
        extension: 'mp4',
      })
      return new Response(JSON.stringify(envelope({
        upload: {
          method: 'PUT',
          url: 'media/uploads/token',
          headers: { 'content-type': 'video/mp4' },
          expires_at: '2099-01-01T00:00:00.000Z',
          chunk_size: 512,
          chunk_count: 2,
        },
        object_url: 'workbench-upload:token',
        upload_token: 'token',
      })), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const client = createKinoVideoClient({ fetch: fetchImpl })

    const prepared = await client.prepareUpload({
      game_id: 'demo',
      file_name: 'clip.mp4',
      mime_type: 'video/mp4',
      bytes: FIXTURE_BYTES,
      extension: 'mp4',
    })
    expect(prepared.upload.chunk_count).toBe(2)
    expect(prepared.object_url).toBe('workbench-upload:token')
  })

  it('strips game_id from create, batch, and update bodies', async () => {
    const fetchImpl = makeFetch((input, init) => {
      expect(init?.method).toBe('POST')
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body).not.toHaveProperty('game_id')
      if (String(input).endsWith('/batch')) {
        expect(body).toEqual({ resources: [{ media_type: 'video', url: 'https://object', name: 'a.mp4' }] })
        return new Response(JSON.stringify(envelope({ created_count: 1, skipped_count: 0, items: [] })), {
          status: 200, headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify(envelope(dto({ resource_id: 'new' }))), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    })
    const client = createKinoVideoClient({ fetch: fetchImpl })
    await client.create({ game_id: 'demo', media_type: 'video', url: 'https://object', name: 'a.mp4' })
    await client.batch({ game_id: 'demo', resources: [{ media_type: 'video', url: 'https://object', name: 'a.mp4' }] })

    const updateFetch = makeFetch((_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body).not.toHaveProperty('game_id')
      return new Response(JSON.stringify(envelope(dto({ name: 'renamed.mp4' }))), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    })
    await createKinoVideoClient({ fetch: updateFetch }).update('res-1', {
      resource_id: 'res-1', game_id: 'demo', media_type: 'video', url: 'https://object', name: 'renamed.mp4',
    })
  })

  it('accepts a Host 204 delete response', async () => {
    const fetchImpl = makeFetch((input, init) => {
      expect(String(input)).toBe('media/resources/res%2F1')
      expect(init?.method).toBe('DELETE')
      return new Response(null, { status: 204 })
    })
    await createKinoVideoClient({ fetch: fetchImpl }).delete('res/1', 'demo')
  })

  it('maps HTTP, malformed, and network failures to KinoClientError', async () => {
    const errorClient = createKinoVideoClient({
      fetch: makeFetch(() => new Response(
        '{"code":400,"message":"Invalid upload size","data":null,"error_code":"invalid_upload_size","debug":"secret"}',
        { status: 400, headers: { 'content-type': 'application/json' } },
      )),
    })
    await expect(errorClient.list({ game_id: 'demo' })).rejects.toMatchObject({
      name: 'KinoClientError', status: 400, errorCode: 'invalid_upload_size', message: 'Invalid upload size',
    })
    await expect(errorClient.list({ game_id: 'demo' })).rejects.not.toSatisfy((error: Error) => error.message.includes('secret'))

    const malformed = createKinoVideoClient({ fetch: makeFetch(() => new Response('not-json', { status: 200 })) })
    await expect(malformed.list({ game_id: 'demo' })).rejects.toMatchObject({ status: 502, errorCode: 'upstream_unavailable' })

    const network = createKinoVideoClient({ fetch: vi.fn(() => Promise.reject(new Error('offline'))) as typeof fetch })
    await expect(network.list({ game_id: 'demo' })).rejects.toMatchObject({ status: 502, errorCode: 'network_error' })
  })
})
