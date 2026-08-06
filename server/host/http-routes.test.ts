import { describe, expect, it } from 'vitest'
import {
  WB_GAME_VIDEO_HTTP_ROUTES,
  WB_GAME_VIDEO_POST_SERVICE_ROUTES,
} from './http-routes'

describe('WB_GAME_VIDEO_HTTP_ROUTES', () => {
  it('lists every extension HTTP surface once', () => {
    const keys = WB_GAME_VIDEO_HTTP_ROUTES.map((route) => `${route.method} ${route.path}`)
    expect(keys).toEqual([
      'GET assets',
      'GET assets/:id',
      'GET asset-library',
      'POST asset-library',
      'GET media/bundled/:name',
      'GET style-axes',
      'POST style-axes',
      'POST references/characters/import',
      'POST references/scenes/import',
      'POST generation/shot-script',
      'POST generation/keyframe',
      'POST generation/video',
      'POST generation/node-video',
    ])
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps POST service dispatch map aligned with the declaration table', () => {
    expect([...WB_GAME_VIDEO_POST_SERVICE_ROUTES.entries()]).toEqual([
      ['references/characters/import', 'importCharacterRefs'],
      ['references/scenes/import', 'importSceneRefs'],
      ['generation/shot-script', 'generateShotScript'],
      ['generation/keyframe', 'generateKeyframe'],
      ['generation/video', 'generateVideo'],
      ['generation/node-video', 'generateNodeVideo'],
    ])
  })
})
