/**
 * perf —— 演出/交互节点（默认类型）。
 * enter：换片 → 跑 enter 元素（先表现层、后交互）→ enter 相位 reactions；
 * 决定意图：进了交互或有 redirect → await（引擎处理挂起/硬跳）；瞬时 → advance；有 media/时长 → await（等 onEnd）。
 * next：媒体播完/时长到点 → advance。
 */
import type { NodeKind, NodeRuntimeCtx, NextIntent } from './node-kind'

export const perfNodeKind: NodeKind = {
  type: 'perf',
  execute(ctx: NodeRuntimeCtx): NextIntent {
    const { node } = ctx
    ctx.beginPerform()
    // 先铺表现层（HUD/字幕/飘字…）
    for (const el of ctx.childrenOf(node)) {
      if (el.trigger.when !== 'enter' || el.window) continue
      if (ctx.roleOf(el.component) === 'interaction') continue
      ctx.runElement(el)
      if (ctx.redirected) break
    }
    // 再开交互（碰交互挂起就停）
    if (!ctx.redirected) {
      for (const el of ctx.childrenOf(node)) {
        if (el.trigger.when !== 'enter' || el.window) continue
        if (ctx.roleOf(el.component) !== 'interaction') continue
        ctx.runElement(el)
        if (ctx.awaiting || ctx.redirected) break
      }
    }
    if (!ctx.awaiting && !ctx.redirected) ctx.applyEnterReactions(node)
    // await：相位已由元素/引擎设好（awaitInteraction 或 playing）；redirect 由引擎 consumeRedirect 处理。
    if (ctx.awaiting || ctx.redirected) return { kind: 'await' }
    return ctx.isInstant(node) ? { kind: 'advance' } : { kind: 'await' }
  },
  next(): NextIntent {
    return { kind: 'advance' }
  },
}
