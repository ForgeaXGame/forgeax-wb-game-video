import { afterEach, describe, expect, test, vi } from 'vitest'

const client = {
  gamePackage: {
    load: vi.fn(),
    save: vi.fn(),
  },
}

vi.mock('../../../lib/workbench-host', () => ({
  getWorkbenchHost: () => client,
}))

afterEach(() => {
  client.gamePackage.load.mockReset()
  client.gamePackage.save.mockReset()
  localStorage.clear()
})

describe('persist client', () => {
  test('loads the host-bound package without deriving a game URL', async () => {
    const project = { scenario: {}, manifest: {} }
    client.gamePackage.load.mockResolvedValue({ blueprint: project })
    const { loadStore } = await import('../persist-client')

    await expect(loadStore('query-game')).resolves.toMatchObject({ project })
    expect(client.gamePackage.load).toHaveBeenCalledWith()
  })

  test('saves the blueprint through the host-bound package client', async () => {
    const project = { scenario: {}, manifest: {} }
    client.gamePackage.save.mockResolvedValue({})
    const { saveProject } = await import('../persist-client')

    await expect(saveProject(project as never, 'query-game')).resolves.toEqual({ ok: true })
    expect(client.gamePackage.save).toHaveBeenCalledWith({ blueprint: project })
  })
})
