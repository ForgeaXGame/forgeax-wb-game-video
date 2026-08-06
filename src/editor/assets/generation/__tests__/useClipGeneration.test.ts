// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ForgeaXToolPort } from '@forgeax-extension/wb-asset-canvas/generation'
import { KinoClientError } from '../../kino-api'
import {
  CLIP_GENERATION_TOOL_ID,
  VIDEO_GENERATIONS_API_PATH,
  VideoGenerationRouteUnavailableError,
  createClipGenerationRequestId,
  createVideoGeneration,
  getVideoGeneration,
  listActiveVideoGenerations,
  submitClipGeneration,
  type ClipGenerationRequest,
  type ClipGenerationSubmission,
  type ClipGenerationWireRequest,
  type VideoGenerationTask,
} from '../generation-api'
import {
  CLIP_GENERATION_POLL_INTERVAL_MS,
  CLIP_GENERATION_POLL_MAX_CONSECUTIVE_FAILURES,
  CLIP_GENERATION_SOURCE,
  useClipGeneration,
  type ClipGenerationRegistryEntry,
} from '../useClipGeneration'

const request: ClipGenerationRequest = {
  gameSlug: 'demo',
  prompt: 'A knight crossing a rain-soaked bridge',
  durationSeconds: 8,
  generateAudio: true,
  mode: 'strict',
  firstFrameAssetId: 'first-frame',
  lastFrameAssetId: 'last-frame',
  firstFrameResourceId: 'first-resource',
  lastFrameResourceId: 'last-resource',
  size: '1440x2560',
  resolution: '1080p',
  label: 'Bridge shot',
}

const requestIdA = 'client-a-request-id'
const requestIdB = 'client-b-request-id'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function task(
  generationId: string,
  status: VideoGenerationTask['status'],
  overrides: Partial<VideoGenerationTask> = {},
): VideoGenerationTask {
  return { generationId, status, ...overrides }
}

function registryEntry(
  id: string,
  status: ClipGenerationRegistryEntry['status'],
  requestId: string,
  overrides: Partial<ClipGenerationRegistryEntry> = {},
): ClipGenerationRegistryEntry {
  return {
    id,
    status,
    meta: { source: CLIP_GENERATION_SOURCE, requestId },
    ...overrides,
  }
}

function envelope<T>(data: T): Response {
  return new Response(JSON.stringify({ code: 0, message: 'ok', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function unavailableRoute(): Promise<never> {
  return Promise.reject(new VideoGenerationRouteUnavailableError())
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('generation HTTP API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('posts the native kino create payload and maps snake_case task fields', async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(VIDEO_GENERATIONS_API_PATH)
      expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
      expect(JSON.parse(String(init?.body))).toEqual({
        game_id: 'demo',
        media_type: 'video',
        model: 'seedance2',
        size: '1440x2560',
        duration_sec: 8,
        add_to_resource: true,
        content: [
          { type: 'text', text: request.prompt },
          { type: 'resource', resource_id: 'first-resource', frame_position: 'first' },
          { type: 'resource', resource_id: 'last-resource', frame_position: 'last' },
          { type: 'resource', resource_id: 'ref-1' },
        ],
        extra: { generate_audio: true, resolution: '1080p' },
      })
      return Promise.resolve(envelope({
        generation_id: 'gen-1',
        status: 'submitting',
        provider_task_id: 'provider-1',
        created_at: 123,
        resource: { resource_id: 'resource-1', ignored: 'private' },
      }))
    }) as typeof fetch
    vi.stubGlobal('fetch', fetchImpl)

    await expect(createVideoGeneration({
      gameSlug: 'demo',
      prompt: request.prompt,
      durationSeconds: 8,
      size: '1440x2560',
      resolution: '1080p',
      generateAudio: true,
      firstFrameResourceId: 'first-resource',
      lastFrameResourceId: 'last-resource',
      referenceImageResourceIds: ['ref-1'],
    })).resolves.toEqual({
      generationId: 'gen-1',
      status: 'submitting',
      providerTaskId: 'provider-1',
      resourceId: 'resource-1',
      createdAt: 123,
    })
  })

  it('gets one game-owned task and lists active tasks in server order', async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/gen%2F1')) {
        expect(url).toBe(`${VIDEO_GENERATIONS_API_PATH}/gen%2F1`)
        return Promise.resolve(envelope({
          generation_id: 'gen/1',
          status: 'succeeded',
          result_url: 'https://cdn.example/result.mp4',
          resource: { resource_id: 'res-1', url: 'must-not-be-consumed' },
        }))
      }
      expect(url).toBe(`${VIDEO_GENERATIONS_API_PATH}?game_id=demo%20game&media_type=video&page_size=50`)
      return Promise.resolve(envelope({
        items: [
          { generation_id: 'newer', status: 'polling', created_at: 20 },
          { generation_id: 'older', status: 'pending', created_at: 10 },
        ],
        total: 2,
      }))
    }) as typeof fetch
    vi.stubGlobal('fetch', fetchImpl)

    await expect(getVideoGeneration('demo game', 'gen/1')).resolves.toEqual({
      generationId: 'gen/1',
      status: 'succeeded',
      resultUrl: 'https://cdn.example/result.mp4',
      resourceId: 'res-1',
    })
    await expect(listActiveVideoGenerations('demo game')).resolves.toEqual([
      { generationId: 'newer', status: 'polling', createdAt: 20 },
      { generationId: 'older', status: 'pending', createdAt: 10 },
    ])
  })

  it('turns only a plain non-JSON 404 into the route-missing sentinel', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
      new Response('Not Found', { status: 404 }),
    )))

    await expect(createVideoGeneration({
      gameSlug: 'demo',
      prompt: 'rain',
      durationSeconds: 8,
      size: '2560x1440',
      resolution: '720p',
      generateAudio: false,
    })).rejects.toBeInstanceOf(VideoGenerationRouteUnavailableError)
  })
})

describe('submitClipGeneration', () => {
  it('sends the opaque requestId through the shared tool port and unwraps the result', async () => {
    const call = vi.fn<ForgeaXToolPort['call']>().mockResolvedValue({
      ok: true,
      result: { assetId: 'a-vid-new', status: 'ready' },
    })
    const wireRequest: ClipGenerationWireRequest = {
      prompt: request.prompt,
      durationSeconds: request.durationSeconds,
      generateAudio: request.generateAudio,
      mode: request.mode,
      firstFrameAssetId: request.firstFrameAssetId,
      lastFrameAssetId: request.lastFrameAssetId,
      label: request.label,
      requestId: requestIdA,
    }

    await expect(submitClipGeneration(wireRequest, { call })).resolves.toEqual({
      assetId: 'a-vid-new',
      status: 'ready',
    })
    expect(call).toHaveBeenCalledWith(CLIP_GENERATION_TOOL_ID, wireRequest)
  })

  it('creates a schema-safe high-entropy requestId', () => {
    const requestId = createClipGenerationRequestId()
    expect(requestId.length).toBeGreaterThanOrEqual(1)
    expect(requestId.length).toBeLessThanOrEqual(128)
  })
})

describe('useClipGeneration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('polls HTTP without overlapping requests and exposes the successful result', async () => {
    const pendingPoll = deferred<VideoGenerationTask>()
    const createGeneration = vi.fn().mockResolvedValue(task('gen-1', 'submitting'))
    const getGeneration = vi.fn(() => pendingPoll.promise)
    const onTerminal = vi.fn()
    const { result } = renderHook(() => useClipGeneration([], {
      createGeneration,
      getGeneration,
      onTerminal,
    }))

    act(() => result.current.submit(request))
    await flush()
    expect(result.current.state).toMatchObject({
      phase: 'generating',
      transport: 'http',
      generationId: 'gen-1',
    })

    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    expect(getGeneration).toHaveBeenCalledWith('demo', 'gen-1', { signal: expect.any(AbortSignal) })
    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS * 3))
    expect(getGeneration).toHaveBeenCalledOnce()

    await act(async () => pendingPoll.resolve(task('gen-1', 'succeeded', {
      resultUrl: 'https://cdn.example/clip.mp4',
      resourceId: 'resource-1',
    })))
    expect(result.current.state).toEqual({
      phase: 'succeeded',
      transport: 'http',
      generationId: 'gen-1',
      resultUrl: 'https://cdn.example/clip.mp4',
      resourceId: 'resource-1',
      activeTasks: [],
    })
    expect(onTerminal).toHaveBeenCalledWith(task('gen-1', 'succeeded', {
      resultUrl: 'https://cdn.example/clip.mp4',
      resourceId: 'resource-1',
    }))
  })

  it('maps a failed HTTP terminal task to its server-provided message', async () => {
    const { result } = renderHook(() => useClipGeneration([], {
      createGeneration: vi.fn().mockResolvedValue(task('gen-failed', 'polling')),
      getGeneration: vi.fn().mockResolvedValue(task('gen-failed', 'failed', {
        errorCode: 'VIDEO_MODEL_SAFETY_BLOCKED',
        errorMessage: '内容未通过安全检查',
      })),
    }))

    act(() => result.current.submit(request))
    await flush()
    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    expect(result.current.state).toMatchObject({
      phase: 'failed',
      transport: 'http',
      generationId: 'gen-failed',
      error: '内容未通过安全检查',
    })
  })

  it('keeps a polling business 404 on HTTP and never starts a tool task', async () => {
    const submitClip = vi.fn()
    const { result } = renderHook(() => useClipGeneration([], {
      createGeneration: vi.fn().mockResolvedValue(task('gen-hidden', 'polling')),
      getGeneration: vi.fn().mockRejectedValue(
        new KinoClientError('Generation not found', 404, 'kino_generation_not_found'),
      ),
      submitClip,
    }))

    act(() => result.current.submit(request))
    await flush()
    // A polling error is tolerated for CLIP_GENERATION_POLL_MAX_CONSECUTIVE_FAILURES
    // consecutive attempts before it is treated as a terminal failure.
    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    expect(result.current.state).toMatchObject({
      phase: 'failed',
      transport: 'http',
      generationId: 'gen-hidden',
      error: 'Generation not found',
    })
    expect(submitClip).not.toHaveBeenCalled()
  })

  it('tolerates transient poll failures below the threshold without flashing failed', async () => {
    expect(CLIP_GENERATION_POLL_MAX_CONSECUTIVE_FAILURES).toBe(3)
    const rejection = new Error('transient network blip')
    const getGeneration = vi.fn()
      .mockRejectedValueOnce(rejection)
      .mockRejectedValueOnce(rejection)
      .mockResolvedValue(task('gen-transient', 'polling'))
    const { result } = renderHook(() => useClipGeneration([], {
      createGeneration: vi.fn().mockResolvedValue(task('gen-transient', 'submitting')),
      getGeneration,
    }))

    act(() => result.current.submit(request))
    await flush()
    expect(result.current.state).toMatchObject({ phase: 'generating', generationId: 'gen-transient' })

    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    expect(getGeneration).toHaveBeenCalledTimes(1)
    expect(result.current.state.phase).toBe('generating')

    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    expect(getGeneration).toHaveBeenCalledTimes(2)
    expect(result.current.state.phase).toBe('generating')

    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    expect(getGeneration).toHaveBeenCalledTimes(3)
    expect(result.current.state).toMatchObject({ phase: 'generating', generationId: 'gen-transient' })

    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    expect(getGeneration).toHaveBeenCalledTimes(4)
  })

  it('marks failed only once poll failures reach the consecutive threshold, then stops polling', async () => {
    const rejection = new Error('persistent failure')
    const getGeneration = vi.fn().mockRejectedValue(rejection)
    const { result } = renderHook(() => useClipGeneration([], {
      createGeneration: vi.fn().mockResolvedValue(task('gen-persistent', 'submitting')),
      getGeneration,
    }))

    act(() => result.current.submit(request))
    await flush()

    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    expect(result.current.state.phase).toBe('generating')
    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    expect(result.current.state.phase).toBe('generating')
    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    expect(result.current.state).toMatchObject({
      phase: 'failed',
      transport: 'http',
      generationId: 'gen-persistent',
      error: rejection.message,
    })
    expect(getGeneration).toHaveBeenCalledTimes(3)

    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS * 3))
    expect(getGeneration).toHaveBeenCalledTimes(3)
  })

  it('resets the consecutive-failure counter across cancel so a fresh submit is not prematurely marked failed', async () => {
    const rejection = new Error('transient network blip')
    const failuresByGenerationId: Record<string, number> = {}
    const getGeneration = vi.fn((_gameSlug: string, generationId: string) => {
      failuresByGenerationId[generationId] = (failuresByGenerationId[generationId] ?? 0) + 1
      if (generationId === 'gen-first') return Promise.reject(rejection)
      if (generationId === 'gen-second' && failuresByGenerationId[generationId] === 1) {
        return Promise.reject(rejection)
      }
      return Promise.resolve(task(generationId, 'polling'))
    })
    const createGeneration = vi.fn()
      .mockResolvedValueOnce(task('gen-first', 'submitting'))
      .mockResolvedValueOnce(task('gen-second', 'submitting'))
    const { result } = renderHook(() => useClipGeneration([], {
      createGeneration,
      getGeneration,
    }))

    act(() => result.current.submit(request))
    await flush()
    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    expect(result.current.state.phase).toBe('generating')

    act(() => result.current.cancel())
    expect(result.current.state).toMatchObject({ phase: 'idle' })

    act(() => result.current.submit(request))
    await flush()
    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    // If the previous epoch's 2 accrued failures had leaked into this submission,
    // this single failure would already reach the 3-failure threshold and fail.
    expect(result.current.state.phase).toBe('generating')
  })

  it('cancel stops local tracking and ignores a stale in-flight response', async () => {
    const pendingPoll = deferred<VideoGenerationTask>()
    const onTerminal = vi.fn()
    const { result } = renderHook(() => useClipGeneration([], {
      createGeneration: vi.fn().mockResolvedValue(task('gen-cancel', 'polling')),
      getGeneration: vi.fn(() => pendingPoll.promise),
      onTerminal,
    }))

    act(() => result.current.submit(request))
    await flush()
    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    act(() => result.current.cancel())
    expect(result.current.state).toEqual({
      phase: 'idle',
      activeTasks: [task('gen-cancel', 'polling')],
    })

    await act(async () => pendingPoll.resolve(task('gen-cancel', 'succeeded')))
    expect(result.current.state).toEqual({
      phase: 'idle',
      activeTasks: [task('gen-cancel', 'polling')],
    })
    expect(onTerminal).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a newer submit invalidates a stale create response', async () => {
    const firstCreate = deferred<VideoGenerationTask>()
    const createGeneration = vi.fn()
      .mockImplementationOnce(() => firstCreate.promise)
      .mockResolvedValueOnce(task('gen-new-submit', 'polling'))
    const onTerminal = vi.fn()
    const { result } = renderHook(() => useClipGeneration([], {
      createGeneration,
      onTerminal,
    }))

    act(() => result.current.submit(request))
    act(() => result.current.submit({ ...request, prompt: 'newer prompt' }))
    await flush()
    expect(result.current.state).toMatchObject({
      phase: 'generating',
      generationId: 'gen-new-submit',
    })

    await act(async () => firstCreate.resolve(task('gen-stale-submit', 'succeeded')))
    expect(result.current.state).toMatchObject({
      phase: 'generating',
      generationId: 'gen-new-submit',
    })
    expect(onTerminal).not.toHaveBeenCalled()
  })

  it('rejects asset-only references before HTTP submission without falling back', async () => {
    const createGeneration = vi.fn()
    const submitClip = vi.fn()
    const { result } = renderHook(() => useClipGeneration([], {
      createGeneration,
      submitClip,
    }))

    act(() => result.current.submit({
      ...request,
      firstFrameAssetId: 'asset-only-secret-first',
      lastFrameAssetId: 'asset-only-secret-last',
      firstFrameResourceId: undefined,
      lastFrameResourceId: undefined,
    }))

    expect(result.current.state).toMatchObject({
      phase: 'failed',
      transport: 'http',
      error: expect.stringMatching(/unavailable for HTTP generation/),
    })
    expect(result.current.state.error).not.toContain('asset-only-secret')
    expect(createGeneration).not.toHaveBeenCalled()
    expect(submitClip).not.toHaveBeenCalled()
  })

  it('rejects resource-only references before tool submission', async () => {
    const createGeneration = vi.fn()
    const submitClip = vi.fn()
    const { result } = renderHook(() => useClipGeneration([], {
      gameSlug: 'demo',
      listActiveGenerations: unavailableRoute,
      createGeneration,
      submitClip,
      createRequestId: () => requestIdA,
    }))
    await flush()

    act(() => result.current.submit({
      ...request,
      firstFrameAssetId: undefined,
      lastFrameAssetId: undefined,
      firstFrameResourceId: 'resource-only-secret-first',
      lastFrameResourceId: 'resource-only-secret-last',
    }))

    expect(result.current.state).toMatchObject({
      phase: 'failed',
      transport: 'tool',
      error: expect.stringMatching(/unavailable for tool generation/),
    })
    expect(result.current.state.error).not.toContain('resource-only-secret')
    expect(createGeneration).not.toHaveBeenCalled()
    expect(submitClip).not.toHaveBeenCalled()
  })

  it.each([
    {
      transport: 'http' as const,
      assetIds: ['asset-1', 'asset-2'],
      resourceIds: ['resource-1'],
      expected: /unavailable for HTTP generation/,
    },
    {
      transport: 'tool' as const,
      assetIds: ['asset-1'],
      resourceIds: ['resource-1', 'resource-2'],
      expected: /unavailable for tool generation/,
    },
  ])('rejects mixed reference identities on $transport transport', async ({
    transport,
    assetIds,
    resourceIds,
    expected,
  }) => {
    const createGeneration = vi.fn()
    const submitClip = vi.fn()
    const options = transport === 'tool'
      ? {
        gameSlug: 'demo',
        listActiveGenerations: unavailableRoute,
        createGeneration,
        submitClip,
        createRequestId: () => requestIdA,
      }
      : { createGeneration, submitClip }
    const { result } = renderHook(() => useClipGeneration([], options))
    await flush()

    act(() => result.current.submit({
      ...request,
      mode: 'ref',
      firstFrameAssetId: undefined,
      lastFrameAssetId: undefined,
      firstFrameResourceId: undefined,
      lastFrameResourceId: undefined,
      referenceImageAssetIds: assetIds,
      referenceImageResourceIds: resourceIds,
    }))

    expect(result.current.state).toMatchObject({
      phase: 'failed',
      transport,
      error: expect.stringMatching(expected),
    })
    expect(createGeneration).not.toHaveBeenCalled()
    expect(submitClip).not.toHaveBeenCalled()
  })

  it('keeps both identities for a local import but sends only the transport-owned one', async () => {
    const importedRequest: ClipGenerationRequest = {
      ...request,
      mode: 'ref',
      firstFrameAssetId: undefined,
      lastFrameAssetId: undefined,
      firstFrameResourceId: undefined,
      lastFrameResourceId: undefined,
      referenceImageAssetIds: ['local-registry-asset'],
      referenceImageResourceIds: ['local-kino-resource'],
    }
    const createGeneration = vi.fn().mockResolvedValue(task('gen-local', 'polling'))
    const http = renderHook(() => useClipGeneration([], { createGeneration }))

    act(() => http.result.current.submit(importedRequest))
    await flush()
    expect(createGeneration).toHaveBeenCalledWith(expect.objectContaining({
      referenceImageResourceIds: ['local-kino-resource'],
    }), { signal: expect.any(AbortSignal) })
    expect(createGeneration.mock.calls[0]?.[0]).not.toHaveProperty('referenceImageAssetIds')
    http.unmount()

    const submitClip = vi.fn().mockResolvedValue({ assetId: 'tool-local', status: 'ready' })
    const tool = renderHook(() => useClipGeneration([], {
      gameSlug: 'demo',
      listActiveGenerations: unavailableRoute,
      submitClip,
      createRequestId: () => requestIdA,
    }))
    await flush()
    act(() => tool.result.current.submit(importedRequest))
    await flush()
    expect(submitClip).toHaveBeenCalledWith(expect.objectContaining({
      referenceImageAssetIds: ['local-registry-asset'],
    }))
    expect(submitClip.mock.calls[0]?.[0]).not.toHaveProperty('referenceImageResourceIds')
  })

  it('unmount clears polling and prevents terminal callbacks from stale responses', async () => {
    const pendingPoll = deferred<VideoGenerationTask>()
    const onTerminal = vi.fn()
    const hook = renderHook(() => useClipGeneration([], {
      createGeneration: vi.fn().mockResolvedValue(task('gen-unmount', 'polling')),
      getGeneration: vi.fn(() => pendingPoll.promise),
      onTerminal,
    }))

    act(() => hook.result.current.submit(request))
    await flush()
    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    hook.unmount()
    await act(async () => pendingPoll.resolve(task('gen-unmount', 'succeeded')))

    expect(onTerminal).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('recovers all active tasks in server order, tracks the newest, and explicitly switches target', async () => {
    const tasks = [
      task('gen-new', 'polling', { createdAt: 20 }),
      task('gen-old', 'pending', { createdAt: 10 }),
    ]
    const listActiveGenerations = vi.fn().mockResolvedValue(tasks)
    const getGeneration = vi.fn().mockResolvedValue(task('gen-old', 'polling'))
    const { result } = renderHook(() => useClipGeneration([], {
      gameSlug: 'demo',
      listActiveGenerations,
      getGeneration,
    }))

    await flush()
    expect(result.current.state).toEqual({
      phase: 'generating',
      transport: 'http',
      generationId: 'gen-new',
      resultUrl: undefined,
      resourceId: undefined,
      activeTasks: tasks,
    })

    act(() => result.current.track('gen-old'))
    expect(result.current.state).toMatchObject({ generationId: 'gen-old', activeTasks: tasks })
    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    expect(getGeneration).toHaveBeenCalledWith('demo', 'gen-old', { signal: expect.any(AbortSignal) })
  })

  it('cancel preserves recovered active tasks in state', async () => {
    const tasks = [
      task('gen-a', 'polling', { createdAt: 20 }),
      task('gen-b', 'pending', { createdAt: 10 }),
    ]
    const { result } = renderHook(() => useClipGeneration([], {
      gameSlug: 'demo',
      listActiveGenerations: vi.fn().mockResolvedValue(tasks),
    }))

    await flush()
    expect(result.current.state.activeTasks).toEqual(tasks)

    act(() => result.current.cancel())
    expect(result.current.state).toMatchObject({ phase: 'idle', activeTasks: tasks })
  })

  it('submit after recovery keeps prior active tasks and prepends the new one', async () => {
    const restored = [
      task('gen-restored-a', 'polling', { createdAt: 20 }),
      task('gen-restored-b', 'pending', { createdAt: 10 }),
    ]
    const createGeneration = vi.fn().mockResolvedValue(task('gen-new', 'submitting'))
    const { result } = renderHook(() => useClipGeneration([], {
      gameSlug: 'demo',
      listActiveGenerations: vi.fn().mockResolvedValue(restored),
      createGeneration,
    }))

    await flush()
    act(() => result.current.submit(request))
    await flush()
    expect(result.current.state.activeTasks).toEqual([
      task('gen-new', 'submitting'),
      ...restored,
    ])
  })

  it('keeps idle when recovery is empty or fails', async () => {
    const empty = renderHook(() => useClipGeneration([], {
      gameSlug: 'demo',
      listActiveGenerations: vi.fn().mockResolvedValue([]),
    }))
    await flush()
    expect(empty.result.current.state).toEqual({ phase: 'idle' })
    empty.unmount()

    const failed = renderHook(() => useClipGeneration([], {
      gameSlug: 'demo',
      listActiveGenerations: vi.fn().mockRejectedValue(new KinoClientError('Bad request', 400)),
    }))
    await flush()
    expect(failed.result.current.state).toEqual({ phase: 'idle' })
  })

  it('silently marks the Phase 1 transport when recovery finds no private route', async () => {
    const submitClip = vi.fn().mockResolvedValue({ assetId: 'tool-restored', status: 'ready' })
    const createGeneration = vi.fn()
    const { result } = renderHook(() => useClipGeneration([], {
      gameSlug: 'demo',
      listActiveGenerations: unavailableRoute,
      createGeneration,
      submitClip,
      createRequestId: () => requestIdA,
    }))

    await flush()
    expect(result.current.state).toEqual({ phase: 'idle', transport: 'tool' })
    act(() => result.current.submit(request))
    await flush()
    expect(createGeneration).not.toHaveBeenCalled()
    expect(submitClip).toHaveBeenCalledOnce()
  })

  it('keeps HTTP preferred after a silent recovery business 404', async () => {
    const createGeneration = vi.fn().mockResolvedValue(task('gen-after-list-404', 'polling'))
    const submitClip = vi.fn()
    const { result } = renderHook(() => useClipGeneration([], {
      gameSlug: 'demo',
      listActiveGenerations: vi.fn().mockRejectedValue(
        new KinoClientError('Game not found', 404, 'kino_resource_not_found'),
      ),
      createGeneration,
      submitClip,
    }))

    await flush()
    expect(result.current.state).toEqual({ phase: 'idle' })
    act(() => result.current.submit(request))
    await flush()
    expect(createGeneration).toHaveBeenCalledOnce()
    expect(submitClip).not.toHaveBeenCalled()
    expect(result.current.state).toMatchObject({
      phase: 'generating',
      transport: 'http',
      generationId: 'gen-after-list-404',
    })
  })

  it('refreshes the asset library when a recovered task reaches a terminal state', async () => {
    const onTerminal = vi.fn()
    const listActiveGenerations = vi.fn().mockResolvedValue([task('gen-restored', 'polling')])
    const getGeneration = vi.fn().mockResolvedValue(task('gen-restored', 'succeeded', {
      resourceId: 'res-restored',
    }))
    renderHook(() => useClipGeneration([], {
      gameSlug: 'demo',
      listActiveGenerations,
      getGeneration,
      onTerminal,
    }))

    await flush()
    await act(async () => vi.advanceTimersByTime(CLIP_GENERATION_POLL_INTERVAL_MS))
    expect(onTerminal).toHaveBeenCalledWith(task('gen-restored', 'succeeded', {
      resourceId: 'res-restored',
    }))
  })

  it('falls back on 404 and preserves requestId correlation for concurrent identical prompts', async () => {
    const pendingA = deferred<ClipGenerationSubmission>()
    const pendingB = deferred<ClipGenerationSubmission>()
    const clientA = renderHook(
      ({ entries }) => useClipGeneration(entries, {
        createGeneration: unavailableRoute,
        submitClip: () => pendingA.promise,
        createRequestId: () => requestIdA,
      }),
      { initialProps: { entries: [] as ClipGenerationRegistryEntry[] } },
    )
    const clientB = renderHook(
      ({ entries }) => useClipGeneration(entries, {
        createGeneration: unavailableRoute,
        submitClip: () => pendingB.promise,
        createRequestId: () => requestIdB,
      }),
      { initialProps: { entries: [] as ClipGenerationRegistryEntry[] } },
    )

    act(() => {
      clientA.result.current.submit(request)
      clientB.result.current.submit(request)
    })
    await flush()
    expect(clientA.result.current.state).toEqual({ phase: 'submitting', transport: 'tool' })
    expect(clientB.result.current.state).toEqual({ phase: 'submitting', transport: 'tool' })

    const concurrentEntries = [
      registryEntry('a-vid-b', 'generating', requestIdB),
      registryEntry('a-vid-a', 'generating', requestIdA),
    ]
    clientA.rerender({ entries: concurrentEntries })
    clientB.rerender({ entries: concurrentEntries })
    expect(clientA.result.current.state).toEqual({
      phase: 'generating', transport: 'tool', assetId: 'a-vid-a',
    })
    expect(clientB.result.current.state).toEqual({
      phase: 'generating', transport: 'tool', assetId: 'a-vid-b',
    })

    const terminalEntries = [
      registryEntry('a-vid-a', 'ready', requestIdA),
      registryEntry('a-vid-b', 'failed', requestIdB, { error: 'Client B failed' }),
    ]
    clientA.rerender({ entries: terminalEntries })
    clientB.rerender({ entries: terminalEntries })
    expect(clientA.result.current.state).toEqual({
      phase: 'succeeded', transport: 'tool', assetId: 'a-vid-a',
    })
    expect(clientB.result.current.state).toEqual({
      phase: 'failed', transport: 'tool', assetId: 'a-vid-b', error: 'Client B failed',
    })
  })

  it('also falls back on an explicit browser connection failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    const submitClip = vi.fn().mockResolvedValue({ assetId: 'tool-result', status: 'ready' })
    const { result } = renderHook(() => useClipGeneration([], {
      submitClip,
      createRequestId: () => requestIdA,
    }))

    act(() => result.current.submit(request))
    await flush()
    expect(submitClip).toHaveBeenCalledWith(expect.objectContaining({
      prompt: request.prompt,
      requestId: requestIdA,
    }))
    expect(submitClip.mock.calls[0]?.[0]).not.toHaveProperty('gameSlug')
    expect(result.current.state).toEqual({
      phase: 'succeeded', transport: 'tool', assetId: 'tool-result',
    })
  })

  it.each([
    ['not found', new KinoClientError('Generation not found', 404, 'kino_generation_not_found')],
    ['validation', new KinoClientError('Invalid size', 400, 'kino_invalid_parameter')],
    ['unauthorized', new KinoClientError('Unauthorized', 401, 'unauthorized')],
    ['unprocessable', new KinoClientError('Safety blocked', 422, 'VIDEO_MODEL_SAFETY_BLOCKED')],
    ['network-coded business', new KinoClientError('Provider network unavailable', 503, 'network_error')],
    ['server', new KinoClientError('Server error', 500, 'internal_error')],
    ['bad gateway', new KinoClientError('Bad gateway', 502, 'upstream_unavailable')],
  ])('does not fall back on %s HTTP business errors', async (_label, error) => {
    const submitClip = vi.fn()
    const { result } = renderHook(() => useClipGeneration([], {
      createGeneration: vi.fn().mockRejectedValue(error),
      submitClip,
    }))

    act(() => result.current.submit(request))
    await flush()
    expect(result.current.state).toEqual({
      phase: 'failed', transport: 'http', error: error.message,
    })
    expect(submitClip).not.toHaveBeenCalled()
  })
})
