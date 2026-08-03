import { describe, expect, it } from 'vitest'
import type { WorkbenchExtensionContext } from '@forgeax/workbench-host/node'
import { createWbGameVideoRouter } from './router'

describe('wb-game-video media routing', () => {
  it('does not recreate the retired extension-owned resource API', async () => {
    const router = createWbGameVideoRouter({} as WorkbenchExtensionContext)

    const response = await router.handle({
      gameId: 'game-1', runtimeId: 'runtime-1', method: 'GET', path: 'media/resources', headers: {}, query: {}, body: new Uint8Array(),
    })

    expect(response.status).toBe(404)
  })
})
