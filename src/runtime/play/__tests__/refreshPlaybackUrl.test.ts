import { describe, expect, it } from 'vitest'
import { refreshPlaybackUrl } from '../refreshPlaybackUrl'

describe('refreshPlaybackUrl', () => {
  it('refreshes stable runtime media gateways', () => {
    expect(refreshPlaybackUrl('/__gva__/media/clip?game=demo', 2)).toBe(
      '/__gva__/media/clip?game=demo&__gva_refresh=2',
    )
    expect(refreshPlaybackUrl('/__workbench__/v1/games/demo/media/clip?view=play', 3)).toBe(
      '/__workbench__/v1/games/demo/media/clip?view=play&__gva_refresh=3',
    )
  })

  it('does not touch direct provider URLs', () => {
    expect(refreshPlaybackUrl('https://cos.example.test/video.mp4?q-signature=secret', 1)).toBeNull()
  })
})
