import type { DecisionSpec, Scene } from '../scenario/types'

/** 解析选项类型 —— optType 优先，兼容旧 mode 字段。 */
export function resolveOptType(d?: DecisionSpec): 'static' | 'timed' | 'timed_qte' {
  if (d?.optType) return d.optType
  if (d?.mode === 'timed' || d?.mode === 'wait') return 'timed'
  return 'static'
}

/** 场景视频是否循环 —— loop 模式或 wait 决策均边播边交互。 */
export function isLoopScene(scene: Scene): boolean {
  return scene.mediaPlayMode === 'loop' || scene.decision?.mode === 'wait'
}

export function choiceWindowStart(scene: Scene): number {
  const d = scene.decision
  if (d?.windowStartMs != null) return d.windowStartMs
  if (d?.atMs != null) return d.atMs
  return 0
}

export function choiceWindowEnd(scene: Scene): number {
  const d = scene.decision
  if (d?.windowEndMs != null) return d.windowEndMs
  return scene.durationMs
}

/** 播放中是否应弹出选项层（非 scene-end 路径）。 */
export function shouldOpenChoiceDuringPlayback(scene: Scene, elapsedMs: number): boolean {
  const optType = resolveOptType(scene.decision)
  if (optType === 'timed_qte') return false
  const hasChoice = scene.branches.some((b) => b.kind === 'choice')
  if (!hasChoice) return false

  // 纯 static 且无 loop/window → 只在 scene end 弹
  const endOnly =
    optType === 'static' &&
    !isLoopScene(scene) &&
    scene.decision?.atMs == null &&
    scene.decision?.windowStartMs == null
  if (endOnly) return false

  const start = choiceWindowStart(scene)
  const end = choiceWindowEnd(scene)
  return elapsedMs >= start && elapsedMs < end
}

/** 弹出选项时是否暂停视频（loop/wait 保持播放）。 */
export function shouldPauseVideoForChoice(scene: Scene): boolean {
  if (isLoopScene(scene)) return false
  if (scene.decision?.mode === 'wait') return false
  const optType = resolveOptType(scene.decision)
  if (optType === 'timed') return false
  return true
}

/** 限时 QTE 窗口内是否激活 QTE 层。 */
export function shouldActivateTimedQte(scene: Scene, elapsedMs: number): boolean {
  if (resolveOptType(scene.decision) !== 'timed_qte' && scene.kind !== 'qte') return false
  if (!scene.qte?.cues?.length) return false
  if (resolveOptType(scene.decision) === 'timed_qte') {
    const start = choiceWindowStart(scene)
    const end = choiceWindowEnd(scene)
    return elapsedMs >= start && elapsedMs < end
  }
  // kind=qte 且无 decision 窗口 → 全场景有效
  return true
}

/** fireAt 缺省：loop 场景选完等视频段结束再跳。 */
export function resolveFireAt(scene: Scene): 'on_pick' | 'video_end' {
  if (scene.decision?.fireAt) return scene.decision.fireAt
  if (isLoopScene(scene)) return 'video_end'
  return 'on_pick'
}
