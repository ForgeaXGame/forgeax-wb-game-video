/**
 * GraphConfigView —— 新引擎场景级配置中间页（界面 / 规则）。样式对齐旧配置 tab（CatalogShell：
 * 左栏列表 + 右栏预览）。与蓝图共用 graphScenario store；顶部工具条：保存 / 版本 / 重置。
 *
 * 两种形态（同一套 CatalogShell 壳）：
 *  - **界面**（overlays）：左栏为**树**——「全局 HUD」组头（带「＋方案」）→ 各方案叶子；
 *    点叶子右栏只渲染**那一个方案**（OverlaySchemeEditor）。方案增删改在本组件持有并写回
 *    scenario.ui.overlays。
 *  - **规则**（实体/变量/场景设置/reactions）：左栏多行扁平切换，右栏渲染 ScenarioInspector。
 */
import { useEffect, useMemo, useState, useCallback } from 'react'
import type { GameScenario, Layout, Overlay } from '../../runtime/schema/graph-schema'
import { CatalogShell, type CatalogItem } from './CatalogShell'
import { ScenarioInspector, type ScenarioSection } from './ScenarioInspector'
import { OverlaySchemeEditor, UsageBadge } from './OverlaySchemeEditor'
import { VersionPicker } from './VersionPicker'
import { useGraphScenario } from '../persist/graphScenarioStore'
import { getGameSlug } from '../persist/gameScope'
import { NEW_COMPONENT_PRESETS, sortSchemeIds } from '../demo/builtin-schemes'

export interface ConfigTab {
  section: ScenarioSection
  label: string
}

/** 自动分配与 Record key 对齐的 id（新增方案用；用户不可手填）。 */
function allocId(prefix: string, existing: Record<string, unknown>): string {
  let i = Object.keys(existing).length
  let id = `${prefix}${i}`
  while (existing[id]) {
    i += 1
    id = `${prefix}${i}`
  }
  return id
}

export function GraphConfigView({ tabs, title = '配置', icon = '⚙', scenario }: { tabs: ConfigTab[]; title?: string; icon?: string; scenario: GameScenario }): JSX.Element {
  // 宿主 iframe 传 `?slug=`（见 gameScope.ts）；勿只读 `?game=`，否则会落到默认 demo 命名空间。
  const game = useMemo(() => getGameSlug() ?? 'game-nodia-fighting', [])
  const meta = useGraphScenario((s) => s.meta)
  const graph = useGraphScenario((s) => s.graph)
  const isDraft = useGraphScenario((s) => s.isDraft)
  const savedTip = useGraphScenario((s) => s.savedTip)
  const setMeta = useGraphScenario((s) => s.setMeta)
  const doSave = useGraphScenario((s) => s.save)
  const reset = useGraphScenario((s) => s.reset)
  const ensureBoot = useGraphScenario((s) => s.ensureBoot)

  useEffect(() => { ensureBoot(game, scenario) }, [game, scenario, ensureBoot])
  const [active, setActive] = useState<ScenarioSection>(tabs[0]?.section ?? 'entities')
  const nodeIds = graph.nodes.map((n) => n.id)
  // overlay 资源池「已用/未用」：统计每个 overlay 被多少节点挂载引用。
  const overlayUsage = useMemo(() => {
    const m: Record<string, number> = {}
    for (const n of graph.nodes) {
      for (const mount of n.data.overlayNodes ?? []) {
        m[mount.overlay] = (m[mount.overlay] ?? 0) + 1
      }
    }
    return m
  }, [graph.nodes])
  const nodeLabel = useCallback((id: string) => {
    const n = graph.nodes.find((x) => x.id === id)
    const name = n?.data.name?.trim()
    if (!name || name === id) return id
    return `${name} (${id})`
  }, [graph.nodes])
  const edgeOptions = useMemo(
    () =>
      graph.edges.map((e) => ({
        value: e.id,
        label: `${nodeLabel(e.source)} ─${e.sourceHandle ?? 'default'}→ ${nodeLabel(e.target)}`,
      })),
    [graph.edges, nodeLabel],
  )

  // ── 界面（overlays）形态：树 + 单方案编辑 ──
  const overlaysMode = tabs.length === 1 && tabs[0]?.section === 'overlays'
  const allOverlays = meta.ui?.overlays ?? {}
  // 「通用样式」= 自由方案；排除每节点自动内容 overlay（node:*，那是时间轴的内容容器）。
  const schemeIds = useMemo(
    () => sortSchemeIds(Object.keys(allOverlays).filter((id) => !id.startsWith('node:'))),
    [allOverlays],
  )
  const [selectedOverlayId, setSelectedOverlayId] = useState('')
  // 选中项自愈：不在当前方案集里（删除/首次）就落到第一个。
  const selOverlay = schemeIds.includes(selectedOverlayId) ? selectedOverlayId : (schemeIds[0] ?? '')

  const setOverlays = (overlays: Record<string, Overlay>) => setMeta({ ...meta, ui: { ...meta.ui, overlays } })
  const addScheme = () => {
    const id = allocId('scheme-', allOverlays)
    setOverlays({ ...allOverlays, [id]: { id, title: '新方案', children: [] } })
    setSelectedOverlayId(id)
  }
  const renameScheme = (oid: string, title: string) => {
    const ov = allOverlays[oid]
    if (!ov) return
    setOverlays({ ...allOverlays, [oid]: { ...ov, title } })
  }
  const removeScheme = (oid: string) => {
    const { [oid]: _drop, ...rest } = allOverlays
    setOverlays(rest)
  }
  const addSchemeChild = (oid: string, presetId: string) => {
    const ov = allOverlays[oid]
    const preset = NEW_COMPONENT_PRESETS.find((p) => p.id === presetId)
    if (!ov || !preset) return
    const childId = `${presetId}-${Object.keys(ov.children).length}-${Date.now().toString(36)}`
    setOverlays({ ...allOverlays, [oid]: { ...ov, children: [...ov.children, preset.make(childId)] } })
  }
  const removeSchemeChild = (oid: string, childId: string) => {
    const ov = allOverlays[oid]
    if (!ov) return
    setOverlays({ ...allOverlays, [oid]: { ...ov, children: ov.children.filter((c) => c.id !== childId) } })
  }
  const patchOverlayChild = (
    oid: string,
    childId: string,
    patch: { inputs?: Record<string, unknown>; component?: string; layout?: Partial<Layout> },
  ) => {
    const ov = allOverlays[oid]
    if (!ov) return
    setOverlays({
      ...allOverlays,
      [oid]: {
        ...ov,
        children: ov.children.map((c) =>
          c.id !== childId
            ? c
            : {
                ...c,
                ...(patch.component != null ? { component: patch.component } : {}),
                inputs: patch.inputs ? { ...c.inputs, ...patch.inputs } : c.inputs,
                layout: patch.layout ? { ...c.layout, ...patch.layout } : c.layout,
              },
        ),
      },
    })
  }

  const overlayTree: CatalogItem[] = [
    {
      id: '__overlays_group__',
      label: tabs[0]?.label ?? '全局 HUD',
      action: (
        <button type="button" className="gc-group-add" title="新建界面方案" onClick={addScheme}>
          ＋ 方案
        </button>
      ),
      children: schemeIds.map((id) => ({
        id,
        label: allOverlays[id]?.title || id,
        badge: <UsageBadge count={overlayUsage[id] ?? 0} />,
      })),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: 'var(--work, #0e0c09)' }}>
      <div style={{ padding: 8, borderBottom: '1px solid var(--line-soft, #2e2924)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', color: 'var(--txt, #f6f1e9)' }}>
        <button onClick={() => doSave()}>💾 保存</button>
        <VersionPicker />
        <button onClick={() => { if (confirm('重置为内置 demo 数据？当前未保存的编辑将丢失。')) reset() }}>↺ 重置</button>
        <span style={{ opacity: 0.6, fontSize: 11 }}>{savedTip}{isDraft ? ' · ⚠ 未保存草稿' : ''}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {overlaysMode ? (
          <CatalogShell
            icon={icon}
            title={title}
            items={overlayTree}
            selectedId={selOverlay}
            onSelect={setSelectedOverlayId}
            renderPreview={() => {
              const ov = allOverlays[selOverlay]
              if (!ov) {
                return (
                  <div style={{ flex: 1, padding: 18, opacity: 0.6, fontSize: 12 }}>
                    暂无界面方案。点左侧「＋ 方案」新建。
                  </div>
                )
              }
              return (
                <OverlaySchemeEditor
                  overlayId={selOverlay}
                  overlay={ov}
                  entities={meta.entities ?? {}}
                  variables={meta.variables ?? {}}
                  usageCount={overlayUsage[selOverlay] ?? 0}
                  onRename={(t) => renameScheme(selOverlay, t)}
                  onRemove={() => removeScheme(selOverlay)}
                  onAddChild={(p) => addSchemeChild(selOverlay, p)}
                  onRemoveChild={(c) => removeSchemeChild(selOverlay, c)}
                  onPatchChild={(c, patch) => patchOverlayChild(selOverlay, c, patch)}
                />
              )
            }}
          />
        ) : (
          <CatalogShell
            icon={icon}
            title={title}
            items={tabs.map((t) => ({ id: t.section, label: t.label }))}
            selectedId={active}
            onSelect={(id) => setActive(id as ScenarioSection)}
            renderPreview={() => (
              <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
                <ScenarioInspector value={meta} nodeIds={nodeIds} nodeLabel={nodeLabel} edgeOptions={edgeOptions} section={active} onChange={setMeta} />
              </div>
            )}
          />
        )}
      </div>
    </div>
  )
}
