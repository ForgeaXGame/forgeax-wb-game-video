import { beforeAll, describe, expect, it } from 'vitest'
import type { GameNode, GameScenario } from '../../../runtime/schema/graph-schema'
import type { OverlayChild } from '../../../runtime/schema/node-config-schema'
import type { QteCue } from '../../../runtime/registry/core-kinds'
import { registerCoreKinds } from '../../../runtime/registry/core-kinds'
import { node, scnOf } from '../../../runtime/__tests__/test-fixtures'
import { nodeOverlayId } from '../../../graph/edit/overlay-edit'
import {
  activePreviewOverlaysFromNode,
  addMaterialGraph,
  addQteCueGraph,
  canAddQte,
  collectMaterialsFromNode,
  findElement,
  findNode,
  listAvailableQteOutcomes,
  listExtraAddableComponents,
  listQteOutcomeViews,
  overlayEffects,
  addOptionBranchGraph,
  choiceOptionsLocked,
  choiceSkinPreviewInteractions,
  listOptionBranches,
  patchMaterialGraph,
  patchOverlayGraph,
  patchOverlayPositionGraph,
  patchSelectedGraph,
  previewSkinChildrenInWindow,
  qteSkinPreviewInteraction,
  clampSettlementSpawnTtlMs,
  setChoiceSkinGraph,
  setOptionBranchEffectsGraph,
  setOptionBranchSpawnGraph,
  setQteOutcomeEffectsGraph,
  setQteOutcomeSpawnGraph,
  setQteOutcomeTargetGraph,
} from '../graphMaterialOps'
import type { MaterialItem } from '../materialTimelineShared'
import { registerCoreSkins } from '../../../runtime/skins/components'

function qteEl(scenario: GameScenario, nodeId: string): OverlayChild | undefined {
  return scenario.ui?.overlays?.[nodeOverlayId(nodeId)]?.children?.find(
    (c) => c.component === 'qte' || c.component === 'battleParry' || c.component === 'inkKou',
  )
}
function qteItem(cueId: string): MaterialItem {
  return { key: `qte:x:${cueId}`, id: cueId, kind: 'qte', label: '', startMs: 0, endMs: 1000, zIndex: 2 }
}

function seedQte(): { scenario: GameScenario; node: GameNode; cueId: string } {
  const n = node('a', { durationMs: 8000 })
  let scenario = scnOf({ nodes: [n], edges: [] })
  const nodeRef = scenario.graph.nodes[0]!
  const res = addQteCueGraph(scenario, nodeRef, 8000, 1000)
  scenario = res.scenario
  const cueId = res.selectKey!.split(':').pop()!
  return { scenario, node: scenario.graph.nodes[0]!, cueId }
}

describe('graphMaterialOps · QTE 元素级参数', () => {
  it('完美判定 perfectMs 落到元素级 inputs，不写进 cue（成功=命中显示窗内，无独立半窗）', () => {
    const { scenario, node: n, cueId } = seedQte()
    const next = patchSelectedGraph(scenario, n, qteItem(cueId), { perfectMs: 100 })
    const el = qteEl(next, 'a')!
    expect((el.inputs as { perfectMs?: number }).perfectMs).toBe(100)
    const cue = ((el.inputs as { cues?: QteCue[] }).cues ?? []).find((c) => c.id === cueId)!
    expect((cue as { perfectMs?: number }).perfectMs).toBeUndefined()
  })

  it('cue 级参数（label/appearAt）仍写进对应拍点，不污染元素级', () => {
    const { scenario, node: n, cueId } = seedQte()
    const next = patchSelectedGraph(scenario, n, qteItem(cueId), { label: '叩', appearAt: 1200 })
    const el = qteEl(next, 'a')!
    const cue = ((el.inputs as { cues?: QteCue[] }).cues ?? []).find((c) => c.id === cueId)!
    expect(cue.label).toBe('叩')
    expect(cue.appearAt).toBe(1200)
    expect((el.inputs as { label?: unknown }).label).toBeUndefined()
  })
})

describe('graphMaterialOps · QTE 结算候选（样式驱动，见 qteKind.outputs）', () => {
  beforeAll(() => registerCoreKinds())

  it('默认（无 exits）：候选仍是 完美/良好/失败 三档，未配置时只展示「完美」', () => {
    const { scenario, node: n } = seedQte()
    const views = listQteOutcomeViews(scenario, n)
    expect(views).toHaveLength(1)
    expect(views[0]!.key).toBe('pass')
    expect(views[0]!.label).toBe('完美')
    const available = listAvailableQteOutcomes(scenario, n)
    expect(available.map((c) => c.handle)).toEqual(['good', 'fail'])
  })

  it('battleParry：出口由样式锁定为皮肤 defaults；写入的自定义 events 被忽略', () => {
    const { scenario, node: n, cueId } = seedQte()
    const next = patchSelectedGraph(scenario, n, qteItem(cueId), {
      component: 'battleParry',
      events: [{ id: 'ok', label: '自定义' }, { id: 'ng', label: '普通' }],
      defaultEvent: 'fail',
    })
    const n2 = findNode(next.graph, 'a')!
    const el = qteEl(next, 'a')!
    // 落盘也被锁回 battleParryDefaults.events
    expect((el.inputs as { events?: Array<{ id: string; label?: string }> }).events?.map((e) => e.id)).toEqual([
      'pass',
      'good',
      'fail',
    ])
    expect((el.inputs as { events?: Array<{ id: string; label?: string }> }).events?.map((e) => e.label)).toEqual([
      '防反',
      '闪避',
      '受击',
    ])
    const available = listAvailableQteOutcomes(next, n2)
    expect(available.map((c) => c.handle)).toEqual(['good', 'fail'])
    const shown = listQteOutcomeViews(next, n2)
    expect(shown.map((v) => v.key)).toEqual(['pass'])
    expect(shown[0]!.label).toBe('防反')
  })

  it('inkKou：出口由样式锁定为 pass/fail；写入的自定义 events 被忽略', () => {
    const { scenario, node: n, cueId } = seedQte()
    const next = patchSelectedGraph(scenario, n, qteItem(cueId), {
      component: 'inkKou',
      events: [{ id: 'a', label: '自定义' }, { id: 'b', label: '普通' }, { id: 'c', label: '多余' }],
      defaultEvent: 'fail',
    })
    const el = qteEl(next, 'a')!
    expect((el.inputs as { events?: Array<{ id: string; label?: string }> }).events?.map((e) => e.id)).toEqual([
      'pass',
      'fail',
    ])
    expect((el.inputs as { events?: Array<{ id: string; label?: string }> }).events?.map((e) => e.label)).toEqual([
      '完美',
      '失败',
    ])
  })

  it('battleParry 样式出口上可对某一档单独配跳转 + 改数值，互不覆盖', () => {
    const { scenario, node: n, cueId } = seedQte()
    const s0 = patchSelectedGraph(scenario, n, qteItem(cueId), { component: 'battleParry' })
    const n0 = findNode(s0.graph, 'a')!
    const s1 = setQteOutcomeTargetGraph(s0, n0, 'pass', 'b')
    const n1 = findNode(s1.graph, 'a')!
    const s2 = setQteOutcomeEffectsGraph(s1, n1, 'good', [{ kind: 'attr', entityId: 'ent-boss', attr: 'hp', op: 'add', value: -10 }])
    const n2 = findNode(s2.graph, 'a')!
    const views = listQteOutcomeViews(s2, n2)
    const pass = views.find((v) => v.key === 'pass')!
    const good = views.find((v) => v.key === 'good')!
    expect(pass.targetId).toBe('b')
    expect(pass.effects).toHaveLength(0)
    expect(good.targetId).toBeUndefined()
    expect(good.effects).toHaveLength(1)
  })

  it('QTE 结算 spawn：ttl 截断到节点时长；写 effects 不冲掉 spawn', () => {
    expect(clampSettlementSpawnTtlMs(99999, 8000)).toBe(8000)
    expect(clampSettlementSpawnTtlMs(0, 8000)).toBe(8000)
    const { scenario, node: n, cueId } = seedQte()
    const s0 = patchSelectedGraph(scenario, n, qteItem(cueId), { component: 'battleParry' })
    const n0 = findNode(s0.graph, 'a')!
    const withScheme = {
      ...s0,
      ui: {
        ...s0.ui,
        overlays: {
          ...(s0.ui?.overlays ?? {}),
          'scheme-dynamic': {
            id: 'scheme-dynamic',
            children: [{ id: 'float', component: 'floatText', trigger: { when: 'enter' as const }, inputs: { text: '+1' } }],
          },
        },
      },
    }
    const s1 = setQteOutcomeSpawnGraph(withScheme, n0, 'pass', {
      from: 'scheme-dynamic/float',
      ttlMs: 99_000,
      inputs: { text: '爆' },
    })
    const n1 = findNode(s1.graph, 'a')!
    const view1 = listQteOutcomeViews(s1, n1).find((v) => v.key === 'pass')!
    expect(view1.spawn?.from).toBe('scheme-dynamic/float')
    expect(view1.spawn?.ttlMs).toBe(8000)
    expect(view1.spawn?.inputs).toEqual({ text: '爆' })
    const s2 = setQteOutcomeEffectsGraph(s1, n1, 'pass', [
      { kind: 'attr', entityId: 'ent-boss', attr: 'hp', op: 'add', value: -1 },
    ])
    const n2 = findNode(s2.graph, 'a')!
    const view2 = listQteOutcomeViews(s2, n2).find((v) => v.key === 'pass')!
    expect(view2.effects).toHaveLength(1)
    expect(view2.spawn?.from).toBe('scheme-dynamic/float')
  })
})

describe('graphMaterialOps · QTE 拖入门槛（无挂载/无默认样式含 qte 时不可加）', () => {
  it('节点无挂载、无默认样式方案：canAddQte=false，addMaterialGraph(qte) 原样返回（不新建）', () => {
    const n = node('a', { durationMs: 8000 })
    const scenario = scnOf({ nodes: [n], edges: [] })
    const nodeRef = scenario.graph.nodes[0]!
    expect(canAddQte(scenario, nodeRef)).toBe(false)
    const res = addMaterialGraph(scenario, nodeRef, 8000, 'qte', undefined, 0)
    expect(res.selectKey).toBeNull()
    expect(qteEl(res.scenario, 'a')).toBeUndefined()
  })

  it('默认样式方案（styleScheme）里有 qte 组件：canAddQte=true，可正常新建', () => {
    const n = node('a', { durationMs: 8000, styleScheme: 'scheme1' })
    const scenario = scnOf(
      { nodes: [n], edges: [] },
      {
        ui: {
          overlays: {
            scheme1: {
              id: 'scheme1',
              children: [
                { id: 'skin1', component: 'qte', trigger: { when: 'enter' }, inputs: { qteKind: 'parry' } },
              ],
            },
          },
        },
      },
    )
    const nodeRef = scenario.graph.nodes[0]!
    expect(canAddQte(scenario, nodeRef)).toBe(true)
    const res = addMaterialGraph(scenario, nodeRef, 8000, 'qte', undefined, 0)
    expect(res.selectKey).not.toBeNull()
    expect(qteEl(res.scenario, 'a')).toBeDefined()
  })

  it('已挂载的 overlay 里有 qte 组件：canAddQte=true（挂载来源，不靠 styleScheme）', () => {
    const n = node('a', { durationMs: 8000, timeline: [{ id: 'skin1', component: 'qte', inputs: { qteKind: 'parry' } }] })
    const scenario = scnOf({ nodes: [n], edges: [] })
    const nodeRef = scenario.graph.nodes[0]!
    expect(canAddQte(scenario, nodeRef)).toBe(true)
  })
})

describe('graphMaterialOps · battleParry 时间轴 ↔ 预览时钟对齐', () => {
  function seedBattleParryStyle(): { scenario: GameScenario; node: GameNode } {
    const n = node('a', { durationMs: 8000, styleScheme: 'scheme-parry' })
    const scenario = scnOf(
      { nodes: [n], edges: [] },
      {
        ui: {
          overlays: {
            'scheme-parry': {
              id: 'scheme-parry',
              children: [
                {
                  id: 'qte-parry',
                  component: 'battleParry',
                  trigger: { when: 'enter' },
                  inputs: {
                    component: 'battleParry',
                    durationMs: 2600,
                    events: [{ id: 'pass' }, { id: 'good' }, { id: 'fail' }],
                    defaultEvent: 'fail',
                  },
                },
              ],
            },
          },
        },
      },
    )
    return { scenario, node: scenario.graph.nodes[0]! }
  }

  it('从 battleParry 样式拖入：cue 落点=appearAt，endAt=appearAt+durationMs，并写 windowMs', () => {
    const { scenario, node: n } = seedBattleParryStyle()
    const res = addQteCueGraph(scenario, n, 8000, 1200)
    const el = qteEl(res.scenario, 'a')!
    const cue = ((el.inputs as { cues?: QteCue[] }).cues ?? [])[0]!
    expect(cue.appearAt).toBe(1200)
    expect(cue.endAt).toBe(1200 + 2600)
    expect((el.inputs as { windowMs?: number }).windowMs).toBe(2600)
    expect((el.inputs as { component?: string }).component).toBe('battleParry')
  })

  it('拖时间轴边缘：同步 cue 窗 + windowMs（检视器时长 SSOT）', () => {
    const { scenario, node: n } = seedBattleParryStyle()
    const res = addQteCueGraph(scenario, n, 8000, 1000)
    const cueId = res.selectKey!.split(':').pop()!
    const n1 = findNode(res.scenario.graph, 'a')!
    const item: MaterialItem = {
      key: `qte:x:${cueId}`,
      id: cueId,
      kind: 'qte',
      label: '',
      startMs: 1000,
      endMs: 3600,
      zIndex: 2,
    }
    const next = patchMaterialGraph(res.scenario, n1, 8000, item, { startMs: 1500, endMs: 3000 })
    const el = qteEl(next, 'a')!
    const cue = ((el.inputs as { cues?: QteCue[] }).cues ?? []).find((c) => c.id === cueId)!
    expect(cue.appearAt).toBe(1500)
    expect(cue.endAt).toBe(3000)
    expect((el.inputs as { windowMs?: number }).windowMs).toBe(1500)
  })

  it('qteSkinPreviewInteraction：播放头在 cue 窗外返回 null，窗内返回 snap', () => {
    const { scenario, node: n } = seedBattleParryStyle()
    const res = addQteCueGraph(scenario, n, 8000, 2000)
    const n1 = findNode(res.scenario.graph, 'a')!
    expect(qteSkinPreviewInteraction(res.scenario, n1, 500)).toBeNull()
    expect(qteSkinPreviewInteraction(res.scenario, n1, 2500)).not.toBeNull()
    expect(qteSkinPreviewInteraction(res.scenario, n1, 5000)).toBeNull()
  })
})

describe('graphMaterialOps · choice 皮肤时间轴预览', () => {
  beforeAll(() => registerCoreKinds())

  it('styleScheme 含 inkYingMo：新建选项带上皮肤；播放头窗内可预览、窗外卸掉', () => {
    const n = node('a', { durationMs: 8000, styleScheme: 'scheme-choice' })
    const scenario = scnOf(
      { nodes: [n], edges: [] },
      {
        ui: {
          overlays: {
            'scheme-choice': {
              id: 'scheme-choice',
              children: [
                {
                  id: 'choice-ym',
                  component: 'inkYingMo',
                  trigger: { when: 'enter' },
                  inputs: {
                    component: 'inkYingMo',
                    events: [{ id: 'ying', label: '應' }, { id: 'mo', label: '默' }],
                  },
                },
              ],
            },
          },
        },
      },
    )
    const nodeRef = scenario.graph.nodes[0]!
    const res = addMaterialGraph(scenario, nodeRef, 8000, 'option', undefined, 0, { ms: 1000, zIndex: 3 })
    const el = res.scenario.ui?.overlays?.[nodeOverlayId('a')]?.children?.find((c) => c.component === 'choice')
    expect(el).toBeDefined()
    expect((el!.inputs as { component?: string }).component).toBe('inkYingMo')
    expect((el!.inputs as { events?: { id: string }[] }).events?.map((o) => o.id)).toEqual(['ying', 'mo'])
    expect(el!.window).toEqual({ startMs: 1000, endMs: 3500 })

    const n1 = findNode(res.scenario.graph, 'a')!
    expect(choiceSkinPreviewInteractions(res.scenario, n1, 500, 8000)).toHaveLength(0)
    const snaps = choiceSkinPreviewInteractions(res.scenario, n1, 2000, 8000)
    expect(snaps).toHaveLength(1)
    expect(snaps[0]!.component).toBe('inkYingMo')
    expect(choiceSkinPreviewInteractions(res.scenario, n1, 5000, 8000)).toHaveLength(0)
  })

  it('默认清单（无皮肤 component）：不进预览皮肤层', () => {
    const n = node('a', { durationMs: 8000 })
    let scenario = scnOf({ nodes: [n], edges: [] })
    const res = addMaterialGraph(scenario, scenario.graph.nodes[0]!, 8000, 'option', undefined, 0)
    const n1 = findNode(res.scenario.graph, 'a')!
    expect(choiceSkinPreviewInteractions(res.scenario, n1, 100, 8000)).toHaveLength(0)
  })

  it('选项预览可拖空间锚点：movable + 写回 inputs.x/y', () => {
    const n = node('a', { durationMs: 8000 })
    let scenario = scnOf({ nodes: [n], edges: [] })
    const res = addMaterialGraph(scenario, scenario.graph.nodes[0]!, 8000, 'option', undefined, 0)
    const n1 = findNode(res.scenario.graph, 'a')!
    const overlays = activePreviewOverlaysFromNode(res.scenario, n1, 100, 8000)
    const opt = overlays.find((o) => o.kind === 'option')
    expect(opt?.movable).toBe(true)
    expect(opt?.target).toEqual({ kind: 'element', elementId: expect.any(String) })
    const next = patchOverlayPositionGraph(res.scenario, n1, opt!.target, 0.33, 0.44)
    const el = next.ui?.overlays?.[nodeOverlayId('a')]?.children?.find((c) => c.id === (opt!.target as { elementId: string }).elementId)
    expect((el?.inputs as { x?: number; y?: number }).x).toBe(0.33)
    expect((el?.inputs as { x?: number; y?: number }).y).toBe(0.44)
    const moved = activePreviewOverlaysFromNode(next, findNode(next.graph, 'a')!, 100, 8000).find((o) => o.kind === 'option')
    expect(moved?.x).toBe(0.33)
    expect(moved?.y).toBe(0.44)
  })

  it('选项结算 spawn：与改数值并存，ttl 截断到节点时长', () => {
    const n = node('a', { durationMs: 5000 })
    let scenario = scnOf({ nodes: [n], edges: [] }, {
      ui: {
        overlays: {
          'scheme-dynamic': {
            id: 'scheme-dynamic',
            children: [{ id: 'float', component: 'floatText', trigger: { when: 'enter' }, inputs: { text: '+30' } }],
          },
        },
      },
    })
    const res = addMaterialGraph(scenario, scenario.graph.nodes[0]!, 5000, 'option', undefined, 0)
    const n1 = findNode(res.scenario.graph, 'a')!
    const key = listOptionBranches(res.scenario, n1)[0]!.key
    const s1 = setOptionBranchSpawnGraph(res.scenario, n1, key, { from: 'scheme-dynamic/float', ttlMs: 50_000 })
    const n2 = findNode(s1.graph, 'a')!
    const s2 = setOptionBranchEffectsGraph(s1, n2, key, [
      { kind: 'attr', entityId: 'ent-boss', attr: 'hp', op: 'add', value: -10 },
    ])
    const n3 = findNode(s2.graph, 'a')!
    const branch = listOptionBranches(s2, n3).find((b) => b.key === key)!
    expect(branch.effects).toHaveLength(1)
    expect(branch.spawn?.from).toBe('scheme-dynamic/float')
    expect(branch.spawn?.ttlMs).toBe(5000)
  })
})

describe('graphMaterialOps · 选项/组件结算统一写 mount.reactions（修复 2026-07-16 误写 node.data.reactions 导致运行时不生效的 bug）', () => {
  it('setOptionBranchEffectsGraph 写进挂载级 reactions（node:<id>），不落 node.data.reactions', () => {
    const n = node('a', { durationMs: 5000 })
    const scenario = scnOf({ nodes: [n], edges: [] })
    const res = addMaterialGraph(scenario, scenario.graph.nodes[0]!, 5000, 'option', undefined, 0)
    const n1 = findNode(res.scenario.graph, 'a')!
    const key = listOptionBranches(res.scenario, n1)[0]!.key
    const next = setOptionBranchEffectsGraph(res.scenario, n1, key, [
      { kind: 'attr', entityId: 'ent-boss', attr: 'hp', op: 'add', value: -10 },
    ])
    const n2 = findNode(next.graph, 'a')!
    expect(n2.data.reactions).toBeUndefined()
    const mount = (n2.data.overlayNodes ?? []).find((m) => (m.id ?? m.overlay) === nodeOverlayId('a'))
    expect(mount?.reactions?.some((r) => r.when.type === 'event' && r.when.id === key)).toBe(true)
  })

  it('读兜底：升级前遗留在 node.data.reactions 的旧配置仍能读回，不会静默消失', () => {
    const key = 'opt0'
    const n = node('a', {
      durationMs: 5000,
      reactions: [{
        when: { type: 'event', id: key },
        do: [{ kind: 'effect', effects: [{ kind: 'attr', entityId: 'ent-boss', attr: 'hp', op: 'add', value: -20 }] }],
      }],
    })
    const scenario = scnOf({ nodes: [n], edges: [] })
    const res = addMaterialGraph(scenario, scenario.graph.nodes[0]!, 5000, 'option', undefined, 0)
    const n1 = findNode(res.scenario.graph, 'a')!
    const branch = listOptionBranches(res.scenario, n1).find((b) => b.key === key)
    expect(branch?.effects).toHaveLength(1)
    expect(branch?.effects[0]).toMatchObject({ entityId: 'ent-boss', attr: 'hp', value: -20 })
  })

  it('写入会顺带清理同 key 的 legacy node.data.reactions 残留（不留新旧两处数据）', () => {
    const key = 'opt0'
    const n = node('a', {
      durationMs: 5000,
      reactions: [{
        when: { type: 'event', id: key },
        do: [{ kind: 'effect', effects: [{ kind: 'attr', entityId: 'ent-boss', attr: 'hp', op: 'add', value: -20 }] }],
      }],
    })
    const scenario = scnOf({ nodes: [n], edges: [] })
    const res = addMaterialGraph(scenario, scenario.graph.nodes[0]!, 5000, 'option', undefined, 0)
    const n1 = findNode(res.scenario.graph, 'a')!
    const next = setOptionBranchEffectsGraph(res.scenario, n1, key, [
      { kind: 'attr', entityId: 'ent-boss', attr: 'hp', op: 'add', value: -30 },
    ])
    const n2 = findNode(next.graph, 'a')!
    expect(n2.data.reactions).toBeUndefined()
    const branch = listOptionBranches(next, n2).find((b) => b.key === key)
    expect(branch?.effects[0]).toMatchObject({ value: -30 })
  })
})

describe('graphMaterialOps · 挂载组件全量上时间轴', () => {
  beforeAll(() => {
    registerCoreKinds()
    registerCoreSkins()
  })

  it('未分类按挂载实例列槽（同类型两份血条各一格）；添加时克隆 bind/label', () => {
    const n = node('a', { durationMs: 8000 })
    const scenario = scnOf(
      { nodes: [n], edges: [] },
      {
        ui: {
          overlays: {
            'ov-a': {
              id: 'ov-a',
              children: [
                {
                  id: 'hp-player',
                  component: 'battleHpBar',
                  trigger: { when: 'enter' },
                  window: { startMs: 0, endMs: 8000 },
                  inputs: { bind: 'ent-player', label: '我方' },
                },
                {
                  id: 'hp-boss',
                  component: 'battleHpBar',
                  trigger: { when: 'enter' },
                  window: { startMs: 0, endMs: 8000 },
                  inputs: { bind: 'ent-boss', label: '敌方' },
                },
                {
                  id: 'fade',
                  component: 'transition',
                  trigger: { when: 'at', ms: 100 },
                  window: { startMs: 100, endMs: 800 },
                  inputs: { durationMs: 600 },
                },
                {
                  id: 'line',
                  component: 'dialogue',
                  trigger: { when: 'enter' },
                  window: { startMs: 0, endMs: 2000 },
                  inputs: { text: '字幕' },
                },
              ],
            },
          },
        },
      },
    )
    const withMount: GameScenario = {
      ...scenario,
      graph: {
        ...scenario.graph,
        nodes: scenario.graph.nodes.map((nd) =>
          nd.id === 'a' ? { ...nd, data: { ...nd.data, overlayNodes: [{ overlay: 'ov-a' }] } } : nd,
        ),
      },
    }
    const nodeA = findNode(withMount.graph, 'a')!
    const mats = collectMaterialsFromNode(withMount, nodeA, 8000)
    expect(mats.filter((m) => m.kind === 'component' && m.componentId === 'battleHpBar')).toHaveLength(2)
    expect(mats.find((m) => m.id === 'hp-player')?.label).toBe('我方')
    expect(mats.find((m) => m.id === 'hp-boss')?.label).toBe('敌方')
    const skinKids = previewSkinChildrenInWindow(withMount, nodeA, 200, 8000)
    expect(skinKids.filter((c) => c.component === 'battleHpBar')).toHaveLength(2)

    const extras = listExtraAddableComponents(withMount, nodeA)
    // 按实例：overlayId/childId；字幕走六槽不进额外格
    expect(extras.map((c) => c.id).sort()).toEqual(['ov-a/fade', 'ov-a/hp-boss', 'ov-a/hp-player'])
    expect(extras.find((c) => c.id === 'ov-a/hp-player')).toEqual({
      id: 'ov-a/hp-player',
      label: '我方',
      componentId: 'battleHpBar',
    })
    expect(extras.find((c) => c.id === 'ov-a/hp-boss')?.label).toBe('敌方')
    expect(extras.find((c) => c.id === 'ov-a/fade')?.label).toBe('转场 · fade')
    expect(listExtraAddableComponents(withMount, undefined)).toEqual([])

    // 从「敌方」模板添加 → 新实例带上 ent-boss / 敌方
    const added = addMaterialGraph(withMount, nodeA, 8000, 'ov-a/hp-boss', undefined, 0)
    const newId = added.selectKey?.replace(/^component:/, '')
    expect(newId).toBeTruthy()
    const cloned = findElement(added.scenario, findNode(added.scenario.graph, 'a')!, newId!)
    expect(cloned?.component).toBe('battleHpBar')
    expect(cloned?.inputs).toMatchObject({ bind: 'ent-boss', label: '敌方' })
  })

  it('第二份挂载的 HUD 方案也进时间轴与预览（不只看 primary 内容挂载）', () => {
    const n = node('a', { durationMs: 8000 })
    const scenario = scnOf(
      { nodes: [n], edges: [] },
      {
        ui: {
          overlays: {
            'node:a': { id: 'node:a', children: [] },
            'scheme-static': {
              id: 'scheme-static',
              children: [
                {
                  id: 'hp-player',
                  component: 'battleHpBar',
                  trigger: { when: 'enter' },
                  inputs: { bind: 'ent-player', label: '我方' },
                },
              ],
            },
          },
        },
      },
    )
    // 内容挂载在前（空），HUD 方案挂第二份——旧逻辑只读 primary 会漏掉血条
    const withMount: GameScenario = {
      ...scenario,
      graph: {
        ...scenario.graph,
        nodes: scenario.graph.nodes.map((nd) =>
          nd.id === 'a'
            ? {
                ...nd,
                data: {
                  ...nd.data,
                  overlayNodes: [{ overlay: 'node:a' }, { overlay: 'scheme-static' }],
                },
              }
            : nd,
        ),
      },
    }
    const nodeA = findNode(withMount.graph, 'a')!
    const mats = collectMaterialsFromNode(withMount, nodeA, 8000)
    expect(mats.some((m) => m.id === 'hp-player' && m.kind === 'component')).toBe(true)
    const skinKids = previewSkinChildrenInWindow(withMount, nodeA, 100, 8000)
    expect(skinKids.some((c) => c.id === 'hp-player' && c.component === 'battleHpBar')).toBe(true)
    const extras = listExtraAddableComponents(withMount, nodeA)
    expect(extras.some((c) => c.id === 'scheme-static/hp-player' && c.label === '我方')).toBe(true)
  })

  it('添加控件额外槽：排除 node:* 本地 children 与 mount.added（不因 override 增生模板卡）', () => {
    const n = node('a', { durationMs: 8000 })
    const scenario = scnOf(
      { nodes: [n], edges: [] },
      {
        ui: {
          overlays: {
            'node:a': {
              id: 'node:a',
              children: [
                {
                  id: 'timeline-hp',
                  component: 'battleHpBar',
                  trigger: { when: 'enter' },
                  inputs: { bind: 'ent-player', label: '时间轴新建' },
                },
              ],
            },
            'scheme-static': {
              id: 'scheme-static',
              children: [
                {
                  id: 'hp-player',
                  component: 'battleHpBar',
                  trigger: { when: 'enter' },
                  inputs: { bind: 'ent-player', label: '我方' },
                },
              ],
            },
          },
        },
      },
    )
    const withMount: GameScenario = {
      ...scenario,
      graph: {
        ...scenario.graph,
        nodes: scenario.graph.nodes.map((nd) =>
          nd.id === 'a'
            ? {
                ...nd,
                data: {
                  ...nd.data,
                  overlayNodes: [
                    { overlay: 'node:a' },
                    {
                      overlay: 'scheme-static',
                      added: [
                        {
                          id: 'hp-added',
                          component: 'battleHpBar',
                          trigger: { when: 'enter' },
                          inputs: { bind: 'ent-boss', label: 'override新增' },
                        },
                      ],
                    },
                  ],
                },
              }
            : nd,
        ),
      },
    }
    const nodeA = findNode(withMount.graph, 'a')!
    const extras = listExtraAddableComponents(withMount, nodeA)
    expect(extras.map((c) => c.id)).toEqual(['scheme-static/hp-player'])
    expect(extras.some((c) => c.id.includes('timeline-hp') || c.id.includes('hp-added'))).toBe(false)
  })
})

describe('graphMaterialOps · choice 样式锁定选项集合', () => {
  beforeAll(() => registerCoreKinds())

  function seedDefaultOption(): { scenario: GameScenario; node: GameNode } {
    const n = node('a', { durationMs: 8000 })
    let scenario = scnOf({ nodes: [n], edges: [] })
    const res = addMaterialGraph(scenario, scenario.graph.nodes[0]!, 8000, 'option', undefined, 0)
    return { scenario: res.scenario, node: findNode(res.scenario.graph, 'a')! }
  }

  it('切到 inkYingMo：结算条数变成應/默 两条，并写入皮肤 events', () => {
    const { scenario, node: n } = seedDefaultOption()
    expect(listOptionBranches(scenario, n)).toHaveLength(1)
    const next = setChoiceSkinGraph(scenario, n, 'inkYingMo')
    const n1 = findNode(next.graph, 'a')!
    const branches = listOptionBranches(next, n1)
    expect(branches.map((b) => b.key)).toEqual(['ying', 'mo'])
    expect(branches.map((b) => b.label)).toEqual(['應', '默'])
    const el = next.ui?.overlays?.[nodeOverlayId('a')]?.children?.find((c) => c.component === 'choice')
    expect((el!.inputs as { component?: string }).component).toBe('inkYingMo')
    expect(choiceOptionsLocked(el!.inputs)).toBe(true)
  })

  it('方案样式式切皮：patchSelectedGraph 带 component 时 inputs.component 与结算一起换', () => {
    const { scenario, node: n } = seedDefaultOption()
    const el0 = scenario.ui?.overlays?.[nodeOverlayId('a')]?.children?.find((c) => c.component === 'choice')
    expect(el0).toBeDefined()
    const item: MaterialItem = {
      key: `option:${el0!.id}`,
      id: el0!.id,
      kind: 'option',
      label: '',
      startMs: 0,
      endMs: 8000,
      zIndex: 3,
    }
    // 先落到三选项技能条
    const skinned = setChoiceSkinGraph(scenario, n, 'battleSkillBar', el0!.id)
    const n1 = findNode(skinned.graph, 'a')!
    expect(listOptionBranches(skinned, n1)).toHaveLength(3)
    // 再经 patchSelectedGraph（方案样式路径）切到应默
    const next = patchSelectedGraph(skinned, n1, item, {
      component: 'inkYingMo',
      events: [{ id: 'ying', label: '應' }, { id: 'mo', label: '默' }],
    })
    const n2 = findNode(next.graph, 'a')!
    const el = next.ui?.overlays?.[nodeOverlayId('a')]?.children?.find((c) => c.id === el0!.id)
    expect(el?.component).toBe('choice')
    expect((el?.inputs as { component?: string } | undefined)?.component).toBe('inkYingMo')
    expect(listOptionBranches(next, n2).map((b) => b.key)).toEqual(['ying', 'mo'])
  })

  it('样式锁定后 addOptionBranchGraph 为 no-op', () => {
    const { scenario, node: n } = seedDefaultOption()
    const locked = setChoiceSkinGraph(scenario, n, 'inkYingMo')
    const n1 = findNode(locked.graph, 'a')!
    const again = addOptionBranchGraph(locked, n1)
    expect(listOptionBranches(again, findNode(again.graph, 'a')!)).toHaveLength(2)
  })

  it('切回默认清单：顶栏回到 choice，保留当前 events，可再增删', () => {
    const { scenario, node: n } = seedDefaultOption()
    const locked = setChoiceSkinGraph(scenario, n, 'inkYingMo')
    const unlocked = setChoiceSkinGraph(locked, findNode(locked.graph, 'a')!, undefined)
    const n1 = findNode(unlocked.graph, 'a')!
    const el = unlocked.ui?.overlays?.[nodeOverlayId('a')]?.children?.find((c) => c.component === 'choice')
    expect(el).toBeDefined()
    expect((el!.inputs as { component?: string }).component).toBeUndefined()
    expect(choiceOptionsLocked(el!.inputs)).toBe(false)
    expect(listOptionBranches(unlocked, n1)).toHaveLength(2)
    const added = addOptionBranchGraph(unlocked, n1)
    expect(listOptionBranches(added, findNode(added.graph, 'a')!)).toHaveLength(3)
  })
})

function seedFloat(): { scenario: GameScenario; node: GameNode; floatId: string } {
  const n = node('a', { durationMs: 8000 })
  let scenario = scnOf({ nodes: [n], edges: [] })
  const nodeRef = scenario.graph.nodes[0]!
  const res = addMaterialGraph(scenario, nodeRef, 8000, 'overlay', undefined, 0)
  scenario = res.scenario
  const floatId = res.selectKey!.split(':').pop()!
  return { scenario, node: scenario.graph.nodes[0]!, floatId }
}

describe('graphMaterialOps · 飘字 effects/valuePick/expr（结算写回 node.data.reactions，前端表现对齐旧「选取式」）', () => {
  it('新建飘字自带默认到点效果（Boss hp −100）', () => {
    const { scenario, node: n, floatId } = seedFloat()
    const fx = overlayEffects(scenario, n, floatId)
    expect(fx).toHaveLength(1)
    expect(fx[0]).toMatchObject({ kind: 'attr', attr: 'hp', op: 'add', value: -100, id: `${floatId}-settle` })
  })

  it('effects 往返：EffectsEditor 产出的完整列表写入后可读回，首条打上定位 id', () => {
    const { scenario, node: n, floatId } = seedFloat()
    const next = patchOverlayGraph(
      scenario,
      n,
      floatId,
      { effects: [{ kind: 'attr', entityId: 'ent-player', attr: 'hp', op: 'add', value: 30 }] },
      undefined,
    )
    const curNode = findNode(next.graph, n.id)!
    const fx = overlayEffects(next, curNode, floatId)
    expect(fx).toHaveLength(1)
    expect(fx[0]).toMatchObject({ kind: 'attr', entityId: 'ent-player', attr: 'hp', op: 'add', value: 30, id: `${floatId}-settle` })
  })

  it('effects 传空数组＝清除结算（纯展示，不改数值）', () => {
    const { scenario, node: n, floatId } = seedFloat()
    const next = patchOverlayGraph(scenario, n, floatId, { effects: [] }, undefined)
    const curNode = findNode(next.graph, n.id)!
    expect(overlayEffects(next, curNode, floatId)).toEqual([])
    expect(curNode.data.reactions).toBeUndefined()
  })

  it('valuePick/expr 往返：勾选自定义显示数值后写回 inputs，取消勾选清空二者', () => {
    const { scenario, node: n, floatId } = seedFloat()
    const withExpr = patchOverlayGraph(
      scenario,
      n,
      floatId,
      {
        expr: 'entity.ent-boss.attr.hp',
        valuePick: { mode: 'pick', terms: [{ op: '-', source: 'entity', refId: 'ent-boss', attr: 'hp' }] },
      },
      undefined,
    )
    const el = findElement(withExpr, findNode(withExpr.graph, n.id), floatId)!
    expect(el.inputs?.expr).toBe('entity.ent-boss.attr.hp')
    expect(el.inputs?.valuePick).toBeDefined()

    const cleared = patchOverlayGraph(
      withExpr,
      findNode(withExpr.graph, n.id)!,
      floatId,
      { expr: undefined, valuePick: undefined },
      undefined,
    )
    const el2 = findElement(cleared, findNode(cleared.graph, n.id), floatId)!
    expect(el2.inputs?.expr).toBeUndefined()
    expect(el2.inputs?.valuePick).toBeUndefined()
  })

  it('content 只改显示文案，不影响结算 effects', () => {
    const { scenario, node: n, floatId } = seedFloat()
    const next = patchOverlayGraph(scenario, n, floatId, { content: '会心一击 {v}' }, undefined)
    const curNode = findNode(next.graph, n.id)!
    const el = findElement(next, curNode, floatId)!
    expect(el.inputs?.text).toBe('会心一击 {v}')
    expect(overlayEffects(next, curNode, floatId)).toHaveLength(1)
  })
})
