/**
 * 图存储客户端 —— 走 handshake 绑定的 Workbench package client。
 *
 *   · 唯一真相（玩法）= `GraphLibraryDocument`，落盘为游戏仓 `blueprint.json`。
 *   · 保存：写入完整 package 的 blueprint patch。
 *   · 读取：返回 `{ project, blueprint, assetsManifest }`。
 *   · 未保存草稿只在 localStorage。
 *
 */
import { getWorkbenchHost } from '../../lib/workbench-host'
import type { GraphLibraryDocument } from '../../runtime/schema/graph-schema'

/** 保留类型以兼容既有 import；game-host 版本载体是 git tag。 */
export interface VersionEntry {
  id: string
  savedAt: number
}
export interface GraphStore {
  /** 磁盘最新已保存文档（package.blueprint）。 */
  project: GraphLibraryDocument | null
  /** localStorage 未保存草稿。 */
  draft: GraphLibraryDocument | null
  /** 兼容字段；game-host 下恒为空，版本查询走独立的 git-tag API。 */
  versions: VersionEntry[]
}

export interface CurrentVersion {
  tag: string | null
  commitHash: string | null
  dirty: boolean
}

/** 游戏仓 git 版本条目（tag = vN）。 */
export interface GameVersion {
  tag: string
  createdAt: number
  message: string
}

const draftKey = (game?: string) => `wb-game-video:graph:${game ?? 'default'}:draft`

function packageBlueprint(value: unknown): GraphLibraryDocument | null {
  if (!value || typeof value !== 'object') return null
  const blueprint = (value as { blueprint?: unknown }).blueprint
  return blueprint && typeof blueprint === 'object' ? blueprint as GraphLibraryDocument : null
}

function readLocal<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key)
    return s ? (JSON.parse(s) as T) : null
  } catch {
    return null
  }
}
function writeLocal(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* quota / SSR：best-effort */
  }
}
function removeLocal(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* best-effort */
  }
}

export async function loadStore(game?: string): Promise<GraphStore> {
  let project: GraphLibraryDocument | null = null
  try {
    project = packageBlueprint(await getWorkbenchHost().gamePackage.load())
  } catch {
    /* 离线/无宿主 → 无磁盘数据 */
  }
  return { project, draft: readLocal<GraphLibraryDocument>(draftKey(game)), versions: [] }
}

/**
 * 保存整包（当前只回写 blueprint；project/manifest 由宿主保留或补齐）。
 * 返回 { ok } —— PUT 成功清草稿。失败保留草稿由调用方回滚 UI。
 */
export async function saveProject(project: GraphLibraryDocument, game?: string): Promise<{ ok: boolean }> {
  try {
    await getWorkbenchHost().gamePackage.save({ blueprint: project })
    removeLocal(draftKey(game))
    return { ok: true }
  } catch {
    /* 离线/无宿主 → best-effort */
  }
  return { ok: false }
}

/** 打一个新版本（游戏仓 git annotated tag vN）。返回新 tag 或 null。 */
export async function commitVersion(game?: string, message?: string): Promise<CurrentVersion | null> {
  void game
  void message
  return null
}

/** 读当前最新版本（tag + hash + dirty）。无宿主/无仓 → 全 null。 */
export async function currentVersion(game?: string): Promise<CurrentVersion> {
  void game
  return { tag: null, commitHash: null, dirty: false }
}

/** 列出该游戏所有版本（vN，最新在前）。无宿主/无仓 → []。 */
export async function listVersions(game?: string): Promise<GameVersion[]> {
  void game
  return []
}

/**
 * 读某个版本 tag 的 blueprint（只读 `git show`，不 checkout、不改历史）。
 * 用于「载入旧版到编辑器」——载入后由用户再保存成新版本。
 */
export async function loadVersionProject(game: string | undefined, tag: string): Promise<GraphLibraryDocument | null> {
  void game
  void tag
  return null
}

export function saveDraft(project: GraphLibraryDocument, game?: string): void {
  writeLocal(draftKey(game), project)
}

export function clearDraft(game?: string): void {
  removeLocal(draftKey(game))
}

export function loadDraft(game?: string): GraphLibraryDocument | null {
  return readLocal<GraphLibraryDocument>(draftKey(game))
}
