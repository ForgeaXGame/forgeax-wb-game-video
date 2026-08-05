import { useEffect, useState } from 'react'
import type { Overlay } from '../../runtime/schema/graph-schema'
import { injectStyleOnce } from '../../styles/injectStyle'

export interface UiTreeViewNode {
  id: string
  kind: 'folder' | 'scheme'
  name?: string
  overlayId?: string
  children?: UiTreeViewNode[]
  readOnly?: boolean
}

export interface UiTreeViewProps {
  nodes: readonly UiTreeViewNode[]
  overlays: Record<string, Overlay>
  usageByOverlay?: Record<string, number>
  selectedTreeNodeId: string | null
  onSelect: (node: UiTreeViewNode) => void
  onAddFolder: (parentId: string) => void
  onAddScheme: (parentId: string) => void
  onRename: (nodeId: string, name: string) => void
  onDelete: (node: UiTreeViewNode) => void
}

const UI_TREE_CSS = `
.uit-tree { display:flex; flex-direction:column; width:100%; min-width:0; }
.uit-branch { display:flex; flex-direction:column; width:100%; min-width:0; }
.uit-row {
  box-sizing:border-box; width:100%; min-width:0; height:42px;
  display:flex; align-items:center; gap:4px; padding-right:0;
  border-bottom:1px solid rgba(255,255,255,.10); background:transparent; color:#fff;
}
.uit-row:hover { background:rgba(255,255,255,.05); }
.uit-row.is-selected { background:rgba(255,255,255,.10); }
.uit-main {
  all:unset; box-sizing:border-box; min-width:0; flex:1; display:flex; align-items:center;
  gap:8px; cursor:pointer; height:41px; overflow:hidden;
}
.uit-main:focus-visible,.uit-icon-btn:focus-visible {
  outline:1px solid rgba(255,255,255,.45); outline-offset:-1px;
}
.uit-toggle {
  width:20px; height:20px; flex:none; display:inline-flex; align-items:center; justify-content:center;
  text-align:center; opacity:.72; font-size:15px; line-height:20px;
  border:0; padding:0; background:transparent; color:inherit; cursor:pointer;
}
.uit-row:hover .uit-toggle,.uit-row:focus-within .uit-toggle { opacity:1; }
.uit-label {
  min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  font-size:16px; line-height:26px;
}
.uit-usage { flex:none; font-size:11px; opacity:.65; }
.uit-icon-btn {
  width:20px; height:20px; flex:none; border:0; border-radius:2px; background:transparent;
  color:rgba(255,255,255,.72); cursor:pointer; padding:0; opacity:0; pointer-events:none;
  transition:opacity .12s, background .12s;
}
.uit-row:hover .uit-icon-btn,.uit-row:focus-within .uit-icon-btn,.uit-icon-btn.is-open {
  opacity:1; pointer-events:auto;
}
.uit-icon-btn:hover,.uit-icon-btn.is-open { background:rgba(255,255,255,.12); color:#fff; }
.uit-children { display:flex; flex-direction:column; width:100%; min-width:0; }
.uit-menu {
  box-sizing:border-box; width:calc(100% - 24px); min-width:0;
  margin:4px 0 4px 24px; padding:5px; display:flex; flex-wrap:wrap; gap:4px;
  border:1px solid rgba(255,255,255,.12); border-radius:2px; background:#353535;
}
.uit-menu button {
  border:0; border-radius:2px; padding:5px 7px; background:rgba(255,255,255,.08);
  color:#fff; cursor:pointer; font-size:12px;
}
.uit-menu button:hover { background:rgba(255,255,255,.15); }
.uit-menu button.is-danger { color:#ffb4ae; }
.uit-edit { flex:1; min-width:0; display:flex; gap:4px; }
.uit-edit input {
  min-width:0; flex:1; border:1px solid rgba(255,255,255,.22); border-radius:2px;
  background:#242424; color:#fff; padding:4px 6px;
}
.uit-edit button { flex:none; border:0; border-radius:2px; padding:4px 6px; cursor:pointer; }
.uit-confirm { display:flex; flex-direction:column; gap:6px; width:100%; font-size:12px; line-height:1.4; }
.uit-confirm-actions { display:flex; justify-content:flex-end; gap:5px; }
.ns-empty {
  min-height:42px; display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,.10);
  color:rgba(255,255,255,.45); font-size:13px;
}
`

type RowMode = 'menu' | 'rename' | 'delete' | null

function UiTreeRow({
  node,
  depth,
  overlays,
  usageByOverlay,
  selectedTreeNodeId,
  onSelect,
  onAddFolder,
  onAddScheme,
  onRename,
  onDelete,
}: UiTreeViewProps & { node: UiTreeViewNode; depth: number }): JSX.Element {
  const isFolder = node.kind === 'folder'
  const [expanded, setExpanded] = useState(true)
  const [mode, setMode] = useState<RowMode>(null)
  const [draft, setDraft] = useState(node.name ?? '')
  const overlay = node.overlayId ? overlays[node.overlayId] : undefined
  const label = isFolder ? (node.name?.trim() || '未命名文件夹') : (overlay?.title?.trim() || node.overlayId || '缺失方案')
  const usage = node.overlayId ? (usageByOverlay?.[node.overlayId] ?? 0) : 0

  useEffect(() => {
    if (mode === 'rename') setDraft(node.name ?? label)
  }, [mode, node.name, label])

  const confirmRename = (): void => {
    const next = draft.trim()
    if (next) onRename(node.id, next)
    setMode(null)
  }

  return (
    <div className="uit-branch" role="treeitem" aria-expanded={isFolder ? expanded : undefined}>
      <div
        className={`uit-row${selectedTreeNodeId === node.id ? ' is-selected' : ''}`}
        style={{ paddingLeft: Math.min(depth * 24, 96) }}
      >
        <div
          className="uit-main"
          role="button"
          tabIndex={0}
          aria-label={isFolder ? `选择文件夹 ${label}` : `选择界面方案 ${label}`}
          onClick={() => {
            if (mode === 'rename') return
            onSelect(node)
            if (isFolder) setExpanded(true)
          }}
          onKeyDown={(event) => {
            if (mode === 'rename' || (event.key !== 'Enter' && event.key !== ' ')) return
            event.preventDefault()
            onSelect(node)
            if (isFolder) setExpanded(true)
          }}
        >
          <button
            type="button"
            className="uit-toggle"
            aria-label={isFolder ? `${expanded ? '收起' : '展开'}${label}` : undefined}
            tabIndex={isFolder ? 0 : -1}
            onClick={(event) => {
              if (!isFolder) return
              event.stopPropagation()
              setExpanded((value) => !value)
            }}
          >
            {isFolder ? (expanded ? '⌄' : '›') : ''}
          </button>
          {mode === 'rename' ? (
            <span className="uit-edit" onClick={(event) => event.stopPropagation()}>
              <input
                autoFocus
                aria-label={`重命名${isFolder ? '文件夹' : '方案'}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); confirmRename() }
                  if (event.key === 'Escape') { event.preventDefault(); setMode(null) }
                }}
              />
              <button type="button" onClick={confirmRename}>确定</button>
            </span>
          ) : (
            <span className="uit-label" title={label}>{label}</span>
          )}
          {!isFolder && usage > 0 && <span className="uit-usage" title={`被 ${usage} 个节点引用`}>⇢{usage}</span>}
        </div>
        {!node.readOnly && mode !== 'rename' && (
          <button
            type="button"
            className={`uit-icon-btn${mode ? ' is-open' : ''}`}
            aria-label={`${label}操作`}
            aria-expanded={mode !== null}
            onClick={() => setMode((value) => (value ? null : 'menu'))}
          >
            ⋯
          </button>
        )}
      </div>
      {mode === 'menu' && (
        <div className="uit-menu" role="menu" aria-label={`${label}操作菜单`}>
          {isFolder && <button type="button" onClick={() => { onAddFolder(node.id); setExpanded(true); setMode(null) }}>＋ 子文件夹</button>}
          {isFolder && <button type="button" onClick={() => { onAddScheme(node.id); setExpanded(true); setMode(null) }}>＋ 方案</button>}
          <button type="button" onClick={() => setMode('rename')}>重命名</button>
          <button type="button" className="is-danger" onClick={() => setMode('delete')}>删除</button>
        </div>
      )}
      {mode === 'delete' && (
        <div className="uit-menu" role="dialog" aria-label={`删除${label}`}>
          <div className="uit-confirm">
            <span>
              确定删除「{label}」？
              {!isFolder && usage > 0 ? ` 当前仍被 ${usage} 个节点引用。` : ''}
            </span>
            <span className="uit-confirm-actions">
              <button type="button" onClick={() => setMode(null)}>取消</button>
              <button type="button" className="is-danger" onClick={() => { onDelete(node); setMode(null) }}>确认删除</button>
            </span>
          </div>
        </div>
      )}
      {isFolder && expanded && (node.children?.length ?? 0) > 0 && (
        <div className="uit-children" role="group">
          {node.children!.map((child) => (
            <UiTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              nodes={node.children!}
              overlays={overlays}
              usageByOverlay={usageByOverlay}
              selectedTreeNodeId={selectedTreeNodeId}
              onSelect={onSelect}
              onAddFolder={onAddFolder}
              onAddScheme={onAddScheme}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function UiTreeView(props: UiTreeViewProps): JSX.Element {
  injectStyleOnce('ui-tree-view', UI_TREE_CSS)
  return (
    <div className="uit-tree" role="tree" aria-label="界面方案树">
      {props.nodes.length > 0 ? props.nodes.map((node) => (
        <UiTreeRow key={node.id} {...props} node={node} depth={0} />
      )) : <div className="ns-empty">暂无界面方案</div>}
    </div>
  )
}
