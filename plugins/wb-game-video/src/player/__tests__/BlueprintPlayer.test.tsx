import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useScenarioStore } from '../../scenario/scenarioStore'
import { BlueprintPlayer } from '../BlueprintPlayer'
import { makeDemoScenario } from '../../blueprint/__tests__/fixtures'

// 让 React 18 的 act() 在 vitest+happy-dom 下正常工作（消除 act 环境告警）。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

describe('BlueprintPlayer (render smoke)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useScenarioStore.setState({ scenario: makeDemoScenario() } as any)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  test('mounts and plays the start node clip', () => {
    act(() => {
      root.render(<BlueprintPlayer />)
    })
    expect(container.textContent).toContain('开场对峙')
    expect(container.textContent).toContain('退出')
  })

  test('auto-advances to the choice node and renders options', () => {
    vi.useFakeTimers()
    act(() => {
      root.render(<BlueprintPlayer />)
    })
    // 起点 loop 节点 durationMs=5000（真实视频以 onEnded 为主，happy-dom 无播放 →
    // 走时长兜底）；推进过 5.3s 兜底后应到达 choice 节点并由 ChoiceLayer 渲染选项。
    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(container.textContent).toContain('迎击（QTE）')
    expect(container.textContent).toContain('直冲 Boss')
  })
})
