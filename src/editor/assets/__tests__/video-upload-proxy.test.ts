import { Readable, PassThrough } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  createVideoUploadProxyHandler,
  parseAllowedExtraHosts,
  validateVideoUploadTargetUrl,
} from '../../../../server/video-upload-proxy'
import {
  createDefaultXhrUploadTransport,
  resolveUploadTransportUrl,
} from '../video-upload'

const COS_SIGNED =
  'https://bucket.cos.ap-guangzhou.myqcloud.com/path/to/key.mp4?q-sign-algorithm=sha1&q-ak=AKIDxxx&q-sign-time=1;2&q-key-time=1;2&q-header-list=host&q-url-param-list=&q-signature=abc123'

const CUSTOM_ENDPOINT_SIGNED =
  'https://bucket.example.internal/videos/demo/key.mp4?q-sign-algorithm=sha1&q-ak=AKIDxxx&q-sign-time=1;2&q-key-time=1;2&q-header-list=host&q-url-param-list=&q-signature=abc123'

const COS_TENCENTCOS_PUBLIC_SIGNED =
  'https://bucket.cos.ap-guangzhou.tencentcos.cn/path/to/key.mp4?q-sign-algorithm=sha1&q-ak=AKIDxxx&q-sign-time=1;2&q-key-time=1;2&q-header-list=host&q-url-param-list=&q-signature=abc123'

const S3_SIGNED =
  'https://bucket.s3.us-east-1.amazonaws.com/key.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAxxx%2F20260101%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Signature=deadbeef&X-Amz-Date=20260101T000000Z'

describe('validateVideoUploadTargetUrl', () => {
  it('accepts signed public Tencent COS HTTPS URLs', () => {
    expect(validateVideoUploadTargetUrl(COS_SIGNED, []).ok).toBe(true)
    expect(validateVideoUploadTargetUrl(COS_TENCENTCOS_PUBLIC_SIGNED, []).ok).toBe(true)
  })

  it('does not treat internal-style tencentcos hostnames as built-in public COS', () => {
    const internalStyleHost = `bucket.${['cos', 'internal'].join('-')}.ap-guangzhou.tencentcos.cn`
    const signedUrl = `https://${internalStyleHost}/videos/demo/key.mp4?q-sign-algorithm=sha1&q-ak=AKIDxxx&q-sign-time=1;2&q-key-time=1;2&q-header-list=host&q-url-param-list=&q-signature=abc123`

    const rejected = validateVideoUploadTargetUrl(signedUrl, [])
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) {
      expect(rejected.reason).toBe('host_not_allowed')
    }

    expect(validateVideoUploadTargetUrl(signedUrl, [internalStyleHost]).ok).toBe(true)
  })

  it('rejects custom-endpoint signed hosts unless explicitly allowlisted', () => {
    const rejected = validateVideoUploadTargetUrl(CUSTOM_ENDPOINT_SIGNED, [])
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) {
      expect(rejected.reason).toBe('host_not_allowed')
    }

    expect(
      validateVideoUploadTargetUrl(CUSTOM_ENDPOINT_SIGNED, ['bucket.example.internal']).ok,
    ).toBe(true)
  })

  it('rejects bare COS service endpoints and unsigned tencentcos hosts', () => {
    const bareCustomEndpoint =
      'https://storage.example.com/videos/demo/key.mp4?q-sign-algorithm=sha1&q-ak=AKIDxxx&q-sign-time=1;2&q-key-time=1;2&q-header-list=host&q-url-param-list=&q-signature=abc123'
    expect(validateVideoUploadTargetUrl(bareCustomEndpoint, []).ok).toBe(false)

    const barePublicEndpoint =
      'https://cos.ap-guangzhou.tencentcos.cn/bucket/key.mp4?q-sign-algorithm=sha1&q-ak=AKIDxxx&q-sign-time=1;2&q-key-time=1;2&q-header-list=host&q-url-param-list=&q-signature=abc123'
    expect(validateVideoUploadTargetUrl(barePublicEndpoint, []).ok).toBe(false)

    expect(
      validateVideoUploadTargetUrl(
        'https://evil.tencentcos.cn/key.mp4?q-sign-algorithm=sha1&q-ak=AKIDxxx&q-signature=abc123',
        [],
      ).ok,
    ).toBe(false)
  })

  it('accepts signed AWS S3 HTTPS URLs', () => {
    expect(validateVideoUploadTargetUrl(S3_SIGNED, []).ok).toBe(true)
  })

  it('rejects HTTP, missing signature params, userinfo, fragment, and unknown hosts', () => {
    const httpCos = COS_SIGNED.replace('https://', 'http://')
    expect(validateVideoUploadTargetUrl(httpCos, []).ok).toBe(false)

    const missingSig = COS_SIGNED.replace('q-signature=abc123', '')
    expect(validateVideoUploadTargetUrl(missingSig, []).ok).toBe(false)

    const userinfo = COS_SIGNED.replace('https://', 'https://user:pass@')
    expect(validateVideoUploadTargetUrl(userinfo, []).ok).toBe(false)

    const fragment = `${COS_SIGNED}#frag`
    expect(validateVideoUploadTargetUrl(fragment, []).ok).toBe(false)

    expect(
      validateVideoUploadTargetUrl('https://evil.example.com/upload?q-sign-algorithm=x&q-ak=a&q-signature=b', [])
        .ok,
    ).toBe(false)
  })

  it('rejects private and localhost hosts unless explicitly allowlisted', () => {
    const localCos =
      'https://127.0.0.1/path?q-sign-algorithm=sha1&q-ak=a&q-signature=b'
    expect(validateVideoUploadTargetUrl(localCos, []).ok).toBe(false)

    const privateCos =
      'https://10.0.0.5/path?q-sign-algorithm=sha1&q-ak=a&q-signature=b'
    expect(validateVideoUploadTargetUrl(privateCos, []).ok).toBe(false)

    expect(validateVideoUploadTargetUrl(localCos, ['127.0.0.1']).ok).toBe(true)
  })

  it('allows exact custom hosts from VIDEO_UPLOAD_PROXY_ALLOWED_HOSTS with COS or S3 signatures', () => {
    const s3Custom =
      'https://uploads.example.com/file?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=x&X-Amz-Signature=y'
    expect(validateVideoUploadTargetUrl(s3Custom, ['uploads.example.com']).ok).toBe(true)
    expect(validateVideoUploadTargetUrl(s3Custom, ['other.example.com']).ok).toBe(false)

    const cosCustom =
      'https://uploads.example.com/file?q-sign-algorithm=sha1&q-ak=AKIDxxx&q-signature=abc123'
    expect(validateVideoUploadTargetUrl(cosCustom, ['uploads.example.com']).ok).toBe(true)

    const unsignedCustom = 'https://uploads.example.com/file'
    const unsignedResult = validateVideoUploadTargetUrl(unsignedCustom, ['uploads.example.com'])
    expect(unsignedResult.ok).toBe(false)
    if (!unsignedResult.ok) {
      expect(unsignedResult.reason).toBe('missing_signature')
    }
  })

  it('parseAllowedExtraHosts splits comma-separated exact hostnames', () => {
    expect(parseAllowedExtraHosts(' a.example.com ,b.example.com ')).toEqual([
      'a.example.com',
      'b.example.com',
    ])
    expect(parseAllowedExtraHosts(undefined)).toEqual([])
  })
})

describe('createVideoUploadProxyHandler', () => {
  type FetchCall = {
    url: string
    init: RequestInit & { duplex?: string }
  }

  function mockReq(options: {
    method?: string
    url?: string
    headers?: Record<string, string | string[] | undefined>
    body?: Buffer | Iterable<string | Buffer>
  }): IncomingMessage {
    const passthrough = new PassThrough()
    const stream = passthrough as unknown as IncomingMessage
    stream.method = options.method ?? 'PUT'
    stream.url = options.url ?? `/?url=${encodeURIComponent(COS_SIGNED)}`
    stream.headers = options.headers ?? { 'content-type': 'video/mp4' }

    queueMicrotask(() => {
      const chunks =
        options.body instanceof Buffer
          ? [options.body]
          : options.body
            ? [...(options.body as Iterable<string | Buffer>)]
            : []
      for (const chunk of chunks) {
        passthrough.write(chunk)
      }
      passthrough.end()
    })

    return stream
  }

  function mockRes(): ServerResponse & { body: Buffer; headersOut: Record<string, string | number | string[]> } {
    const headersOut: Record<string, string | number | string[]> = {}
    const chunks: Buffer[] = []
    const res = {
      statusCode: 200,
      headersOut,
      body: Buffer.alloc(0),
      setHeader(name: string, value: string | number | string[]) {
        headersOut[name.toLowerCase()] = value
      },
      write(chunk: Buffer | string) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        return true
      },
      end(chunk?: Buffer | string) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        res.body = Buffer.concat(chunks)
      },
    }
    return res as unknown as ServerResponse & { body: Buffer; headersOut: Record<string, string | number | string[]> }
  }

  it('forwards PUT with full target URL, streamed body, and only safe upload headers', async () => {
    const fetchCalls: FetchCall[] = []
    let bodyWasStream = false

    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body
      if (body && typeof (body as unknown as NodeJS.ReadableStream).on === 'function') {
        bodyWasStream = true
        const readable = body as unknown as NodeJS.ReadableStream
        const collected: Buffer[] = []
        await new Promise<void>((resolve, reject) => {
          readable.on('data', (c) => collected.push(Buffer.from(c)))
          readable.on('end', () => resolve())
          readable.on('error', reject)
        })
        expect(Buffer.concat(collected).toString()).toBe('chunk-achunk-b')
      } else {
        throw new Error('expected streamed body, not buffered')
      }

      fetchCalls.push({ url: String(_input), init: init as FetchCall['init'] })
      return new Response('ok', {
        status: 200,
        headers: {
          etag: '"abc"',
          'content-type': 'video/mp4',
          'x-cos-request-id': 'req-1',
          'set-cookie': 'ignored=1',
        },
      })
    })

    const handler = createVideoUploadProxyHandler({ fetchImpl: fetchImpl as typeof fetch })
    const req = mockReq({
      body: ['chunk-a', 'chunk-b'],
      headers: {
        'content-type': 'video/mp4',
        'x-cos-acl': 'private',
        host: 'localhost:15185',
        origin: 'http://localhost:15185',
        cookie: 'session=1',
        authorization: 'Bearer bad',
        'content-length': '999',
        connection: 'keep-alive',
      },
    })
    const res = mockRes()
    const next = vi.fn()

    await new Promise<void>((resolve) => {
      handler(req, res, () => {
        next()
        resolve()
      })
      setTimeout(resolve, 50)
    })

    expect(next).not.toHaveBeenCalled()
    expect(bodyWasStream).toBe(true)
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0]!.url).toBe(COS_SIGNED)
    expect(fetchCalls[0]!.init.method).toBe('PUT')
    expect(fetchCalls[0]!.init.redirect).toBe('manual')
    expect(fetchCalls[0]!.init.credentials).toBe('omit')
    expect(fetchCalls[0]!.init.duplex).toBe('half')

    const forwarded = fetchCalls[0]!.init.headers as Record<string, string>
    expect(forwarded['content-type']).toBe('video/mp4')
    expect(forwarded['x-cos-acl']).toBe('private')
    expect(forwarded.host).toBeUndefined()
    expect(forwarded.origin).toBeUndefined()
    expect(forwarded.cookie).toBeUndefined()
    expect(forwarded.authorization).toBeUndefined()
    expect(forwarded['content-length']).toBeUndefined()

    expect(res.statusCode).toBe(200)
    expect(res.headersOut.etag).toBe('"abc"')
    expect(res.headersOut['content-type']).toBe('video/mp4')
    expect(res.headersOut['x-cos-request-id']).toBe('req-1')
    expect(res.headersOut['set-cookie']).toBeUndefined()
  })

  it('relays upstream S3 response headers and caps error bodies', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('x'.repeat(9000), {
        status: 403,
        headers: {
          'content-type': 'application/xml',
          'x-amz-request-id': 'amz-req',
        },
      }),
    )
    const handler = createVideoUploadProxyHandler({ fetchImpl: fetchImpl as typeof fetch })
    const req = mockReq({ url: `/?url=${encodeURIComponent(S3_SIGNED)}` })
    const res = mockRes()
    const next = vi.fn()

    await new Promise<void>((resolve) => {
      handler(req, res, next)
      setTimeout(resolve, 50)
    })

    expect(res.statusCode).toBe(403)
    expect(res.headersOut['x-amz-request-id']).toBe('amz-req')
    expect(res.body.length).toBeLessThanOrEqual(8192)
    expect(res.body.toString()).not.toContain('X-Amz-Signature')
  })

  it('rejects non-PUT, invalid targets, and returns 502 on network errors without leaking signed URLs', async () => {
    const handler = createVideoUploadProxyHandler({
      fetchImpl: vi.fn(async () => {
        throw new Error(`network down ${COS_SIGNED}`)
      }) as typeof fetch,
    })

    const optionsReq = mockReq({ method: 'OPTIONS' })
    const optionsRes = mockRes()
    await new Promise<void>((resolve) => {
      handler(optionsReq, optionsRes, vi.fn())
      setTimeout(resolve, 20)
    })
    expect(optionsRes.statusCode).toBe(204)
    expect(optionsRes.headersOut.allow).toBe('PUT')

    const getReq = mockReq({ method: 'GET' })
    const getRes = mockRes()
    await new Promise<void>((resolve) => {
      handler(getReq, getRes, vi.fn())
      setTimeout(resolve, 20)
    })
    expect(getRes.statusCode).toBe(405)

    const badTargetReq = mockReq({
      url: '/?url=https%3A%2F%2Fevil.example.com%2Fx',
    })
    const badTargetRes = mockRes()
    await new Promise<void>((resolve) => {
      handler(badTargetReq, badTargetRes, vi.fn())
      setTimeout(resolve, 20)
    })
    expect(badTargetRes.statusCode).toBe(400)
    expect(badTargetRes.body.toString()).not.toContain('evil.example.com')

    const networkReq = mockReq({ url: `/?url=${encodeURIComponent(COS_SIGNED)}` })
    const networkRes = mockRes()
    await new Promise<void>((resolve) => {
      handler(networkReq, networkRes, vi.fn())
      setTimeout(resolve, 50)
    })
    expect(networkRes.statusCode).toBe(502)
    expect(networkRes.body.toString()).not.toContain('q-signature')
    expect(networkRes.body.toString()).not.toContain(COS_SIGNED)
  })
})

describe('resolveUploadTransportUrl', () => {
  it('rewrites cross-origin signed URLs on dev port 15185 to the local proxy', () => {
    const origin = 'http://localhost:15185'
    const resolved = resolveUploadTransportUrl(COS_SIGNED, { origin })
    expect(resolved).toBe(
      `${origin}/__video-upload-proxy?url=${encodeURIComponent(COS_SIGNED)}`,
    )
  })

  it('keeps same-origin, EA local, and non-15185 URLs unchanged', () => {
    const devOrigin = 'http://localhost:15185'
    const sameOrigin = `${devOrigin}/api/v1/kino/uploads/token`
    expect(resolveUploadTransportUrl(sameOrigin, { origin: devOrigin })).toBe(sameOrigin)

    const eaUrl = 'http://127.0.0.1:18900/api/v1/kino/uploads/token'
    expect(resolveUploadTransportUrl(eaUrl, { origin: devOrigin })).toBe(eaUrl)

    const studioOrigin = 'http://localhost:18920'
    expect(resolveUploadTransportUrl(COS_SIGNED, { origin: studioOrigin })).toBe(COS_SIGNED)
  })

  it('encodes query parameters in the proxy url parameter', () => {
    const origin = 'http://127.0.0.1:15185'
    const resolved = resolveUploadTransportUrl(S3_SIGNED, { origin })
    const proxyUrl = new URL(resolved)
    expect(proxyUrl.pathname).toBe('/__video-upload-proxy')
    expect(proxyUrl.searchParams.get('url')).toBe(S3_SIGNED)
  })
})

describe('default XHR transport with upload proxy resolver', () => {
  type XhrMock = {
    open: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    setRequestHeader: ReturnType<typeof vi.fn>
    upload: { onprogress: ((event: ProgressEvent<EventTarget>) => void) | null }
    onload: (() => void) | null
    status: number
    responseText: string
  }

  let xhrInstances: XhrMock[]
  const OriginalXHR = globalThis.XMLHttpRequest
  const originalLocation = globalThis.location

  beforeEach(() => {
    xhrInstances = []
    class MockXHR {
      open = vi.fn()
      send = vi.fn()
      setRequestHeader = vi.fn()
      upload = { onprogress: null as XhrMock['upload']['onprogress'] }
      onload: XhrMock['onload'] = null
      status = 200
      responseText = ''
      constructor() {
        xhrInstances.push(this as unknown as XhrMock)
      }
    }
    globalThis.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { origin: 'http://localhost:15185' },
    })
  })

  afterEach(() => {
    globalThis.XMLHttpRequest = OriginalXHR
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('opens XHR against the proxy URL while validating the original instruction', async () => {
    const transport = createDefaultXhrUploadTransport()
    const file = new File([new Uint8Array([1, 2])], 'clip.mp4', { type: 'video/mp4' })
    const instruction = {
      method: 'PUT' as const,
      url: COS_SIGNED,
      headers: { 'content-type': 'video/mp4' },
      expires_at: '2099-01-01T00:00:00.000Z',
    }

    const promise = transport.put(file, instruction)
    const xhr = xhrInstances[0]!
    xhr.onload?.()
    await promise

    expect(xhr.open).toHaveBeenCalledWith(
      'PUT',
      `http://localhost:15185/__video-upload-proxy?url=${encodeURIComponent(COS_SIGNED)}`,
      true,
    )
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('content-type', 'video/mp4')
    expect(xhr.send).toHaveBeenCalledWith(file)
  })
})
