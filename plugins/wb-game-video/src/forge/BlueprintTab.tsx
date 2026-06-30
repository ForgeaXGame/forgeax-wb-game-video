import { memo, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
  Handle,
  Position,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useScenarioStore } from '../scenario/scenarioStore'
import { useShellStore } from '../shell/shellStore'
import { BlueprintGameplayPanel } from './BlueprintGameplayPanel'
import { resolveBranchEdgeStyle } from '../editor/storygraph/BranchEdge'
import {
  BPG_CANVAS_GRID_CSS,
  BPG_LEGEND,
  BPG_NODE_W,
  BPG_TYPE_ACCENTS,
  resolveBpgType,
  type BpgTypeClass,
} from '../editor/storygraph/blueprintGraphStyle'
import { handleSceneNodeDragStop } from '../editor/storygraph/sceneNodeHandlers'
import { computeStoryGraphLayout } from '../scenario/layout'
import { injectStyleOnce } from '../styles/injectStyle'
import type { BranchKind, Scene, Scenario } from '../scenario/types'

/**
 * BlueprintTab —— 「蓝图」视图(玩法结构总览)。
 *
 * 与「剧情树」并列、**同一个 Scenario**(SSOT)，只是渲染侧重不同:剧情树重叙事节点编辑，
 * 蓝图重玩法骨架——按 Scene.kind 上色、把 Boss/QTE/限时选择/门槛/热点 以角标标出，
 * 连线叠加条件/数值效果标记。横向(LR)流程图式布局，全画布只读导航。
 *
 * 复用:computeStoryGraphLayout(同一布局引擎) + 统一分支连线样式。
 * 作者拖过的节点坐标落在 scene.pos, 持久化进 Scenario; 再次进入 / AI 改剧本时以 pos 为准。
 */
export function BlueprintTab() {
  return (
    <ReactFlowProvider>
      <BlueprintInner />
    </ReactFlowProvider>
  )
}

const NODE_W = BPG_NODE_W
const NODE_H = 96

function BlueprintInner() {
  const scenario = useScenarioStore((s) => s.scenario)
  const selectedSceneId = useScenarioStore((s) => s.selectedSceneId)
  const selectScene = useScenarioStore((s) => s.selectScene)
  const setScenePos = useScenarioStore((s) => s.setScenePos)
  const stageSceneId = useShellStore((s) => s.stageSceneId)
  const forgeView = useShellStore((s) => s.forgeView)
  const { fitView } = useReactFlow()

  // 蓝图是「视频脉络编辑图」：点击节点 = 就地选中并编辑其玩法配置，
  // 选中态以 selectedSceneId 为准（点击即更新），不被外部 stageSceneId 抢占。
  const activeId = selectedSceneId ?? stageSceneId
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    if (activeId) setPanelOpen(true)
  }, [activeId])

  const layout = useMemo(
    () =>
      computeStoryGraphLayout(scenario, {
        direction: 'LR',
        nodeWidth: NODE_W,
        nodeHeight: NODE_H,
        nodeSep: 26,
        rankSep: 64,
        marginX: 24,
        marginY: 24,
      }),
    [scenario],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    const nextNodes: Node[] = []
    for (const [id, scene] of Object.entries(scenario.scenes)) {
      const rect = layout[id]
      if (!scene || !rect) continue
      nextNodes.push({
        id,
        type: 'bp',
        position: { x: rect.x, y: rect.y },
        data: deriveNodeData(scene, scenario, id === activeId),
        draggable: true,
        selectable: true,
      })
    }
    const nextEdges: Edge[] = []
    for (const [id, scene] of Object.entries(scenario.scenes)) {
      if (!scene) continue
      for (const b of scene.branches) {
        if (!scenario.scenes[b.targetSceneId]) continue
        if (!layout[id] || !layout[b.targetSceneId]) continue
        nextEdges.push({
          id: b.id,
          source: id,
          target: b.targetSceneId,
          sourceHandle: b.id,
          type: 'bpBranch',
          animated: false,
          data: {
            kind: b.kind,
            label: b.label,
            hasCondition: !!b.condition,
            effectCount: b.effects?.length ?? 0,
          },
        })
      }
    }
    setNodes(nextNodes)
    setEdges(nextEdges)
  }, [scenario, layout, activeId, setNodes, setEdges])

  // 首批节点就绪 / 换剧本 / 切到蓝图视图 → 适配全景。
  //
  // 必须把 forgeView 纳入触发：ForgeTab 用 `hidden`(display:none) 切视图，蓝图面板
  // 在隐藏期间容器尺寸为 0，此时 fitView 会按 0×0 计算、节点全挤到左上角。等用户
  // 切到「蓝图」(forgeView==='blueprint') 面板才有真实尺寸——这一刻重跑 fitView 才框得对。
  useEffect(() => {
    if (nodes.length === 0) return
    if (forgeView !== 'blueprint') return
    const t = requestAnimationFrame(() => fitView({ padding: 0.18, duration: 0, maxZoom: 1 }))
    return () => cancelAnimationFrame(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, scenario.id, forgeView])

  return (
    <div className="ks-bp">
      <div className="ks-bp-legend" aria-label="蓝图图例">
        {BPG_LEGEND.map((l) => (
          <span key={l.typeClass} className="ks-bp-legend-item">
            <span
              className="ks-bp-legend-swatch"
              style={{ background: BPG_TYPE_ACCENTS[l.typeClass] }}
              aria-hidden
            />
            {l.label}
          </span>
        ))}
        <span className="ks-bp-legend-sep" aria-hidden />
        <span className="ks-bp-legend-item">🔒 门槛/条件</span>
      </div>

      <div className="ks-bp-canvas">
        {nodes.length === 0 ? (
          <div className="ks-bp-empty">
            <span className="ks-bp-empty-glyph" aria-hidden>◇</span>
            <span className="ks-bp-empty-text">还没有可展示的玩法结构</span>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={BP_NODE_TYPES}
            edgeTypes={BP_EDGE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_e, node) => {
              selectScene(node.id)
              setPanelOpen(true)
            }}
            onNodeDragStop={(_e, node) => {
              handleSceneNodeDragStop(node.id, node.position, {
                selectScene,
                setScenePos,
                dispatchFocusStage: () => {},
              })
            }}
            minZoom={0.2}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            zoomOnScroll
            panOnScroll={false}
            panOnDrag
          >
          </ReactFlow>
        )}
        {nodes.length > 0 && activeId && panelOpen && (
          <BlueprintGameplayPanel onCollapse={() => setPanelOpen(false)} />
        )}
      </div>
    </div>
  )
}

/* ── 节点数据派生 ─────────────────────────────────────────── */

interface BadgeSpec {
  glyph: string
  text: string
  tone: 'boss' | 'qte' | 'timed' | 'gate' | 'hotspot'
}

interface BranchPin {
  id: string
  label: string
  hasCondition: boolean
}

interface BPNodeData extends Record<string, unknown> {
  title: string
  kindLabel: string
  typeClass: BpgTypeClass
  accent: string
  isRoot: boolean
  isEnding: boolean
  isSelected: boolean
  badges: BadgeSpec[]
  branches: BranchPin[]
  hasInput: boolean
}

function branchPinLabel(label: string | undefined, kind: BranchKind, index: number): string {
  const t = label?.trim()
  if (t) return t
  if (kind === 'auto') return '自动'
  if (kind === 'choice') return `选项 ${index + 1}`
  return '输出'
}

function deriveNodeData(scene: Scene, scenario: Scenario, isSelected: boolean): BPNodeData {
  const badges: BadgeSpec[] = []
  const { typeClass, accent, kindLabel } = resolveBpgType(scene, scenario)

  if (scene.boss) {
    const bossName = scenario.entities?.[scene.boss.entityId]?.name ?? 'Boss'
    const rounds = scene.boss.rounds?.length ?? 0
    badges.push({
      glyph: '☠',
      text: rounds > 0 ? `${bossName}·${rounds}回合` : bossName,
      tone: 'boss',
    })
  }
  if (scene.qte) {
    const n = scene.qte.cues?.length ?? 0
    const extra = [scene.qte.sequence ? '连段' : '', scene.qte.timeoutMs ? '限时' : '']
      .filter(Boolean)
      .join('·')
    badges.push({ glyph: '⏱', text: `QTE×${n}${extra ? `·${extra}` : ''}`, tone: 'qte' })
  }
  if (scene.decision?.mode === 'timed') {
    const sec = scene.decision.timeoutMs ? Math.round(scene.decision.timeoutMs / 1000) : null
    badges.push({ glyph: '⏳', text: sec ? `限时${sec}s` : '限时选择', tone: 'timed' })
  }
  if (scene.entryGate) {
    badges.push({ glyph: '🔒', text: '门槛', tone: 'gate' })
  }
  if (scene.hotspots && scene.hotspots.length > 0) {
    badges.push({ glyph: '⊕', text: `热点×${scene.hotspots.length}`, tone: 'hotspot' })
  }

  const branches: BranchPin[] = scene.branches
    .filter((b) => scenario.scenes[b.targetSceneId])
    .map((b, i) => ({
      id: b.id,
      label: branchPinLabel(b.label, b.kind, i),
      hasCondition: !!b.condition,
    }))

  return {
    title: scene.title,
    kindLabel,
    typeClass,
    accent,
    isRoot: scene.id === scenario.rootSceneId,
    isEnding: !!scene.isEnding,
    isSelected,
    badges,
    branches,
    hasInput: scene.id !== scenario.rootSceneId,
  }
}

function pinTop(index: number, total: number): string {
  if (total <= 1) return '50%'
  return `${((index + 1) / (total + 1)) * 100}%`
}

function BlueprintNode({ data }: NodeProps<Node<BPNodeData, 'bp'>>) {
  const d = data
  const cls = [
    'ks-bpg-node',
    `ks-bpg-type-${d.typeClass}`,
    d.isSelected ? 'is-selected' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const outs =
    d.branches.length > 0
      ? d.branches
      : [{ id: '__default', label: '输出', hasCondition: false }]
  return (
    <div className={cls} style={{ ['--bpc' as string]: d.accent }}>
      {d.hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="ks-bpg-handle ks-bpg-handle-in"
          style={{ top: '50%' }}
        />
      )}
      {outs.map((b, i) =>
        b.id === '__default' ? (
          <Handle
            key={b.id}
            type="source"
            position={Position.Right}
            className="ks-bpg-handle ks-bpg-handle-out"
            style={{ top: '50%' }}
          />
        ) : (
          <Handle
            key={b.id}
            type="source"
            position={Position.Right}
            id={b.id}
            className="ks-bpg-handle ks-bpg-handle-out"
            style={{ top: pinTop(i, outs.length) }}
          />
        ),
      )}
      <div className="ks-bpg-title" title={d.title}>
        {d.title}
      </div>
      <div className="ks-bpg-body">
        <div className="ks-bpg-col ks-bpg-in">
          {d.hasInput && (
            <div className="ks-bpg-pin">
              <span className="ks-bpg-pindot ks-bpg-pindot-in" aria-hidden />
              <span>输入</span>
            </div>
          )}
        </div>
        <div className="ks-bpg-col ks-bpg-out">
          {outs.map((b) => (
            <div key={b.id} className="ks-bpg-pin">
              {b.hasCondition && (
                <span className="ks-bpg-cond" title="有条件">
                  🔒
                </span>
              )}
              <span>{b.label}</span>
              <span className="ks-bpg-pindot" aria-hidden />
            </div>
          ))}
        </div>
      </div>
      {(d.badges.length > 0 || d.kindLabel) && (
        <div className="ks-bpg-sub">
          <div className="ks-bpg-srow">
            <span className="ks-bpg-sk">类型</span>
            <span className="ks-bpg-sv">{d.kindLabel}</span>
          </div>
          {d.badges.slice(0, 2).map((b, i) => (
            <div key={i} className="ks-bpg-srow" title={b.text}>
              <span className="ks-bpg-sk">{b.glyph}</span>
              <span className="ks-bpg-sv">{b.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── 连线（统一中性色；可选显示分支 label / 条件标记） ─────────── */

interface BPEdgeData extends Record<string, unknown> {
  kind: BranchKind
  label?: string
  hasCondition: boolean
  effectCount: number
}

const BlueprintEdge = memo(function BlueprintEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const d = (data ?? {}) as BPEdgeData
  const style = resolveBranchEdgeStyle(d.kind)
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const marks: string[] = []
  if (d.hasCondition) marks.push('🔒')
  if (d.effectCount > 0) marks.push(`±${d.effectCount}`)
  const labelText = d.label?.trim() ?? ''
  const showLabel = labelText.length > 0 || marks.length > 0
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: selected ? '#e0795f' : style.stroke,
          strokeWidth: selected ? 3.6 : style.strokeWidth,
          fill: 'none',
          opacity: selected ? 1 : 0.92,
          filter: selected
            ? 'drop-shadow(0 0 5px rgba(224,121,95,.75))'
            : 'drop-shadow(0 1px 2px rgba(0,0,0,.55))',
        }}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className="ks-bp-edge-label"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            title={labelText || undefined}
          >
            {labelText && <span>{labelText}</span>}
            {marks.length > 0 && <span className="ks-bp-edge-marks">{marks.join(' ')}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

const BP_NODE_TYPES: NodeTypes = { bp: BlueprintNode }
const BP_EDGE_TYPES: EdgeTypes = { bpBranch: BlueprintEdge }

injectStyleOnce('blueprint-tab', BP_CSS())

function BP_CSS(): string {
  return `
.ks-bp {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: var(--color-background-elevated, #242424);
  color: var(--color-text-primary, #fff);
}
.ks-bp-legend {
  flex-shrink: 0;
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px;
  padding: 8px 14px;
  font-size: 11px;
  color: var(--color-text-secondary, rgba(255,255,255,0.6));
  border-bottom: 1px solid var(--color-border-default, #404040);
  background: var(--color-background-base, #191919);
}
.ks-bp-legend-item { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.ks-bp-legend-sep { width: 1px; height: 12px; background: var(--color-border-default, #404040); }
.ks-bp-legend-swatch { width: 10px; height: 10px; border-radius: 3px; }

.ks-bp-canvas {
  flex: 1; min-height: 0; position: relative;
  ${BPG_CANVAS_GRID_CSS}
}
.ks-bp-canvas .react-flow {
  background: transparent;
  --xy-background-color: transparent;
  --xy-attribution-background-color-default: transparent;
}
.ks-bp-canvas .react-flow__pane,
.ks-bp-canvas .react-flow__renderer,
.ks-bp-canvas .react-flow__viewport { background: transparent; }
.ks-bp-canvas .react-flow__attribution { display: none; }

.ks-bp-empty {
  height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; text-align: center;
}
.ks-bp-empty-glyph { font-size: 40px; color: var(--color-text-tertiary, rgba(255,255,255,0.3)); }
.ks-bp-empty-text { font-size: 13px; color: var(--color-text-secondary, rgba(255,255,255,0.6)); }

/* ── UE4 蓝图节点（对齐原型 .bpg-node） ───────────────── */
.ks-bpg-node {
  width: ${NODE_W}px;
  min-height: ${NODE_H}px;
  box-sizing: border-box;
  border-radius: 10px;
  background: linear-gradient(180deg, #313640, #23262d);
  border: 1px solid rgba(0,0,0,.5);
  box-shadow: 0 8px 20px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.05) inset, 0 1px 0 rgba(255,255,255,.07) inset;
  cursor: grab;
  transition: box-shadow .15s, transform .12s;
  --bpc: #4a90d8;
}
.ks-bpg-node:active { cursor: grabbing; }
.ks-bpg-node:hover {
  box-shadow: 0 12px 26px rgba(0,0,0,.55), 0 0 0 1.5px var(--bpc) inset;
}
.ks-bpg-node.is-selected {
  box-shadow: 0 0 0 2px var(--bpc), 0 0 18px color-mix(in srgb, var(--bpc) 35%, transparent), 0 10px 24px rgba(0,0,0,.6);
}

.ks-bpg-title {
  font-size: 12px; font-weight: 700; color: #fff;
  padding: 8px 11px; border-radius: 9px 9px 0 0;
  background: linear-gradient(180deg, var(--bpc), color-mix(in srgb, var(--bpc) 50%, #000));
  letter-spacing: .01em; text-shadow: 0 1px 2px rgba(0,0,0,.5);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border-bottom: 1px solid rgba(0,0,0,.4);
  box-shadow: 0 1px 0 rgba(255,255,255,.13) inset;
}

.ks-bpg-body {
  display: flex; justify-content: space-between; gap: 10px;
  padding: 11px 11px 10px;
}
.ks-bpg-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.ks-bpg-in { align-items: flex-start; margin-left: -11px; flex: 0 0 auto; }
.ks-bpg-out { align-items: flex-end; margin-right: -11px; flex: 1 1 auto; }

.ks-bpg-pin {
  position: relative;
  display: flex; align-items: center; gap: 6px;
  font-size: 10.5px; color: #aeb6c2; white-space: nowrap; font-weight: 500;
}
.ks-bpg-pindot {
  width: 11px; height: 11px; flex: none;
  background: #cfd6dd;
  clip-path: polygon(0 0, 100% 50%, 0 100%);
  filter: drop-shadow(0 0 1px rgba(0,0,0,.5));
}
.ks-bpg-pindot-in { transform: rotate(180deg); }
.ks-bpg-cond {
  font-size: 9px; padding: 0 3px; border-radius: 4px;
  color: #e0a83a; background: rgba(224,168,58,.12); border: 1px solid rgba(224,168,58,.4);
}

.ks-bpg-sub {
  font-size: 10px; color: #8b94a2;
  padding: 6px 11px 8px;
  border-top: 1px solid rgba(255,255,255,.06);
  background: rgba(0,0,0,.16);
  border-radius: 0 0 10px 10px;
  display: flex; flex-direction: column; gap: 3px;
}
.ks-bpg-srow { display: flex; align-items: baseline; gap: 7px; }
.ks-bpg-sk { flex: none; color: #6f7886; }
.ks-bpg-sv {
  flex: 1; min-width: 0; color: #c2cad4;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-align: right; font-variant-numeric: tabular-nums;
}

.ks-bpg-handle {
  width: 11px !important; height: 11px !important;
  min-width: 0 !important; min-height: 0 !important;
  background: #cfd6dd !important;
  border: none !important;
  border-radius: 0 !important;
  clip-path: polygon(0 0, 100% 50%, 0 100%);
  opacity: 1 !important;
  transform: none;
}
.ks-bpg-handle-in { transform: translate(-50%, -50%) rotate(180deg) !important; }
.ks-bpg-handle-out { transform: translate(50%, -50%) !important; }

.ks-bp-edge-label {
  position: absolute;
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 6px; max-width: 120px;
  font-size: 9px; font-weight: 600; line-height: 1.2;
  color: rgba(255,255,255,0.82);
  background: rgba(15, 17, 24, 0.72);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 4px;
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ks-bp-edge-marks { font-weight: 800; }
`
}
