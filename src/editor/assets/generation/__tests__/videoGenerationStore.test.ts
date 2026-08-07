import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listActiveVideoGenerationTasks,
  getVideoGenerationTask,
  useVideoGenerationStore,
} from '../videoGenerationStore'

describe('global video generation store', () => {
  beforeEach(() => {
    useVideoGenerationStore.setState({ byGame: {} })
    vi.restoreAllMocks()
  })

  it('loads the game-scoped Kino task list and keeps its persisted prompt', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      code: 0,
      message: 'success',
      data: {
        items: [{
          generation_id: 'generation-1',
          status: 'polling',
          prompt_text: '雨夜追逐镜头',
          created_at: 123,
        }],
      },
    }))

    await expect(listActiveVideoGenerationTasks('game-a')).resolves.toEqual([{
      generationId: 'generation-1',
      status: 'polling',
      prompt: '雨夜追逐镜头',
      createdAt: 123,
    }])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/kino-generations?gameSlug=game-a',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('stores task selection outside page component lifetime', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      code: 0,
      message: 'success',
      data: { items: [], total: 0 },
    }))
    await useVideoGenerationStore.getState().refresh('game-a')
    useVideoGenerationStore.getState().select('game-a', 'generation-1')

    expect(useVideoGenerationStore.getState().byGame['game-a']?.selectedGenerationId)
      .toBe('generation-1')
  })

  it('loads the selected task detail after it leaves the active list', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      code: 0,
      message: 'success',
      data: {
        generation_id: 'generation-1',
        status: 'succeeded',
        prompt_text: '已完成的提示词',
        resource: { resource_id: 'resource-1' },
      },
    }))

    await expect(getVideoGenerationTask('game-a', 'generation-1')).resolves.toMatchObject({
      generationId: 'generation-1',
      status: 'succeeded',
      prompt: '已完成的提示词',
      resourceId: 'resource-1',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/kino-generations/generation-1?gameSlug=game-a',
      expect.any(Object),
    )
  })

  it('publishes a completion revision when a globally active task leaves the list', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({
        code: 0,
        message: 'success',
        data: { items: [{ generation_id: 'generation-1', status: 'polling' }] },
      }))
      .mockResolvedValueOnce(Response.json({
        code: 0,
        message: 'success',
        data: { items: [] },
      }))

    await useVideoGenerationStore.getState().refresh('game-a')
    expect(useVideoGenerationStore.getState().byGame['game-a']?.completionRevision).toBe(0)
    await useVideoGenerationStore.getState().refresh('game-a')
    expect(useVideoGenerationStore.getState().byGame['game-a']?.completionRevision).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
