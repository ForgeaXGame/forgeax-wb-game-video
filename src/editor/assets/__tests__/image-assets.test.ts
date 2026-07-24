import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteReferenceImage, gvaImageUrl, ImageUploadError } from '../image-assets'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('gvaImageUrl', () => {
  it('builds a same-origin, revisioned image URL', () => {
    expect(gvaImageUrl('a-img-1/2', 'demo game', 42)).toBe(
      '/api/gva/media/a-img-1%2F2?game=demo+game&v=42',
    )
  })
})

describe('deleteReferenceImage', () => {
  it('deletes an uploaded image through the GVA API', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ deleted: true, id: 'a-img-1' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    await deleteReferenceImage('demo game', 'a-img-1')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/gva/assets/a-img-1?game=demo%20game',
      { method: 'DELETE' },
    )
  })

  it('surfaces server refusal messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'Only uploaded images can be deleted' }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    )))

    await expect(deleteReferenceImage('demo', 'a-charref-hero')).rejects.toEqual(
      new ImageUploadError('Only uploaded images can be deleted'),
    )
  })
})
