import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertRewriteRules,
  createForgeaxHttp,
  forgeaxHttp,
} from '../forgeax-http'

describe('forgeaxHttp.rewriteUrl', () => {
  afterEach(() => {
    forgeaxHttp.defaults.rewrite = []
  })

  it('returns input unchanged when rules are empty', () => {
    expect(forgeaxHttp.rewriteUrl('/api/v1/kino/resources')).toBe('/api/v1/kino/resources')
  })

  it('replaces pathname with capture groups and keeps query/hash', () => {
    forgeaxHttp.defaults.rewrite = [
      { from: /^\/api\/v1\/kino\/(.*)$/, to: '/foo/kino/$1' },
    ]
    expect(forgeaxHttp.rewriteUrl('/api/v1/kino/resources?page=1#x'))
      .toBe('/foo/kino/resources?page=1#x')
  })

  it('rewrites only the path of absolute URLs', () => {
    forgeaxHttp.defaults.rewrite = [
      { from: /^\/__gva__\/(.*)$/, to: '/proxy/gva/$1' },
    ]
    expect(forgeaxHttp.rewriteUrl('https://cdn.example/__gva__/assets?g=1'))
      .toBe('https://cdn.example/proxy/gva/assets?g=1')
  })

  it('stops at the first matching rule', () => {
    forgeaxHttp.defaults.rewrite = [
      { from: /^\/api\/a$/, to: '/first' },
      { from: /^\/api\/a$/, to: '/second' },
    ]
    expect(forgeaxHttp.rewriteUrl('/api/a')).toBe('/first')
  })
})

describe('forgeaxHttp.fetch', () => {
  afterEach(() => {
    forgeaxHttp.defaults.rewrite = []
    vi.unstubAllGlobals()
  })

  it('fetches the rewritten URL', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)
    const http = createForgeaxHttp({
      rewrite: [{ from: /^\/api\/a$/, to: '/foo/api/b' }],
    })
    await http.fetch('/api/a', { method: 'GET' })
    expect(fetchMock).toHaveBeenCalledWith('/foo/api/b', expect.objectContaining({ method: 'GET' }))
  })
})

describe('assertRewriteRules', () => {
  it('throws on invalid rules', () => {
    expect(() => assertRewriteRules([{ from: 'x' as unknown as RegExp, to: '/y' }]))
      .toThrow(/rewrite/i)
  })
})
