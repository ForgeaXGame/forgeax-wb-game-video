import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type Ref,
} from 'react'
import type { BlueprintDoc, GameScenario } from '../../runtime/schema/graph-schema'
import type { MediaStatus } from './registry-types'
import { findVideoReferences } from './video-references'
import type { VideoAssetsController, VideoAssetListItem } from './useVideoAssets'

export interface VideoLibraryEntry {
  id: string
  label: string
  url: string
  group: string
  bundled?: boolean
  fromApi?: boolean
  fromRegistry?: boolean
  status?: MediaStatus
  durMs?: number
  type?: string
}

export type { VideoAssetsController }

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  restoreFocus,
}: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy: boolean
  restoreFocus: HTMLElement | null
}): JSX.Element {
  const titleId = useId()
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    return () => {
      restoreFocus?.focus()
    }
  }, [restoreFocus])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab') {
      return
    }
    const active = document.activeElement
    if (event.shiftKey && active === cancelRef.current) {
      event.preventDefault()
      confirmRef.current?.focus()
    } else if (!event.shiftKey && active === confirmRef.current) {
      event.preventDefault()
      cancelRef.current?.focus()
    }
  }

  return (
    <div className="val-dialog-backdrop" role="presentation">
      <div
        className="val-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId} style={{ whiteSpace: 'pre-wrap' }}>{message}</p>
        <div className="val-dialog-actions">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy}>取消</button>
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={busy}>
            {busy ? '处理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function mapApiItem(item: VideoAssetListItem): VideoLibraryEntry {
  return {
    id: item.id,
    label: item.label,
    url: item.url,
    group: '上传',
    fromApi: true,
    durMs: item.durMs,
    type: item.type,
  }
}

export interface VideoAssetLibraryProps {
  gameId: string
  scenario: GameScenario
  /** Blueprint library used when resolving delete-reference warnings across packs. */
  blueprints?: Record<string, BlueprintDoc>
  mainPackId?: string
  bundledEntries: VideoLibraryEntry[]
  supplementalEntries?: VideoLibraryEntry[]
  selectedId: string
  boundId?: string
  onSelect: (id: string) => void
  onDeleted?: (id: string) => void
  controller: VideoAssetsController
  listBodyRef?: Ref<HTMLDivElement>
}

export function VideoAssetLibrary({
  gameId,
  scenario,
  blueprints,
  mainPackId,
  bundledEntries,
  supplementalEntries = [],
  selectedId,
  boundId,
  onSelect,
  onDeleted,
  controller,
  listBodyRef,
}: VideoAssetLibraryProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pendingDelete, setPendingDelete] = useState<VideoLibraryEntry | null>(null)
  const [renameBusy, setRenameBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const deleteTriggerRef = useRef<HTMLElement | null>(null)
  const actionsBusy = controller.uploading
    || controller.mutating
    || renameBusy
    || deleteBusy

  const apiEntries = useMemo(() => controller.items.map(mapApiItem), [controller.items])

  const entries = useMemo(() => {
    const seen = new Set<string>()
    const out: VideoLibraryEntry[] = []
    for (const entry of [...bundledEntries, ...apiEntries, ...supplementalEntries]) {
      if (seen.has(entry.id)) {
        continue
      }
      seen.add(entry.id)
      out.push(entry)
    }
    return out
  }, [apiEntries, bundledEntries, supplementalEntries])

  const openDeleteDialog = (entry: VideoLibraryEntry, trigger: HTMLElement) => {
    setOperationError(null)
    deleteTriggerRef.current = trigger
    setPendingDelete(entry)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) {
      return
    }
    const id = pendingDelete.id
    if (!pendingDelete.fromApi) {
      return
    }
    setDeleteBusy(true)
    setOperationError(null)
    try {
      await controller.deleteResource(id)
      onDeleted?.(id)
      setPendingDelete(null)
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '删除失败')
    } finally {
      setDeleteBusy(false)
    }
  }

  const deleteMessage = useMemo(() => {
    if (!pendingDelete) {
      return ''
    }
    const refs = findVideoReferences(scenario, pendingDelete.id, { blueprints, mainPackId })
    if (refs.length === 0) {
      return `确定删除「${pendingDelete.label}」？此操作不可撤销。`
    }
    const lines = refs.map((r) => `${r.graphLabel} · ${r.nodeName} (${r.nodeId})`)
    return `「${pendingDelete.label}」仍被以下节点引用：\n${lines.join('\n')}\n删除后图内绑定不会自动清除，但素材将无法播放。确定删除？`
  }, [pendingDelete, scenario, blueprints, mainPackId])

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    const created = await controller.upload(file)
    if (created) {
      onSelect(created.resource_id)
    }
  }

  const startRename = (entry: VideoLibraryEntry) => {
    setOperationError(null)
    setRenamingId(entry.id)
    setRenameValue(entry.label)
  }

  const saveRename = async () => {
    if (!renamingId) {
      return
    }
    const id = renamingId
    const value = renameValue.trim()
    if (!value) {
      return
    }
    setRenameBusy(true)
    setOperationError(null)
    try {
      await controller.rename(id, value)
      setRenamingId(null)
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '重命名失败')
    } finally {
      setRenameBusy(false)
    }
  }

  return (
    <aside className="gc-list val-library" aria-label="视频素材库">
      <div className="gc-list-head">
        <span className="gc-list-ico" aria-hidden>🎥</span>
        <span className="gc-list-title">视频素材</span>
        <span className="gc-list-count">{entries.length}</span>
        <div className="val-head-actions">
          <button
            type="button"
            aria-label="刷新视频库"
            onClick={() => void controller.refresh()}
            disabled={controller.loading || actionsBusy}
          >
            ↻
          </button>
          <button
            type="button"
            aria-label="上传视频"
            disabled={actionsBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            ＋
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4"
            hidden
            aria-hidden
            onChange={(e) => void onFileChange(e)}
          />
        </div>
      </div>

      {controller.error || operationError ? (
        <div className="val-error" role="alert">
          {controller.error ?? operationError}
        </div>
      ) : null}

      {controller.uploadProgress != null ? (
        <div className="val-upload">
          <progress
            role="progressbar"
            max={100}
            value={controller.uploadProgress}
            aria-valuenow={controller.uploadProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
          <span>{controller.uploadProgress}%</span>
        </div>
      ) : null}

      {controller.uploadError ? (
        <div className="val-upload-error" role="alert">
          <span>{controller.uploadError}</span>
          {controller.canRetryComplete ? (
            <button
              type="button"
              aria-label="重试完成上传"
              onClick={() => void controller.retryComplete()}
            >
              重试完成
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="gc-list-body" ref={listBodyRef}>
        {controller.loading && entries.length === 0 ? (
          <div className="val-empty" role="status">加载视频素材…</div>
        ) : null}

        {!controller.loading && entries.length === 0 ? (
          <div className="val-empty">暂无视频素材。可上传 MP4 或使用内置 bundle。</div>
        ) : null}

        {entries.map((entry) => {
          const isSelected = entry.id === selectedId
          const isBound = entry.id === boundId
          const isRenaming = renamingId === entry.id
          return (
            <div key={entry.id} className={`val-row${isSelected ? ' is-on' : ''}`}>
              {isRenaming ? (
                <div className="val-rename">
                  <label>
                    <span className="sr-only">新名称</span>
                    <input
                      aria-label="新名称"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label="保存名称"
                    disabled={actionsBusy}
                    onClick={() => void saveRename()}
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    aria-label="取消重命名"
                    disabled={renameBusy}
                    onClick={() => setRenamingId(null)}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    data-clip-id={entry.id}
                    className={`gc-row${isSelected ? ' is-on' : ''}`}
                    aria-label={`${entry.group} · ${entry.label}`}
                    onClick={() => onSelect(entry.id)}
                  >
                    <span className="gc-row-mark" aria-hidden>{isBound ? '✓' : ''}</span>
                    <span className="gc-row-label">{entry.group} · {entry.label}</span>
                    {entry.status && entry.status !== 'ready' ? (
                      <span className={`gvv-row-status is-${entry.status}`}>
                        {entry.status === 'generating' ? '生成中…' : entry.status === 'failed' ? '失败' : '占位'}
                      </span>
                    ) : null}
                  </button>
                  {entry.fromApi ? (
                    <div className="val-row-actions">
                      <button
                        type="button"
                        aria-label={`重命名 ${entry.label}`}
                        disabled={actionsBusy}
                        onClick={() => startRename(entry)}
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        aria-label={`删除 ${entry.label}`}
                        disabled={actionsBusy}
                        onClick={(event) => openDeleteDialog(entry, event.currentTarget)}
                      >
                        删除
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )
        })}
      </div>

      {controller.hasMore ? (
        <button
          type="button"
          className="val-load-more"
          aria-label="加载更多视频"
          disabled={controller.loading}
          onClick={() => void controller.loadMore()}
        >
          {controller.loading ? '加载中…' : '加载更多'}
        </button>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="删除视频素材"
          message={deleteMessage}
          confirmLabel="确认删除"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
          busy={deleteBusy}
          restoreFocus={deleteTriggerRef.current}
        />
      ) : null}
    </aside>
  )
}
