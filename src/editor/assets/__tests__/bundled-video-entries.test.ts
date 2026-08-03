import { describe, expect, it } from 'vitest'
import { createBundledVideoEntries } from '../bundled-video-entries'

describe('createBundledVideoEntries', () => {
  it('lists compiled videos as read-only battle and narrative entries', () => {
    expect(createBundledVideoEntries(
      {
        'narr-open': '/assets/narr-open.mp4',
        pugong: '/assets/pugong.mp4',
        dazhao: '/assets/dazhao.mp4',
      },
      { battle: 'Battle', narrative: 'Narrative' },
    )).toEqual([
      {
        id: 'dazhao',
        label: 'dazhao',
        url: '/assets/dazhao.mp4',
        group: 'Battle',
        bundled: true,
        status: 'ready',
      },
      {
        id: 'pugong',
        label: 'pugong',
        url: '/assets/pugong.mp4',
        group: 'Battle',
        bundled: true,
        status: 'ready',
      },
      {
        id: 'narr-open',
        label: 'narr-open',
        url: '/assets/narr-open.mp4',
        group: 'Narrative',
        bundled: true,
        status: 'ready',
      },
    ])
  })
})
