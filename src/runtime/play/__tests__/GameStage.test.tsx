import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClipSnap } from '../../engine/session'
import { GameStage, type GameStageProps } from '../GameStage'

function clip(nodeId: string, mediaId = nodeId): ClipSnap {
  return { nodeId, mediaId, name: nodeId, loop: false }
}

function props(overrides: Partial<GameStageProps> = {}): GameStageProps {
  return {
    videoSrc: '/a.mp4',
    clip: clip('a'),
    overlayMounts: [],
    skins: undefined,
    skinCtx: undefined,
    onEmit: vi.fn(),
    onTick: vi.fn(),
    onPerformanceEnd: vi.fn(),
    ...overrides,
  }
}

function videoFor(container: HTMLElement, src: string): HTMLVideoElement {
  const video = [...container.querySelectorAll('video')]
    .find((element) => element.getAttribute('src') === src)
  if (!video) throw new Error(`video not found: ${src}`)
  return video
}

describe('GameStage buffered playback', () => {
  it('keeps the current frame visible until the next video has decoded a frame', () => {
    const current = props()
    const { container, rerender } = render(<GameStage {...current} />)
    const first = videoFor(container, '/a.mp4')
    fireEvent.loadedData(first)

    rerender(<GameStage {...props({ videoSrc: '/b.mp4', clip: clip('b') })} />)
    const next = videoFor(container, '/b.mp4')

    expect(first).toHaveStyle({ opacity: '1' })
    expect(next).toHaveStyle({ opacity: '0' })

    fireEvent.loadedData(next)

    expect(first).toHaveStyle({ opacity: '0' })
    expect(next).toHaveStyle({ opacity: '1' })
  })

  it('ignores media events from the retained old video', () => {
    const onTick = vi.fn()
    const onPerformanceEnd = vi.fn()
    const { container, rerender } = render(
      <GameStage {...props({ onTick, onPerformanceEnd })} />,
    )
    const first = videoFor(container, '/a.mp4')
    fireEvent.loadedData(first)

    rerender(
      <GameStage
        {...props({
          videoSrc: '/b.mp4',
          clip: clip('b'),
          onTick,
          onPerformanceEnd,
        })}
      />,
    )
    const next = videoFor(container, '/b.mp4')

    fireEvent.timeUpdate(first)
    fireEvent.ended(first)
    expect(onTick).not.toHaveBeenCalled()
    expect(onPerformanceEnd).not.toHaveBeenCalled()

    fireEvent.loadedData(next)
    fireEvent.ended(next)
    expect(onPerformanceEnd).toHaveBeenCalledTimes(1)
  })

  it('does not activate a stale background load after a newer switch', () => {
    const { container, rerender } = render(<GameStage {...props()} />)
    const first = videoFor(container, '/a.mp4')
    fireEvent.loadedData(first)

    rerender(<GameStage {...props({ videoSrc: '/b.mp4', clip: clip('b') })} />)
    const stale = videoFor(container, '/b.mp4')
    rerender(<GameStage {...props({ videoSrc: '/c.mp4', clip: clip('c') })} />)
    const latest = videoFor(container, '/c.mp4')

    fireEvent.loadedData(stale)
    expect(first).toHaveStyle({ opacity: '1' })
    expect(latest).toHaveStyle({ opacity: '0' })

    fireEvent.loadedData(latest)
    expect(first).toHaveStyle({ opacity: '0' })
    expect(latest).toHaveStyle({ opacity: '1' })
  })

  it('loads the alternate slot when the same URL is replayed with a new key', () => {
    const { container, rerender } = render(<GameStage {...props({ videoKey: 'run-1' })} />)
    const first = videoFor(container, '/a.mp4')
    fireEvent.loadedData(first)

    rerender(<GameStage {...props({ videoKey: 'run-2' })} />)

    const videos = container.querySelectorAll('video')
    expect(videos).toHaveLength(2)
    const replay = [...videos].find((video) => video !== first)!
    expect(replay).toHaveAttribute('src', '/a.mp4')
    expect(first).toHaveStyle({ opacity: '1' })
    expect(replay).toHaveStyle({ opacity: '0' })

    fireEvent.loadedData(replay)
    expect(replay).toHaveStyle({ opacity: '1' })
  })
})
