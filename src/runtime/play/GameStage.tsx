/**
 * GameStage —— 「当前演出帧」的共享渲染 SSOT（runtime/play）。
 *
 * 把原先散在 GraphPlayer / GraphPlaySurface / GraphStudio 里**重复**的
 * 「<video> 演出 + 缺片提示 + VideoOverlayStage 叠层」这一块收成一个组件。
 * 只依赖 runtime（引擎快照类型 + 皮肤注册表 + 视频矩形工具），**不碰 editor / 宿主**：
 *   - 视频地址由调用方算好传入(`videoSrc`)——宿主专属的 mediaId→url 解析留在调用方(注入)。
 *   - 会话推进/事件回灌经回调(onTick / onPerformanceEnd / onEmit)交给调用方的 GraphSession。
 *
 * 自持:双 video 槽、内容矩形(useVideoContentRect)、缺片状态(随 clip 变更自动复位)。
 * 换片时旧槽保持可见，备用槽在后台解码到 loadeddata 后才接管画面，避免浏览器把
 * 单 video 的 readyState 重置到 HAVE_NOTHING 时露出黑底。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ClipSnap, OverlayMountSnap } from '../engine/session'
import type { SkinCtx, SkinRegistry } from '../component-host/rendererRegistry'
import { MissingVideoNotice } from './MissingVideoNotice'
import { VideoOverlayStage } from './VideoOverlayStage'
import { useVideoContentRect } from './useVideoContentRect'
import { videoDurationCapReached } from './videoTiming'

export interface GameStageProps {
  /** 当前演出视频的可播 url;调用方用(注入的)解析器把 clip.mediaId 转成 url。 */
  videoSrc: string | undefined
  clip: ClipSnap | undefined
  overlayMounts: OverlayMountSnap[]
  /** 皮肤注册表(session.skins);缺省不渲染叠层。 */
  skins: SkinRegistry | undefined
  skinCtx: SkinCtx | undefined
  onEmit: (elementId: string, key: string) => void
  onTick: (nowMs: number) => void
  /** 演出提前收尾(时长上限到点 / 非 loop 视频自然结束)。 */
  onPerformanceEnd: () => void
  /** 无视频时的占位内容(如「（无演出）」/「加载中…」)。 */
  placeholder?: ReactNode
  /** 播放标识覆盖(默认 clip.nodeId);需要「同节点再 jump 强制重播」时传入带 epoch 的 key。 */
  videoKey?: string
}

type VideoSlot = 'a' | 'b'

interface BufferedPlayback {
  key: string
  src: string
  mediaId: string | undefined
  loop: boolean
  durationMs: number | undefined
}

interface VideoBufferState {
  front: VideoSlot
  slots: Record<VideoSlot, BufferedPlayback | null>
}

const OTHER_SLOT: Record<VideoSlot, VideoSlot> = { a: 'b', b: 'a' }

function playbackKey(videoSrc: string | undefined, clip: ClipSnap | undefined, videoKey: string | undefined): string | null {
  if (!videoSrc) return null
  return [
    videoKey ?? clip?.nodeId ?? 'clip',
    clip?.mediaId ?? '',
    clip?.loop ? 'loop' : 'once',
    clip?.durationMs ?? '',
    videoSrc,
  ].join('\u0000')
}

export function GameStage({
  videoSrc, clip, overlayMounts, skins, skinCtx, onEmit, onTick, onPerformanceEnd, placeholder, videoKey,
}: GameStageProps): JSX.Element {
  const desired = useMemo<BufferedPlayback | null>(
    () => {
      const key = playbackKey(videoSrc, clip, videoKey)
      return videoSrc && key
        ? {
            key,
            src: videoSrc,
            mediaId: clip?.mediaId,
            loop: !!clip?.loop,
            durationMs: clip?.durationMs,
          }
        : null
    },
    [videoSrc, videoKey, clip?.nodeId, clip?.mediaId, clip?.loop, clip?.durationMs],
  )
  const desiredKey = desired?.key ?? null
  const [buffer, setBuffer] = useState<VideoBufferState>(() => ({
    front: 'a',
    slots: { a: desired, b: null },
  }))
  const slotElements = useRef<Record<VideoSlot, HTMLVideoElement | null>>({ a: null, b: null })
  const activeVideoRef = useRef<HTMLVideoElement | null>(null)
  const frontSlotRef = useRef<VideoSlot>(buffer.front)
  const desiredKeyRef = useRef<string | null>(desiredKey)
  frontSlotRef.current = buffer.front
  desiredKeyRef.current = desiredKey
  const activePlayback = buffer.slots[buffer.front]
  const { contentRect, recomputeRect } = useVideoContentRect(activeVideoRef, [activePlayback?.key])
  const [missingVideoId, setMissingVideoId] = useState<string | null>(null)

  useEffect(() => {
    setMissingVideoId(null)
  }, [clip?.nodeId, clip?.mediaId, videoSrc])

  useEffect(() => {
    if (!desired) {
      slotElements.current.a?.pause()
      slotElements.current.b?.pause()
      activeVideoRef.current = null
      setBuffer((current) => (
        current.slots.a || current.slots.b
          ? { front: 'a', slots: { a: null, b: null } }
          : current
      ))
      return
    }

    setBuffer((current) => {
      const frontPlayback = current.slots[current.front]
      if (frontPlayback?.key === desired.key) return current

      const target = frontPlayback ? OTHER_SLOT[current.front] : current.front
      if (current.slots[target]?.key === desired.key) return current
      return {
        ...current,
        slots: { ...current.slots, [target]: desired },
      }
    })
  }, [desired])

  useEffect(() => {
    const element = slotElements.current[buffer.front]
    activeVideoRef.current = element
    if (!element || activePlayback?.key !== desiredKey) return
    recomputeRect()
    if (!element.paused) return
    const playing = element.play()
    void playing?.catch((error: unknown) => {
      if ((error as { name?: string })?.name !== 'AbortError') {
        console.warn('[wb-game-video] failed to start buffered video', error)
      }
    })
  }, [buffer.front, activePlayback?.key, desiredKey, recomputeRect])

  const isCurrentPlayback = (slot: VideoSlot, key: string): boolean =>
    frontSlotRef.current === slot && desiredKeyRef.current === key

  const handleLoadedData = (slot: VideoSlot, playback: BufferedPlayback, element: HTMLVideoElement): void => {
    if (desiredKeyRef.current !== playback.key) return
    const previousFront = frontSlotRef.current
    if (previousFront !== slot) {
      slotElements.current[previousFront]?.pause()
      activeVideoRef.current = element
      frontSlotRef.current = slot
      setBuffer((current) => current.slots[slot]?.key === playback.key
        ? { ...current, front: slot }
        : current)
    } else {
      activeVideoRef.current = element
    }
    setMissingVideoId(null)
    recomputeRect()
  }

  return (
    <>
      {videoSrc ? (
        <>
          {(['a', 'b'] as const).map((slot) => {
            const playback = buffer.slots[slot]
            if (!playback) return null
            const isFront = buffer.front === slot
            return (
              <video
                key={playback.key}
                ref={(element) => { slotElements.current[slot] = element }}
                data-video-slot={slot}
                data-playback-key={playback.key}
                src={playback.src}
                autoPlay={isFront}
                muted
                playsInline
                preload="auto"
                loop={playback.loop}
                onLoadedMetadata={(event) => {
                  if (desiredKeyRef.current !== playback.key) return
                  setMissingVideoId(null)
                  if (isCurrentPlayback(slot, playback.key)) {
                    activeVideoRef.current = event.currentTarget
                    recomputeRect()
                  }
                }}
                onLoadedData={(event) => handleLoadedData(slot, playback, event.currentTarget)}
                onError={() => {
                  if (desiredKeyRef.current === playback.key && playback.mediaId) {
                    setMissingVideoId(playback.mediaId)
                  }
                }}
                onEnded={() => {
                  if (!isCurrentPlayback(slot, playback.key) || playback.loop) return
                  onPerformanceEnd()
                }}
                onTimeUpdate={(event) => {
                  if (!isCurrentPlayback(slot, playback.key)) return
                  const element = event.currentTarget
                  const nowMs = Math.floor(element.currentTime * 1000)
                  if (videoDurationCapReached(nowMs, playback.durationMs, element.duration)) {
                    element.pause()
                    onPerformanceEnd()
                    return
                  }
                  onTick(nowMs)
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  opacity: isFront ? 1 : 0,
                  pointerEvents: 'none',
                }}
              />
            )
          })}
          {missingVideoId ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.72)', padding: 16, zIndex: 2 }}>
              <MissingVideoNotice resourceId={missingVideoId} />
            </div>
          ) : null}
        </>
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7, color: 'rgba(255,255,255,0.6)' }}>
          {placeholder ?? clip?.name ?? '（无演出）'}
        </div>
      )}

      <VideoOverlayStage contentRect={contentRect}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {overlayMounts.map((m) => (
            <span key={m.mountId} style={{ display: 'contents' }}>
              {skins?.renderOverlayMount(m, onEmit, skinCtx)}
            </span>
          ))}
        </div>
      </VideoOverlayStage>
    </>
  )
}
