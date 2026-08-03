import { afterEach, describe, expect, it, vi } from 'vitest'

const { hostFetch, hostUrl } = vi.hoisted(() => ({
  hostFetch: vi.fn(),
  hostUrl: vi.fn((path: string) => `https://host.test/${path}`),
}))

vi.mock('../../../lib/workbench-host', () => ({
  getWorkbenchHost: () => ({ extension: { fetch: hostFetch, url: hostUrl } }),
}))

import { deleteReferenceImage, gvaImageUrl, ImageUploadError } from '../image-assets'

afterEach(() => {
  hostFetch.mockReset()
  hostUrl.mockClear()
  vi.unstubAllGlobals()
})

describe('gvaImageUrl', () => {
  it('builds a Host-bound, revisioned image URL', () => {
    expect(gvaImageUrl('a-img-1/2', 'demo game', 42)).toBe(
      'https://host.test/media/resources/a-img-1%2F2/content?v=42',
    )
  })
})

describe('deleteReferenceImage', () => {
  it('deletes an uploaded image through the Host resource API', async () => {
    hostFetch.mockResolvedValue(new Response(null, { status: 204 }))

    await deleteReferenceImage('demo game', 'a-img-1')

    expect(hostFetch).toHaveBeenCalledWith(
      'media/resources/a-img-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('surfaces Host refusal messages', async () => {
    hostFetch.mockResolvedValue(new Response(
      JSON.stringify({
        code: 403,
        message: 'Only uploaded images can be deleted',
        data: null,
      }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    ))

    await expect(deleteReferenceImage('demo', 'a-charref-hero')).rejects.toEqual(
      new ImageUploadError('Only uploaded images can be deleted'),
    )
  })
})
