import type { VideoLibraryEntry } from './VideoAssetLibrary'

export interface BundledVideoGroups {
  battle: string
  narrative: string
}

/** Maps the videos compiled into this extension into read-only library entries. */
export function createBundledVideoEntries(
  videos: Readonly<Record<string, string>>,
  groups: BundledVideoGroups,
): VideoLibraryEntry[] {
  return Object.entries(videos)
    .map(([id, url]) => ({
      id,
      label: id,
      url,
      group: id.startsWith('narr-') ? groups.narrative : groups.battle,
      bundled: true,
      status: 'ready' as const,
    }))
    .sort((left, right) => {
      const groupOrder = Number(left.id.startsWith('narr-')) - Number(right.id.startsWith('narr-'))
      return groupOrder || left.id.localeCompare(right.id)
    })
}
