import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgeaxHttp, resetHostInitForTests } from '../forgeax-http'
import { pluginFetch, pluginUrl } from '../plugin-http'

describe('pluginUrl', () => {
  const pluginBase = '/__fx-plugin/wb-game-video/'

  it('keeps host API requests rooted at the origin', () => {
    expect(pluginUrl('/api/game-host/games/demo/package/status', pluginBase))
      .toBe('/api/game-host/games/demo/package/status')
    expect(pluginUrl('/api/v1/kino/assets', pluginBase)).toBe('/api/v1/kino/assets')
  })

  it('prefixes plugin-local routes with the plugin mount', () => {
    expect(pluginUrl('/__gva__/assets?game=demo', pluginBase))
      .toBe('/__fx-plugin/wb-game-video/__gva__/assets?game=demo')
  })

  it('does not double-prefix existing or standalone paths', () => {
    expect(pluginUrl('/__fx-plugin/wb-game-video/__gva__/assets', pluginBase))
      .toBe('/__fx-plugin/wb-game-video/__gva__/assets')
    expect(pluginUrl('/__gva__/assets', './')).toBe('/__gva__/assets')
  })
})

describe('pluginFetch + forgeaxHttp', () => {
  afterEach(() => {
    resetHostInitForTests()
    vi.unstubAllGlobals()
  })

  it.each(['/vibe/', '/__fx-plugin/wb-game-video/'])(
    'rewrites the logical path before applying plugin base %s',
    async (pluginBase) => {
      const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}'))
      vi.stubGlobal('fetch', fetchMock)
      forgeaxHttp.defaults.rewrite = [
        { from: /^\/__gva__\/(.*)$/, to: '/proxy/gva/$1' },
      ]

      await pluginFetch('/__gva__/assets', undefined, pluginBase)

      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${pluginBase.replace(/\/$/, '')}/proxy/gva/assets`)
    },
  )
})
