/**
 * Overlay 目录预览 —— 界面 tab 用；无视频底、无时间轴，节点无关。
 * 通用渲染方案里的**每一个** child（HUD / 交互 / 表现），不写死具体皮肤。
 *
 * 两态（同一组件）：
 *  - **只读**：不传交互回调时 = 纯预览（规则/别处复用）。
 *  - **可交互**（界面 tab）：stage 作组件库拖拽落点；每个 child 叠一个「操作框」——
 *    拖动改 `layout.left/top`、右下角手柄改 `layout.width/height`（均归一 0~1，写回 schema）。
 *    操作框 = 我们正在编辑的 **layout 盒**本身（不测量组件实际绘制内容），所见即所改。
 */
import { useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Entity, Layout, Overlay, Variable } from '../../runtime/schema/graph-schema'
import { bootEditorSkins } from '../init'
import { createCoreSkinRegistry } from '../../runtime/skins/components'
import type { SkinCtx } from '../../runtime/skins/rendererRegistry'
import { injectStyleOnce } from '../../styles/injectStyle'
import { renderOverlayChildPreview } from './overlayChildPreview'
import { isSizable } from './editors'
import { OVERLAY_PRESET_MIME } from './ComponentLibrary'

/** 未显式配尺寸的可缩放组件，操作框默认展示大小（也是首次缩放的起点）。 */
const DEFAULT_BOX_W = 0.25
const DEFAULT_BOX_H = 0.15

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))
const num = (v: unknown, d: number): number => (typeof v === 'number' ? v : d)

const PREVIEW_CSS = `
.ocp-root { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
.ocp-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: linear-gradient(165deg, #1a1510 0%, #0a0908 55%, #12100e 100%);
  border: 1px solid rgba(255,255,255,.08);
  box-shadow: inset 0 0 40px rgba(0,0,0,.45);
}
.ocp-stage.is-dropping { border-color: var(--gc-accent, #c8955a); box-shadow: inset 0 0 40px rgba(200,149,90,.25); }
.ocp-stage::after {
  content: '界面预览';
  position: absolute; left: 8px; top: 6px;
  font-size: 10px; letter-spacing: .06em; opacity: .45; pointer-events: none; z-index: 999;
}
.ocp-empty {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 11px; opacity: .45; pointer-events: none;
}
.ocp-scrub { display: flex; align-items: center; gap: 8px; font-size: 10px; opacity: .7; }
.ocp-scrub input { flex: 1; }
/* ── 可交互操作层：操作框只描边不挡点（pointer-events:none），选中/拖动/循环全走 stage ── */
.ocp-stage.is-interactive { cursor: default; }
.ocp-stage.is-grab { cursor: grab; }
.ocp-stage.is-grabbing, .ocp-stage.is-grabbing * { cursor: grabbing !important; }
.ocp-hit {
  position: absolute; box-sizing: border-box;
  border: 1px dashed rgba(255,255,255,.28); border-radius: 4px;
  pointer-events: none; touch-action: none;
}
.ocp-hit.is-selected { border: 1px solid var(--gc-accent, #c8955a); box-shadow: 0 0 0 1px rgba(200,149,90,.4); }
.ocp-hit-tag {
  position: absolute; left: 0; top: -15px; white-space: nowrap;
  font-size: 9px; line-height: 1; padding: 2px 4px; border-radius: 3px;
  background: rgba(0,0,0,.6); color: #f6f1e9; pointer-events: none;
}
.ocp-resize {
  position: absolute; right: -5px; bottom: -5px; width: 12px; height: 12px;
  border-radius: 2px; background: var(--gc-accent, #c8955a);
  border: 1px solid #fff; cursor: nwse-resize; touch-action: none; pointer-events: auto;
}
`

function mockHudCtx(entities: Record<string, Entity> | undefined, variables: Record<string, Variable> | undefined): SkinCtx {
  const ents: SkinCtx['hud']['entities'] = {}
  const pack = (attrs: Record<string, number>, attrMeta?: Record<string, { max?: number; initial?: number }>) => {
    const attrMax: Record<string, number> = {}
    for (const [k, v] of Object.entries(attrs)) attrMax[k] = attrMeta?.[k]?.max ?? v
    return { hp: attrs.hp ?? 0, maxHp: attrMeta?.hp?.max ?? attrs.hp ?? 0, attrs: { ...attrs }, attrMax }
  }
  for (const [id, e] of Object.entries(entities ?? {})) {
    const hp = e.attrs?.hp ?? e.attrMeta?.hp?.initial ?? 100
    const attrs = { ...(e.attrs ?? {}), hp }
    ents[id] = pack(attrs, e.attrMeta)
  }
  // 保底给两个常见战斗实体样例血量，好让血条皮肤在无实体数据时也有内容。
  if (!ents['ent-player']) ents['ent-player'] = pack({ hp: 72 }, { hp: { max: 100 } })
  if (!ents['ent-boss']) ents['ent-boss'] = pack({ hp: 58 }, { hp: { max: 100 } })
  const vars: Record<string, number> = { qi: 3 }
  for (const [id, v] of Object.entries(variables ?? {})) vars[id] = v.initial ?? 0
  return { hud: { entities: ents, vars, flags: {}, score: 1200 } }
}

export interface OverlayCatalogPreviewProps {
  overlay: Overlay
  entities: Record<string, Entity> | undefined
  variables: Record<string, Variable> | undefined
  /** 传任一交互回调即进入「可交互」态；全缺省 = 只读预览（向后兼容）。 */
  selectedChildId?: string
  onSelectChild?: (childId: string) => void
  /** 组件库 chip 拖到画布落地：presetId + 归一落点。 */
  onAddChild?: (presetId: string, layout: Partial<Layout>) => void
  /** 画布上拖动/缩放：写回 child.layout（归一 0~1）。 */
  onPatchChildLayout?: (childId: string, patch: Partial<Layout>) => void
}

export function OverlayCatalogPreview({
  overlay,
  entities,
  variables,
  selectedChildId,
  onSelectChild,
  onAddChild,
  onPatchChildLayout,
}: OverlayCatalogPreviewProps): JSX.Element {
  injectStyleOnce('overlay-catalog-preview', PREVIEW_CSS)
  bootEditorSkins()
  const reg = useMemo(() => createCoreSkinRegistry(), [])
  const ctx = useMemo(() => mockHudCtx(entities, variables), [entities, variables])
  const [timeMs, setTimeMs] = useState(400)
  const [dropping, setDropping] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  /** 每个 child 操作框的 DOM——stage 按其屏幕 rect 做几何命中判定（不依赖 z 序/事件目标）。 */
  const childRefs = useRef<Record<string, HTMLElement | null>>({})
  /** 拖动进行中——悬停 cursor 逻辑在拖动时让位给「抓紧」。 */
  const draggingRef = useRef(false)

  const interactive = !!(onAddChild || onPatchChildLayout)

  /** stage 当前像素尺寸（拖拽时 px 位移 → 归一）。 */
  const stageSize = (): { w: number; h: number } => {
    const r = stageRef.current?.getBoundingClientRect()
    return { w: r?.width ?? 0, h: r?.height ?? 0 }
  }
  /** 事件点 → 归一舞台坐标。 */
  const normPoint = (clientX: number, clientY: number): { left: number; top: number } => {
    const r = stageRef.current?.getBoundingClientRect()
    if (!r || !r.width || !r.height) return { left: 0, top: 0 }
    return { left: clamp01((clientX - r.left) / r.width), top: clamp01((clientY - r.top) / r.height) }
  }

  /** 事件点是否落在某 child 操作框内（用其真实屏幕 rect，含 pill 尺寸）。 */
  const rectContains = (childId: string, x: number, y: number): boolean => {
    const r = childRefs.current[childId]?.getBoundingClientRect()
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  }

  /** 悬停在某组件操作框上 → 抓手（grab）；空处 → 默认。拖动中不干预（让位给 grabbing）。 */
  const onStageHoverMove = (e: ReactPointerEvent) => {
    if (!interactive || draggingRef.current) return
    const stage = stageRef.current
    if (!stage) return
    const over = overlay.children.some((c) => rectContains(c.id, e.clientX, e.clientY))
    stage.classList.toggle('is-grab', over)
  }

  /**
   * stage 按下：几何命中栈（顶层在前）。未选中框 pointer-events:none，故 stage 总能收到按下。
   * 模型 = 点击选中 / 拖动移动：
   *  - 拖动移动**当前选中**（若它在命中栈内），否则移动栈顶；
   *  - 纯点击（无位移）在重叠处**循环**到下一层，供逐层选中。
   */
  const onStagePointerDown = (e: ReactPointerEvent) => {
    if (!interactive) return
    if ((e.target as HTMLElement).classList.contains('ocp-resize')) return // 交给缩放手柄自身
    const stack = overlay.children.filter((c) => rectContains(c.id, e.clientX, e.clientY)).reverse()
    if (stack.length === 0) {
      onSelectChild?.('')
      return
    }
    const selIdx = stack.findIndex((c) => c.id === selectedChildId)
    const target = selIdx >= 0 ? stack[selIdx] : stack[0]
    if (!target) return
    onSelectChild?.(target.id)
    if (!onPatchChildLayout) return
    const { w, h } = stageSize()
    if (!w || !h) return
    const startX = e.clientX
    const startY = e.clientY
    const startL = num(target.layout?.left, 0)
    const startT = num(target.layout?.top, 0)
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 2 && Math.abs(ev.clientY - startY) < 2) return
      if (!moved) {
        moved = true
        draggingRef.current = true
        el.classList.remove('is-grab')
        el.classList.add('is-grabbing') // 拖动中 → 抓紧
      }
      onPatchChildLayout(target.id, {
        left: clamp01(startL + (ev.clientX - startX) / w),
        top: clamp01(startT + (ev.clientY - startY) / h),
      })
    }
    const up = () => {
      try { el.releasePointerCapture(e.pointerId) } catch { /* already released */ }
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      draggingRef.current = false
      el.classList.remove('is-grabbing')
      // 纯点击（未拖动）+ 已选中项在栈内 + 有重叠 → 循环到下一层，逐层选中。
      if (!moved && selIdx >= 0 && stack.length > 1) {
        const next = stack[(selIdx + 1) % stack.length]
        if (next) onSelectChild?.(next.id)
      }
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  const beginResize = (e: ReactPointerEvent, childId: string, layout: Layout | undefined) => {
    if (!onPatchChildLayout) return
    e.stopPropagation()
    e.preventDefault()
    onSelectChild?.(childId)
    const { w, h } = stageSize()
    if (!w || !h) return
    const startX = e.clientX
    const startY = e.clientY
    const startW = num(layout?.width, DEFAULT_BOX_W)
    const startH = num(layout?.height, DEFAULT_BOX_H)
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      onPatchChildLayout(childId, {
        width: clamp01(startW + (ev.clientX - startX) / w),
        height: clamp01(startH + (ev.clientY - startY) / h),
      })
    }
    const up = () => {
      try { el.releasePointerCapture(e.pointerId) } catch { /* already released */ }
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  const onDrop = (e: React.DragEvent) => {
    setDropping(false)
    if (!onAddChild) return
    const presetId = e.dataTransfer.getData(OVERLAY_PRESET_MIME)
    if (!presetId) return
    e.preventDefault()
    onAddChild(presetId, normPoint(e.clientX, e.clientY))
  }

  return (
    <div className="ocp-root">
      <div
        ref={stageRef}
        className={`ocp-stage${interactive ? ' is-interactive' : ''}${dropping ? ' is-dropping' : ''}`}
        onPointerDown={interactive ? onStagePointerDown : undefined}
        onPointerMove={interactive ? onStageHoverMove : undefined}
        onDragOver={
          onAddChild
            ? (e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                if (!dropping) setDropping(true)
              }
            : undefined
        }
        onDragLeave={onAddChild ? () => setDropping(false) : undefined}
        onDrop={onAddChild ? onDrop : undefined}
      >
        {overlay.children.length === 0 ? (
          <div className="ocp-empty">{interactive ? '从右侧组件库拖组件到这里' : '此方案暂无组件'}</div>
        ) : (
          overlay.children.map((child) => (
            <div key={child.id} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {renderOverlayChildPreview(child, reg, ctx, timeMs)}
            </div>
          ))
        )}
        {interactive &&
          overlay.children.map((child) => {
            const L = child.layout
            const pl = num(L?.left, 0)
            const pt = num(L?.top, 0)
            const sizable = isSizable(child.component)
            const selected = child.id === selectedChildId
            // 有显式宽高、或（选中且可缩放）→ 画成盒；否则画成小把手 pill。
            const boxW = typeof L?.width === 'number' ? L.width : selected && sizable ? DEFAULT_BOX_W : undefined
            const boxH = typeof L?.height === 'number' ? L.height : selected && sizable ? DEFAULT_BOX_H : undefined
            const asBox = boxW != null && boxH != null
            return (
              <div
                key={child.id}
                ref={(el) => { childRefs.current[child.id] = el }}
                className={`ocp-hit${selected ? ' is-selected' : ''}`}
                style={{
                  left: `${pl * 100}%`,
                  top: `${pt * 100}%`,
                  ...(asBox
                    ? { width: `${boxW * 100}%`, height: `${boxH * 100}%` }
                    : { padding: '3px 7px', minWidth: 14 }),
                }}
              >
                {!asBox && <span style={{ fontSize: 9, opacity: 0.8, pointerEvents: 'none' }}>{child.component}</span>}
                {asBox && <span className="ocp-hit-tag">{child.component}</span>}
                {selected && sizable && (
                  <span className="ocp-resize" onPointerDown={(e) => beginResize(e, child.id, L)} title="拖动改尺寸" />
                )}
              </div>
            )
          })}
      </div>
      <label className="ocp-scrub">
        <span>预览时刻</span>
        <input type="range" min={0} max={3000} step={50} value={timeMs} onChange={(e) => setTimeMs(Number(e.target.value))} />
        <span>{(timeMs / 1000).toFixed(2)}s</span>
      </label>
    </div>
  )
}
