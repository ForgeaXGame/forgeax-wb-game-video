import { describe, expect, it } from 'vitest'
import type { WorkbenchExtensionContext } from '@forgeax/workbench-host/node'
import { createWbGameVideoRouter } from './router'

const decoder = new TextDecoder()
const encoder = new TextEncoder()

function contextFor(files: Record<string, string>): WorkbenchExtensionContext {
  return {
    files: {
      read: async (path: string) => {
        const value = files[path]
        return value === undefined ? null : encoder.encode(value)
      },
    },
  } as unknown as WorkbenchExtensionContext
}

function request(path: string) {
  return {
    gameId: 'game-1',
    runtimeId: 'runtime-1',
    method: 'GET',
    path,
    headers: {},
    query: {},
    body: new Uint8Array(),
  } as const
}

describe('wb-game-video document routing', () => {
  it('returns an empty document list for a new project', async () => {
    const router = createWbGameVideoRouter(contextFor({}))

    const response = await router.handle(request('documents'))

    expect(response.status).toBe(200)
    expect(JSON.parse(decoder.decode(response.body))).toEqual({ documents: [] })
  })

  it('lists a docs/ intake record and reads its body from game root', async () => {
    const files = {
      'assets/manifest.json': JSON.stringify({
        version: 2,
        assets: [{
          id: 'doc-intake',
          kind: 'document',
          name: '需求',
          status: 'ready',
          mimeType: 'text/markdown',
          provider: { kind: 'local', ref: 'docs/demo_intake.md' },
          createdAt: 1,
          updatedAt: 2,
          meta: { documentType: 'intake' },
        }],
      }),
      'docs/demo_intake.md': '# Intake',
    }
    const router = createWbGameVideoRouter(contextFor(files))

    const list = await router.handle(request('documents'))
    expect(JSON.parse(decoder.decode(list.body))).toEqual({
      documents: [{ id: 'doc-intake', name: '需求', documentType: 'intake', updatedAt: 2 }],
    })

    const one = await router.handle(request('documents/doc-intake'))
    expect(JSON.parse(decoder.decode(one.body))).toEqual({
      document: { id: 'doc-intake', name: '需求', documentType: 'intake', updatedAt: 2 },
      content: '# Intake',
    })
  })
})
