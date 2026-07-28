import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('wb-game-video browser key migration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it.each(['reel-studio:graph:view', 'gamevideo:graph:view'])(
    'moves %s into the wb-game-video namespace',
    async (oldKey) => {
      localStorage.setItem(oldKey, 'saved')
      await import('../bootMigrateLegacyKeys')
      expect(localStorage.getItem('wb-game-video:graph:view')).toBe('saved')
      expect(localStorage.getItem(oldKey)).toBeNull()
    },
  )

  it('does not overwrite an existing new key', async () => {
    localStorage.setItem('gamevideo:graph:view', 'old')
    localStorage.setItem('wb-game-video:graph:view', 'new')
    await import('../bootMigrateLegacyKeys')
    expect(localStorage.getItem('wb-game-video:graph:view')).toBe('new')
  })
})
