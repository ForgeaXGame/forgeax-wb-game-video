import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const COMPONENTS_ROUTE_PREFIX = '/@game-components'
const GAME_ID = /^[a-z0-9][a-z0-9-]{1,40}$/

export interface GameComponentsSourcePluginOptions {
  workspaceRoot: string
}

/**
 * Development-only bridge for a game's source-owned control module.
 *
 * Controls are non-media assets. Their source stays in the game directory and
 * Vite performs the TypeScript/TSX transform only when the browser requests
 * its ESM entry module.
 */
export function createGameComponentsSourcePlugin(
  { workspaceRoot }: GameComponentsSourcePluginOptions,
): Plugin {
  return {
    name: 'wb-game-video-game-components-source',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(COMPONENTS_ROUTE_PREFIX, async (request, response, next) => {
        try {
          const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
          const gameId = /^\/([^/]+)\/index\.js$/.exec(pathname)?.[1]
          if (!gameId) return next()
          if (!GAME_ID.test(gameId)) {
            response.statusCode = 400
            response.end('// invalid game id')
            return
          }

          const componentRoot = resolve(workspaceRoot, '.forgeax', 'games', gameId, 'components')
          const tsx = resolve(componentRoot, 'index.tsx')
          const ts = resolve(componentRoot, 'index.ts')
          const source = existsSync(tsx) ? tsx : existsSync(ts) ? ts : null
          if (!source) {
            response.statusCode = 404
            response.end('// project components source not found')
            return
          }

          const transformed = await server.transformRequest(`/@fs/${source}`)
          if (!transformed) {
            response.statusCode = 404
            response.end('// project components transform failed')
            return
          }

          response.statusCode = 200
          response.setHeader('cache-control', 'no-store')
          response.setHeader('content-type', 'text/javascript; charset=utf-8')
          response.end(transformed.code)
        } catch (error) {
          response.statusCode = 500
          response.setHeader('content-type', 'text/javascript; charset=utf-8')
          response.end(`// project components load failed: ${String(error)}`)
        }
      })
    },
  }
}
