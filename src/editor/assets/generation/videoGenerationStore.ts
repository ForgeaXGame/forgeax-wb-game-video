import { useEffect } from 'react'
import { create } from 'zustand'
import { requestKinoEnvelope, type KinoRequestOptions } from '../kino-api'
import type { VideoGenerationTask, VideoGenerationStatus } from './generation-api'

export const VIDEO_GENERATION_POLL_INTERVAL_MS = 3_000

interface GenerationTaskDTO {
  generation_id: string
  status: VideoGenerationStatus
  prompt_text?: string
  model?: string
  provider_task_id?: string
  result_url?: string
  resource?: { resource_id?: unknown }
  error_code?: string
  error_message?: string
  created_at?: number
}

interface ActiveGenerationPageDTO {
  items: GenerationTaskDTO[]
}

export interface VideoGenerationStoreEntry {
  tasks: readonly VideoGenerationTask[]
  selectedGenerationId?: string
  selectedTask?: VideoGenerationTask
  loading: boolean
  error: string | null
  revision: number
  completionRevision: number
}

interface VideoGenerationStore {
  byGame: Record<string, VideoGenerationStoreEntry | undefined>
  refresh: (gameSlug: string, options?: KinoRequestOptions) => Promise<void>
  select: (gameSlug: string, generationId?: string) => void
}

const EMPTY_ENTRY: VideoGenerationStoreEntry = {
  tasks: [],
  loading: false,
  error: null,
  revision: 0,
  completionRevision: 0,
}

/**
 * Reads the server-owned Kino task projection. This deliberately uses the
 * Studio same-origin API instead of the extension router: a long-running
 * generation must not prevent status recovery when the extension page unmounts.
 */
export async function listActiveVideoGenerationTasks(
  gameSlug: string,
  options: KinoRequestOptions = {},
): Promise<VideoGenerationTask[]> {
  const page = await requestKinoEnvelope<ActiveGenerationPageDTO>('/api/v1/kino-generations', {
    query: { gameSlug },
    signal: options.signal,
    fetch: globalThis.fetch.bind(globalThis),
  })
  if (!page || !Array.isArray(page.items)) throw new Error('Video generation list returned an invalid response')
  return page.items.map(toTask)
}

export async function getVideoGenerationTask(
  gameSlug: string,
  generationId: string,
  options: KinoRequestOptions = {},
): Promise<VideoGenerationTask> {
  const task = await requestKinoEnvelope<GenerationTaskDTO>(
    `/api/v1/kino-generations/${encodeURIComponent(generationId)}`,
    {
      query: { gameSlug },
      signal: options.signal,
      fetch: globalThis.fetch.bind(globalThis),
    },
  )
  return toTask(task)
}

export const useVideoGenerationStore = create<VideoGenerationStore>((set, get) => ({
  byGame: {},

  async refresh(gameSlug, options) {
    const current = get().byGame[gameSlug] ?? EMPTY_ENTRY
    const revision = current.revision + 1
    set((state) => ({
      byGame: {
        ...state.byGame,
        [gameSlug]: { ...current, loading: current.tasks.length === 0, error: null, revision },
      },
    }))
    try {
      const tasks = await listActiveVideoGenerationTasks(gameSlug, options)
      const selectedGenerationId = current.selectedGenerationId
      const selectedTask = selectedGenerationId === undefined
        ? undefined
        : tasks.find((task) => task.generationId === selectedGenerationId)
          ?? await getVideoGenerationTask(gameSlug, selectedGenerationId, options)
      if ((get().byGame[gameSlug]?.revision ?? 0) !== revision) return
      set((state) => ({
        byGame: (() => {
          const previous = state.byGame[gameSlug] ?? EMPTY_ENTRY
          const activeIds = new Set(tasks.map((task) => task.generationId))
          const completed = previous.tasks.some((task) => !activeIds.has(task.generationId))
          return {
            ...state.byGame,
            [gameSlug]: {
              ...previous,
              completionRevision: previous.completionRevision + (completed ? 1 : 0),
              tasks,
              selectedTask,
              loading: false,
              error: null,
              revision,
            },
          }
        })(),
      }))
    } catch (error) {
      if (options?.signal?.aborted || (get().byGame[gameSlug]?.revision ?? 0) !== revision) return
      set((state) => ({
        byGame: {
          ...state.byGame,
          [gameSlug]: {
            ...(state.byGame[gameSlug] ?? EMPTY_ENTRY),
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            revision,
          },
        },
      }))
    }
  },

  select(gameSlug, generationId) {
    set((state) => {
      const current = state.byGame[gameSlug] ?? EMPTY_ENTRY
      return {
        byGame: {
          ...state.byGame,
          [gameSlug]: generationId === undefined
            ? {
                ...current,
                revision: current.revision + 1,
                selectedGenerationId: undefined,
                selectedTask: undefined,
              }
            : {
                ...current,
                revision: current.revision + 1,
                selectedGenerationId: generationId,
                selectedTask: current.tasks.find((task) => task.generationId === generationId),
              },
        },
      }
    })
  },
}))

/** One app-level subscriber owns polling; page components only consume snapshots. */
export function useGlobalVideoGenerationTracker(gameSlug: string): void {
  const refresh = useVideoGenerationStore((state) => state.refresh)
  useEffect(() => {
    const controller = new AbortController()
    void refresh(gameSlug, { signal: controller.signal })
    const timer = window.setInterval(() => {
      void refresh(gameSlug, { signal: controller.signal })
    }, VIDEO_GENERATION_POLL_INTERVAL_MS)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [gameSlug, refresh])
}

function toTask(dto: GenerationTaskDTO): VideoGenerationTask {
  if (!dto || typeof dto.generation_id !== 'string' || !isStatus(dto.status)) {
    throw new Error('Video generation list returned an invalid task')
  }
  const resourceId = dto.resource && typeof dto.resource.resource_id === 'string'
    ? dto.resource.resource_id
    : undefined
  return {
    generationId: dto.generation_id,
    status: dto.status,
    ...(typeof dto.prompt_text === 'string' ? { prompt: dto.prompt_text } : {}),
    ...(typeof dto.model === 'string' ? { model: dto.model } : {}),
    ...(typeof dto.provider_task_id === 'string' ? { providerTaskId: dto.provider_task_id } : {}),
    ...(typeof dto.result_url === 'string' ? { resultUrl: dto.result_url } : {}),
    ...(resourceId ? { resourceId } : {}),
    ...(typeof dto.error_code === 'string' ? { errorCode: dto.error_code } : {}),
    ...(typeof dto.error_message === 'string' ? { errorMessage: dto.error_message } : {}),
    ...(typeof dto.created_at === 'number' ? { createdAt: dto.created_at } : {}),
  }
}

function isStatus(value: unknown): value is VideoGenerationStatus {
  return value === 'pending' || value === 'submitting' || value === 'polling'
    || value === 'succeeded' || value === 'failed' || value === 'cancelled'
}
