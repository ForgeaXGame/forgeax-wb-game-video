/**
 * Scenario → GameVideoBlueprintGraph 编译器。
 *
 * 把现有「玩法优先」的 Scenario(scenes + branches + gameplay specs) **一次性**编译成
 * 对齐 cinegame BPMN 形态的 `GameVideoBlueprintGraph`（不兼容历史数据，以新为准）。
 *
 * 映射约定：
 *  - 每个 Scene → 一个 node；node.id = scene.id。
 *  - 每条 Branch / Boss 胜负跳转 / Hotspot 子流程入口 → 一条 edge（flow 本体在 edges，
 *    node 只保留 incoming/outgoing 的 flow id，和 cinegame 完全一致）。
 *  - 富玩法（kind/boss/qte/decision/hotspots/performance/loop/transition）→ 节点
 *    `extensionElements`（cinegame 扩展风格）。
 *  - Branch.condition(结构化) → edge.conditionExpression(可读派生) + edge.extension.condition(运行时求值)。
 */

import type {
  Branch,
  BranchCondition,
  ConditionClause,
  QTESpec,
  Scenario,
  Scene,
} from '../scenario/types'
import type {
  BossSpec,
  DecisionSpec,
  Hotspot,
  PerformanceSpec,
} from '../scenario/gameplayTypes'
import {
  GAME_VIDEO_BLUEPRINT_SCHEMA_VERSION,
  type BlueprintBoss,
  type BlueprintDamagePoint,
  type BlueprintDecision,
  type BlueprintElementType,
  type BlueprintHotspot,
  type BlueprintHudMode,
  type BlueprintMediaPlayMode,
  type BlueprintOption,
  type BlueprintQte,
  type BlueprintSceneKind,
  type BlueprintTransition,
  type GameVideoBlueprintEdge,
  type GameVideoBlueprintGraph,
  type GameVideoBlueprintNode,
  type GameVideoExtensionElements,
} from './blueprint-schema'

// ── 顶层入口 ───────────────────────────────────────────────────────────────

export function scenarioToBlueprint(scenario: Scenario): GameVideoBlueprintGraph {
  const scenes = orderedScenes(scenario)
  const sceneIds = new Set(scenes.map((s) => s.id))

  const edges = buildEdges(scenes, sceneIds)
  const incomingByNode = collectFlow(edges, 'targetRef')
  const outgoingByNode = collectFlow(edges, 'sourceRef')

  const rootId = scenario.rootSceneId || scenes[0]?.id || ''
  const nodes = scenes.map((scene) =>
    buildNode(scene, {
      isRoot: scene.id === rootId,
      incoming: incomingByNode[scene.id] ?? [],
      outgoing: outgoingByNode[scene.id] ?? [],
    }),
  )

  return {
    id: scenario.id,
    title: scenario.title,
    schemaVersion: GAME_VIDEO_BLUEPRINT_SCHEMA_VERSION,
    nodes,
    edges,
  }
}

// ── edges ─────────────────────────────────────────────────────────────────

function buildEdges(scenes: Scene[], sceneIds: Set<string>): GameVideoBlueprintEdge[] {
  const edges: GameVideoBlueprintEdge[] = []
  const used = new Set<string>()

  for (const scene of scenes) {
    for (const br of scene.branches ?? []) {
      if (!sceneIds.has(br.targetSceneId)) continue
      edges.push(branchEdge(scene, br, used))
    }
    // Boss 胜负跳转 —— 让图保持连通（运行时仍直接读 extensionElements.boss）。
    if (scene.boss) {
      if (scene.boss.winSceneId && sceneIds.has(scene.boss.winSceneId)) {
        edges.push(syntheticEdge(scene.id, scene.boss.winSceneId, 'Boss 胜利', 'boss.win', used))
      }
      if (scene.boss.loseSceneId && sceneIds.has(scene.boss.loseSceneId)) {
        edges.push(syntheticEdge(scene.id, scene.boss.loseSceneId, 'Boss 失败', 'boss.lose', used))
      }
    }
    // Hotspot 子流程入口（call/return / goto）。
    for (const hs of scene.hotspots ?? []) {
      if (hs.targetSceneId && sceneIds.has(hs.targetSceneId)) {
        const label = hs.mode === 'goto' ? '热点跳转' : '热点子流程'
        edges.push(syntheticEdge(scene.id, hs.targetSceneId, hs.label ?? label, `hotspot(${hs.id})`, used))
      }
    }
  }

  return edges
}

function branchEdge(scene: Scene, br: Branch, used: Set<string>): GameVideoBlueprintEdge {
  return {
    id: uniqueId(`Flow_${scene.id}__${br.targetSceneId}`, used),
    sourceRef: scene.id,
    targetRef: br.targetSceneId,
    name: br.label,
    conditionExpression: branchExpression(br),
    extension: {
      kind: br.kind,
      branchId: br.id,
      condition: br.condition,
      effects: br.effects,
      itemEffects: br.itemEffects,
      showAtMs: br.showAt,
      gateMode: br.gateMode,
    },
  }
}

function syntheticEdge(
  source: string,
  target: string,
  name: string,
  expr: string,
  used: Set<string>,
): GameVideoBlueprintEdge {
  return {
    id: uniqueId(`Flow_${source}__${target}`, used),
    sourceRef: source,
    targetRef: target,
    name,
    conditionExpression: expr,
    extension: { kind: 'auto', branchId: expr },
  }
}

function collectFlow(
  edges: GameVideoBlueprintEdge[],
  key: 'sourceRef' | 'targetRef',
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {}
  for (const edge of edges) {
    ;(grouped[edge[key]] ??= []).push(edge.id)
  }
  return grouped
}

// ── nodes ─────────────────────────────────────────────────────────────────

interface NodeContext {
  isRoot: boolean
  incoming: string[]
  outgoing: string[]
}

function buildNode(scene: Scene, ctx: NodeContext): GameVideoBlueprintNode {
  return {
    id: scene.id,
    elementType: elementTypeFor(scene, ctx),
    name: scene.title || scene.id,
    documentation: nodeDocumentation(scene),
    incoming: ctx.incoming,
    outgoing: ctx.outgoing,
    extensionElements: extensionFor(scene),
  }
}

function elementTypeFor(scene: Scene, ctx: NodeContext): BlueprintElementType {
  if (ctx.isRoot) return 'start'
  if (ctx.outgoing.length === 0 && !scene.boss) return 'end'
  if (scene.kind === 'battle') return 'serviceTask'
  if (scene.kind === 'qte') return 'serviceTask'
  const hasChoice = scene.kind === 'choice' || (scene.branches ?? []).some((b) => b.kind === 'choice')
  if (hasChoice) return 'userTask'
  return 'task'
}

function extensionFor(scene: Scene): GameVideoExtensionElements {
  return {
    clipId: scene.clipId,
    mediaId: mediaIdOf(scene),
    hud: hudFor(scene),
    stateKey: scene.id,
    sceneKind: (scene.kind ?? 'story') as BlueprintSceneKind,
    mediaPlayMode: (scene.mediaPlayMode ?? 'once') as BlueprintMediaPlayMode,
    calcType: scene.kind && scene.kind !== 'story' ? scene.kind : undefined,
    dmgPoints: damagePointsOf(scene),
    options: optionsOf(scene),
    durationMs: scene.durationMs,
    qte: scene.qte ? compileQte(scene.qte, scene.decision) : undefined,
    boss: scene.boss ? compileBoss(scene.boss) : undefined,
    decision: scene.decision ? compileDecision(scene.decision) : undefined,
    hotspots: scene.hotspots && scene.hotspots.length > 0 ? compileHotspots(scene.hotspots) : undefined,
    transition: scene.transition ? compileTransition(scene.transition) : undefined,
    onEnter: onEnterOf(scene),
    entryGate: scene.entryGate
      ? {
          conditionExpression: conditionExpression(scene.entryGate.condition),
          condition: scene.entryGate.condition,
          onFail: scene.entryGate.onFail,
          redirectTarget: scene.entryGate.redirectSceneId,
          hint: scene.entryGate.hint,
        }
      : undefined,
    returnsToCaller: scene.returnsToCaller || undefined,
  }
}

function onEnterOf(scene: Scene): GameVideoExtensionElements['onEnter'] {
  const effects = scene.onEnterEffects
  const itemEffects = scene.onEnterItemEffects
  const setFlagVarIds = scene.setFlags
  if (
    (!effects || effects.length === 0) &&
    (!itemEffects || itemEffects.length === 0) &&
    (!setFlagVarIds || setFlagVarIds.length === 0)
  ) {
    return undefined
  }
  return { effects, itemEffects, setFlagVarIds }
}

function mediaIdOf(scene: Scene): string | undefined {
  const ref = scene.media?.ref
  return ref && scene.media?.kind === 'VIDEO' ? ref : undefined
}

function hudFor(scene: Scene): BlueprintHudMode {
  if (scene.hudPreset) return scene.hudPreset
  switch (scene.kind) {
    case 'battle':
      return 'battle'
    case 'qte':
      return 'qte'
    case 'choice':
      return 'main'
    default:
      return scene.isEnding ? 'ending' : 'main'
  }
}

function damagePointsOf(scene: Scene): BlueprintDamagePoint[] {
  const perf: PerformanceSpec | undefined = scene.performance
  if (!perf || perf.cues.length === 0) return []
  return perf.cues.map((cue) => ({
    t: cue.atMs / 1000,
    x: 50,
    y: 40,
    note: cue.label ?? '结算',
    damageToBoss: cue.damageToBoss,
    damageToPlayer: cue.damageToPlayer,
  }))
}

function optionsOf(scene: Scene): BlueprintOption[] | undefined {
  const choices = (scene.branches ?? []).filter((b) => b.kind === 'choice')
  if (choices.length === 0) return undefined
  return choices.map((b) => ({
    key: b.id,
    label: b.label ?? b.targetSceneId,
    target: b.targetSceneId,
    conditionExpression: b.condition ? conditionExpression(b.condition) : undefined,
  }))
}

function nodeDocumentation(scene: Scene): string {
  if (scene.background) return scene.background
  const firstLine = scene.dialogue?.find((d) => d.text)?.text
  return firstLine ?? ''
}

// ── 玩法子结构编译 ──────────────────────────────────────────────────────────

function compileQte(qte: QTESpec, decision?: DecisionSpec): BlueprintQte {
  const cues = qte.cues ?? []
  const sequence = qte.sequence === true
  const kind = decision?.qteKind ?? inferQteKind(qte)
  return {
    kind,
    windowMs: qte.window?.good ?? 200,
    cueMs: cues.map((c) => c.appearAt),
    sequence,
    timeoutMs: qte.timeoutMs,
    passingHits: sequence ? cues.length : Math.max(1, Math.ceil(cues.length / 2)),
  }
}

function inferQteKind(qte: QTESpec): BlueprintQte['kind'] {
  if (qte.sequence) return 'sequence'
  const first = qte.cues?.[0]
  if (first?.shape === 'sweep') return 'sweep'
  if (first?.shape === 'hold') return 'timing'
  return 'timing'
}

function compileBoss(boss: BossSpec): BlueprintBoss {
  return {
    entityId: boss.entityId,
    playerEntityId: boss.playerEntityId,
    rounds: boss.rounds.map((r) => ({
      id: r.id,
      label: r.label,
      damageToBoss: r.damageToBoss,
      damageToPlayer: r.damageToPlayer,
      qte: r.qte ? compileQte(r.qte) : undefined,
    })),
    winTarget: boss.winSceneId,
    loseTarget: boss.loseSceneId,
    perfectFlagVarId: boss.perfectFlagVarId,
  }
}

function compileDecision(decision: DecisionSpec): BlueprintDecision {
  const optType = decision.optType ?? (decision.mode === 'timed' ? 'timed' : 'static')
  return {
    optType,
    atMs: decision.atMs,
    timeoutMs: decision.timeoutMs,
    defaultTarget: decision.defaultBranchId,
    prompt: decision.prompt,
    fireAt: decision.fireAt,
    presentation: decision.presentation,
  }
}

function compileHotspots(hotspots: Hotspot[]): BlueprintHotspot[] {
  return hotspots.map((hs) => ({
    id: hs.id,
    x: hs.x,
    y: hs.y,
    r: hs.r,
    appearAtMs: hs.appearAt,
    endMs: hs.endMs,
    target: hs.targetSceneId,
    detour: hs.detour ? { speaker: hs.detour.speaker, dialogue: hs.detour.dialogue } : undefined,
    once: hs.once,
    mode: hs.mode,
    label: hs.label,
    conditionExpression: hs.condition ? conditionExpression(hs.condition) : undefined,
  }))
}

function compileTransition(t: { presetId: string; durationMs: number }): BlueprintTransition {
  const kind = mapTransitionPreset(t.presetId)
  return { kind, durationMs: t.durationMs }
}

function mapTransitionPreset(presetId: string): BlueprintTransition['kind'] {
  const p = presetId.toLowerCase()
  if (p.includes('dissolve') || p.includes('cross')) return 'crossfade'
  if (p.includes('dip')) return 'dip'
  if (p.includes('flash') || p.includes('fade')) return 'fade'
  return 'cut'
}

// ── 条件表达式（结构化 → 可读字符串，cinegame parity）────────────────────────

function branchExpression(br: Branch): string | undefined {
  const parts: string[] = []
  if (br.kind === 'qte_pass') parts.push('qte.passed')
  if (br.kind === 'qte_fail') parts.push('qte.failed')
  if (br.condition?.all && br.condition.all.length > 0) parts.push(conditionExpression(br.condition))
  return parts.length > 0 ? parts.join(' && ') : undefined
}

export function conditionExpression(cond: BranchCondition): string {
  return (cond.all ?? []).map(clauseExpression).join(' && ')
}

function clauseExpression(clause: ConditionClause): string {
  switch (clause.type) {
    case 'var':
      return `${clause.varId} ${opSymbol(clause.op)} ${clause.value}`
    case 'flag':
      return `${clause.varId} == ${clause.equals}`
    case 'visited':
      return `visited(${clause.sceneId})`
    case 'hasItem':
      return `hasItem(${clause.itemId}) >= ${clause.count ?? 1}`
    case 'hpRatio':
      return `hpRatio(${clause.entityId}) ${opSymbol(clause.op)} ${clause.value}`
    case 'score':
      return `score ${opSymbol(clause.op)} ${clause.value}`
    case 'status':
      return `status(${clause.statusId}${clause.entityId ? `,${clause.entityId}` : ''}) == ${clause.present}`
    default:
      return 'true'
  }
}

function opSymbol(op: 'gte' | 'lte' | 'gt' | 'lt' | 'eq' | 'neq'): string {
  switch (op) {
    case 'gte':
      return '>='
    case 'lte':
      return '<='
    case 'gt':
      return '>'
    case 'lt':
      return '<'
    case 'eq':
      return '=='
    case 'neq':
      return '!='
  }
}

// ── utils ─────────────────────────────────────────────────────────────────

function orderedScenes(scenario: Scenario): Scene[] {
  const all = Object.values(scenario.scenes)
  const rootId = scenario.rootSceneId
  if (!rootId) return all
  const root = all.find((s) => s.id === rootId)
  if (!root) return all
  return [root, ...all.filter((s) => s.id !== rootId)]
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base
  let n = 2
  while (used.has(id)) {
    id = `${base}__${n}`
    n += 1
  }
  used.add(id)
  return id
}
