import { afterEach, describe, expect, it, vi } from 'vitest'

const { hostFetch, hostClient } = vi.hoisted(() => {
  const context = {
    gameId: 'demo-game',
    endpoints: { gamePackage: 'https://host.test/__workbench__/v1/games/demo-game/package' },
  }
  return {
    hostFetch: vi.fn(),
    hostClient: { context, ready: vi.fn(async () => context) },
  }
})

vi.mock('../../../lib/workbench-host', () => ({
  getWorkbenchHost: () => hostClient,
}))

import { deleteReferenceImage, gvaImageUrl, ImageUploadError } from '../image-assets'

afterEach(() => {
  hostFetch.mockReset()
  vi.unstubAllGlobals()
})

describe('gvaImageUrl', () => {
  it('builds a Host-bound, revisioned image URL', () => {
    expect(gvaImageUrl('a-img-1/2', 'demo game', 42)).toBe(
      'https://host.test/__workbench__/v1/games/demo-game/media/a-img-1%2F2?v=42',
    )
  })
})

describe('deleteReferenceImage', () => {
  it('deletes an uploaded image through the Host media API', async () => {
    vi.stubGlobal('fetch', hostFetch)
    hostFetch.mockResolvedValue(new Response(null, { status: 204 }))

    await deleteReferenceImage('demo game', 'a-img-1')

    expect(hostFetch).toHaveBeenCalledWith(
      'https://host.test/__workbench__/v1/games/demo-game/media/a-img-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('surfaces Host media request failures', async () => {
    vi.stubGlobal('fetch', hostFetch)
    hostFetch.mockResolvedValue(new Response(
      JSON.stringify({
        code: 403,
        message: 'Only uploaded images can be deleted',
        data: null,
      }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    ))

    await expect(deleteReferenceImage('demo', 'a-charref-hero')).rejects.toEqual(
      new ImageUploadError('Workbench media request failed with 403'),
    )
  })
})
