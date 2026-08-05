import { useCallback, useEffect, useRef, useState } from 'react'
import type { MediaStatus } from '../registry-types'
import {
  assertClipGenerationRequestId,
  createClipGenerationRequestId,
  createVideoGeneration,
  getVideoGeneration,
  isVideoGenerationHttpUnavailable,
  listActiveVideoGenerations,
  submitClipGeneration,
  type ClipGenerationRequest,
  type ClipGenerationSubmission,
  type ClipGenerationWireRequest,
  type VideoGenerationParams,
  type VideoGenerationTask,
} from './generation-api'

export const CLIP_GENERATION_SOURCE = 'asset-library-generation'
export const CLIP_GENERATION_POLL_INTERVAL_MS = 3_000

export type ClipGenPhase = 'idle' | 'submitting' | 'generating' | 'succeeded' | 'failed'

export interface ClipGenState {
  phase: ClipGenPhase
  transport?: 'http' | 'tool'
  generationId?: string
  assetId?: string
  resultUrl?: string
  resourceId?: string
  error?: string
  /** Restored active tasks stay in server order (newest first). */
  activeTasks?: readonly VideoGenerationTask[]
}

/** Browser-safe subset of a registry asset needed to correlate one submitted generation. */
export interface ClipGenerationRegistryEntry {
  id: string
  status: MediaStatus
  error?: string
  /** Exact correlation fields live in `meta`; unmarked assets are never adopted. */
  meta?: Readonly<Record<string, unknown>>
}

type CreateGeneration = typeof createVideoGeneration
type GetGeneration = typeof getVideoGeneration
type ListActiveGenerations = typeof listActiveVideoGenerations

export interface UseClipGenerationOptions {
  gameSlug?: string
  submitClip?: (request: ClipGenerationWireRequest) => Promise<ClipGenerationSubmission>
  createRequestId?: () => string
  createGeneration?: CreateGeneration
  getGeneration?: GetGeneration
  listActiveGenerations?: ListActiveGenerations
  pollIntervalMs?: number
  onTerminal?: (task: VideoGenerationTask) => void | Promise<void>
}

export interface ClipGenerationController {
  state: ClipGenState
  submit: (request: ClipGenerationRequest) => void
  /** Stops local tracking only. The cloud task continues because Kino has no cancel endpoint. */
  cancel: () => void
  reset: () => void
  /** Switches the primary poll target without mutating the restored task list. */
  track: (generationId: string) => void
}

interface TrackedSubmission {
  requestId: string
  idsBeforeSubmit: ReadonlySet<string>
  assetId?: string
}

const IDLE_STATE: ClipGenState = { phase: 'idle' }

export function useClipGeneration(
  entries: readonly ClipGenerationRegistryEntry[],
  options: UseClipGenerationOptions = {},
): ClipGenerationController {
  const submitClip = options.submitClip ?? submitClipGeneration
  const createRequestId = options.createRequestId ?? createClipGenerationRequestId
  const createGeneration = options.createGeneration ?? createVideoGeneration
  const getGeneration = options.getGeneration ?? getVideoGeneration
  const listActiveGenerations = options.listActiveGenerations ?? listActiveVideoGenerations
  const pollIntervalMs = options.pollIntervalMs ?? CLIP_GENERATION_POLL_INTERVAL_MS
  const onTerminal = options.onTerminal
  const gameSlug = options.gameSlug

  const [state, setState] = useState<ClipGenState>(IDLE_STATE)
  const epochRef = useRef(0)
  const trackedToolRef = useRef<TrackedSubmission | null>(null)
  const activeTasksRef = useRef<readonly VideoGenerationTask[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const preferredTransportRef = useRef<'http' | 'tool'>('http')
  const createGenerationRef = useRef(createGeneration)
  const getGenerationRef = useRef(getGeneration)
  const listActiveGenerationsRef = useRef(listActiveGenerations)
  const onTerminalRef = useRef(onTerminal)
  createGenerationRef.current = createGeneration
  getGenerationRef.current = getGeneration
  listActiveGenerationsRef.current = listActiveGenerations
  onTerminalRef.current = onTerminal

  const clearTimer = useCallback((): void => {
    if (timerRef.current === null) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const beginTrackingEpoch = useCallback((): { epoch: number, controller: AbortController } => {
    epochRef.current += 1
    clearTimer()
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    trackedToolRef.current = null
    return { epoch: epochRef.current, controller }
  }, [clearTimer])

  const isCurrent = useCallback((epoch: number): boolean => (
    mountedRef.current && epochRef.current === epoch
  ), [])

  const updateActiveTask = useCallback((task: VideoGenerationTask): readonly VideoGenerationTask[] => {
    const current = activeTasksRef.current
    const index = current.findIndex((candidate) => candidate.generationId === task.generationId)
    const next = index === -1
      ? [task, ...current]
      : current.map((candidate, candidateIndex) => candidateIndex === index ? task : candidate)
    activeTasksRef.current = next
    return next
  }, [])

  const removeActiveTask = useCallback((generationId: string): readonly VideoGenerationTask[] => {
    const next = activeTasksRef.current.filter((task) => task.generationId !== generationId)
    activeTasksRef.current = next
    return next
  }, [])

  const finishHttpTask = useCallback((task: VideoGenerationTask, epoch: number): void => {
    if (!isCurrent(epoch)) return
    clearTimer()
    const activeTasks = removeActiveTask(task.generationId)
    setState(httpTerminalState(task, activeTasks))
    if (onTerminalRef.current) void onTerminalRef.current(task)
  }, [clearTimer, isCurrent, removeActiveTask])

  const pollHttpTask = useCallback(async (
    taskGameSlug: string,
    generationId: string,
    epoch: number,
    signal: AbortSignal,
  ): Promise<void> => {
    if (!isCurrent(epoch)) return
    let task: VideoGenerationTask
    try {
      task = await getGenerationRef.current(taskGameSlug, generationId, { signal })
    } catch (error) {
      if (!isCurrent(epoch)) return
      clearTimer()
      setState((current) => ({
        phase: 'failed',
        transport: 'http',
        generationId,
        activeTasks: current.activeTasks,
        error: errorMessage(error),
      }))
      return
    }
    if (!isCurrent(epoch)) return
    if (isTerminalTask(task)) {
      finishHttpTask(task, epoch)
      return
    }
    const activeTasks = updateActiveTask(task)
    setState(httpGeneratingState(task, activeTasks))
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void pollHttpTask(taskGameSlug, generationId, epoch, signal)
    }, pollIntervalMs)
  }, [clearTimer, finishHttpTask, isCurrent, pollIntervalMs, updateActiveTask])

  const scheduleHttpPoll = useCallback((
    taskGameSlug: string,
    generationId: string,
    epoch: number,
    signal: AbortSignal,
  ): void => {
    if (!isCurrent(epoch)) return
    clearTimer()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void pollHttpTask(taskGameSlug, generationId, epoch, signal)
    }, pollIntervalMs)
  }, [clearTimer, isCurrent, pollHttpTask, pollIntervalMs])

  const adoptHttpTask = useCallback((
    taskGameSlug: string,
    task: VideoGenerationTask,
    epoch: number,
    signal: AbortSignal,
    activeTasks: readonly VideoGenerationTask[],
  ): void => {
    if (!isCurrent(epoch)) return
    activeTasksRef.current = activeTasks
    if (isTerminalTask(task)) {
      finishHttpTask(task, epoch)
      return
    }
    setState(httpGeneratingState(task, activeTasks))
    scheduleHttpPoll(taskGameSlug, task.generationId, epoch, signal)
  }, [finishHttpTask, isCurrent, scheduleHttpPoll])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      epochRef.current += 1
      clearTimer()
      abortRef.current?.abort()
    }
  }, [clearTimer])

  useEffect(() => {
    const tracked = trackedToolRef.current
    if (!tracked) return

    const entry = tracked.assetId
      ? entries.find((candidate) => (
        candidate.id === tracked.assetId && matchesCorrelation(candidate, tracked.requestId)
      ))
      : findSubmittedEntry(entries, tracked)
    if (!entry) return

    if (!tracked.assetId) tracked.assetId = entry.id
    syncStateFromEntry(entry, setState)
  }, [entries])

  useEffect(() => {
    if (!gameSlug) return
    const { epoch, controller } = beginTrackingEpoch()
    preferredTransportRef.current = 'http'
    activeTasksRef.current = []
    setState(IDLE_STATE)
    void listActiveGenerationsRef.current(gameSlug, { signal: controller.signal }).then(
      (tasks) => {
        if (!isCurrent(epoch)) return
        preferredTransportRef.current = 'http'
        if (tasks.length === 0) return
        const latest = tasks[0]
        if (!latest) return
        adoptHttpTask(gameSlug, latest, epoch, controller.signal, tasks)
      },
      (error: unknown) => {
        // Recovery is best-effort; create remains available regardless of list failures.
        if (!isCurrent(epoch) || !isVideoGenerationHttpUnavailable(error)) return
        preferredTransportRef.current = 'tool'
        setState({ phase: 'idle', transport: 'tool' })
      },
    )
    return () => {
      if (epochRef.current !== epoch) return
      epochRef.current += 1
      clearTimer()
      controller.abort()
    }
  }, [adoptHttpTask, beginTrackingEpoch, clearTimer, gameSlug, isCurrent])

  const startToolFallback = useCallback((
    request: ClipGenerationRequest,
    epoch: number,
  ): void => {
    let requestId: string
    try {
      requestId = createRequestId()
      assertClipGenerationRequestId(requestId)
    } catch (error) {
      if (isCurrent(epoch)) setState({ phase: 'failed', transport: 'tool', error: errorMessage(error) })
      return
    }

    const tracked: TrackedSubmission = {
      requestId,
      idsBeforeSubmit: new Set(entries.map((entry) => entry.id)),
    }
    let wireRequest: ClipGenerationWireRequest
    try {
      wireRequest = toPhaseOneWireRequest(request, requestId)
    } catch (error) {
      if (isCurrent(epoch)) {
        setState({ phase: 'failed', transport: 'tool', error: errorMessage(error) })
      }
      return
    }
    trackedToolRef.current = tracked
    setState({ phase: 'submitting', transport: 'tool' })
    void submitClip(wireRequest).then(
      (submission) => {
        if (!isCurrent(epoch)) return
        tracked.assetId = submission.assetId
        setState((current) => terminalFallbackState(current, submission))
      },
      (error: unknown) => {
        if (!isCurrent(epoch)) return
        setState((current) => {
          if (current.phase === 'succeeded' || current.phase === 'failed') return current
          return {
            phase: 'failed',
            transport: 'tool',
            assetId: current.assetId,
            error: errorMessage(error),
          }
        })
      },
    )
  }, [createRequestId, entries, isCurrent, submitClip])

  const submit = useCallback((request: ClipGenerationRequest): void => {
    const { epoch, controller } = beginTrackingEpoch()
    activeTasksRef.current = []
    if (preferredTransportRef.current === 'tool') {
      startToolFallback(request, epoch)
      return
    }
    let params: VideoGenerationParams
    try {
      params = toVideoGenerationParams(request)
    } catch (error) {
      setState({ phase: 'failed', transport: 'http', error: errorMessage(error) })
      return
    }
    setState({ phase: 'submitting', transport: 'http' })
    void createGenerationRef.current(params, { signal: controller.signal }).then(
      (task) => {
        if (!isCurrent(epoch)) return
        preferredTransportRef.current = 'http'
        adoptHttpTask(request.gameSlug, task, epoch, controller.signal, [task])
      },
      (error: unknown) => {
        if (!isCurrent(epoch)) return
        if (isVideoGenerationHttpUnavailable(error)) {
          preferredTransportRef.current = 'tool'
          startToolFallback(request, epoch)
          return
        }
        setState({ phase: 'failed', transport: 'http', error: errorMessage(error) })
      },
    )
  }, [adoptHttpTask, beginTrackingEpoch, isCurrent, startToolFallback])

  const cancel = useCallback((): void => {
    beginTrackingEpoch()
    activeTasksRef.current = []
    setState(preferredTransportRef.current === 'tool'
      ? { phase: 'idle', transport: 'tool' }
      : IDLE_STATE)
  }, [beginTrackingEpoch])

  const track = useCallback((generationId: string): void => {
    if (!gameSlug) return
    const task = activeTasksRef.current.find((candidate) => candidate.generationId === generationId)
    if (!task) return
    const { epoch, controller } = beginTrackingEpoch()
    adoptHttpTask(gameSlug, task, epoch, controller.signal, activeTasksRef.current)
  }, [adoptHttpTask, beginTrackingEpoch, gameSlug])

  return { state, submit, cancel, reset: cancel, track }
}

function toVideoGenerationParams(request: ClipGenerationRequest): VideoGenerationParams {
  assertReferenceIdentities(request, 'http')
  return {
    gameSlug: request.gameSlug,
    prompt: request.prompt,
    durationSeconds: request.durationSeconds,
    size: request.size ?? '2560x1440',
    resolution: request.resolution ?? '720p',
    ...(request.model ? { model: request.model } : {}),
    generateAudio: request.generateAudio,
    ...(request.firstFrameResourceId
      ? { firstFrameResourceId: request.firstFrameResourceId }
      : {}),
    ...(request.lastFrameResourceId
      ? { lastFrameResourceId: request.lastFrameResourceId }
      : {}),
    ...(request.referenceImageResourceIds
      ? { referenceImageResourceIds: request.referenceImageResourceIds }
      : {}),
  }
}

function toPhaseOneWireRequest(
  request: ClipGenerationRequest,
  requestId: string,
): ClipGenerationWireRequest {
  assertReferenceIdentities(request, 'tool')
  return {
    prompt: request.prompt,
    durationSeconds: Math.min(15, request.durationSeconds),
    generateAudio: request.generateAudio,
    mode: request.mode,
    ...(request.firstFrameAssetId
      ? { firstFrameAssetId: request.firstFrameAssetId }
      : {}),
    ...(request.lastFrameAssetId
      ? { lastFrameAssetId: request.lastFrameAssetId }
      : {}),
    ...(request.referenceImageAssetIds
      ? { referenceImageAssetIds: request.referenceImageAssetIds }
      : {}),
    ...(request.label ? { label: request.label } : {}),
    requestId,
  }
}

type ReferenceIdentityTransport = 'http' | 'tool'

function assertReferenceIdentities(
  request: ClipGenerationRequest,
  transport: ReferenceIdentityTransport,
): void {
  const firstId = transport === 'http'
    ? request.firstFrameResourceId
    : request.firstFrameAssetId
  const lastId = transport === 'http'
    ? request.lastFrameResourceId
    : request.lastFrameAssetId
  const referenceIds = transport === 'http'
    ? request.referenceImageResourceIds
    : request.referenceImageAssetIds

  if (request.mode === 'strict') {
    if (!isNonEmptyId(firstId) || !isNonEmptyId(lastId)) {
      throw missingReferenceIdentity(transport)
    }
    return
  }
  if (request.mode === 'firstref') {
    if (!isNonEmptyId(firstId)) throw missingReferenceIdentity(transport)
    return
  }
  if (request.mode !== 'ref') return

  const counterpartIds = transport === 'http'
    ? request.referenceImageAssetIds
    : request.referenceImageResourceIds
  const expectedCount = Math.max(referenceIds?.length ?? 0, counterpartIds?.length ?? 0)
  if (
    expectedCount === 0
    || referenceIds?.length !== expectedCount
    || !referenceIds.every(isNonEmptyId)
  ) {
    throw missingReferenceIdentity(transport)
  }
}

function missingReferenceIdentity(transport: ReferenceIdentityTransport): Error {
  return new Error(transport === 'http'
    ? 'Selected reference media is unavailable for HTTP generation. Choose it again.'
    : 'Selected reference media is unavailable for tool generation. Choose it again.')
}

function isNonEmptyId(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function findSubmittedEntry(
  entries: readonly ClipGenerationRegistryEntry[],
  tracked: TrackedSubmission,
): ClipGenerationRegistryEntry | undefined {
  return entries.find((entry) => (
    !tracked.idsBeforeSubmit.has(entry.id)
    && matchesCorrelation(entry, tracked.requestId)
  ))
}

function matchesCorrelation(entry: ClipGenerationRegistryEntry, requestId: string): boolean {
  return entry.meta?.source === CLIP_GENERATION_SOURCE
    && entry.meta.requestId === requestId
}

function syncStateFromEntry(
  entry: ClipGenerationRegistryEntry,
  setState: (updater: (current: ClipGenState) => ClipGenState) => void,
): void {
  const next = stateFromEntry(entry)
  if (!next) return
  setState((current) => statesEqual(current, next) ? current : next)
}

function stateFromEntry(entry: ClipGenerationRegistryEntry): ClipGenState | null {
  if (entry.status === 'generating') {
    return { phase: 'generating', transport: 'tool', assetId: entry.id }
  }
  if (entry.status === 'ready') {
    return { phase: 'succeeded', transport: 'tool', assetId: entry.id }
  }
  if (entry.status === 'failed') {
    return { phase: 'failed', transport: 'tool', assetId: entry.id, error: entry.error }
  }
  return null
}

function terminalFallbackState(
  current: ClipGenState,
  submission: ClipGenerationSubmission,
): ClipGenState {
  if (current.phase === 'succeeded' || current.phase === 'failed') return current
  if (submission.status === 'ready') {
    return { phase: 'succeeded', transport: 'tool', assetId: submission.assetId }
  }
  return {
    phase: 'failed',
    transport: 'tool',
    assetId: submission.assetId,
    error: submission.error,
  }
}

function httpGeneratingState(
  task: VideoGenerationTask,
  activeTasks: readonly VideoGenerationTask[],
): ClipGenState {
  return {
    phase: 'generating',
    transport: 'http',
    generationId: task.generationId,
    resultUrl: task.resultUrl,
    resourceId: task.resourceId,
    activeTasks,
  }
}

function httpTerminalState(
  task: VideoGenerationTask,
  activeTasks: readonly VideoGenerationTask[],
): ClipGenState {
  if (task.status === 'succeeded') {
    return {
      phase: 'succeeded',
      transport: 'http',
      generationId: task.generationId,
      resultUrl: task.resultUrl,
      resourceId: task.resourceId,
      activeTasks,
    }
  }
  return {
    phase: 'failed',
    transport: 'http',
    generationId: task.generationId,
    resultUrl: task.resultUrl,
    resourceId: task.resourceId,
    activeTasks,
    error: task.errorMessage ?? (task.status === 'cancelled'
      ? 'Video generation was cancelled'
      : 'Video generation failed'),
  }
}

function isTerminalTask(task: VideoGenerationTask): boolean {
  return task.status === 'succeeded' || task.status === 'failed' || task.status === 'cancelled'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function statesEqual(left: ClipGenState, right: ClipGenState): boolean {
  return left.phase === right.phase
    && left.transport === right.transport
    && left.generationId === right.generationId
    && left.assetId === right.assetId
    && left.resultUrl === right.resultUrl
    && left.resourceId === right.resourceId
    && left.error === right.error
    && left.activeTasks === right.activeTasks
}
