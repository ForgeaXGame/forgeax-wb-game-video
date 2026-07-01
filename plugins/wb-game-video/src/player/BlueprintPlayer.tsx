/**
 * BlueprintPlayer —— 「试玩」运行时的 React 驱动层，对齐 cinegame runtime 的走法：
 * 全屏舞台 + 真实视频演出 + 由纯引擎 `BlueprintRuntime` 决定的 Loop/转场/QTE/状态机/
 * Boss 走向；本组件只把 RuntimeDirective[] 翻译成画面、把玩家输入回灌引擎。
 *
 * 渲染设施复用旧 `Player.tsx` 的成熟组件（HUD 血条 / 电影字幕 / 富文本叠字 / 选项层 /
 * 热点层）——蓝图节点 id 恒等于 scene id，可直接取回原始 Scene 喂给这些层，并用 runtime
 * 的实体/数值/背包状态驱动它们。
 *
 * 与 cinegame 对齐的运行时设施：真实 `<video>` 播放（mediaStore 解析，回落 demo 视频）、
 * `dmgPoints` 到点飘字+扣血（floatDamage）、蓝图面板 + 节点 JSON inspector、战斗日志、
 * 自动演示、重开。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useScenarioStore } from '../scenario/scenarioStore'
import { useShellStore } from '../shell/shellStore'
import { useMediaStore } from '../media/mediaStore'
import { getVideoClip } from '../scenario/gameAssetCatalog'
import {
  DEFAULT_PLAYBACK_VIDEO_URL,
  primeColdCliffDemoMedia,
} from '../scenario/coldCliffDemoMedia'
import { scenarioToBlueprint } from '../blueprint/scenarioToBlueprint'
import { toFXGraph } from '../blueprint/blueprint-reactflow'
import { BlueprintRuntime } from '../blueprint/runtime/engine'
import type { RuntimeDirective } from '../blueprint/runtime/directives'
import type {
  BlueprintBossRound,
  BlueprintDamagePoint,
  GameVideoBlueprintGraph,
  GameVideoBlueprintNode,
  BlueprintHotspot,
  BlueprintOption,
  BlueprintQte,
} from '../blueprint/blueprint-schema'
import type { Hotspot, Scene } from '../scenario/types'
import { HudLayer } from './hud/HudLayer'
import { DialogueBox } from './DialogueBox'
import { TextOverlayLayer } from './TextOverlayLayer'
import { ChoiceLayer } from './ChoiceLayer'
import { HotspotLayer } from './hotspots/HotspotLayer'
import { initEntities, type EntitiesState } from './entities'
import { evaluateCondition } from './conditionEval'

const STYLE_ID = 'bpx-style'
// 真实视频以 <video> 的 onEnded 为主推进；此超时只是「视频不结束（loop/加载失败）」
// 时的安全兜底，故取节点时长 + 缓冲，并设一个较大的封顶避免无限等待。
const AUTO_ADVANCE_CAP_MS = 15000
const QTE_DEFAULT_MS = 2600
const CLOCK_TICK_MS = 100
const DEMO_STEP_MS = 900
const MAX_LOGS = 24

type Interaction =
  | { type: 'none' }
  | { type: 'qte'; qte: BlueprintQte }
  | { type: 'choice'; options: BlueprintOption[] }
  | { type: 'boss'; round: BlueprintBossRound; index: number; total: number }
  | { type: 'hotspots'; hotspots: BlueprintHotspot[] }
  | { type: 'banner'; kind: 'victory' | 'defeat' | 'ending'; title: string }

interface ClipView {
  nodeId: string
  label: string
  /** 固定视频库直链（scene.clipId → gameAssetCatalog）。 */
  url?: string
  type?: string
  loop: boolean
  hud: string
  transition?: string
  durationMs?: number
  mediaId?: string
  dmgPoints: BlueprintDamagePoint[]
}

interface Snapshot {
  clip?: ClipView
  interaction: Interaction
}

interface FloatItem {
  id: number
  text: string
  x: number
  y: number
  kind: 'dmg' | 'hurt' | 'note'
}

const EMPTY: Snapshot = { interaction: { type: 'none' } }

export function BlueprintPlayer(): JSX.Element {
  const scenario = useScenarioStore((s) => s.scenario)
  const setMode = useScenarioStore((s) => s.setMode)
  const mediaEntries = useMediaStore((s) => s.entries)

  const [runKey, setRunKey] = useState(0)
  const runtime = useMemo(
    () => (scenario ? new BlueprintRuntime(scenarioToBlueprint(scenario), scenario) : null),
    // runKey 参与依赖 → 重开时重建引擎。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenario, runKey],
  )
  const graph = useMemo(() => (scenario ? scenarioToBlueprint(scenario) : null), [scenario])
  const fxGraph = useMemo(() => (graph ? toFXGraph(graph) : null), [graph])

  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY)
  const [, force] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [floats, setFloats] = useState<FloatItem[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [showBlueprint, setShowBlueprint] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [demoRunning, setDemoRunning] = useState(false)
  const tapsRef = useRef(0)
  const [taps, setTaps] = useState(0)
  const advancedRef = useRef<string | null>(null)
  const floatSeq = useRef(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  injectStyles()

  useEffect(() => {
    primeColdCliffDemoMedia()
  }, [])

  const dispatch = (dirs: RuntimeDirective[]): void => {
    setSnapshot((prev) => applyDirectives(prev, dirs))
    setElapsed(0)
    setLogs((prev) => [...prev, ...dirs.map(logLine).filter((l): l is string => !!l)].slice(-MAX_LOGS))
    force((n) => n + 1)
  }

  // boot / restart
  useEffect(() => {
    if (!runtime) return
    advancedRef.current = null
    setSnapshot(EMPTY)
    setFloats([])
    setLogs([])
    dispatch(runtime.start())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime])

  // 场景内时钟 —— 驱动字幕 / 叠字 / 热点出现窗口（elapsed ms）。
  useEffect(() => {
    if (!runtime) return
    const timer = window.setInterval(() => setElapsed((e) => e + CLOCK_TICK_MS), CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [runtime, snapshot.clip?.nodeId])

  // dmgPoints 到点飘字 + 扣血（对齐 cinegame playClip 的 onPoint 定时）。
  useEffect(() => {
    if (!runtime || !snapshot.clip) return
    const points = snapshot.clip.dmgPoints
    if (points.length === 0) return
    const timers = points.map((p) =>
      window.setTimeout(() => {
        spawnFloats(p)
        dispatch(runtime.applyDamagePoint(p))
      }, Math.max(0, p.t * 1000)),
    )
    return () => timers.forEach((t) => window.clearTimeout(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.clip?.nodeId, runtime])

  // 自动推进：纯演出节点（无交互）按时长/视频结束走到下一节点。
  useEffect(() => {
    if (!runtime) return
    if (snapshot.interaction.type !== 'none') return
    if (runtime.state.phase !== 'playing' && runtime.state.phase !== 'awaitHotspot') return
    // loop 只控制 <video> 视觉循环；状态推进由 phase/interaction 决定：无交互的
    // 'playing' 节点（含 Loop 空节点）按时长自动走下一节点，避免死循环。
    const ms = Math.min((snapshot.clip?.durationMs ?? 2600) + 300, AUTO_ADVANCE_CAP_MS)
    const timer = window.setTimeout(() => advanceClip(), ms)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.clip?.nodeId, snapshot.interaction.type, runtime])

  // QTE 计时：超时按当前命中数结算。
  useEffect(() => {
    if (!runtime || snapshot.interaction.type !== 'qte') return
    tapsRef.current = 0
    setTaps(0)
    const ms = snapshot.interaction.qte.timeoutMs ?? QTE_DEFAULT_MS
    const timer = window.setTimeout(() => dispatch(runtime.submitQte(tapsRef.current)), ms)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.interaction.type, snapshot.clip?.nodeId, runtime])

  // 自动演示：每步挑第一个可行输入推进，直到结局。
  useEffect(() => {
    if (!runtime || !demoRunning) return
    const it = snapshot.interaction
    if (it.type === 'banner') {
      setDemoRunning(false)
      return
    }
    const timer = window.setTimeout(() => {
      if (it.type === 'choice' && it.options[0]) dispatch(runtime.chooseOption(it.options[0].key))
      else if (it.type === 'qte') dispatch(runtime.submitQte(it.qte.passingHits ?? it.qte.cueMs.length))
      else if (it.type === 'boss') dispatch(runtime.submitBossRound(true))
      else if (it.type === 'hotspots' && it.hotspots[0]) dispatch(runtime.clickHotspot(it.hotspots[0].id))
      else advanceClip()
    }, DEMO_STEP_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoRunning, snapshot, runtime])

  if (!scenario || !runtime) {
    return <div className="bpx-empty">无可播放剧本</div>
  }

  function advanceClip(): void {
    if (!runtime) return
    const id = runtime.state.currentNodeId
    if (id && advancedRef.current === id) return
    advancedRef.current = id
    dispatch(runtime.onClipEnded())
  }

  function spawnFloats(p: BlueprintDamagePoint): void {
    const items: FloatItem[] = []
    if (p.damageToBoss) items.push({ id: floatSeq.current++, text: `-${p.damageToBoss}`, x: p.x, y: p.y, kind: 'dmg' })
    if (p.damageToPlayer) items.push({ id: floatSeq.current++, text: `-${p.damageToPlayer}`, x: p.x, y: p.y + 8, kind: 'hurt' })
    if (items.length === 0) items.push({ id: floatSeq.current++, text: p.note, x: p.x, y: p.y, kind: 'note' })
    setFloats((prev) => [...prev, ...items])
    for (const it of items) window.setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== it.id)), 1100)
  }

  const exit = (): void => {
    useShellStore.getState().setForgeView('blueprint')
    setMode('editor')
  }

  const onTap = (): void => {
    tapsRef.current += 1
    setTaps(tapsRef.current)
  }

  const clip = snapshot.clip
  const interaction = snapshot.interaction
  const scene: Scene | undefined = runtime.state.currentNodeId
    ? scenario.scenes[runtime.state.currentNodeId]
    : undefined

  const hudEntities = deriveEntities(scenario, runtime)
  const score = runtime.state.score
  const vars = runtime.state.vars
  const ownedItems = runtime.state.items
  const visitedList = Array.from(runtime.state.visited)
  const hudVisible = clip?.hud && clip.hud !== 'hidden'
  const videoSrc =
    clip?.url || (clip?.mediaId && mediaEntries[clip.mediaId]?.url) || DEFAULT_PLAYBACK_VIDEO_URL
  const currentBpNode = findBlueprintNode(graph, runtime.state.currentNodeId)

  return (
    <div className="bpx-root" tabIndex={0}>
      <div className="bpx-stage" data-transition={clip?.transition ?? 'cut'}>
        <video
          key={clip?.nodeId ?? 'boot'}
          ref={videoRef}
          className="bpx-video"
          src={videoSrc}
          autoPlay
          muted
          playsInline
          loop={clip?.loop ?? false}
          onEnded={() => {
            if (!clip?.loop) advanceClip()
          }}
        />
        <div className="bpx-vignette" aria-hidden />
        <div className="bpx-clip-tag">
          <span>{clip?.type ?? '演出'}{clip?.loop ? ' · Loop' : ''}</span>
          <strong>{clip?.label ?? '—'}</strong>
        </div>

        {/* dmgPoints 飘字层 */}
        <div className="bpx-floats" aria-hidden>
          {floats.map((f) => (
            <span key={f.id} className={`bpx-float bpx-float--${f.kind}`} style={{ left: `${f.x}%`, top: `${f.y}%` }}>
              {f.text}
            </span>
          ))}
        </div>

        {/* ── 复用旧 Player 的成熟渲染设施 ── */}
        {scene && <DialogueBox scene={scene} elapsed={elapsed} />}
        {scene && <TextOverlayLayer scene={scene} elapsed={elapsed} />}
        {scene && hudVisible && (
          <HudLayer scenario={scenario} scene={scene} entities={hudEntities} score={score} />
        )}

        {scene && interaction.type === 'choice' && (
          <ChoiceLayer
            scene={scene}
            onPick={(b) => dispatch(runtime.chooseOption(b.id))}
            vars={vars}
            visitedSceneIds={visitedList}
            ownedItems={ownedItems}
            entities={hudEntities}
            score={score}
          />
        )}

        {scene && interaction.type === 'hotspots' && (
          <HotspotLayer
            hotspots={visibleHotspots(scene, elapsed, {
              vars,
              visitedSceneIds: new Set(visitedList),
              ownedItems,
              entities: hudEntities,
              score,
            })}
            onActivate={(h) => dispatch(runtime.clickHotspot(h.id))}
          />
        )}

        {/* ── QTE / Boss / 结局：紧凑交互覆盖层 ── */}
        {interaction.type === 'qte' && (
          <div className="bpx-qte">
            <button className="bpx-qte-btn" onClick={onTap}>
              命中 ×{taps}
            </button>
            <p>在限时内连点命中（需 {interaction.qte.passingHits ?? interaction.qte.cueMs.length} 次）</p>
          </div>
        )}

        {interaction.type === 'boss' && (
          <div className="bpx-boss">
            <p>
              {interaction.round.label ?? '回合'} ({interaction.index + 1}/{interaction.total})
            </p>
            <div className="bpx-boss-actions">
              <button onClick={() => dispatch(runtime.submitBossRound(true))}>命中</button>
              <button className="bpx-boss-miss" onClick={() => dispatch(runtime.submitBossRound(false))}>
                失手
              </button>
            </div>
          </div>
        )}

        {interaction.type === 'banner' && (
          <div className={`bpx-banner bpx-banner--${interaction.kind}`}>
            <strong>{interaction.title}</strong>
            <div className="bpx-banner-actions">
              <button onClick={() => setRunKey((k) => k + 1)}>重新开始</button>
              <button className="bpx-banner-exit" onClick={exit}>返回蓝图</button>
            </div>
          </div>
        )}

        <div className="bpx-tools">
          <button className={demoRunning ? 'is-on' : ''} onClick={() => setDemoRunning((v) => !v)}>
            {demoRunning ? '停止演示' : '自动演示'}
          </button>
          <button onClick={() => setRunKey((k) => k + 1)}>重开</button>
          <button className={showLogs ? 'is-on' : ''} onClick={() => setShowLogs((v) => !v)}>日志</button>
          <button className={showBlueprint ? 'is-on' : ''} onClick={() => setShowBlueprint((v) => !v)}>蓝图</button>
          <button onClick={exit}>退出</button>
        </div>

        {showBlueprint && fxGraph && (
          <div className="bpx-blueprint">
            <h3>蓝图状态机</h3>
            <ul>
              {fxGraph.nodes.map((n) => (
                <li key={n.id} className={n.id === runtime.state.currentNodeId ? 'active' : ''}>
                  <b>{n.data.label}</b>
                  <span>{n.data.elementType}</span>
                  <em>{n.data.badge}</em>
                </li>
              ))}
            </ul>
          </div>
        )}

        {showLogs && (
          <div className="bpx-logs">
            <h3>运行日志</h3>
            <ol>
              {logs.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
            <pre>{JSON.stringify(currentBpNode, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  )
}

/** 把 runtime 的实体血量合并进 initEntities（保留名字/头像/状态词汇），供 HudLayer/ChoiceLayer 用。 */
function deriveEntities(
  scenario: NonNullable<ReturnType<typeof useScenarioStore.getState>['scenario']>,
  runtime: BlueprintRuntime,
): EntitiesState {
  const base = initEntities(scenario)
  for (const [id, e] of Object.entries(runtime.state.entities)) {
    const prev = base[id]
    base[id] = prev
      ? { ...prev, hp: e.hp, maxHp: e.maxHp, statusIds: e.statusIds }
      : { id, name: id, kind: e.kind as EntitiesState[string]['kind'], hp: e.hp, maxHp: e.maxHp, statusIds: e.statusIds }
  }
  return base
}

function visibleHotspots(
  scene: Scene,
  elapsed: number,
  ctx: Parameters<typeof evaluateCondition>[1],
): Hotspot[] {
  return (scene.hotspots ?? []).filter((h) => {
    const appeared = elapsed >= (h.appearAt ?? 0)
    const notEnded = h.endMs == null || elapsed <= h.endMs
    return appeared && notEnded && evaluateCondition(h.condition, ctx)
  })
}

function logLine(d: RuntimeDirective): string | undefined {
  switch (d.type) {
    case 'playClip':
      return `▶ ${getVideoClip(d.clipId)?.label ?? d.name}${d.loop ? ' (Loop)' : ''}`
    case 'dialogue':
      return `💬 ${d.lines.join(' / ')}`
    case 'openQte':
      return `⏱ QTE ×${d.qte.cueMs.length}`
    case 'openChoice':
      return `❓ 选择 ×${d.options.length}`
    case 'openBossRound':
      return `☠ 回合 ${d.roundIndex + 1}/${d.totalRounds}`
    case 'openHotspots':
      return `⊕ 热点 ×${d.hotspots.length}`
    case 'banner':
      return `🏁 ${d.kind}: ${d.title}`
    case 'log':
      return d.message
    default:
      return undefined
  }
}

function applyDirectives(prev: Snapshot, dirs: RuntimeDirective[]): Snapshot {
  let next: Snapshot = { ...prev }
  for (const d of dirs) {
    switch (d.type) {
      case 'playClip':
        next = {
          clip: {
            nodeId: d.nodeId,
            label: getVideoClip(d.clipId)?.label ?? d.clipId ?? d.name ?? d.nodeId,
            url: getVideoClip(d.clipId)?.url,
            type: getVideoClip(d.clipId)?.type,
            loop: d.loop,
            hud: d.hud,
            transition: d.transition?.kind,
            durationMs: d.durationMs,
            mediaId: d.mediaId,
            dmgPoints: d.dmgPoints ?? [],
          },
          interaction: { type: 'none' },
        }
        break
      case 'openQte':
        next = { ...next, interaction: { type: 'qte', qte: d.qte } }
        break
      case 'openChoice':
        next = { ...next, interaction: { type: 'choice', options: d.options } }
        break
      case 'openBossRound':
        next = {
          ...next,
          interaction: { type: 'boss', round: d.round, index: d.roundIndex, total: d.totalRounds },
        }
        break
      case 'openHotspots':
        next = { ...next, interaction: { type: 'hotspots', hotspots: d.hotspots } }
        break
      case 'banner':
        next = { ...next, interaction: { type: 'banner', kind: d.kind, title: d.title } }
        break
      default:
        break
    }
  }
  return next
}

function findBlueprintNode(
  graph: GameVideoBlueprintGraph | null,
  nodeId: string | null,
): GameVideoBlueprintNode | undefined {
  if (!graph || !nodeId) return undefined
  return (
    graph.nodes.find((n) => n.id === nodeId) ??
    Object.values(graph.subflows ?? {})
      .flatMap((subflow) => subflow.nodes)
      .find((n) => n.id === nodeId)
  )
}

function injectStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .bpx-root{position:absolute;inset:0;background:#05060a;color:#f4eee2;font-family:Inter,ui-sans-serif,system-ui,sans-serif;overflow:hidden;outline:none}
    .bpx-empty{display:grid;place-items:center;height:100%;color:#9aa}
    .bpx-stage{position:absolute;inset:0}
    .bpx-video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#05060a}
    .bpx-vignette{position:absolute;inset:0;box-shadow:inset 0 0 160px rgba(0,0,0,.82);pointer-events:none}
    .bpx-clip-tag{position:absolute;left:20px;bottom:18px;z-index:20;padding:8px 12px;border-radius:10px;background:rgba(6,8,12,.6);border:1px solid rgba(255,230,180,.16);backdrop-filter:blur(4px)}
    .bpx-clip-tag span{display:block;font-size:11px;letter-spacing:.06em;color:#ffe6b5}
    .bpx-clip-tag strong{font-size:15px}
    .bpx-floats{position:absolute;inset:0;pointer-events:none;z-index:30}
    .bpx-float{position:absolute;transform:translate(-50%,-50%);font-size:34px;font-weight:900;text-shadow:0 3px 8px #000;animation:bpx-float 1s ease-out forwards}
    .bpx-float--dmg{color:#fff3db}.bpx-float--hurt{color:#ff5656}.bpx-float--note{color:#ffe35b;font-size:22px}
    .bpx-qte{position:absolute;right:9vw;top:34%;text-align:center;z-index:40}
    .bpx-qte-btn{width:120px;height:120px;border-radius:50%;border:2px solid rgba(158,255,202,.9);background:radial-gradient(circle,rgba(84,255,170,.24),rgba(5,15,10,.84));color:#ddffed;font-size:18px;font-weight:900;cursor:pointer;box-shadow:0 0 28px rgba(85,255,180,.32)}
    .bpx-qte p{margin-top:10px;padding:6px 10px;border-radius:8px;background:rgba(0,0,0,.55);font-weight:700;font-size:13px}
    .bpx-boss{position:absolute;left:50%;bottom:130px;transform:translateX(-50%);text-align:center;z-index:40}
    .bpx-boss p{margin:0 0 10px;font-weight:800}
    .bpx-boss-actions{display:flex;gap:14px;justify-content:center}
    .bpx-boss-actions button{padding:12px 26px;border-radius:12px;border:1px solid rgba(158,255,202,.7);background:rgba(20,40,30,.8);color:#ddffed;font-weight:900;cursor:pointer}
    .bpx-boss-miss{border-color:rgba(255,120,120,.7)!important;background:rgba(40,16,16,.8)!important;color:#ffd9d9!important}
    .bpx-banner{position:absolute;inset:0;display:grid;place-content:center;text-align:center;background:rgba(0,0,0,.5);backdrop-filter:blur(2px);z-index:50}
    .bpx-banner strong{display:block;font-size:56px;text-shadow:0 0 24px rgba(255,210,90,.6)}
    .bpx-banner--defeat strong{text-shadow:0 0 24px rgba(255,90,90,.6)}
    .bpx-banner-actions{margin-top:20px;display:flex;gap:12px;justify-content:center}
    .bpx-banner button{padding:10px 22px;border-radius:10px;border:1px solid rgba(255,224,160,.4);background:rgba(24,20,14,.8);color:#ffe6b5;font-weight:800;cursor:pointer}
    .bpx-banner-exit{background:rgba(14,14,18,.8)!important;color:#cfd6dd!important}
    .bpx-tools{position:absolute;right:20px;top:20px;display:flex;gap:8px;z-index:60}
    .bpx-tools button{padding:8px 12px;border-radius:10px;border:1px solid rgba(255,224,160,.32);background:rgba(24,20,14,.72);color:#ffe6b5;font-weight:800;cursor:pointer}
    .bpx-tools button.is-on{background:rgba(92,255,178,.18);border-color:rgba(92,255,178,.6);color:#ddffed}
    .bpx-blueprint,.bpx-logs{position:absolute;bottom:22px;max-height:56vh;overflow:auto;padding:14px;border-radius:14px;border:1px solid rgba(255,230,180,.18);background:rgba(5,7,10,.92);z-index:60}
    .bpx-blueprint{left:22px;width:min(420px,40vw)}
    .bpx-logs{right:22px;width:min(420px,40vw)}
    .bpx-blueprint h3,.bpx-logs h3{margin:0 0 10px}
    .bpx-blueprint ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
    .bpx-blueprint li{padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);display:flex;gap:8px;align-items:baseline}
    .bpx-blueprint li.active{outline:2px solid rgba(92,255,178,.7);background:rgba(40,80,60,.25)}
    .bpx-blueprint li b{font-size:14px}
    .bpx-blueprint li span,.bpx-blueprint li em{font-style:normal;font-size:11px;color:#9aa6b6}
    .bpx-logs ol{margin:0 0 10px;padding-left:18px;display:flex;flex-direction:column;gap:4px;font-size:12px}
    .bpx-logs pre{white-space:pre-wrap;font-size:11px;color:#bfe4ff;background:rgba(255,255,255,.05);padding:10px;border-radius:10px;margin:0}
    @keyframes bpx-float{0%{opacity:0;transform:translate(-50%,10px) scale(.8)}20%{opacity:1}100%{opacity:0;transform:translate(-50%,-82px) scale(1.12)}}
  `
  document.head.appendChild(style)
}
