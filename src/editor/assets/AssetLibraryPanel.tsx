import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { CatalogShell, type CatalogItem } from '../shell/CatalogShell'
import type { AssetLibraryController, ManagedAsset, ManagedAssetKind } from './assetLibraryClient'

function formatBytes(value: number | undefined): string {
  if (value == null) return '大小未知'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function AssetUpload({
  kind,
  busy,
  disabled,
  onUpload,
}: {
  kind: ManagedAssetKind
  busy: boolean
  disabled: boolean
  onUpload: (kind: ManagedAssetKind, file: File) => void
}): JSX.Element {
  const accept = kind === 'image' ? 'image/*' : 'audio/*'
  const label = kind === 'image' ? '上传图片' : '上传 BGM'
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onUpload(kind, file)
  }
  return (
    <label className="alp-upload" aria-disabled={disabled || busy}>
      <span>{busy ? '上传中…' : label}</span>
      <input type="file" accept={accept} aria-label={label} disabled={disabled || busy} onChange={onChange} />
    </label>
  )
}

function preview(asset: ManagedAsset | undefined): JSX.Element {
  if (!asset) return <div className="alp-empty">选择一个图片或 BGM 查看详情。</div>
  return (
    <div className="gc-stage alp-stage">
      {asset.kind === 'image' && asset.url ? (
        <img className="alp-image" src={asset.url} alt={asset.name} />
      ) : asset.kind === 'audio' && asset.url ? (
        <audio className="alp-audio" controls src={asset.url}>浏览器不支持音频预览。</audio>
      ) : (
        <div className="alp-preview-icon" aria-hidden>{asset.kind === 'image' ? '图片' : 'BGM'}</div>
      )}
      <h2>{asset.name}</h2>
      <div className="gc-meta">
        <div className="gc-meta-cell"><span className="gc-meta-k">类型</span><span className="gc-meta-v">{asset.mime ?? (asset.kind === 'image' ? '图片' : '音频')}</span></div>
        <div className="gc-meta-cell"><span className="gc-meta-k">大小</span><span className="gc-meta-v">{formatBytes(asset.bytes)}</span></div>
        <div className="gc-meta-cell gc-meta-cell--wide"><span className="gc-meta-k">来源</span><span className="gc-meta-v">{asset.source ?? '上传资产'}</span></div>
      </div>
    </div>
  )
}

export function AssetLibraryPanel({
  controller,
}: {
  controller: AssetLibraryController
}): JSX.Element {
  const [selectedId, setSelectedId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const deleteRef = useRef<ManagedAsset | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ManagedAsset | null>(null)

  const groups = useMemo<CatalogItem[]>(() => {
    const toItem = (asset: ManagedAsset): CatalogItem => ({
      id: asset.id,
      label: asset.name,
      badge: asset.mime,
    })
    return [
      { id: 'images', label: '图片', children: controller.items.filter((item) => item.kind === 'image').map(toItem) },
      { id: 'audio', label: 'BGM', children: controller.items.filter((item) => item.kind === 'audio').map(toItem) },
    ]
  }, [controller.items])
  const selected = controller.items.find((asset) => asset.id === selectedId)
  const actionsDisabled = !controller.available || controller.mutating || controller.uploading != null

  const select = (id: string) => {
    setSelectedId(id)
    setEditingId(null)
  }
  const beginRename = (asset: ManagedAsset) => {
    setEditingId(asset.id)
    setName(asset.name)
  }
  const saveRename = async () => {
    if (!editingId) return
    await controller.rename(editingId, name)
    setEditingId(null)
  }
  const confirmDelete = async () => {
    if (!pendingDelete) return
    await controller.remove(pendingDelete.id)
    if (selectedId === pendingDelete.id) setSelectedId('')
    setPendingDelete(null)
  }

  return (
    <div className="alp-root">
      {!controller.available ? <div className="alp-unavailable" role="status">图片与 BGM 资源 API 尚未启用。页面和接线已准备好，待 API 提供后即可扫描 manifest 并执行上传、重命名、删除。</div> : null}
      {controller.error ? <div className="alp-error" role="alert">{controller.error}</div> : null}
      <CatalogShell
        icon="素材"
        title="资产库"
        items={groups}
        selectedId={selectedId}
        onSelect={select}
        headAction={
          <span className="alp-head-actions">
            <AssetUpload kind="image" busy={controller.uploading === 'image'} disabled={actionsDisabled} onUpload={(kind, file) => void controller.upload(kind, file)} />
            <AssetUpload kind="audio" busy={controller.uploading === 'audio'} disabled={actionsDisabled} onUpload={(kind, file) => void controller.upload(kind, file)} />
            <button type="button" className="alp-refresh" onClick={() => void controller.refresh()} disabled={controller.loading || controller.uploading != null} aria-label="刷新资产库">刷新</button>
          </span>
        }
        renderRowActions={(id) => {
          const asset = controller.items.find((item) => item.id === id)
          if (!asset) return null
          return (
            <>
              <button type="button" className="gc-row-act" disabled={actionsDisabled} onClick={() => beginRename(asset)} aria-label={`重命名 ${asset.name}`}>改名</button>
              <button type="button" className="gc-row-act is-danger" disabled={actionsDisabled} onClick={(event) => { deleteRef.current = asset; setPendingDelete(asset); event.currentTarget.focus() }} aria-label={`删除 ${asset.name}`}>删除</button>
            </>
          )
        }}
        renderPreview={() => preview(selected)}
      />
      {controller.loading ? <div className="alp-loading" role="status">正在扫描资产 manifest…</div> : null}
      {editingId ? (
        <div className="alp-dialog-backdrop" role="presentation">
          <div className="alp-dialog" role="dialog" aria-modal="true" aria-label="重命名资产">
            <label>资产名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
            <div><button type="button" onClick={() => setEditingId(null)}>取消</button><button type="button" onClick={() => void saveRename()} disabled={!name.trim() || controller.mutating}>保存</button></div>
          </div>
        </div>
      ) : null}
      {pendingDelete ? (
        <div className="alp-dialog-backdrop" role="presentation">
          <div className="alp-dialog" role="dialog" aria-modal="true" aria-label="删除资产">
            <p>确定删除“{pendingDelete.name}”？此操作不可撤销。</p>
            <div><button type="button" onClick={() => { setPendingDelete(null); deleteRef.current = null }}>取消</button><button type="button" onClick={() => void confirmDelete()} disabled={controller.mutating}>确认删除</button></div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
