import {
  HttpForgeaXToolClient,
  type ForgeaXToolPort,
} from '@forgeax-extension/wb-asset-canvas/generation'
import {
  KinoClientError,
  requestKinoEnvelope,
  type KinoEnvelopeRequestOptions,
  type KinoRequestOptions,
} from '../kino-api'

export const CLIP_GENERATION_TOOL_ID = 'wb-game-video:generate-video-clip'
export const VIDEO_GENERATIONS_API_PATH = '/api/private/v1/kino/generations'

export type KinoVideoSize = '2560x1440' | '1440x2560' | '2496x1664' | '1664x2496'
export type KinoVideoResolution = '720p' | '1080p'
export type VideoGenerationStatus =
  | 'pending'
  | 'submitting'
  | 'polling'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface ClipGenerationRequest {
  gameSlug: string
  prompt: string
  durationSeconds: number
  generateAudio: boolean
  mode: 'strict' | 'firstref' | 'ref' | 't2v'
  /** Shared-registry identities used only by the Phase 1 tool transport. */
  firstFrameAssetId?: string
  lastFrameAssetId?: string
  referenceImageAssetIds?: string[]
  size?: KinoVideoSize
  resolution?: KinoVideoResolution
  model?: string
  /** Kino resource identities used only by the Phase 2 HTTP transport. */
  firstFrameResourceId?: string
  lastFrameResourceId?: string
  referenceImageResourceIds?: string[]
  label?: string
}

/**
 * Phase 1 ToolRegistry wire contract; Phase 2-only parameters must never cross this schema.
 * gameSlug is intentionally absent: the host injects game identity from its own binding,
 * matching every other wb-game-video:* tool contract.
 */
export interface ClipGenerationWireRequest {
  prompt: string
  durationSeconds: number
  generateAudio: boolean
  mode: ClipGenerationRequest['mode']
  firstFrameAssetId?: string
  lastFrameAssetId?: string
  referenceImageAssetIds?: string[]
  label?: string
  requestId: string
}

export interface ClipGenerationSubmission {
  assetId: string
  status: 'ready' | 'failed'
  error?: string
}

export interface VideoGenerationParams {
  gameSlug: string
  prompt: string
  durationSeconds: number
  size: KinoVideoSize
  resolution: KinoVideoResolution
  model?: string
  generateAudio: boolean
  firstFrameResourceId?: string
  lastFrameResourceId?: string
  referenceImageResourceIds?: string[]
}

export interface VideoGenerationTask {
  generationId: string
  status: VideoGenerationStatus
  model?: string
  providerTaskId?: string
  resultUrl?: string
  resourceId?: string
  errorCode?: string
  errorMessage?: string
  createdAt?: number
}

interface VideoGenerationTaskDTO {
  generation_id: string
  status: VideoGenerationStatus
  model?: string
  provider_task_id?: string
  result_url?: string
  resource?: { resource_id?: unknown }
  error_code?: string
  error_message?: string
  created_at?: number
}

interface ActiveVideoGenerationsDTO {
  items: VideoGenerationTaskDTO[]
}

const defaultClient = new HttpForgeaXToolClient()
const PLAIN_ROUTE_NOT_FOUND_MESSAGE = 'Request failed with HTTP 404'
const NETWORK_REQUEST_FAILED_MESSAGE = 'Network request failed'

/** Explicit sentinel for an unmounted private route; Kino business 404s never become this error. */
export class VideoGenerationRouteUnavailableError extends Error {
  constructor() {
    super('Video generation HTTP route is unavailable')
    this.name = 'VideoGenerationRouteUnavailableError'
  }
}

/** Explicit sentinel for a browser-level connection failure, never an upstream business code. */
export class VideoGenerationConnectionUnavailableError extends Error {
  constructor() {
    super('Video generation HTTP connection is unavailable')
    this.name = 'VideoGenerationConnectionUnavailableError'
  }
}

export async function createVideoGeneration(
  params: VideoGenerationParams,
  options: KinoRequestOptions = {},
): Promise<VideoGenerationTask> {
  const dto = await requestVideoGenerationEnvelope<VideoGenerationTaskDTO>(VIDEO_GENERATIONS_API_PATH, {
    method: 'POST',
    json: params,
    signal: options.signal,
  })
  return toVideoGenerationTask(dto)
}

export async function getVideoGeneration(
  gameSlug: string,
  generationId: string,
  options: KinoRequestOptions = {},
): Promise<VideoGenerationTask> {
  const dto = await requestVideoGenerationEnvelope<VideoGenerationTaskDTO>(
    `${VIDEO_GENERATIONS_API_PATH}/${encodeURIComponent(generationId)}`,
    { query: { gameSlug }, signal: options.signal },
  )
  return toVideoGenerationTask(dto)
}

/** The server already returns active tasks newest-first; do not re-filter or re-sort here. */
export async function listActiveVideoGenerations(
  gameSlug: string,
  options: KinoRequestOptions = {},
): Promise<VideoGenerationTask[]> {
  const page = await requestVideoGenerationEnvelope<ActiveVideoGenerationsDTO>(VIDEO_GENERATIONS_API_PATH, {
    query: { gameSlug },
    signal: options.signal,
  })
  if (!page || !Array.isArray(page.items)) {
    throw new KinoClientError('Video generation list returned an invalid response', 502, 'upstream_unavailable')
  }
  return page.items.map(toVideoGenerationTask)
}

/** Only a missing private route or a browser-level connection failure enables Phase 1 fallback. */
export function isVideoGenerationHttpUnavailable(error: unknown): boolean {
  return error instanceof VideoGenerationRouteUnavailableError
    || error instanceof VideoGenerationConnectionUnavailableError
}

/**
 * Starts the blocking ToolRegistry call and unwraps its result envelope.
 * Consumers must not await this promise to represent progress: the registry asset is the
 * lifecycle source of truth, while this terminal result only provides a fallback.
 */
export async function submitClipGeneration(
  request: ClipGenerationWireRequest,
  toolPort: ForgeaXToolPort = defaultClient,
): Promise<ClipGenerationSubmission> {
  assertClipGenerationRequestId(request.requestId)
  const response = await toolPort.call(CLIP_GENERATION_TOOL_ID, request)
  if (!response.ok) {
    throw new Error(response.error)
  }
  if (!isClipGenerationSubmission(response.result)) {
    throw new Error('Video generation tool returned an invalid response')
  }
  return response.result
}

export function createClipGenerationRequestId(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') {
    const requestId = cryptoApi.randomUUID()
    assertClipGenerationRequestId(requestId)
    return requestId
  }
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    const requestId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    assertClipGenerationRequestId(requestId)
    return requestId
  }
  throw new Error('Secure requestId generation is unavailable')
}

export function assertClipGenerationRequestId(requestId: string): void {
  if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > 128) {
    throw new Error('Video generation requestId must contain 1 to 128 characters')
  }
}

function isClipGenerationSubmission(value: unknown): value is ClipGenerationSubmission {
  if (!isRecord(value) || typeof value.assetId !== 'string') {
    return false
  }
  if (value.status !== 'ready' && value.status !== 'failed') {
    return false
  }
  return value.error === undefined || typeof value.error === 'string'
}

async function requestVideoGenerationEnvelope<T>(
  path: string,
  options: KinoEnvelopeRequestOptions,
): Promise<T> {
  try {
    return await requestKinoEnvelope<T>(path, options)
  } catch (error) {
    if (isPlainRouteNotFound(error)) {
      throw new VideoGenerationRouteUnavailableError()
    }
    if (isBrowserConnectionFailure(error)) {
      throw new VideoGenerationConnectionUnavailableError()
    }
    throw error
  }
}

function isPlainRouteNotFound(error: unknown): boolean {
  return error instanceof KinoClientError
    && error.status === 404
    && error.errorCode === 'not_found'
    && error.message === PLAIN_ROUTE_NOT_FOUND_MESSAGE
}

function isBrowserConnectionFailure(error: unknown): boolean {
  return error instanceof KinoClientError
    && error.status === 502
    && error.errorCode === 'network_error'
    && error.message === NETWORK_REQUEST_FAILED_MESSAGE
}

function toVideoGenerationTask(dto: VideoGenerationTaskDTO): VideoGenerationTask {
  if (!isRecord(dto) || typeof dto.generation_id !== 'string' || !isVideoGenerationStatus(dto.status)) {
    throw new KinoClientError('Video generation returned an invalid response', 502, 'upstream_unavailable')
  }
  const resourceId = isRecord(dto.resource) && typeof dto.resource.resource_id === 'string'
    ? dto.resource.resource_id
    : undefined
  return {
    generationId: dto.generation_id,
    status: dto.status,
    ...(typeof dto.model === 'string' ? { model: dto.model } : {}),
    ...(typeof dto.provider_task_id === 'string' ? { providerTaskId: dto.provider_task_id } : {}),
    ...(typeof dto.result_url === 'string' ? { resultUrl: dto.result_url } : {}),
    ...(resourceId ? { resourceId } : {}),
    ...(typeof dto.error_code === 'string' ? { errorCode: dto.error_code } : {}),
    ...(typeof dto.error_message === 'string' ? { errorMessage: dto.error_message } : {}),
    ...(typeof dto.created_at === 'number' ? { createdAt: dto.created_at } : {}),
  }
}

function isVideoGenerationStatus(value: unknown): value is VideoGenerationStatus {
  return value === 'pending'
    || value === 'submitting'
    || value === 'polling'
    || value === 'succeeded'
    || value === 'failed'
    || value === 'cancelled'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
