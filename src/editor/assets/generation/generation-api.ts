import {
  HttpForgeaXToolClient,
  type ForgeaXToolPort,
} from '@forgeax-extension/wb-asset-canvas/generation'
import {
  KINO_NETWORK_FAILURE_MESSAGE,
  KINO_PLAIN_HTTP_404_MESSAGE,
  KinoClientError,
  requestKinoEnvelope,
  type KinoEnvelopeRequestOptions,
  type KinoRequestOptions,
} from '../kino-api'

export const CLIP_GENERATION_TOOL_ID = 'wb-game-video:generate-video-clip'
// Kino 原生 generations API（经网关直达 kino 服务端）。此前指向旧服务端的
// /api/private/v1/kino/generations —— Arrival 侧没有该私有
// 服务，请求/响应契约由本文件直接翻译成 kino 原生格式。
export const VIDEO_GENERATIONS_API_PATH = '/api/v1/kino/generations'

// 与服务端默认值保持一致（DEFAULT_KINO_VIDEO_MODEL）。
const DEFAULT_VIDEO_MODEL = 'seedance2'
const ACTIVE_GENERATION_STATUSES = new Set<VideoGenerationStatus>([
  'pending',
  'submitting',
  'polling',
])
const LIST_PAGE_SIZE = 50

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

/** 把私有契约的平铺参数翻译成 kino 原生 create 请求体。 */
function toKinoCreatePayload(params: VideoGenerationParams): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: params.prompt }]
  if (params.firstFrameResourceId) {
    content.push({
      type: 'resource',
      resource_id: params.firstFrameResourceId,
      frame_position: 'first',
    })
  }
  if (params.lastFrameResourceId) {
    content.push({
      type: 'resource',
      resource_id: params.lastFrameResourceId,
      frame_position: 'last',
    })
  }
  for (const resourceId of params.referenceImageResourceIds ?? []) {
    content.push({ type: 'resource', resource_id: resourceId })
  }
  return {
    game_id: params.gameSlug,
    media_type: 'video',
    model: params.model || DEFAULT_VIDEO_MODEL,
    size: params.size,
    duration_sec: params.durationSeconds,
    add_to_resource: true,
    content,
    extra: { generate_audio: params.generateAudio, resolution: params.resolution },
  }
}

export async function createVideoGeneration(
  params: VideoGenerationParams,
  options: KinoRequestOptions = {},
): Promise<VideoGenerationTask> {
  const dto = await requestVideoGenerationEnvelope<VideoGenerationTaskDTO>(VIDEO_GENERATIONS_API_PATH, {
    method: 'POST',
    json: toKinoCreatePayload(params),
    signal: options.signal,
  })
  return toVideoGenerationTask(dto)
}

export async function getVideoGeneration(
  gameSlug: string,
  generationId: string,
  options: KinoRequestOptions = {},
): Promise<VideoGenerationTask> {
  // kino 原生单查只认路径参数，任务归属由服务端会话判定；gameSlug 仅保留在
  // 签名里以维持调用方兼容。
  void gameSlug
  const dto = await requestVideoGenerationEnvelope<VideoGenerationTaskDTO>(
    `${VIDEO_GENERATIONS_API_PATH}/${encodeURIComponent(generationId)}`,
    { signal: options.signal },
  )
  return toVideoGenerationTask(dto)
}

/**
 * kino 原生 list 不支持"仅进行中"的多状态过滤（status 参数单值），这里拉最近
 * 一页后在客户端过滤 + 按 created_at 降序 —— 与旧服务端的私有 API 行为一致。
 */
export async function listActiveVideoGenerations(
  gameSlug: string,
  options: KinoRequestOptions = {},
): Promise<VideoGenerationTask[]> {
  const page = await requestVideoGenerationEnvelope<ActiveVideoGenerationsDTO>(VIDEO_GENERATIONS_API_PATH, {
    query: { game_id: gameSlug, media_type: 'video', page_size: String(LIST_PAGE_SIZE) },
    signal: options.signal,
  })
  if (!page || !Array.isArray(page.items)) {
    throw new KinoClientError('Video generation list returned an invalid response', 502, 'upstream_unavailable')
  }
  return page.items
    .map(toVideoGenerationTask)
    .filter((task) => ACTIVE_GENERATION_STATUSES.has(task.status))
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
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
    && error.message === KINO_PLAIN_HTTP_404_MESSAGE
}

function isBrowserConnectionFailure(error: unknown): boolean {
  return error instanceof KinoClientError
    && error.status === 502
    && error.errorCode === 'network_error'
    && error.message === KINO_NETWORK_FAILURE_MESSAGE
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
