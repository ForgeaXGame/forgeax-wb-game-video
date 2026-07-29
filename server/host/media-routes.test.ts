import { describe, expect, test } from 'vitest'
import { bundledMediaResponse } from './media-routes'

describe('bundled media response', () => {
  test('serves an exact inclusive byte range with 206 semantics', async () => {
    const response = await bundledMediaResponse('dazhao', 'bytes=0-3')

    expect(response.status).toBe(206)
    expect(response.body).toHaveLength(4)
    expect(response.headers).toMatchObject({
      'accept-ranges': 'bytes',
      'content-length': '4',
      'content-range': expect.stringMatching(/^bytes 0-3\/\d+$/),
      'content-type': 'video/mp4',
    })
  })

  test.each(['../dazhao', '%2e%2e', 'unknown-id'])(
    'normalizes traversal or unknown id %s to the same 404',
    async (id) => {
      const response = await bundledMediaResponse(id)
      expect(response).toEqual({
        status: 404,
        headers: {
          'cache-control': 'no-store',
          'content-length': '0',
        },
        body: new Uint8Array(),
      })
    },
  )
})
