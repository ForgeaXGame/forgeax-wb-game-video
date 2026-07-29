/**
 * Overlay 目录预览 —— 界面 tab 用；无视频底、无时间轴，节点无关。
 * 通用渲染方案里的**每一个** child（HUD / 交互 / 表现），不写死具体皮肤。
 *
 * 两态（同一组件）：
 *  - **只读**：不传交互回调时 = 纯预览（规则/别处复用）。
 *  - **可交互**（界面 tab）：stage 作组件库拖拽落点；每个 child 叠一个「操作框」（layout 盒）。
 *    点击、重叠循环、拖动、方向键微调、边界钳制和层级调整全部复用
 *    OverlayCanvasInteraction；本组件只负责 child 的渲染测量与字段写回。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Entity, Layout, Overlay, OverlayChild, Variable } from '../../runtime/schema/graph-schema'
import { bootEditorSkins } from '../init'
import { createCoreSkinRegistry } from '../../runtime/component-host/components'
import type { SkinCtx } from '../../runtime/component-host/rendererRegistry'
import { injectStyleOnce } from '../../styles/injectStyle'
import { renderOverlayChildPreview } from './overlayChildPreview'
import { isInteractive } from './editors'
import { OVERLAY_PRESET_MIME } from './ComponentLibrary'
import { overlayFitTargets } from './overlay-fit-targets'
import {
  clampCanvasDelta,
  OverlayCanvasInteraction,
  type CanvasBox,
  type CanvasInteractionItem,
} from './OverlayCanvasInteraction'

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))
const num = (v: unknown, d: number): number => (typeof v === 'number' ? v : d)

/** 未显式配尺寸的组件，操作框默认展示大小（也是首次缩放的起点）。 */
const DEFAULT_BOX_W = 0.25
const DEFAULT_BOX_H = 0.15

/** 归一 stage 矩形。 */
type NBox = { left: number; top: number; w: number; h: number }

function isStageFillLayout(layout: Layout | undefined): boolean {
  return (
    layout?.left === 0
    && layout.top === 0
    && layout.width === 1
    && layout.height === 1
    && layout.right == null
    && layout.bottom == null
    && layout.translateX == null
    && layout.translateY == null
  )
}

const PREVIEW_CSS = `
.ocp-root { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ocp-stage {
  position: relative;
  container-type: size;
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
.ocp-hit-tag {
  position: absolute; left: 0; top: -15px; white-space: nowrap;
  font-size: 9px; line-height: 1; padding: 2px 4px; border-radius: 3px;
  background: rgba(0,0,0,.6); color: #f6f1e9; pointer-events: none;
}
/* 按钮真实事件热区可视化：青色虚线，冲突时标红。纯展示，不挡点。 */
.ocp-hot { position: absolute; pointer-events: none; border: 1px dashed rgba(90,200,220,.75); border-radius: 3px; background: rgba(90,200,220,.10); }
.ocp-hot.is-warn { border-color: #ff6b6b; background: rgba(255,107,107,.16); }
.ocp-warn-tag {
  position: absolute; left: 0; top: -15px; white-space: nowrap;
  font-size: 9px; line-height: 1; padding: 2px 4px; border-radius: 3px;
  background: #7a2020; color: #ffd9d9; pointer-events: none;
}
/* 选中态：框**内侧**右下角显示 x,y · w×h 像素读数。 */
.ocp-dim {
  position: absolute; right: 2px; bottom: 2px; white-space: nowrap;
  font-size: 9px; line-height: 1; padding: 2px 5px; border-radius: 3px;
  background: var(--gc-accent, #c8955a); color: #1a1510; pointer-events: none;
  font-variant-numeric: tabular-nums; font-weight: 600;
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
  /** 组件库 chip 拖到画布落地：presetId（可选带初始 place）；返回新 child id，供拖入吸附定位。 */
  onAddChild?: (
    presetId: string,
    place?: { inputs?: Record<string, unknown>; layout?: Partial<Layout> },
  ) => string | undefined | void
  /** 画布上拖动/缩放：写回 child.layout（归一 0~1）。 */
  onPatchChildLayout?: (childId: string, patch: Partial<Layout>) => void
  /** 交互热区重叠冲突集变化时回调（DOM 实测得出）——供上层做参数列表标红 / banner。 */
  onWarnChange?: (ids: Set<string>) => void
}

export function OverlayCatalogPreview({
  overlay,
  entities,
  variables,
  selectedChildId,
  onSelectChild,
  onAddChild,
  onPatchChildLayout,
  onWarnChange,
}: OverlayCatalogPreviewProps): JSX.Element {
  injectStyleOnce('overlay-catalog-preview', PREVIEW_CSS)
  bootEditorSkins()
  const reg = useMemo(() => createCoreSkinRegistry(), [])
  const ctx = useMemo(() => mockHudCtx(entities, variables), [entities, variables])
  const [timeMs, setTimeMs] = useState(400)
  const [dropping, setDropping] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  /** 每个 child 预览渲染层的 DOM——实测可点热区做重叠告警。 */
  const previewRefs = useRef<Record<string, HTMLElement | null>>({})
  /** 交互热区重叠冲突集（DOM 实测）。 */
  const [warnIds, setWarnIds] = useState<Set<string>>(() => new Set())
  const warnSigRef = useRef('')
  /** 各按钮真实事件热区（归一 stage 坐标）——画布叠加可视化。 */
  const [hotAreas, setHotAreas] = useState<Array<NBox & { warn: boolean }>>([])
  const hotSigRef = useRef('')
  /** stage 当前像素尺寸——选中态显示 x,y · w×h 像素读数用。 */
  const [stagePx, setStagePx] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  /** 每个 child 真实渲染内容的最小包围盒（归一 stage 坐标，DOM 实测）——操作框贴合内容用。 */
  const [contentBoxes, setContentBoxes] = useState<Record<string, NBox>>({})
  const contentSigRef = useRef('')
  /** 组件 CSS 声明的 min-width/min-height（归一 stage 坐标）。 */
  const [contentMins, setContentMins] = useState<Record<string, { w: number; h: number }>>({})
  const contentMinSigRef = useRef('')
  /** 组件库拖入后待「吸附到落点」的 child：等它渲染 + 实测出内容盒，再把内容中心平移到鼠标点。 */
  const pendingSnapRef = useRef<{ childId: string; left: number; top: number } | null>(null)

  const interactive = !!(onAddChild || onPatchChildLayout)

  // 跟踪 stage 像素尺寸（缩放/换比例时更新），供选中框显示真实像素读数。
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage || typeof ResizeObserver === 'undefined') return
    const update = () => { const r = stage.getBoundingClientRect(); setStagePx({ w: r.width, h: r.height }) }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  // 重叠告警 + 事件热区可视化：量每个**可交互** child 的逐个按钮热区，两两相交则告警。
  useLayoutEffect(() => {
    if (!interactive) return
    const stage = stageRef.current
    if (!stage) return
    const sr = stage.getBoundingClientRect()
    const W = sr.width
    const H = sr.height
    if (!W || !H) return
    type Box = { l: number; t: number; r: number; b: number }
    const affById: Record<string, Box[]> = {}
    for (const child of overlay.children) {
      if (!isInteractive(child.component)) continue
      const wrap = previewRefs.current[child.id]
      if (!wrap) continue
      const cand = Array.from(wrap.querySelectorAll<HTMLElement>('*')).filter((el) => {
        const cs = getComputedStyle(el)
        return el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || cs.cursor === 'pointer' || cs.cursor === 'not-allowed'
      })
      const outer = cand.filter((el) => !cand.some((o) => o !== el && o.contains(el)))
      const rects = outer
        .map((el) => el.getBoundingClientRect())
        .filter((rc) => rc.width && rc.height)
        .map((rc) => ({ l: rc.left, t: rc.top, r: rc.right, b: rc.bottom }))
      if (rects.length) affById[child.id] = rects
    }
    const intersects = (a: Box, bx: Box) => a.l < bx.r && bx.l < a.r && a.t < bx.b && bx.t < a.b
    const ids = Object.keys(affById)
    const hit = new Set<string>()
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const A = affById[ids[i]!]!
        const B = affById[ids[j]!]!
        if (A.some((a) => B.some((bx) => intersects(a, bx)))) { hit.add(ids[i]!); hit.add(ids[j]!) }
      }
    }
    const sig = [...hit].sort().join(',')
    if (sig !== warnSigRef.current) {
      warnSigRef.current = sig
      setWarnIds(hit)
      onWarnChange?.(hit)
    }
    const areas = ids.flatMap((id) =>
      affById[id]!.map((bx) => ({ left: (bx.l - sr.left) / W, top: (bx.t - sr.top) / H, w: (bx.r - bx.l) / W, h: (bx.b - bx.t) / H, warn: hit.has(id) })),
    )
    const hotSig = areas.map((a) => `${a.left.toFixed(3)},${a.top.toFixed(3)},${a.w.toFixed(3)},${a.h.toFixed(3)},${a.warn ? 1 : 0}`).join('|')
    if (hotSig !== hotSigRef.current) {
      hotSigRef.current = hotSig
      setHotAreas(areas)
    }
  }, [overlay.children, timeMs, interactive, onWarnChange])

  // 每个 child 的最小内容包围盒（DOM 实测，归一 stage 坐标）——操作框据此贴合真实内容，而非满屏 / 默认框。
  // 量 wrap 内**叶子元素**（真实内容）**并入交互热区元素**（button/role=button/cursor:pointer），
  // 取非零尺寸的 union，保证框完整覆盖内容 + 可点热区；无可测则回退整层（= 满屏，对真·满屏皮肤正确）。
  // 复用热区那段的 stage 归一 + 签名 diff 范式。图片等异步内容用捕获阶段 load 监听 + rAF 重量。
  useLayoutEffect(() => {
    if (!interactive) return
    const stage = stageRef.current
    if (!stage) return
    let raf = 0
    const measure = (): void => {
      const sr = stage.getBoundingClientRect()
      const W = sr.width
      const H = sr.height
      if (!W || !H) return
      const next: Record<string, NBox> = {}
      const nextMins: Record<string, { w: number; h: number }> = {}
      for (const child of overlay.children) {
        const wrap = previewRefs.current[child.id]
        if (!wrap) continue
        let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
        let minW = 0
        let minH = 0
        for (const el of wrap.querySelectorAll<HTMLElement>('*')) {
          const style = getComputedStyle(el)
          const cssMinW = Number.parseFloat(style.minWidth)
          const cssMinH = Number.parseFloat(style.minHeight)
          if (Number.isFinite(cssMinW)) minW = Math.max(minW, cssMinW)
          if (Number.isFinite(cssMinH)) minH = Math.max(minH, cssMinH)
        }
        for (const el of overlayFitTargets(wrap)) {
          const rc = el.getBoundingClientRect()
          if (!rc.width || !rc.height) continue
          if (rc.left < l) l = rc.left
          if (rc.top < t) t = rc.top
          if (rc.right > r) r = rc.right
          if (rc.bottom > b) b = rc.bottom
        }
        if (!(r > l && b > t)) {
          const rc = wrap.getBoundingClientRect() // 无可测内容（真·全屏皮肤）→ 回退整层
          l = rc.left; t = rc.top; r = rc.right; b = rc.bottom
        }
        next[child.id] = { left: (l - sr.left) / W, top: (t - sr.top) / H, w: (r - l) / W, h: (b - t) / H }
        nextMins[child.id] = { w: minW / W, h: minH / H }
      }
      const sig = Object.entries(next)
        .map(([id, x]) => `${id}:${x.left.toFixed(3)},${x.top.toFixed(3)},${x.w.toFixed(3)},${x.h.toFixed(3)}`)
        .join('|')
      if (sig !== contentSigRef.current) {
        contentSigRef.current = sig
        setContentBoxes(next)
      }
      const minSig = Object.entries(nextMins)
        .map(([id, size]) => `${id}:${size.w.toFixed(3)},${size.h.toFixed(3)}`)
        .join('|')
      if (minSig !== contentMinSigRef.current) {
        contentMinSigRef.current = minSig
        setContentMins(nextMins)
      }
    }
    measure()
    // load 不冒泡 → 捕获阶段监听；rAF 合并连发的图片 load。
    const onLoad = (): void => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure) }
    stage.addEventListener('load', onLoad, true)
    return () => { cancelAnimationFrame(raf); stage.removeEventListener('load', onLoad, true) }
  }, [overlay.children, timeMs, interactive, stagePx.w, stagePx.h])

  /** 事件点 → 归一舞台坐标。 */
  const normPoint = (clientX: number, clientY: number): { left: number; top: number } => {
    const r = stageRef.current?.getBoundingClientRect()
    if (!r || !r.width || !r.height) return { left: 0, top: 0 }
    return { left: clamp01((clientX - r.left) / r.width), top: clamp01((clientY - r.top) / r.height) }
  }

  /** 首次编辑前用实测可见框；写过布局后以显式 left/top/width/height 为准。 */
  const interactionBox = (child: OverlayChild): CanvasBox => {
    const content = contentBoxes[child.id]
    const layout = child.layout
    const authored = !isStageFillLayout(layout) && (
      typeof layout?.left === 'number'
      || typeof layout?.top === 'number'
      || typeof layout?.width === 'number'
      || typeof layout?.height === 'number'
    )
    if (!authored) {
      return {
        left: content?.left ?? num(layout?.left, 0),
        top: content?.top ?? num(layout?.top, 0),
        width: content?.w ?? num(layout?.width, DEFAULT_BOX_W),
        height: content?.h ?? num(layout?.height, DEFAULT_BOX_H),
      }
    }
    const layoutLeft = num(layout?.left, content?.left ?? 0)
    const layoutTop = num(layout?.top, content?.top ?? 0)
    const layoutWidth = num(layout?.width, content?.w ?? DEFAULT_BOX_W)
    const layoutHeight = num(layout?.height, content?.h ?? DEFAULT_BOX_H)
    if (!content) {
      return { left: layoutLeft, top: layoutTop, width: layoutWidth, height: layoutHeight }
    }
    const left = Math.min(layoutLeft, content.left)
    const top = Math.min(layoutTop, content.top)
    return {
      left,
      top,
      width: Math.max(layoutLeft + layoutWidth, content.left + content.w) - left,
      height: Math.max(layoutTop + layoutHeight, content.top + content.h) - top,
    }
  }
  /** 位置和尺寸统一落 child.layout，并清掉相冲突的右/下锚点。 */
  const writeBox = (childId: string, box: CanvasBox): void => {
    onPatchChildLayout?.(childId, {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      right: undefined,
      bottom: undefined,
    })
  }
  /** 层级重排：置顶 = 最大 zIndex+1，置底 = 最小 zIndex-1。 */
  const reorder = (childId: string, to: 'front' | 'back') => {
    if (!onPatchChildLayout) return
    const zs = overlay.children.map((c) => num(c.layout?.zIndex, 0))
    const z = to === 'front' ? Math.max(0, ...zs) + 1 : Math.min(0, ...zs) - 1
    onPatchChildLayout(childId, { zIndex: z })
  }

  const onDrop = (e: React.DragEvent) => {
    setDropping(false)
    if (!onAddChild) return
    const presetId = e.dataTransfer.getData(OVERLAY_PRESET_MIME)
    if (!presetId) return
    e.preventDefault()
    // 严格跟随鼠标：不猜落点字段（cue.x/y、CSS 边角锚定、满屏盒各不相同），先按预设默认加组件，
    // 待其渲染 + 实测出内容盒后，把可见内容框的中心平移到落点。
    const p = normPoint(e.clientX, e.clientY)
    const id = onAddChild(presetId)
    if (typeof id === 'string') pendingSnapRef.current = { childId: id, left: p.left, top: p.top }
  }

  // 拖入吸附：新 child 渲染并实测出内容盒后，把它的内容中心平移到落点并固化可编辑盒。
  useEffect(() => {
    const pend = pendingSnapRef.current
    if (!pend) return
    const child = overlay.children.find((c) => c.id === pend.childId)
    const cb = contentBoxes[pend.childId]
    if (!child || !cb) return // 尚未渲染/实测完 → 等下一次 contentBoxes 更新
    pendingSnapRef.current = null
    // 内容中心当前落在 (cb.left+w/2, cb.top+h/2)；要它落到 (pend.left, pend.top) → 施加对应位移。
    const wantDx = pend.left - (cb.left + cb.w / 2)
    const wantDy = pend.top - (cb.top + cb.h / 2)
    const delta = clampCanvasDelta(
      { left: cb.left, top: cb.top, width: cb.w, height: cb.h },
      wantDx,
      wantDy,
    )
    writeBox(child.id, {
      left: cb.left + delta.x,
      top: cb.top + delta.y,
      width: cb.w,
      height: cb.h,
    })
  }, [contentBoxes, overlay.children])

  const interactionItems = useMemo<CanvasInteractionItem[]>(() =>
    overlay.children.map((child) => {
      const box = interactionBox(child)
      const min = contentMins[child.id]
      return {
        id: child.id,
        label: child.component,
        position: { x: box.left, y: box.top },
        frame: { kind: 'box', ...box },
        zIndex: num(child.layout?.zIndex, 0),
        movable: true,
        resizable: true,
        minWidth: min?.w,
        minHeight: min?.h,
        warn: warnIds.has(child.id),
      }
    }), [contentBoxes, contentMins, overlay.children, warnIds])

  return (
    <div className="ocp-root">
      <div
        ref={stageRef}
        className={`ocp-stage${interactive ? ' is-interactive' : ''}${dropping ? ' is-dropping' : ''}`}
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
            <div
              key={child.id}
              ref={(el) => { previewRefs.current[child.id] = el }}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
              {renderOverlayChildPreview(child, reg, ctx, timeMs)}
            </div>
          ))
        )}
        {interactive &&
          hotAreas.map((a, i) => (
            <div
              key={`hot-${i}`}
              className={`ocp-hot${a.warn ? ' is-warn' : ''}`}
              style={{ left: `${a.left * 100}%`, top: `${a.top * 100}%`, width: `${a.w * 100}%`, height: `${a.h * 100}%` }}
            />
          ))}
        {interactive &&
          <OverlayCanvasInteraction
            stageRef={stageRef}
            items={interactionItems}
            selectedId={selectedChildId || null}
            onSelect={(id) => onSelectChild?.(id ?? '')}
            onMove={(id, position) => {
              const item = interactionItems.find((candidate) => candidate.id === id)
              if (!item || item.frame.kind !== 'box') return
              writeBox(id, {
                left: position.x,
                top: position.y,
                width: item.frame.width,
                height: item.frame.height,
              })
            }}
            onResize={writeBox}
            onReorder={onPatchChildLayout ? reorder : undefined}
            ariaLabel="界面方案画布"
            renderFrame={(item, state) => (
              <>
                <span className="ocp-hit-tag">{item.label}</span>
                {item.warn ? (
                  <span className="ocp-warn-tag" title="与另一交互组件热区重叠，运行时点击会互相遮挡">
                    重叠
                  </span>
                ) : null}
                {state.selected ? (
                  <span className="ocp-dim">
                    {Math.round(state.box.left * stagePx.w)},{Math.round(state.box.top * stagePx.h)}
                    {' · '}
                    {Math.round(state.box.width * stagePx.w)}×{Math.round(state.box.height * stagePx.h)}
                  </span>
                ) : null}
              </>
            )}
          />}
      </div>
      {/* 预览时刻拖条：仅只读预览态显示（规则 tab 等）；界面 tab 可交互态不显，画布固定 t=400ms 渲染。 */}
      {!interactive && (
        <label className="ocp-scrub">
          <span>预览时刻</span>
          <input type="range" min={0} max={3000} step={50} value={timeMs} onChange={(e) => setTimeMs(Number(e.target.value))} />
          <span>{(timeMs / 1000).toFixed(2)}s</span>
        </label>
      )}
    </div>
  )
}
