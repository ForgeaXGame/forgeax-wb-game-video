import { randomUUID } from 'node:crypto'
import type {
  MediaBody,
} from '@forgeax/workbench-host/contracts'
import type { WorkbenchExtensionContext } from '@forgeax/workbench-host/node'
import { WbServiceInputError } from './wb-service'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type BrowserMediaType = 'audio' | 'image' | 'video' | 'font'

type BrowserMediaRecord = {
  readonly resource_id: string
  readonly media_type: BrowserMediaType
  name: string
  type?: string
  remark?: string
  source?: string
  source_meta?: Record<string, unknown>
  readonly created_at: number
  updated_at: number
  deleted: boolean
}

type UploadSession = {
  readonly version: 1
  readonly id: string
  readonly fileName: string
  readonly mediaType: BrowserMediaType
  readonly contentType: string
  readonly totalSize: number
  readonly chunkSize: number
  readonly chunkCount: number
  readonly createdAt: number
  nextIndex: number
  status: 'open' | 'finalized'
  resourceId?: string
}

type KinoCreateInput = {
  game_id: string
  media_type: BrowserMediaType
  url: string
  name?: string
  type?: string
  remark?: string
  source?: string
  source_meta?: Record<string, unknown>
}

const BROWSER_MEDIA_INDEX_PATH = 'assets/wb-game-video-media.json'
const UPLOAD_ROOT = 'assets/.wb-game-video-uploads'
const UPLOAD_CHUNK_BYTES = 512 * 1024
const MAX_UPLOAD_CHUNKS = 200
const UPLOAD_ID_PATTERN = /^[0-9a-f]{32}$/
const UPLOAD_REFERENCE_PATTERN = /^workbench-upload:([0-9a-f]{32})$/
const uploadQueues = new Map<string, Promise<void>>()

const MEDIA_POLICIES: Readonly<Record<BrowserMediaType, {
  readonly maxBytes: number
  readonly mimeTypes: readonly string[]
}>> = {
  image: {
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  },
  video: {
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: ['video/mp4'],
  },
  audio: {
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac'],
  },
  font: {
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: ['font/woff2', 'font/woff', 'font/ttf', 'font/otf'],
  },
}

export class UploadConflictError extends Error {}

function exactObject(
  value: unknown,
  allowed: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WbServiceInputError(`${label} must be an object`)
  }
  const record = value as Record<string, unknown>
  const allowedKeys = new Set(allowed)
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new WbServiceInputError(`${label} contains unsupported key: ${key}`)
    }
  }
  return record
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new WbServiceInputError(`${label} must be a non-empty string`)
  }
  return value
}

function safeFileName(value: unknown): string {
  const name = nonEmptyString(value, 'file_name')
  if (
    name.length > 255
    || /[/\\\u0000-\u001f\u007f]/.test(name)
    || name === '.'
    || name === '..'
  ) {
    throw new WbServiceInputError('file_name is invalid')
  }
  return name
}

export function browserMediaType(value: string | undefined): BrowserMediaType {
  if (value === 'audio' || value === 'image' || value === 'video' || value === 'font') return value
  throw new WbServiceInputError('x-workbench-media-type is invalid')
}

function mediaTypeForContentType(value: string): BrowserMediaType {
  for (const [type, policy] of Object.entries(MEDIA_POLICIES) as Array<
    [BrowserMediaType, typeof MEDIA_POLICIES[BrowserMediaType]]
  >) {
    if (policy.mimeTypes.includes(value)) return type
  }
  throw new WbServiceInputError('mime_type is invalid')
}

function resource(record: BrowserMediaRecord, url: string, gameId: string) {
  return {
    resource_id: record.resource_id,
    game_id: gameId,
    media_type: record.media_type,
    name: record.name,
    ...(record.type === undefined ? {} : { type: record.type }),
    ...(record.remark === undefined ? {} : { remark: record.remark }),
    ...(record.source === undefined ? {} : { source: record.source }),
    ...(record.source_meta === undefined ? {} : { source_meta: record.source_meta }),
    url,
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}

function browserMediaRecord(value: unknown): BrowserMediaRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid persisted browser media record')
  }
  const record = value as Partial<BrowserMediaRecord>
  if (
    typeof record.resource_id !== 'string'
    || !record.resource_id
    || (record.media_type !== 'audio' && record.media_type !== 'image' && record.media_type !== 'video' && record.media_type !== 'font')
    || typeof record.name !== 'string'
    || (record.type !== undefined && typeof record.type !== 'string')
    || (record.remark !== undefined && typeof record.remark !== 'string')
    || (record.source !== undefined && typeof record.source !== 'string')
    || (record.source_meta !== undefined && (
      !record.source_meta
      || typeof record.source_meta !== 'object'
      || Array.isArray(record.source_meta)
    ))
    || !Number.isSafeInteger(record.created_at)
    || !Number.isSafeInteger(record.updated_at)
    || typeof record.deleted !== 'boolean'
  ) {
    throw new Error('Invalid persisted browser media record')
  }
  return record as BrowserMediaRecord
}

async function readBrowserMedia(context: WorkbenchExtensionContext): Promise<BrowserMediaRecord[]> {
  const bytes = await context.files.read(BROWSER_MEDIA_INDEX_PATH)
  if (!bytes) return []
  let value: unknown
  try {
    value = JSON.parse(decoder.decode(bytes))
  } catch {
    throw new Error('Invalid persisted browser media index')
  }
  if (!Array.isArray(value)) throw new Error('Invalid persisted browser media index')
  const records = value.map(browserMediaRecord)
  if (new Set(records.map((record) => record.resource_id)).size !== records.length) {
    throw new Error('Invalid persisted browser media index')
  }
  return records
}

async function writeBrowserMedia(
  context: WorkbenchExtensionContext,
  records: readonly BrowserMediaRecord[],
): Promise<void> {
  await context.files.write(BROWSER_MEDIA_INDEX_PATH, encoder.encode(JSON.stringify(records)))
}

async function browserMediaLocators(
  context: WorkbenchExtensionContext,
): Promise<Map<string, string>> {
  return new Map((await context.media.list(context.gameId)).map((asset) => [asset.id, asset.url]))
}

function uploadSessionPath(id: string): string {
  return `${UPLOAD_ROOT}/${id}/session.json`
}

function uploadChunkPath(id: string, index: number): string {
  return `${UPLOAD_ROOT}/${id}/chunks/${index}.bin`
}

async function withUploadLock<T>(
  scope: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = uploadQueues.get(scope) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => current)
  uploadQueues.set(scope, tail)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (uploadQueues.get(scope) === tail) uploadQueues.delete(scope)
  }
}

function uploadSession(value: unknown, expectedId: string): UploadSession {
  const session = exactObject(value, [
    'version', 'id', 'fileName', 'mediaType', 'contentType', 'totalSize',
    'chunkSize', 'chunkCount', 'createdAt', 'nextIndex', 'status', 'resourceId',
  ], 'upload session') as Partial<UploadSession>
  if (
    session.version !== 1
    || session.id !== expectedId
    || !UPLOAD_ID_PATTERN.test(expectedId)
    || typeof session.fileName !== 'string'
    || browserMediaType(session.mediaType) !== session.mediaType
    || typeof session.contentType !== 'string'
    || !MEDIA_POLICIES[session.mediaType].mimeTypes.includes(session.contentType)
    || !Number.isSafeInteger(session.totalSize)
    || session.totalSize! <= 0
    || session.totalSize! > MEDIA_POLICIES[session.mediaType].maxBytes
    || session.chunkSize !== UPLOAD_CHUNK_BYTES
    || !Number.isSafeInteger(session.chunkCount)
    || session.chunkCount! <= 0
    || session.chunkCount! > MAX_UPLOAD_CHUNKS
    || session.chunkCount !== Math.ceil(session.totalSize! / session.chunkSize)
    || !Number.isSafeInteger(session.createdAt)
    || !Number.isSafeInteger(session.nextIndex)
    || session.nextIndex! < 0
    || session.nextIndex! > session.chunkCount!
    || (session.status !== 'open' && session.status !== 'finalized')
    || (session.resourceId !== undefined && typeof session.resourceId !== 'string')
  ) {
    throw new Error('Invalid persisted upload session')
  }
  return session as UploadSession
}

async function readUploadSession(
  context: WorkbenchExtensionContext,
  id: string,
): Promise<UploadSession | null> {
  if (!UPLOAD_ID_PATTERN.test(id)) return null
  const bytes = await context.files.read(uploadSessionPath(id))
  if (!bytes) return null
  try {
    return uploadSession(JSON.parse(decoder.decode(bytes)), id)
  } catch (error) {
    if (error instanceof WbServiceInputError) throw new Error('Invalid persisted upload session')
    throw error
  }
}

async function writeUploadSession(
  context: WorkbenchExtensionContext,
  session: UploadSession,
): Promise<void> {
  await context.files.write(uploadSessionPath(session.id), encoder.encode(JSON.stringify(session)))
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function kinoCreateInput(
  value: unknown,
  context: WorkbenchExtensionContext,
): KinoCreateInput {
  const input = exactObject(value, [
    'game_id', 'media_type', 'url', 'name', 'type', 'remark', 'source', 'source_meta',
  ], 'resource')
  if (nonEmptyString(input.game_id, 'game_id') !== context.gameId) {
    throw new WbServiceInputError('game_id does not match the host-bound game')
  }
  const mediaType = browserMediaType(
    typeof input.media_type === 'string' ? input.media_type : undefined,
  )
  const url = nonEmptyString(input.url, 'url')
  for (const key of ['name', 'type', 'remark', 'source'] as const) {
    if (input[key] !== undefined && typeof input[key] !== 'string') {
      throw new WbServiceInputError(`${key} must be a string`)
    }
  }
  if (input.source_meta !== undefined && (
    !input.source_meta
    || typeof input.source_meta !== 'object'
    || Array.isArray(input.source_meta)
  )) {
    throw new WbServiceInputError('source_meta must be an object')
  }
  return {
    game_id: context.gameId,
    media_type: mediaType,
    url,
    ...(input.name === undefined ? {} : { name: input.name as string }),
    ...(input.type === undefined ? {} : { type: input.type as string }),
    ...(input.remark === undefined ? {} : { remark: input.remark as string }),
    ...(input.source === undefined ? {} : { source: input.source as string }),
    ...(input.source_meta === undefined ? {} : {
      source_meta: input.source_meta as Record<string, unknown>,
    }),
  }
}

async function finalizeBrowserUpload(
  context: WorkbenchExtensionContext,
  input: KinoCreateInput,
): Promise<ReturnType<typeof resource>> {
  const match = UPLOAD_REFERENCE_PATTERN.exec(input.url)
  if (!match) throw new WbServiceInputError('url is not a prepared workbench upload')
  const id = match[1]!
  return withUploadLock(`${context.gameRoot}:${id}`, async () => {
    const session = await readUploadSession(context, id)
    if (!session) throw new WbServiceInputError('Prepared upload was not found')
    if (session.mediaType !== input.media_type) {
      throw new WbServiceInputError('media_type does not match the prepared upload')
    }
    if (session.status === 'finalized') {
      if (!session.resourceId) throw new Error('Invalid finalized upload session')
      const records = await readBrowserMedia(context)
      const record = records.find((item) => item.resource_id === session.resourceId && !item.deleted)
      const locator = (await browserMediaLocators(context)).get(session.resourceId)
      if (!record || !locator) throw new Error('Finalized upload resource is unavailable')
      return resource(record, locator, context.gameId)
    }
    if (session.nextIndex !== session.chunkCount) {
      throw new WbServiceInputError('Prepared upload is incomplete')
    }
    const combined = new Uint8Array(session.totalSize)
    let offset = 0
    for (let index = 0; index < session.chunkCount; index += 1) {
      const chunk = await context.files.read(uploadChunkPath(id, index))
      const expected = index === session.chunkCount - 1
        ? session.totalSize - session.chunkSize * index
        : session.chunkSize
      if (!chunk || chunk.byteLength !== expected) {
        throw new WbServiceInputError('Prepared upload is incomplete')
      }
      combined.set(chunk, offset)
      offset += chunk.byteLength
    }
    if (offset !== session.totalSize) throw new WbServiceInputError('Prepared upload is incomplete')

    const hosted = await context.media.put(context.gameId, {
      filename: session.fileName,
      contentType: session.contentType,
      bytes: combined,
      metadata: { source: 'wb-game-video-browser', uploadId: session.id },
    })
    const now = Date.now()
    const record: BrowserMediaRecord = {
      resource_id: hosted.id,
      media_type: session.mediaType,
      name: input.name ?? session.fileName,
      ...(input.type === undefined ? {} : { type: input.type }),
      ...(input.remark === undefined ? {} : { remark: input.remark }),
      ...(input.source === undefined ? {} : { source: input.source }),
      source_meta: {
        ...(input.source_meta ?? {}),
        mime_type: session.contentType,
        extra: {
          ...(
            input.source_meta?.extra
            && typeof input.source_meta.extra === 'object'
            && !Array.isArray(input.source_meta.extra)
              ? input.source_meta.extra as Record<string, unknown>
              : {}
          ),
          bytes: session.totalSize,
        },
      },
      created_at: now,
      updated_at: now,
      deleted: false,
    }
    const records = await readBrowserMedia(context)
    if (records.some((item) => item.resource_id === record.resource_id)) {
      throw new Error('Host media id already exists in the browser media index')
    }
    await writeBrowserMedia(context, [...records, record])
    session.status = 'finalized'
    session.resourceId = hosted.id
    await writeUploadSession(context, session)
    for (let index = 0; index < session.chunkCount; index += 1) {
      await context.files.write(uploadChunkPath(id, index), new Uint8Array())
    }
    return resource(record, hosted.url, context.gameId)
  })
}

export function createBrowserMediaService(context: WorkbenchExtensionContext) {
  return {
    async list(type?: BrowserMediaType, resourceType?: string) {
      const locators = await browserMediaLocators(context)
      return (await readBrowserMedia(context))
        .filter((record) =>
          !record.deleted
          && (!type || record.media_type === type)
          && (!resourceType || record.type === resourceType),
        )
        .flatMap((record) => {
          const locator = locators.get(record.resource_id)
          return locator ? [resource(record, locator, context.gameId)] : []
        })
    },

    async prepareUpload(value: unknown) {
      const input = exactObject(value, [
        'game_id', 'file_name', 'mime_type', 'bytes', 'extension',
        'client_resource_id', 'replace_existing',
      ], 'upload preparation')
      if (nonEmptyString(input.game_id, 'game_id') !== context.gameId) {
        throw new WbServiceInputError('game_id does not match the host-bound game')
      }
      const fileName = safeFileName(input.file_name)
      const contentType = nonEmptyString(input.mime_type, 'mime_type')
      const mediaType = mediaTypeForContentType(contentType)
      const totalSize = input.bytes
      if (
        !Number.isSafeInteger(totalSize)
        || (totalSize as number) <= 0
        || (totalSize as number) > MEDIA_POLICIES[mediaType].maxBytes
      ) {
        throw new WbServiceInputError('bytes exceeds the media upload limit')
      }
      if (input.extension !== undefined && (
        typeof input.extension !== 'string'
        || !/^[A-Za-z0-9]{1,10}$/.test(input.extension)
      )) {
        throw new WbServiceInputError('extension is invalid')
      }
      if (input.client_resource_id !== undefined && (
        typeof input.client_resource_id !== 'string'
        || !input.client_resource_id
      )) {
        throw new WbServiceInputError('client_resource_id is invalid')
      }
      if (input.replace_existing !== undefined && typeof input.replace_existing !== 'boolean') {
        throw new WbServiceInputError('replace_existing is invalid')
      }
      if (input.replace_existing === true && input.client_resource_id === undefined) {
        throw new WbServiceInputError('replace_existing requires client_resource_id')
      }

      const id = randomUUID().replaceAll('-', '')
      const chunkCount = Math.ceil((totalSize as number) / UPLOAD_CHUNK_BYTES)
      if (chunkCount <= 0 || chunkCount > MAX_UPLOAD_CHUNKS) {
        throw new WbServiceInputError('bytes requires too many upload chunks')
      }
      const now = Date.now()
      const session: UploadSession = {
        version: 1,
        id,
        fileName,
        mediaType,
        contentType,
        totalSize: totalSize as number,
        chunkSize: UPLOAD_CHUNK_BYTES,
        chunkCount,
        createdAt: now,
        nextIndex: 0,
        status: 'open',
      }
      await writeUploadSession(context, session)
      return {
        upload: {
          method: 'PUT',
          url: `media/uploads/${id}`,
          headers: { 'content-type': contentType },
          expires_at: new Date(now + 60 * 60 * 1000).toISOString(),
          chunk_size: UPLOAD_CHUNK_BYTES,
          chunk_count: chunkCount,
        },
        object_url: `workbench-upload:${id}`,
        upload_token: id,
      }
    },

    async putChunk(
      id: string,
      chunkIndex: number,
      chunkCount: number,
      contentType: string | undefined,
      body: Uint8Array,
    ): Promise<'written' | 'duplicate' | 'missing'> {
      return withUploadLock(`${context.gameRoot}:${id}`, async () => {
        const session = await readUploadSession(context, id)
        if (!session) return 'missing'
        if (session.status !== 'open') throw new UploadConflictError('Upload session is finalized')
        if (chunkCount !== session.chunkCount) {
          throw new WbServiceInputError('chunk_count does not match the upload session')
        }
        if (chunkIndex >= session.chunkCount) {
          throw new WbServiceInputError('chunk_index exceeds the upload session')
        }
        if (contentType !== session.contentType) {
          throw new WbServiceInputError('Chunk content type does not match the upload session')
        }
        const expectedSize = chunkIndex === session.chunkCount - 1
          ? session.totalSize - session.chunkSize * chunkIndex
          : session.chunkSize
        if (body.byteLength !== expectedSize || body.byteLength >= 1024 * 1024) {
          throw new WbServiceInputError('Chunk size does not match the upload session')
        }
        if (chunkIndex < session.nextIndex) {
          const existing = await context.files.read(uploadChunkPath(id, chunkIndex))
          if (existing && bytesEqual(existing, body)) return 'duplicate'
          throw new UploadConflictError('Upload chunk conflicts with persisted bytes')
        }
        if (chunkIndex > session.nextIndex) {
          throw new WbServiceInputError('Upload chunks must be sent in order')
        }
        await context.files.write(uploadChunkPath(id, chunkIndex), body)
        session.nextIndex += 1
        await writeUploadSession(context, session)
        return 'written'
      })
    },

    async create(value: unknown) {
      return finalizeBrowserUpload(context, kinoCreateInput(value, context))
    },

    async batch(value: unknown) {
      const input = exactObject(value, ['game_id', 'resources'], 'resource batch')
      if (nonEmptyString(input.game_id, 'game_id') !== context.gameId) {
        throw new WbServiceInputError('game_id does not match the host-bound game')
      }
      if (!Array.isArray(input.resources) || input.resources.length === 0 || input.resources.length > 100) {
        throw new WbServiceInputError('resources must contain between 1 and 100 items')
      }
      const items = []
      for (const value of input.resources) {
        const resourceInput = kinoCreateInput({
          ...exactObject(value, [
            'media_type', 'url', 'name', 'type', 'remark', 'source', 'source_meta',
          ], 'batch resource'),
          game_id: context.gameId,
        }, context)
        items.push(await finalizeBrowserUpload(context, resourceInput))
      }
      return { created_count: items.length, skipped_count: 0, items }
    },

    async directUpload(
      name: string,
      type: BrowserMediaType,
      contentType: string,
      body: Uint8Array,
    ) {
      const fileName = safeFileName(name)
      if (
        !MEDIA_POLICIES[type].mimeTypes.includes(contentType)
        || body.byteLength <= 0
        || body.byteLength > MEDIA_POLICIES[type].maxBytes
      ) {
        throw new WbServiceInputError('Media upload does not match its declared type')
      }
      const hosted = await context.media.put(context.gameId, {
        filename: fileName,
        contentType,
        bytes: body,
        metadata: { source: 'wb-game-video-browser' },
      })
      const now = Date.now()
      const record: BrowserMediaRecord = {
        resource_id: hosted.id,
        media_type: type,
        name: fileName,
        created_at: now,
        updated_at: now,
        deleted: false,
      }
      const records = await readBrowserMedia(context)
      if (records.some((item) => item.resource_id === record.resource_id)) {
        throw new Error('Host media id already exists in the browser media index')
      }
      await writeBrowserMedia(context, [...records, record])
      return resource(record, hosted.url, context.gameId)
    },

    async get(id: string) {
      const record = (await readBrowserMedia(context))
        .find((item) => item.resource_id === id && !item.deleted)
      if (!record) return null
      const locator = (await browserMediaLocators(context)).get(record.resource_id)
      return locator ? resource(record, locator, context.gameId) : null
    },

    async update(id: string, value: unknown) {
      const records = await readBrowserMedia(context)
      const index = records.findIndex((item) => item.resource_id === id)
      const record = index < 0 ? undefined : records[index]
      if (!record || record.deleted) return null
      const input = exactObject(value, [
        'resource_id', 'game_id', 'media_type', 'url', 'name',
        'type', 'remark', 'source', 'source_meta',
      ], 'resource update')
      if (typeof input.name !== 'string') {
        throw new WbServiceInputError('Media rename requires name')
      }
      if (input.resource_id !== undefined && input.resource_id !== record.resource_id) {
        throw new WbServiceInputError('resource_id does not match the route')
      }
      if (input.game_id !== undefined && input.game_id !== context.gameId) {
        throw new WbServiceInputError('game_id does not match the host-bound game')
      }
      if (input.media_type !== undefined && input.media_type !== record.media_type) {
        throw new WbServiceInputError('media_type cannot be changed')
      }
      if (input.source_meta !== undefined && (
        !input.source_meta
        || typeof input.source_meta !== 'object'
        || Array.isArray(input.source_meta)
      )) {
        throw new WbServiceInputError('source_meta must be an object')
      }
      for (const key of ['type', 'remark', 'source'] as const) {
        if (input[key] !== undefined && typeof input[key] !== 'string') {
          throw new WbServiceInputError(`${key} must be a string`)
        }
      }
      record.name = input.name
      if (input.type !== undefined) record.type = input.type as string
      if (input.remark !== undefined) record.remark = input.remark as string
      if (input.source !== undefined) record.source = input.source as string
      if (input.source_meta !== undefined) {
        record.source_meta = input.source_meta as Record<string, unknown>
      }
      record.updated_at = Date.now()
      records[index] = record
      await writeBrowserMedia(context, records)
      const locator = (await browserMediaLocators(context)).get(record.resource_id)
      return locator ? resource(record, locator, context.gameId) : null
    },

    async remove(id: string) {
      const records = await readBrowserMedia(context)
      const index = records.findIndex((item) => item.resource_id === id)
      const record = index < 0 ? undefined : records[index]
      if (!record || record.deleted) return false
      record.deleted = true
      records[index] = record
      await writeBrowserMedia(context, records)
      return true
    },

    async content(id: string): Promise<MediaBody | null> {
      const record = (await readBrowserMedia(context))
        .find((item) => item.resource_id === id && !item.deleted)
      if (!record) return null
      return context.media.read(context.gameId, record.resource_id)
    },
  }
}
