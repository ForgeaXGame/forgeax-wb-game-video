import { beforeEach, describe, expect, test, vi } from 'vitest'

const createExtensionClient = vi.fn()
const client = {
  gamePackage: {},
  extension: { fetch: vi.fn() },
  tool: { call: vi.fn() },
}

vi.mock('@forgeax/workbench-host/extension', () => ({
  createExtensionClient,
}))

beforeEach(() => {
  createExtensionClient.mockReset()
  createExtensionClient.mockReturnValue(client)
  client.extension.fetch.mockReset()
  client.tool.call.mockReset()
})

describe('getWorkbenchHost', () => {
  test('creates one extension client for all browser consumers', async () => {
    const { getWorkbenchHost } = await import('./workbench-host')

    expect(getWorkbenchHost()).toBe(client)
    expect(getWorkbenchHost()).toBe(client)
    expect(createExtensionClient).toHaveBeenCalledTimes(1)
  })

  test('uses extension fetch and tool calls instead of legacy browser endpoints', async () => {
    client.extension.fetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ assets: [] }),
      { headers: { 'content-type': 'application/json' } },
    ))
    client.extension.fetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ code: 0, message: 'ok', data: { items: [], total: 0, page: 1, page_size: 100 } }),
      { headers: { 'content-type': 'application/json' } },
    ))
    const { fetchRegistryAssets } = await import('../editor/assets/registry-assets')
    const { createKinoVideoClient } = await import('../editor/assets/kino-api')

    await fetchRegistryAssets('query-game', 'image')
    await createKinoVideoClient().list({ game_id: 'query-game', page: 1, page_size: 100 })

    expect(client.extension.fetch).toHaveBeenCalledWith('assets?kind=image')
    expect(client.extension.fetch).toHaveBeenCalledWith(
      'kino/resources?media_type=video&page=1&page_size=100',
      expect.anything(),
    )
    for (const [request] of client.extension.fetch.mock.calls) {
      expect(String(request)).not.toMatch(/^\/(?:api\/game-host|__gva__|__ce-api__)/)
    }
  })
})
