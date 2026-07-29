/**
 * asset-registry —— 游戏级共享素材层中 wb-game-video 资产域的**服务端 CRUD**（node:fs）。
 *
 * 磁盘布局（`.forgeax/games/<slug>/assets/`，与 game-video/ 平级、独立于任何插件）：
 *   - `manifest.json`       = { version:2, assets: AssetRecord[] }
 *   - `media/<id>.<ext>`    = wb-game-video 自产的图/视频二进制
 *
 * 被两处共享（SSOT）：
 *   - `server/tool-handlers.ts` 的 wb-game-video:* 工具 + `server/generation/*` 编排（写）
 *   - `vite.config.ts` 的 `/__gva__` 端点（读 + 流式回文件）
 *
 * 跨模块产物（人设图/场景图）**只读**：不落进本 registry 的 media/，仅以 externalPath
 * 指回对方目录（见 server/intake/*）。本 registry 只写带 productionType 的记录，并
 * 原样保留视频服务等其它资产域拥有的记录。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream, statSync, renameSync } from 'node:fs'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type {
  MediaAsset as HostMediaAsset,
  MediaReference,
  MediaWriteInput,
} from '@forgeax/workbench-host/contracts'
import type {
  BoundedGameFiles,
  WorkbenchExtensionContext,
} from '@forgeax/workbench-host/node'
import type { AssetManifest, MediaAsset, MediaKind, MediaProductionType, StyleAxes } from '../src/editor/assets/registry-types'

const GAME_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/

/** 从起点目录向上找含 `.forgeax/games` 的工程根（与 tool-handlers / vite 同一约定）。 */
export function findProjectRoot(start: string): string | null {
  let dir = start
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, '.forgeax', 'games'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** 素材层根目录：`<root>/.forgeax/games/<slug>/assets`；缺工程根或非法 slug 则 null。 */
export function assetsDir(projectRoot: string | null, slug: string | null): string | null {
  if (!projectRoot || !slug || !GAME_SLUG_RE.test(slug)) return null
  return resolve(projectRoot, '.forgeax', 'games', slug, 'assets')
}

function manifestPath(dir: string): string {
  return resolve(dir, 'manifest.json')
}

function mediaDir(dir: string): string {
  return resolve(dir, 'media')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isMediaAsset(value: unknown): value is MediaAsset {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.kind === 'image' || value.kind === 'video') &&
    typeof value.productionType === 'string'
  )
}

function isProviderBacked(value: unknown): boolean {
  return isRecord(value) && isRecord(value.provider)
}

function normalizeMediaAsset(value: unknown): MediaAsset | null {
  if (!isMediaAsset(value)) return null
  const source = value as MediaAsset & { name?: unknown; mimeType?: unknown }
  const providerBacked = isProviderBacked(source)
  return {
    ...source,
    label: source.label ?? (typeof source.name === 'string' ? source.name : undefined),
    mime: source.mime ?? (typeof source.mimeType === 'string' ? source.mimeType : undefined),
    meta: providerBacked ? { ...(source.meta ?? {}), upload: true } : source.meta,
  }
}

function validateAssetRecords(assets: unknown[]): void {
  const ids = new Set<string>()
  for (const asset of assets) {
    if (!isRecord(asset)) throw new Error('Invalid shared asset manifest record')
    if (
      typeof asset.id !== 'string' ||
      asset.id.length === 0 ||
      typeof asset.kind !== 'string' ||
      asset.kind.length === 0 ||
      ids.has(asset.id)
    ) {
      throw new Error('Invalid or duplicate shared asset id')
    }
    ids.add(asset.id)
  }
}

/** 读共享 manifest；其它资产域的记录原样保留，损坏时 fail loud。 */
export function readManifest(dir: string): AssetManifest {
  const path = manifestPath(dir)
  if (!existsSync(path)) return { version: 2, assets: [] }
  let parsed: Partial<AssetManifest>
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<AssetManifest>
  } catch (error) {
    throw new Error(`Invalid shared asset manifest JSON: ${path}`, { cause: error })
  }
  if (parsed.version !== 2 || !Array.isArray(parsed.assets)) {
    throw new Error(`Unsupported shared asset manifest: ${path}`)
  }
  validateAssetRecords(parsed.assets)
  return { ...parsed, version: 2, assets: parsed.assets } as AssetManifest
}

function writeManifest(dir: string, manifest: AssetManifest): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const target = manifestPath(dir)
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(temp, `${JSON.stringify({ ...manifest, version: 2 }, null, 2)}\n`)
  renameSync(temp, target)
}

export interface AssetFilter {
  kind?: MediaKind
  productionType?: MediaProductionType
  sceneNodeId?: string
}

/** 列资产（可选过滤）。 */
export function listAssets(dir: string, filter?: AssetFilter): MediaAsset[] {
  let out = readManifest(dir).assets
    .map(normalizeMediaAsset)
    .filter((asset): asset is MediaAsset => asset !== null)
  if (filter?.kind) out = out.filter((a) => a.kind === filter.kind)
  if (filter?.productionType) out = out.filter((a) => a.productionType === filter.productionType)
  if (filter?.sceneNodeId) out = out.filter((a) => a.sceneNodeId === filter.sceneNodeId)
  return out
}

export function getAsset(dir: string, id: string): MediaAsset | null {
  const asset = readManifest(dir).assets.find((a) => isRecord(a) && a.id === id)
  return normalizeMediaAsset(asset)
}

/** upsert 一条资产（按 id 覆盖或追加），返回落盘后的资产。 */
export function upsertAsset(dir: string, asset: MediaAsset): MediaAsset {
  const m = readManifest(dir)
  const idx = m.assets.findIndex((a) => a.id === asset.id)
  if (idx >= 0 && (!isMediaAsset(m.assets[idx]) || isProviderBacked(m.assets[idx]))) {
    throw new Error(`Asset id is owned by another asset domain: ${asset.id}`)
  }
  const now = Date.now()
  const next: MediaAsset = { ...asset, updatedAt: now, createdAt: asset.createdAt || now }
  if (idx >= 0) m.assets[idx] = next
  else m.assets.push(next)
  writeManifest(dir, m)
  return next
}

/** patch 一条资产（浅合并）；不存在返回 null。 */
export function updateAsset(dir: string, id: string, patch: Partial<MediaAsset>): MediaAsset | null {
  const m = readManifest(dir)
  const idx = m.assets.findIndex((a) => isMediaAsset(a) && !isProviderBacked(a) && a.id === id)
  if (idx < 0) return null
  const merged: MediaAsset = { ...m.assets[idx], ...patch, id, updatedAt: Date.now() } as MediaAsset
  m.assets[idx] = merged
  writeManifest(dir, m)
  return merged
}

export function deleteAsset(dir: string, id: string): boolean {
  const m = readManifest(dir)
  const next = m.assets.filter((a) => !isMediaAsset(a) || isProviderBacked(a) || a.id !== id)
  if (next.length === m.assets.length) return false
  writeManifest(dir, { ...m, assets: next })
  return true
}

/** 读游戏级风格三轴（manifest.styleAxes）；缺省 undefined。 */
export function getStyleAxes(dir: string): StyleAxes | undefined {
  return readManifest(dir).styleAxes
}

/** 写/合并游戏级风格三轴（浅合并，传 undefined 字段不清空已存值）。 */
export function setStyleAxes(dir: string, axes: StyleAxes): StyleAxes {
  const m = readManifest(dir)
  const merged: StyleAxes = { ...(m.styleAxes ?? {}), ...axes }
  writeManifest(dir, { ...m, styleAxes: merged })
  return merged
}

/**
 * 写一份自产媒体二进制到 `media/<id>.<ext>`，返回相对 `assets/` 根的 file 路径。
 * ext 不含点（如 'mp4' / 'png'）。
 */
export function writeMediaFile(dir: string, id: string, ext: string, bytes: Uint8Array): string {
  const md = mediaDir(dir)
  if (!existsSync(md)) mkdirSync(md, { recursive: true })
  const cleanExt = ext.replace(/^\./, '').toLowerCase() || 'bin'
  const rel = `media/${id}.${cleanExt}`
  writeFileSync(resolve(dir, rel), bytes)
  return rel
}

/** 解析一条资产的绝对磁盘文件路径（自产 file 优先，其次跨模块 externalPath）。 */
export function resolveAssetFilePath(dir: string, asset: MediaAsset): string | null {
  if (asset.file) {
    const mediaRoot = resolve(dir, 'media')
    const candidate = resolve(dir, asset.file)
    const rel = relative(mediaRoot, candidate)
    return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) ? candidate : null
  }
  if (asset.externalPath && isAbsolute(asset.externalPath)) {
    const gameRoot = resolve(dir, '..')
    const candidate = resolve(asset.externalPath)
    const rel = relative(gameRoot, candidate)
    return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) ? candidate : null
  }
  return null
}

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export function mimeForPath(p: string): string {
  return MIME_BY_EXT[extname(p).toLowerCase()] ?? 'application/octet-stream'
}

/** 便捷：读文件流 + 大小 + mime（供 `/__gva__/media/:id` 端点）。 */
export function openAssetFile(dir: string, id: string): { stream: ReturnType<typeof createReadStream>; size: number; mime: string } | null {
  const asset = getAsset(dir, id)
  if (!asset) return null
  const p = resolveAssetFilePath(dir, asset)
  if (!p || !existsSync(p)) return null
  try {
    const size = statSync(p).size
    return { stream: createReadStream(p), size, mime: asset.mime ?? mimeForPath(p) }
  } catch {
    return null
  }
}

// ── Workbench host capability-backed registry ────────────────────────────────

const HOST_MANIFEST_PATH = 'assets/manifest.json'
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const hostManifestQueues = new Map<string, Promise<void>>()

async function withHostManifestLock<T>(
  scope: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = hostManifestQueues.get(scope) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolveLock) => {
    release = resolveLock
  })
  const tail = previous.then(() => current)
  hostManifestQueues.set(scope, tail)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (hostManifestQueues.get(scope) === tail) hostManifestQueues.delete(scope)
  }
}

function assertBoundedRelativePath(value: string, label = 'Game file path'): string {
  const normalized = value.replace(/\\/g, '/')
  if (
    normalized.length === 0
    || normalized.startsWith('/')
    || /^[A-Za-z]:\//.test(normalized)
    || normalized.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new TypeError(`${label} must be a bounded relative path`)
  }
  return normalized
}

async function readHostManifest(files: BoundedGameFiles): Promise<AssetManifest> {
  const bytes = await files.read(HOST_MANIFEST_PATH)
  if (!bytes) return { version: 2, assets: [] }
  let parsed: Partial<AssetManifest>
  try {
    parsed = JSON.parse(textDecoder.decode(bytes)) as Partial<AssetManifest>
  } catch (error) {
    throw new Error('Invalid shared asset manifest JSON', { cause: error })
  }
  if (parsed.version !== 2 || !Array.isArray(parsed.assets)) {
    throw new Error('Unsupported shared asset manifest')
  }
  validateAssetRecords(parsed.assets)
  return { ...parsed, version: 2, assets: parsed.assets } as AssetManifest
}

async function writeHostManifest(
  files: BoundedGameFiles,
  manifest: AssetManifest,
): Promise<void> {
  validateAssetRecords(manifest.assets)
  await files.write(
    HOST_MANIFEST_PATH,
    textEncoder.encode(`${JSON.stringify({ ...manifest, version: 2 }, null, 2)}\n`),
  )
}

function publicHostAsset(
  value: unknown,
  trustedMedia: ReadonlyMap<string, HostMediaAsset>,
): MediaAsset | null {
  const normalized = normalizeMediaAsset(value)
  if (!normalized) return null
  const { label, prompt, error, meta } = normalized
  const hostMedia = isRecord(meta?.hostMedia) ? meta.hostMedia : undefined
  const hostAssetId = (
    hostMedia?.provenance === 'workbench-media-capability'
    && typeof hostMedia.assetId === 'string'
    && normalized.provider?.kind === 'local'
    && normalized.provider.ref === hostMedia.assetId
  ) ? hostMedia.assetId : undefined
  const authoritativeMedia = hostAssetId
    ? trustedMedia.get(hostAssetId)
    : undefined
  const trustedLocator = (
    authoritativeMedia
    && authoritativeMedia.url === normalized.url
  )
    ? safeHostMediaUrl(authoritativeMedia.url)
    : undefined
  const sanitizedMeta = deepSanitizeMeta(
    meta,
    trustedLocator,
    trustedLocator ? hostAssetId : undefined,
  )
  return {
    id: normalized.id,
    kind: normalized.kind,
    productionType: normalized.productionType,
    status: normalized.status,
    ...(label ? { label: sanitizePublicText(label) } : {}),
    ...(prompt ? { prompt: sanitizePublicText(prompt) } : {}),
    ...(normalized.sceneNodeId ? {
      sceneNodeId: sanitizePublicText(normalized.sceneNodeId),
    } : {}),
    ...(normalized.sourceModule ? {
      sourceModule: sanitizePublicText(normalized.sourceModule),
    } : {}),
    ...(normalized.mime ? { mime: normalized.mime } : {}),
    ...(normalized.bytes !== undefined ? { bytes: normalized.bytes } : {}),
    ...(normalized.durationMs !== undefined
      ? { durationMs: normalized.durationMs }
      : {}),
    ...(error ? { error: sanitizePublicText(error) } : {}),
    ...(trustedLocator ? { url: trustedLocator } : {}),
    ...(sanitizedMeta ? { meta: sanitizedMeta } : {}),
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  }
}

export function sanitizePublicText(value: string): string {
  return value
    .replace(/\b[A-Za-z][A-Za-z0-9+.-]*:(?:\/\/)?\S+/g, '[redacted]')
    .replace(/\\\\[^\s]+/g, '[redacted]')
    .replace(/[A-Za-z]:[\\/][^\s]+/g, '[redacted]')
    .replace(
      /(^|[^A-Za-z0-9._-])\/[^\s,;)\]}"']+/g,
      (_match, prefix: string) => `${prefix}[redacted]`,
    )
    .slice(0, 4_000)
}

function containsSensitivePublicText(value: string): boolean {
  return sanitizePublicText(value) !== value
}

function deepSanitizeMeta(
  value: unknown,
  trustedLocator?: string,
  trustedAssetId?: string,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  const out: Record<string, unknown> = {}
  for (const [childKey, child] of Object.entries(value)) {
    if (/^(?:externalPath|sourceUrl|path|file|providerUrl)$/i.test(childKey)) continue
    if (childKey === 'hostMedia' && isRecord(child)) {
      if (
        child.provenance === 'workbench-media-capability'
        && child.assetId === trustedAssetId
        && typeof trustedLocator === 'string'
      ) {
        out.hostMedia = {
          provenance: child.provenance,
          assetId: trustedAssetId,
          locator: trustedLocator,
        }
      }
      continue
    }
    if (typeof child === 'string') {
      if (
        containsSensitivePublicText(child)
        || /(?:path|url)$/i.test(childKey)
      ) continue
      out[childKey] = child
    } else if (Array.isArray(child)) {
      const items: unknown[] = []
      for (const item of child) {
        if (typeof item === 'string') {
          if (containsSensitivePublicText(item)) continue
          items.push(item)
        } else if (Array.isArray(item)) {
          const nested = deepSanitizeMeta(
            { items: item },
            trustedLocator,
            trustedAssetId,
          )
          if (nested?.items) items.push(nested.items)
        } else if (isRecord(item)) {
          const nested = deepSanitizeMeta(
            item,
            trustedLocator,
            trustedAssetId,
          )
          if (nested && Object.keys(nested).length) items.push(nested)
        } else {
          items.push(item)
        }
      }
      out[childKey] = items
    } else if (isRecord(child)) {
      const nested = deepSanitizeMeta(child, trustedLocator, trustedAssetId)
      if (nested && Object.keys(nested).length) out[childKey] = nested
    } else {
      out[childKey] = child
    }
  }
  return Object.keys(out).length ? out : undefined
}

function safeHostMediaUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return ['file:', 'javascript:', 'data:'].includes(url.protocol)
      ? undefined
      : value
  } catch {
    return undefined
  }
}

function filterAssets(
  manifest: AssetManifest,
  trustedMedia: ReadonlyMap<string, HostMediaAsset>,
  filter?: AssetFilter,
): MediaAsset[] {
  let assets = manifest.assets
    .map((asset) => publicHostAsset(asset, trustedMedia))
    .filter((asset): asset is MediaAsset => asset !== null)
  if (filter?.kind) assets = assets.filter((asset) => asset.kind === filter.kind)
  if (filter?.productionType) {
    assets = assets.filter((asset) => asset.productionType === filter.productionType)
  }
  if (filter?.sceneNodeId) {
    assets = assets.filter((asset) => asset.sceneNodeId === filter.sceneNodeId)
  }
  return assets
}

function mediaFilename(prefix: string, id: string, mime: string): string {
  const safeId = id.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'asset'
  const extension = extForContentType(mime)
  return `${prefix}-${safeId}.${extension}`
}

function extForContentType(contentType: string): string {
  switch (contentType.toLowerCase().split(';', 1)[0]) {
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'video/mp4': return 'mp4'
    case 'video/webm': return 'webm'
    case 'video/quicktime': return 'mov'
    default: return 'png'
  }
}

export interface HostAssetRegistry {
  list(filter?: AssetFilter): Promise<MediaAsset[]>
  get(id: string): Promise<MediaAsset | null>
  upsert(asset: MediaAsset): Promise<MediaAsset>
  update(id: string, patch: Partial<MediaAsset>): Promise<MediaAsset | null>
  getStyleAxes(): Promise<StyleAxes | undefined>
  importGameFile(input: {
    registryId: string
    relativePath: string
    filename: string
    contentType: string
    productionType: 'character_ref' | 'scene_ref'
    label: string
    sourceModule: string
    meta?: Record<string, unknown>
  }): Promise<MediaAsset>
  mediaReference(id: string): Promise<MediaReference>
  persistGenerated(
    generated: HostMediaAsset,
    input: {
      registryId: string
      filenamePrefix: string
      productionType: 'shot_image' | 'grid_storyboard' | 'video_clip'
      sceneNodeId: string
      label: string
      prompt: string
      durationMs?: number
      meta?: Record<string, unknown>
    },
  ): Promise<MediaAsset>
}

/**
 * Creates the registry used by host-neutral service and router calls. Game data
 * is accessed only through bounded file helpers; binary ingress/egress goes
 * through the host media capability.
 */
export function createHostAssetRegistry(
  context: WorkbenchExtensionContext,
): HostAssetRegistry {
  const mutationScope = `wb-game-video:${context.gameRoot}`
  const trustedMedia = async (): Promise<Map<string, HostMediaAsset>> => (
    new Map(
      (await context.media.list(context.gameId))
        .map((asset) => [asset.id, asset]),
    )
  )
  const upsert = async (asset: MediaAsset): Promise<MediaAsset> => (
    withHostManifestLock(mutationScope, async () => {
      const manifest = await readHostManifest(context.files)
      const index = manifest.assets.findIndex((entry) => (
        isRecord(entry) && entry.id === asset.id
      ))
      const now = Date.now()
      const next: MediaAsset = {
        ...asset,
        createdAt: asset.createdAt || now,
        updatedAt: now,
      }
      if (index >= 0) {
        const current = manifest.assets[index]
        if (
          !isMediaAsset(current)
          || (isProviderBacked(current) && current.sourceModule !== next.sourceModule)
        ) {
          throw new Error(`Asset id is owned by another asset domain: ${asset.id}`)
        }
        manifest.assets[index] = next
      } else {
        manifest.assets.push(next)
      }
      await writeHostManifest(context.files, manifest)
      return publicHostAsset(next, await trustedMedia())!
    })
  )

  const getRaw = async (id: string): Promise<MediaAsset | null> => {
    const manifest = await readHostManifest(context.files)
    return normalizeMediaAsset(
      manifest.assets.find((entry) => isRecord(entry) && entry.id === id),
    )
  }
  const get = async (id: string): Promise<MediaAsset | null> => (
    publicHostAsset(await getRaw(id), await trustedMedia())
  )

  const update = async (
    id: string,
    patch: Partial<MediaAsset>,
  ): Promise<MediaAsset | null> => {
    const current = await getRaw(id)
    if (!current) return null
    return upsert({ ...current, ...patch, id, createdAt: current.createdAt })
  }

  return {
    async list(filter) {
      return filterAssets(
        await readHostManifest(context.files),
        await trustedMedia(),
        filter,
      )
    },
    get,
    upsert,
    update,
    async getStyleAxes() {
      return (await readHostManifest(context.files)).styleAxes
    },
    async importGameFile(input) {
      const relativePath = assertBoundedRelativePath(input.relativePath)
      const bytes = await context.files.read(relativePath)
      if (!bytes) throw new Error(`Reference media was not found: ${relativePath}`)
      const hosted = await context.media.put(context.gameId, {
        filename: input.filename,
        contentType: input.contentType,
        bytes,
        metadata: {
          source: 'wb-game-video-reference',
          registryId: input.registryId,
        },
      })
      return upsert({
        id: input.registryId,
        kind: 'image',
        productionType: input.productionType,
        status: 'ready',
        label: input.label,
        sourceModule: input.sourceModule,
        mime: hosted.contentType,
        bytes: hosted.sizeBytes ?? bytes.byteLength,
        url: safeHostMediaUrl(hosted.url),
        provider: { kind: 'local', ref: hosted.id },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        meta: {
          ...(input.meta ?? {}),
          hostMedia: {
            provenance: 'workbench-media-capability',
            assetId: hosted.id,
            locator: safeHostMediaUrl(hosted.url),
          },
        },
      })
    },
    async mediaReference(id) {
      const asset = await getRaw(id)
      if (!asset) throw new Error(`参考图不存在：${id}`)
      if (asset.provider?.ref) {
        if (asset.provider.kind !== 'local') {
          throw new Error(`参考图 ${id} 的 provider 不属于宿主媒体能力`)
        }
        const hosted = (await context.media.list(context.gameId))
          .find((candidate) => candidate.id === asset.provider!.ref)
        if (!hosted) {
          throw new Error(`参考图 ${id} 的宿主媒体引用不存在`)
        }
        return { assetId: hosted.id }
      }
      if (!asset.file) throw new Error(`参考图 ${id} 没有可读取的宿主媒体`)
      const relativePath = assertBoundedRelativePath(`assets/${asset.file}`)
      const bytes = await context.files.read(relativePath)
      if (!bytes) throw new Error(`参考图 ${id} 内容不存在`)
      const hosted = await context.media.put(context.gameId, {
        filename: mediaFilename('reference', id, asset.mime ?? 'image/png'),
        contentType: asset.mime ?? 'image/png',
        bytes,
        metadata: { source: 'wb-game-video-registry', registryId: id },
      })
      return { assetId: hosted.id }
    },
    async persistGenerated(generated, input) {
      const body = await context.media.read(context.gameId, generated.id)
      if (!body || body.bytes.byteLength === 0) {
        throw new Error('Generated media is not readable through the host media capability')
      }
      const hosted = await context.media.put(context.gameId, {
        filename: mediaFilename(input.filenamePrefix, input.registryId, body.contentType),
        contentType: body.contentType,
        bytes: body.bytes,
        metadata: {
          source: 'wb-game-video-generation',
          generatedAssetId: generated.id,
          registryId: input.registryId,
        },
      })
      const persisted = await update(input.registryId, {
        kind: input.productionType === 'video_clip' ? 'video' : 'image',
        productionType: input.productionType,
        status: 'ready',
        label: input.label,
        prompt: input.prompt,
        sceneNodeId: input.sceneNodeId,
        sourceModule: 'wb-game-video',
        mime: hosted.contentType,
        bytes: hosted.sizeBytes ?? body.bytes.byteLength,
        url: safeHostMediaUrl(hosted.url),
        provider: { kind: 'local', ref: hosted.id },
        durationMs: input.durationMs,
        updatedAt: Date.now(),
        meta: {
          ...(input.meta ?? {}),
          hostMedia: {
            provenance: 'workbench-media-capability',
            assetId: hosted.id,
            locator: safeHostMediaUrl(hosted.url),
          },
        },
      })
      if (!persisted) {
        throw new Error(`Generating asset disappeared: ${input.registryId}`)
      }
      return persisted
    },
  }
}

export async function getHostStyleAxes(
  context: WorkbenchExtensionContext,
): Promise<StyleAxes | undefined> {
  return createHostAssetRegistry(context).getStyleAxes()
}
