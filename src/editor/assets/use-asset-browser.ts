import { useEffect, useMemo, useState } from 'react'
import {
  createKinoAssetLibraryClient,
  type AssetLibraryClient,
  useAssetLibrary,
} from './assetLibraryClient'
import { assetEntries, type AssetListEntry, type BrowserAsset } from './asset-entries'
import { useAssetDirectory } from './asset-directory'
import { loadProjectComponentAssets, type ProjectComponentAsset } from './project-component-assets'
import { fetchRegistryAssets } from './registry-assets'

const kinoAssetLibraryClient = createKinoAssetLibraryClient()

export function useAssetBrowser(gameId: string, client: AssetLibraryClient = kinoAssetLibraryClient): {
  entries: AssetListEntry[]
  controller: ReturnType<typeof useAssetLibrary>
  directory: ReturnType<typeof useAssetDirectory>
  videoAssets: BrowserAsset[]
  projectComponents: ProjectComponentAsset[]
} {
  const controller = useAssetLibrary(gameId, client)
  const directory = useAssetDirectory(gameId)
  const [videoAssets, setVideoAssets] = useState<BrowserAsset[]>([])
  const [projectComponents, setProjectComponents] = useState<ProjectComponentAsset[]>([])

  useEffect(() => {
    let active = true
    void fetchRegistryAssets(gameId, 'video')
      .then((assets) => {
        if (!active) return
        setVideoAssets(assets.map((asset) => ({
          id: asset.id,
          kind: 'video',
          name: asset.label ?? asset.id,
          url: asset.url,
          mime: asset.mime,
          bytes: asset.bytes,
          readOnly: true,
        })))
      })
      .catch(() => { if (active) setVideoAssets([]) })
    return () => { active = false }
  }, [gameId])

  useEffect(() => {
    let active = true
    void loadProjectComponentAssets().then((components) => {
      if (active) setProjectComponents(components)
    })
    return () => { active = false }
  }, [gameId])

  return {
    entries: useMemo(
      () => assetEntries(controller.items, videoAssets, projectComponents),
      [controller.items, projectComponents, videoAssets],
    ),
    controller,
    directory,
    videoAssets,
    projectComponents,
  }
}
