import { describe, expect, it } from 'vitest'
import {
  isLoopScene,
  resolveFireAt,
  resolveOptType,
  shouldOpenChoiceDuringPlayback,
} from '../choiceTiming'
import type { Scene } from '../scenario/types'

const loopChoiceScene: Scene = {
  id: 'l1',
  title: 'L1',
  media: { kind: 'VIDEO', ref: 'v' },
  durationMs: 120000,
  dialogue: [],
  mediaPlayMode: 'loop',
  decision: {
    optType: 'timed',
    mode: 'wait',
    timeoutMs: 9000,
    windowStartMs: 400,
  },
  branches: [
    { id: 'a', kind: 'choice', label: 'A', targetSceneId: 'x' },
    { id: 'b', kind: 'choice', label: 'B', targetSceneId: 'y' },
  ],
}

describe('choiceTiming', () => {
  it('resolveOptType prefers optType over legacy mode', () => {
    expect(resolveOptType({ optType: 'timed_qte', mode: 'pause' })).toBe('timed_qte')
    expect(resolveOptType({ mode: 'wait' })).toBe('timed')
  })

  it('loop scene opens choice during playback window', () => {
    expect(isLoopScene(loopChoiceScene)).toBe(true)
    expect(shouldOpenChoiceDuringPlayback(loopChoiceScene, 500)).toBe(true)
    expect(shouldOpenChoiceDuringPlayback(loopChoiceScene, 100)).toBe(false)
  })

  it('resolveFireAt defaults video_end on loop scenes', () => {
    expect(resolveFireAt(loopChoiceScene)).toBe('video_end')
  })
})
