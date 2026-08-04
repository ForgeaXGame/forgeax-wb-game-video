import { afterEach, describe, expect, it } from 'vitest'
import { applyHostInit } from '../host-init'
import {
  forgeaxHttp,
  releaseHostInit,
  resetHostInitForTests,
} from '../lib/forgeax-http'

describe('applyHostInit', () => {
  afterEach(() => {
    resetHostInitForTests()
  })

  it('installs rewrite rules on forgeaxHttp.defaults', () => {
    applyHostInit({
      rewrite: [{ from: /^\/a$/, to: '/b' }],
    })
    expect(forgeaxHttp.rewriteUrl('/a')).toBe('/b')
  })

  it('clears rewrite only after matching releases (refcount)', () => {
    applyHostInit({ rewrite: [{ from: /^\/a$/, to: '/b' }] })
    applyHostInit({ rewrite: [{ from: /^\/a$/, to: '/b' }] })
    releaseHostInit()
    expect(forgeaxHttp.rewriteUrl('/a')).toBe('/b')
    releaseHostInit()
    expect(forgeaxHttp.rewriteUrl('/a')).toBe('/a')
  })

  it('throws on invalid rewrite', () => {
    expect(() =>
      applyHostInit({ rewrite: [{ from: /x/, to: 1 as unknown as string }] }),
    ).toThrow(/rewrite/i)
  })
})
