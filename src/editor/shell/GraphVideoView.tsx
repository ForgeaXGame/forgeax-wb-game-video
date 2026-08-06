/**
 * GraphVideoView —— 「新引擎 › 视频」= 视频素材编辑器（UI/交互对齐旧 VideoCatalogTab）。
 *
 * 保留素材库和纯视频预览；不再承载节点绑定、生成配置或组件编辑能力。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { useGraphScenario } from '../persist/graphScenarioStore'
import {
  VideoAssetLibrary,
  type VideoLibraryEntry,
} from '../assets/VideoAssetLibrary'
import { useVideoAssets } from '../assets/useVideoAssets'
import { useClipGeneration } from '../assets/generation/useClipGeneration'
import {
  VideoGenSheet,
  type RecentGeneratedClip,
} from '../assets/generation/VideoGenSheet'
import type { VgenImageAsset } from '../assets/generation/VgenImagePicker'
import {
  listRegistryAssets,
  resolveAssetSrc,
  resolveMediaSrc,
  registryMediaUrl,
} from './media'
import type { MediaAsset } from '../assets/registry-types'
import {
  GraphVideoPreviewPanel,
} from './GraphVideoPreviewPanel'
import { bootEditorSkins } from '../init'
import { injectStyleOnce } from '../../styles/injectStyle'
import { CATALOG_CSS } from './catalogCss'
import { GRAPH_VIDEO_VIEW_CSS } from './graphVideoViewStyles'
import type { GameScenario } from '../../runtime/schema/graph-schema'

// 复用视频 tab 的 --gc-* token；不改 CatalogTabs 的全局 CSS，样式自持。
// 视频 tab 的基础栏目/预览台样式（gc-*）复用共享 CATALOG_CSS（原旧 forge/CatalogTabs 全局 CSS）。
// 注册全部组件包（含 filter/fx）；幂等。
bootEditorSkins()

injectStyleOnce('graph-catalog', CATALOG_CSS)
injectStyleOnce('graph-video-view', GRAPH_VIDEO_VIEW_CSS)

interface VideoEntry extends VideoLibraryEntry {}

export function GraphVideoView(): JSX.Element {
  const t = useT()
  const generatedGroup = t('videoAssets.group.generated')
  const uploadGroup = t('videoAssets.group.upload')
  const game = useGraphScenario((s) => s.game)
  const videoController = useVideoAssets(game)
  const [regAssets, setRegAssets] = useState<MediaAsset[]>([])
  const listBodyRef = useRef<HTMLDivElement | null>(null)
  const [selectedId, setSelectedId] = useState<string>('')
  const [genSheetOpen, setGenSheetOpen] = useState(false)
  const [videoDurationMs, setVideoDurationMs] = useState<number | null>(null)

  const graph = useGraphScenario((s) => s.graph)
  const scenario = useMemo<GameScenario>(
    () => ({ version: 'wb-game-video.graph.v1', graph }),
    [graph],
  )

  // 共享素材层轮询（mtime 级 5s）：驱动生成中占位 + 角色/场景参考图。
  useEffect(() => {
    let alive = true
    const pull = async (): Promise<void> => {
      const all = await listRegistryAssets(game)
      if (!alive) return
      setRegAssets(all)
    }
    void pull()
    const timer = window.setInterval(() => void pull(), 5000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [game])

  const supplementalEntries = useMemo<VideoLibraryEntry[]>(() => {
    return regAssets
      .filter((a) => a.kind === 'video' && a.productionType === 'video_clip')
      .map((v) => ({
        id: v.id,
        label: v.label ?? v.id,
        url: v.status === 'ready' ? registryMediaUrl(v.id, game) : '',
        group: generatedGroup,
        status: v.status,
        fromRegistry: true,
        durMs: v.durationMs,
      }))
  }, [regAssets, game, generatedGroup])

  const imageAssets = useMemo<VgenImageAsset[]>(() => {
    return regAssets.flatMap((asset) => {
      if (asset.kind !== 'image' || asset.status !== 'ready') return []
      const kind = asset.productionType === 'character_ref'
        ? 'character_ref'
        : asset.productionType === 'scene_ref'
          ? 'scene_ref'
          : asset.productionType === 'shot_image'
            ? 'keyframe'
            : null
      if (!kind) return []
      return [{
        id: asset.id,
        resourceId: asset.provider?.kind === 'kino'
          ? nonEmptyString(asset.provider.upstreamResourceId)
          : undefined,
        label: asset.label ?? asset.name ?? asset.id,
        kind,
        thumbUrl: resolveAssetSrc(asset, game),
      }]
    })
  }, [game, regAssets])

  const recentClips = useMemo<RecentGeneratedClip[]>(() => {
    const clips: RecentGeneratedClip[] = regAssets
      .filter(isRecentClipAsset)
      .map((asset) => ({
        id: asset.id,
        label: asset.label ?? asset.name ?? asset.id,
        createdAt: asset.createdAt,
        status: asset.status,
        posterUrl: stringMeta(asset.meta, 'posterUrl') ?? stringMeta(asset.meta, 'thumbnailUrl'),
        playbackUrl: asset.status === 'ready' ? resolveAssetSrc(asset, game) : undefined,
      }))
    for (const item of videoController.items) {
      if (item.type !== 'GENERATION') continue
      clips.push({
        id: item.id,
        label: item.label,
        createdAt: item.updatedAt ?? 0,
        status: 'ready',
        playbackUrl: item.url,
      })
    }
    return [...new Map(clips.map((clip) => [clip.id, clip])).values()]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 5)
  }, [game, regAssets, videoController.items])

  const clipGeneration = useClipGeneration(regAssets, {
    gameSlug: game,
    onTerminal: videoController.refresh,
  })

  const entries = useMemo<VideoEntry[]>(() => {
    const seen = new Set<string>()
    const out: VideoEntry[] = []
    const push = (entry: VideoLibraryEntry): void => {
      if (seen.has(entry.id)) return
      seen.add(entry.id)
      out.push(entry)
    }
    for (const item of videoController.items) {
      push({
        id: item.id,
        label: item.label,
        url: item.url,
        group: uploadGroup,
        fromApi: true,
        durMs: item.durMs,
        type: item.type,
        updatedAt: item.updatedAt,
      })
    }
    for (const entry of supplementalEntries) push(entry)
    return out
  }, [supplementalEntries, videoController.items, uploadGroup])

  const selectedEntry = entries.find((e) => e.id === selectedId)
  const timelineEntry = selectedEntry
  const previewSrc = timelineEntry?.url
    || (timelineEntry?.fromRegistry ? registryMediaUrl(timelineEntry.id, game) : undefined)
    || (timelineEntry ? resolveMediaSrc(timelineEntry.id, game) : undefined)
  const maxMs = Math.max(1000, videoDurationMs ?? timelineEntry?.durMs ?? 0)
  useEffect(() => {
    setVideoDurationMs(null)
  }, [timelineEntry?.id])

  function handleVideoDeleted(id: string): void {
    if (selectedId === id) {
      setSelectedId('')
    }
  }

  return (
    <div className="gc-tab gc-tab-video">
      <VideoAssetLibrary
        gameId={game}
        scenario={scenario}
        supplementalEntries={supplementalEntries}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onOpenGenerate={() => setGenSheetOpen(true)}
        onDeleted={handleVideoDeleted}
        controller={videoController}
        listBodyRef={listBodyRef}
      />
      <section className="gc-preview">
        {timelineEntry ? (
          <div className="gc-stage gc-stage-video">
            <div className="gc-video-head">
              <div>
                <div className="gc-video-title">{timelineEntry.label}</div>
                <div className="gc-video-sub">素材预览</div>
              </div>
            </div>
            <div className="gc-video-top">
              <GraphVideoPreviewPanel
                timelineEntry={timelineEntry}
                previewEntry={selectedEntry}
                previewSrc={previewSrc}
                maxMs={maxMs}
                uploading={videoController.uploading}
                onReplace={videoController.replaceResource}
                onDurationChange={(ms) => {
                  setVideoDurationMs(ms)
                }}
              />
            </div>
          </div>
        ) : (
          <EmptyPreview text="选择一个视频素材以预览" />
        )}
      </section>
      <VideoGenSheet
        open={genSheetOpen}
        gameSlug={game}
        imageAssets={imageAssets}
        recentClips={recentClips}
        genState={clipGeneration.state}
        onSubmit={clipGeneration.submit}
        onCancel={clipGeneration.cancel}
        onTrack={clipGeneration.track}
        onClose={() => setGenSheetOpen(false)}
        onLocateAsset={(assetId) => {
          setSelectedId(assetId)
          setGenSheetOpen(false)
        }}
      />
    </div>
  )
}

function stringMeta(meta: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = meta?.[key]
  return typeof value === 'string' ? value : undefined
}

function nonEmptyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function isRecentClipAsset(
  asset: MediaAsset,
): asset is MediaAsset & { status: RecentGeneratedClip['status'] } {
  return asset.kind === 'video'
    && asset.productionType === 'video_clip'
    && asset.status !== 'placeholder'
}

      function EmptyPreview({text}: {text: string }): JSX.Element {
  return (
      <div className="gc-stage gc-empty-preview">
        <div className="gc-empty-note">{text}</div>
      </div>
      )
}
