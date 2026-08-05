/**
 * 蓝图侧栏 CRUD 浮层状态机 —— 逻辑对齐原 BlueprintLibraryView
 * （新建 / 重命名 / 删除 popConfirm / 设为入口），样式由调用方用 ns-* 渲染。
 */
import {
  useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type RefObject,
} from 'react'
import { blueprintsReferencing } from '../../graph/edit/blueprint-refs'
import { useGraphScenario } from '../persist/graphScenarioStore'

export const DUPLICATE_TITLE_MSG = '已存在同名蓝图'

/** fixed 贴触发按钮右侧（躲过列表 overflow）。 */
export function placeBeside(trigger: HTMLElement | null): CSSProperties | null {
  if (!trigger) return null
  const r = trigger.getBoundingClientRect()
  return {
    position: 'fixed',
    top: r.top + r.height / 2,
    left: r.right + 8,
    transform: 'translateY(-50%)',
  }
}

export interface BlueprintNavActions {
  mainId: string
  composing: boolean
  draftName: string | null
  composeError: string | null
  setDraftName: (v: string) => void
  clearComposeError: () => void
  composeInputRef: RefObject<HTMLInputElement>
  openCompose: () => void
  cancelCompose: () => void
  confirmCompose: () => void
  renameId: string | null
  renameDraft: string
  renameError: string | null
  setRenameDraft: (v: string) => void
  clearRenameError: () => void
  renameRootRef: RefObject<HTMLDivElement>
  renameInputRef: RefObject<HTMLInputElement>
  renamePopStyle: CSSProperties | null
  openRename: (id: string, trigger: HTMLElement) => void
  cancelRename: () => void
  confirmRename: () => void
  pendingDeleteId: string | null
  pendingTitle: string
  deleteRootRef: RefObject<HTMLDivElement>
  deletePopStyle: CSSProperties | null
  openDelete: (id: string, trigger: HTMLElement) => void
  cancelDelete: () => void
  confirmDelete: () => void
  setMain: (id: string) => void
}

export function useBlueprintNavActions(): BlueprintNavActions {
  const blueprints = useGraphScenario((s) => s.blueprints)
  const mainId = useGraphScenario((s) => s.mainBlueprintId)
  const create = useGraphScenario((s) => s.createBlueprint)
  const rename = useGraphScenario((s) => s.renameBlueprint)
  const del = useGraphScenario((s) => s.deleteBlueprint)
  const setMain = useGraphScenario((s) => s.setMainBlueprint)
  const authoringProject = useGraphScenario((s) => s.authoringProject)

  const [draftName, setDraftName] = useState<string | null>(null)
  const [composeError, setComposeError] = useState<string | null>(null)
  const composing = draftName !== null
  const composeInputRef = useRef<HTMLInputElement>(null!)

  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const renameRootRef = useRef<HTMLDivElement>(null!)
  const renameInputRef = useRef<HTMLInputElement>(null!)
  const renameTriggerRef = useRef<HTMLElement | null>(null)
  const [renamePopStyle, setRenamePopStyle] = useState<CSSProperties | null>(null)

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const deleteRootRef = useRef<HTMLDivElement>(null!)
  const deleteTriggerRef = useRef<HTMLElement | null>(null)
  const [deletePopStyle, setDeletePopStyle] = useState<CSSProperties | null>(null)

  const cancelCompose = () => {
    setDraftName(null)
    setComposeError(null)
  }
  const cancelRename = () => {
    setRenameId(null)
    setRenameDraft('')
    setRenameError(null)
  }
  const cancelDelete = () => {
    setPendingDeleteId(null)
  }

  const openCompose = () => {
    cancelRename()
    cancelDelete()
    setComposeError(null)
    setDraftName('')
  }
  const confirmCompose = () => {
    const t = draftName?.trim()
    if (!t) { cancelCompose(); return }
    const r = create(t)
    if (!r.ok) {
      setComposeError(DUPLICATE_TITLE_MSG)
      composeInputRef.current?.focus()
      composeInputRef.current?.select()
      return
    }
    cancelCompose()
  }

  const openRename = (id: string, trigger: HTMLElement) => {
    cancelCompose()
    cancelDelete()
    renameTriggerRef.current = trigger
    setRenameError(null)
    setRenameId(id)
    setRenameDraft(blueprints[id]?.title ?? '')
  }
  const confirmRename = () => {
    if (!renameId) return
    const t = renameDraft.trim()
    if (!t) { cancelRename(); return }
    const r = rename(renameId, t)
    if (!r.ok && r.reason === 'duplicate_title') {
      setRenameError(DUPLICATE_TITLE_MSG)
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
      return
    }
    cancelRename()
  }

  const openDelete = (id: string, trigger: HTMLElement) => {
    if (id === mainId) {
      alert('主蓝图不可删')
      return
    }
    const refs = blueprintsReferencing(authoringProject(), id)
    if (refs.length) {
      alert(`被引用，无法删除：${refs.join(', ')}`)
      return
    }
    cancelCompose()
    cancelRename()
    deleteTriggerRef.current = trigger
    setPendingDeleteId(id)
  }
  const confirmDelete = () => {
    if (!pendingDeleteId) return
    const r = del(pendingDeleteId)
    cancelDelete()
    if (!r.ok) {
      alert(
        r.blockedBy?.includes('__main__')
          ? '主蓝图不可删'
          : `被引用，无法删除：${r.blockedBy?.join(', ')}`,
      )
    }
  }

  useLayoutEffect(() => {
    if (!renameId) { setRenamePopStyle(null); return }
    const place = () => setRenamePopStyle(placeBeside(renameTriggerRef.current))
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [renameId])

  useLayoutEffect(() => {
    if (!pendingDeleteId) { setDeletePopStyle(null); return }
    const place = () => setDeletePopStyle(placeBeside(deleteTriggerRef.current))
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [pendingDeleteId])

  useEffect(() => {
    if (!composing) return
    composeInputRef.current?.focus()
    composeInputRef.current?.select()
  }, [composing])

  useEffect(() => {
    if (!renameId) return
    renameInputRef.current?.focus()
    renameInputRef.current?.select()
  }, [renameId])

  useEffect(() => {
    if (!renameId) return
    const onPointer = (e: PointerEvent) => {
      const root = renameRootRef.current
      if (root && !root.contains(e.target as Node)) cancelRename()
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [renameId])

  useEffect(() => {
    if (!pendingDeleteId) return
    const onPointer = (e: PointerEvent) => {
      const root = deleteRootRef.current
      if (root && !root.contains(e.target as Node)) cancelDelete()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelDelete()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [pendingDeleteId])

  const pendingTitle = pendingDeleteId ? (blueprints[pendingDeleteId]?.title ?? pendingDeleteId) : ''

  return {
    mainId,
    composing,
    draftName,
    composeError,
    setDraftName,
    clearComposeError: () => setComposeError(null),
    composeInputRef,
    openCompose,
    cancelCompose,
    confirmCompose,
    renameId,
    renameDraft,
    renameError,
    setRenameDraft,
    clearRenameError: () => setRenameError(null),
    renameRootRef,
    renameInputRef,
    renamePopStyle,
    openRename,
    cancelRename,
    confirmRename,
    pendingDeleteId,
    pendingTitle,
    deleteRootRef,
    deletePopStyle,
    openDelete,
    cancelDelete,
    confirmDelete,
    setMain,
  }
}
