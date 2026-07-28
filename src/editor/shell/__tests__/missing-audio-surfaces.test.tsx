/**
 * 「音频候选查不到」必须与「素材库真没音频」分得开 —— 与 `missing-video-surfaces.test.tsx`
 * 同款：查询失败在壳层工具条上以 `role="alert"` 摆出来，候选提示不认领「库是空的」。
 *
 * 吞掉失败的话，离线 / 端点坏掉的 studio 与健康的空库长得一模一样，面板会照着空候选分支
 * 告诉作者「素材库暂无音频资产，直接填 id 即可」—— 那是句假话，作者不会去查端点。
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlueprintDoc, GameScenario } from '../../../runtime/schema/graph-schema'
import { useAudioAssetCache } from '../../assets/audioAssetCacheStore'
import { useGraphScenario } from '../../persist/graphScenarioStore'
import { GraphStudio } from '../GraphStudio'

const useKinoVideoResources = vi.hoisted(() => vi.fn())

// 视频候选走 Kino，与本件无关；不 mock 的话它自己也会失败，工具条上会多出一条 alert。
vi.mock('../../assets/kinoVideoCacheStore', () => ({ useKinoVideoResources }))

const SCENARIO: GameScenario = {
  version: 'wb-game-video.graph.v1',
  graph: {
    nodes: [{
      id: 'intro',
      type: 'perf',
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: [],
      data: { name: 'Intro' },
    }],
    edges: [],
  },
}

const MAIN_ID = 'bp-main'
const MAIN_DOC: BlueprintDoc = { id: MAIN_ID, title: 'Main', entry: 'intro', graph: SCENARIO.graph }

function seedGraphStore(): void {
  useGraphScenario.setState({
    game: 'game-nodia-fighting',
    demo: SCENARIO,
    blueprints: { [MAIN_ID]: MAIN_DOC },
    mainBlueprintId: MAIN_ID,
    activeBlueprintId: MAIN_ID,
    graph: SCENARIO.graph,
    meta: {},
    booted: true,
  })
}

/** 素材层资产端点按 `assetsStatus` 应答；其余端点（版本列表等）一律 200。 */
function stubFetch(assetsStatus: number): void {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    if (String(input).includes('/__gva__/assets')) {
      return new Response(
        assetsStatus === 200 ? JSON.stringify({ assets: [] }) : 'boom',
        { status: assetsStatus, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response(JSON.stringify({ versions: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }))
}

const GAME = 'game-nodia-fighting'

/**
 * 等查询真的落地。反例（「不该报警」）尤其需要它：断言里那些元素首帧就在，而 fetch 要过几个
 * 微任务才 resolve —— 不等的话，两条反例断言的其实是「还没查完」，恒绿。
 */
async function settled(): Promise<void> {
  await waitFor(() => {
    const entry = useAudioAssetCache.getState().byGame[GAME]
    expect(entry).toBeDefined()
    expect(entry?.loading).toBe(false)
  })
}

describe('音频候选查询失败的表面', () => {
  beforeEach(() => {
    useAudioAssetCache.setState({ byGame: {} })
    useKinoVideoResources.mockReset()
    useKinoVideoResources.mockReturnValue({
      items: [], total: 0, loading: false, error: null, generation: 0, refresh: vi.fn(),
    })
    seedGraphStore()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('GraphStudio 把音频候选加载失败摆到工具条上（不静默清空候选）', async () => {
    stubFetch(500)

    render(<GraphStudio scenario={SCENARIO} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('音频素材加载失败：HTTP 500')
  })

  it('GraphStudio 正常空库时不报警（空候选是常态，不是故障）', async () => {
    stubFetch(200)

    render(<GraphStudio scenario={SCENARIO} />)

    await settled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // 刷新失败但手上还有候选时，警告不能说「候选不可用」——补全里正列着它们。
  it('候选还在、只是刷新失败时，警告说的是「可能不是最新的」', async () => {
    useAudioAssetCache.setState({
      byGame: {
        [GAME]: {
          assets: [{
            id: 'a-aud-1',
            kind: 'audio',
            productionType: 'video_clip',
            status: 'ready',
            label: '战斗床',
            createdAt: 0,
            updatedAt: 0,
          }],
          loading: false,
          error: 'HTTP 503',
          generation: 2,
        },
      },
    })
    stubFetch(200)

    render(<GraphStudio scenario={SCENARIO} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('HTTP 503')
    expect(alert).toHaveTextContent('不是最新')
    expect(alert.textContent).not.toContain('暂不可用')
  })
})
