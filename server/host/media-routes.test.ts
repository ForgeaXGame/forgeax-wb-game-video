import type { FileHandle } from 'node:fs/promises'
import * as fsPromises from 'node:fs/promises'
import { describe, expect, test, vi } from 'vitest'
import { bundledMediaResponse } from './media-routes'

describe('bundled media response', () => {
  test('serves an exact inclusive byte range with 206 semantics', async () => {
    let openedHandle: FileHandle | undefined
    const actualOpen = fsPromises.open
    const open = vi.spyOn(fsPromises, 'open').mockImplementationOnce(async (...args) => {
      openedHandle = await actualOpen(...args)
      vi.spyOn(openedHandle, 'read')
      return openedHandle
    })
    const readFile = vi.spyOn(fsPromises, 'readFile')
    const response = await bundledMediaResponse('dazhao', 'bytes=0-3')

    expect(response.status).toBe(206)
    expect(response.body).toHaveLength(4)
    expect(response.headers).toMatchObject({
      'accept-ranges': 'bytes',
      'content-length': '4',
      'content-range': expect.stringMatching(/^bytes 0-3\/\d+$/),
      'content-type': 'video/mp4',
    })
    expect(open).toHaveBeenCalledTimes(1)
    expect(readFile).not.toHaveBeenCalled()
    expect(openedHandle?.read).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      0,
      4,
      0,
    )
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
