/**
 * HTTP route declarations for the wb-game-video extension router.
 *
 * This module is the SSOT for method/path → service method mapping.
 * Handlers live in `router.ts` / `wb-service.ts`; hosts must not re-declare
 * these paths.
 */

export type WbGameVideoServiceMethod =
  | 'importCharacterRefs'
  | 'importSceneRefs'
  | 'generateShotScript'
  | 'generateKeyframe'
  | 'generateVideo'
  | 'generateNodeVideo'

export type WbGameVideoHttpRoute = {
  readonly method: 'GET' | 'POST'
  readonly path: string
  /** Service method for POST routes that share the JSON body → service pattern. */
  readonly service?: WbGameVideoServiceMethod
  /** Free-form GET/POST handlers implemented in router.ts. */
  readonly kind?: 'list-assets' | 'get-asset' | 'bundled-media' | 'get-style-axes' | 'set-style-axes'
}

/** Ordered for documentation; router may use maps for O(1) lookup. */
export const WB_GAME_VIDEO_HTTP_ROUTES: readonly WbGameVideoHttpRoute[] = [
  { method: 'GET', path: 'assets', kind: 'list-assets' },
  { method: 'GET', path: 'assets/:id', kind: 'get-asset' },
  { method: 'GET', path: 'media/bundled/:name', kind: 'bundled-media' },
  { method: 'GET', path: 'style-axes', kind: 'get-style-axes' },
  { method: 'POST', path: 'style-axes', kind: 'set-style-axes' },
  { method: 'POST', path: 'references/characters/import', service: 'importCharacterRefs' },
  { method: 'POST', path: 'references/scenes/import', service: 'importSceneRefs' },
  { method: 'POST', path: 'generation/shot-script', service: 'generateShotScript' },
  { method: 'POST', path: 'generation/keyframe', service: 'generateKeyframe' },
  { method: 'POST', path: 'generation/video', service: 'generateVideo' },
  { method: 'POST', path: 'generation/node-video', service: 'generateNodeVideo' },
] as const

/** POST paths that dispatch to `createWbGameVideoService` methods. */
export const WB_GAME_VIDEO_POST_SERVICE_ROUTES: ReadonlyMap<string, WbGameVideoServiceMethod> =
  new Map(
    WB_GAME_VIDEO_HTTP_ROUTES
      .filter((route): route is WbGameVideoHttpRoute & { service: WbGameVideoServiceMethod } =>
        route.method === 'POST' && route.service !== undefined)
      .map((route) => [route.path, route.service]),
  )
