import { describe, expect, it } from 'vitest'
import { createViteWorkbenchPlugin } from '@forgeax/workbench-host/vite'

describe('development Vite adapter', () => {
  it('refuses to construct in production mode', () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      expect(() => createViteWorkbenchPlugin({} as never)).toThrow(
        'development-only',
      )
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previous
    }
  })
})
