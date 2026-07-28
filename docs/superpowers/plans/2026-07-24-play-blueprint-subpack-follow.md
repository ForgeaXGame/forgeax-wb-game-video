# 试玩蓝图浮层 · 子蓝图执行跟随 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **Spec SSOT:** [`../specs/2026-07-24-play-blueprint-subpack-follow-design.md`](../specs/2026-07-24-play-blueprint-subpack-follow-design.md)

**Goal:** 试玩「蓝图」浮层在进入 `subFlowPack` 时自动跟随子蓝图并高亮执行节点；面包屑可钉住回看父图；跨图 jump 在查看图内 seek。

**Architecture:** 引擎维护 `activeBlueprintId` + `CallFrame.returnBlueprintId`；`SessionSnapshot` 投影给 UI；纯函数折叠面包屑；`GraphPlaySurface` 用 follow/pinned 本地态按 id 取图渲染，不再绑编辑器 `store.graph`。

**Tech Stack:** TypeScript · vitest · 现有 `GraphRuntime` / `GraphSession` / `GraphCanvas` / React 试玩壳

## Global Constraints

- 方案 A：默认 follow + 调用栈面包屑；不做双栏 / inline 展开 pack
- Snapshot 必含 `activeBlueprintId` + `callStack: CallStackFrameSnap[]`
- 浮层数据源 = `manifest.packs[id].graph`，**禁止**用编辑选中 `store.graph` 当执行图
- 试玩跟随**不**写 store 的 `activeBlueprintId`（不拽编辑焦点）
- 同图 `subFlow`：snapshot 仍投影完整栈；面包屑按 `blueprintId` 去重折叠
- `jumpToNode` 缺省保持今日「清栈回 root」；Play 传查看图才跨图 seek
- 与 BGM 共用引擎 `callStack` 寿命；本能力只读暴露，不改 push/pop 时机
- **提交：非用户明确要求不 commit**（下列 Commit 步骤默认跳过）

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/runtime/engine/engine.ts` | `activeBlueprintId`；`CallFrame.returnBlueprintId`；descend/pop/start/jump 维护 |
| `src/runtime/engine/session.ts` | snapshot 填位置字段；`jump` 透传 `graph` / `blueprintId`；解析 rootBlueprintId |
| `src/editor/shell/call-stack-view.ts` | 纯函数：面包屑折叠、pinned 高亮 caller |
| `src/runtime/__tests__/engine.blueprint-follow.test.ts` | 引擎 activeBlueprintId / 栈帧 / jump 带 graph |
| `src/editor/shell/__tests__/call-stack-view.test.ts` | 面包屑折叠与 deepest caller |
| `src/editor/shell/GraphPlaySurface.tsx` | follow/pinned UI；按 id 取图；面包屑；jump 带查看图 |
| `src/editor/shell/GraphStudio.tsx` | 试玩高亮对齐执行图（可选但列入：同一 bug） |

无新落盘 schema。

---

### Task 1: 引擎 — `activeBlueprintId` + `CallFrame.returnBlueprintId`

**Files:**
- Modify: `src/runtime/engine/engine.ts`
- Test: `src/runtime/__tests__/engine.blueprint-follow.test.ts`

**Interfaces:**
- Consumes: 现有 `descend` / `pushCall` / `switchGraph` / `CallFrame` / packs 表
- Produces:
  - `CallFrame.returnBlueprintId: string`
  - `GraphRuntime` 公开只读：`getActiveBlueprintId(): string`（或 `readonly` 字段经 getter）
  - 构造可接受 `rootBlueprintId?: string`；缺省从 `scenario.manifest.mainPackId`，再否则 `'__root__'`
  - `jumpToNode(id, opts?: { resetGlobals?: boolean; graph?: GameGraph; blueprintId?: string })`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { GraphRuntime } from '../engine/engine'
import type { GameGraph, SubFlowPackDef } from '../schema/graph-schema'
import { node, scnOf } from './test-fixtures'

describe('activeBlueprintId / callStack returnBlueprintId', () => {
  it('starts on rootBlueprintId with empty stack', () => {
    const main: GameGraph = { nodes: [node('a', { durationMs: 100 })], edges: [] }
    const scn = {
      ...scnOf(main),
      manifest: {
        version: 'wb-game-video.blueprint-manifest.v1' as const,
        mainPackId: 'bp-main',
        packs: {
          'bp-main': { id: 'bp-main', title: '主蓝图', entry: 'a', graph: main },
        },
      },
    }
    const rt = new GraphRuntime(main, scn, undefined, [], 'bp-main')
    rt.start()
    expect(rt.getActiveBlueprintId()).toBe('bp-main')
    expect(rt.state.callStack).toEqual([])
  })

  it('enters subFlowPack → switches blueprint id and records returnBlueprintId', () => {
    const main: GameGraph = {
      nodes: [
        node('wrap', { subFlowPack: { id: 'enemy-turn', version: '1' }, durationMs: 100 }),
        node('after', {}),
      ],
      edges: [{ id: 'e', source: 'wrap', target: 'after', sourceHandle: 'default', targetHandle: 'in' }],
    }
    const packGraph: GameGraph = { nodes: [node('tele', { durationMs: 100 })], edges: [] }
    const pack: SubFlowPackDef = { id: 'enemy-turn', version: '1', entry: 'tele', graph: packGraph, title: '敌方回合' }
    const rt = new GraphRuntime(main, scnOf(main), undefined, [pack], 'bp-main')
    rt.start()
    expect(rt.state.currentNodeId).toBe('tele')
    expect(rt.getActiveBlueprintId()).toBe('enemy-turn')
    expect(rt.state.callStack[0]?.callerNodeId).toBe('wrap')
    expect(rt.state.callStack[0]?.returnBlueprintId).toBe('bp-main')
    rt.onPerformanceEnd()
    expect(rt.state.currentNodeId).toBe('after')
    expect(rt.getActiveBlueprintId()).toBe('bp-main')
    expect(rt.state.callStack).toEqual([])
  })

  it('same-graph subFlow keeps activeBlueprintId', () => {
    const g: GameGraph = {
      nodes: [
        node('wrap', { subFlow: 'sub', durationMs: 100 }),
        node('sub', { durationMs: 100 }),
        node('after', {}),
      ],
      edges: [{ id: 'e', source: 'wrap', target: 'after', sourceHandle: 'default', targetHandle: 'in' }],
    }
    const rt = new GraphRuntime(g, scnOf(g), undefined, [], 'bp-main')
    rt.start()
    expect(rt.state.currentNodeId).toBe('sub')
    expect(rt.getActiveBlueprintId()).toBe('bp-main')
    expect(rt.state.callStack[0]?.returnBlueprintId).toBe('bp-main')
  })

  it('jumpToNode with graph seeks inside pack graph', () => {
    const main: GameGraph = {
      nodes: [node('wrap', { subFlowPack: { id: 'enemy-turn', version: '1' }, durationMs: 100 })],
      edges: [],
    }
    const packGraph: GameGraph = {
      nodes: [node('tele', { durationMs: 100 }), node('mid', { durationMs: 100 })],
      edges: [{ id: 'e', source: 'tele', target: 'mid', sourceHandle: 'default', targetHandle: 'in' }],
    }
    const pack: SubFlowPackDef = { id: 'enemy-turn', version: '1', entry: 'tele', graph: packGraph }
    const rt = new GraphRuntime(main, scnOf(main), undefined, [pack], 'bp-main')
    rt.start()
    rt.jumpToNode('mid', { graph: packGraph, blueprintId: 'enemy-turn' })
    expect(rt.state.currentNodeId).toBe('mid')
    expect(rt.getActiveBlueprintId()).toBe('enemy-turn')
    expect(rt.state.callStack).toEqual([])
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/marketplace/extensions/wb-game-video && bunx vitest run src/runtime/__tests__/engine.blueprint-follow.test.ts
```

Expected: `getActiveBlueprintId` / `returnBlueprintId` / ctor 第 5 参不存在。

- [ ] **Step 3: Minimal engine implementation**

在 `engine.ts`：

1. 扩展 `CallFrame`：
```ts
export interface CallFrame {
  callerNodeId: string
  returnGraph: GameGraph
  returnBlueprintId: string
}
```

2. 字段：
```ts
private activeBlueprintId: string
private readonly rootBlueprintId: string
```

3. 构造函数在现有 `packs` 参数后增加可选 `rootBlueprintId?: string`：
```ts
constructor(
  graph: GameGraph,
  scenario: GameScenario,
  components: ComponentRegistry = defaultComponentRegistry,
  packs: readonly SubFlowPackDef[] = [],
  rootBlueprintId?: string,
) {
  // ...
  this.rootBlueprintId =
    rootBlueprintId
    ?? (scenario as { manifest?: { mainPackId?: string } }).manifest?.mainPackId
    ?? '__root__'
  this.activeBlueprintId = this.rootBlueprintId
}
```

注意：现有调用 `new GraphRuntime(g, scn, undefined, [pack])` 仍合法；第 5 参可选。

4. `pushCall`:
```ts
private pushCall(callerNodeId: string): void {
  this.state.callStack.push({
    callerNodeId,
    returnGraph: this.activeGraph,
    returnBlueprintId: this.activeBlueprintId,
  })
}
```

5. `runIntent` descend 分支：在 `switchGraph(intent.graph)` 时，若有 pack 图，设 `activeBlueprintId = resolvePack(...).id`。同图 descend（无 `intent.graph`）不改 id。

实现提示：`subflow-pack` 的 next 已带 `graph`；descend 时需要知道 pack id。可选改 `NextIntent` descend 带 `blueprintId?: string`，或在 `switchGraph` 前用 `getSubFlowPack(node.data)?.id`：
```ts
case 'descend':
  this.pushCall(node.id)
  if (intent.graph) {
    const packId = getSubFlowPack(node.data)?.id
    if (packId) this.activeBlueprintId = packId
    this.switchGraph(intent.graph)
  }
  this.enterNode(intent.entry)
  return
```

6. pop 弹回：
```ts
this.switchGraph(frame.returnGraph)
this.activeBlueprintId = frame.returnBlueprintId
```

7. `start` / 默认 `jumpToNode`：
```ts
this.activeBlueprintId = this.rootBlueprintId
this.switchGraph(this.rootGraph)
// jump 清栈（已有）
```

8. `jumpToNode` 扩展：
```ts
jumpToNode(id: string, opts: { resetGlobals?: boolean; graph?: GameGraph; blueprintId?: string } = {}): RuntimeDirective[] {
  if (opts.resetGlobals) this.resetGlobalsState()
  const targetGraph = opts.graph ?? this.rootGraph
  const targetBp = opts.blueprintId ?? (opts.graph ? this.activeBlueprintId : this.rootBlueprintId)
  // 若只传 blueprintId：从 packsByKey 取 graph
  this.switchGraph(targetGraph)
  this.activeBlueprintId = opts.blueprintId
    ?? (opts.graph ? /* 若 graph===rootGraph 则 root */ (targetGraph === this.rootGraph ? this.rootBlueprintId : this.activeBlueprintId) : this.rootBlueprintId)
  // 更清晰写法：
  // if (opts.graph || opts.blueprintId) { resolve both; } else { root }
  this.state.callStack = []
  this.chain = 0
  this.returningTo = new Set()
  this.enterNode(id)
  return this.drain()
}
```

推荐清晰分支：
```ts
if (opts.blueprintId) {
  const pack = this.packsByKey.get(opts.blueprintId)
  const g = opts.graph ?? pack?.graph
  if (!g) throw new Error(`jump blueprint '${opts.blueprintId}' not loaded`)
  this.switchGraph(g)
  this.activeBlueprintId = opts.blueprintId
} else if (opts.graph) {
  this.switchGraph(opts.graph)
  this.activeBlueprintId = opts.graph === this.rootGraph ? this.rootBlueprintId : this.activeBlueprintId
} else {
  this.switchGraph(this.rootGraph)
  this.activeBlueprintId = this.rootBlueprintId
}
```

9. 公开：
```ts
getActiveBlueprintId(): string { return this.activeBlueprintId }
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd packages/marketplace/extensions/wb-game-video && bunx vitest run src/runtime/__tests__/engine.blueprint-follow.test.ts src/runtime/__tests__/engine.flow.test.ts
```

- [ ] **Step 5: Commit**（默认跳过）

---

### Task 2: SessionSnapshot 投影位置字段

**Files:**
- Modify: `src/runtime/engine/session.ts`
- Test: 同 `engine.blueprint-follow.test.ts` 追加 session 用例，或新建 `src/runtime/__tests__/session.blueprint-follow.test.ts`

**Interfaces:**
- Consumes: `runtime.getActiveBlueprintId()`、`runtime.state.callStack`、`scenario.manifest.packs`
- Produces:
```ts
export interface CallStackFrameSnap {
  blueprintId: string
  callerNodeId: string
  title?: string
}
export interface SessionSnapshot {
  // existing...
  activeBlueprintId: string
  callStack: CallStackFrameSnap[]
}
```
- `GraphSessionOptions.rootBlueprintId?: string` → 传给 `GraphRuntime`
- `jump(nodeId, opts?: { resetGlobals?: boolean; graph?: GameGraph; blueprintId?: string })`

- [ ] **Step 1: Write failing session test**

```ts
import { describe, expect, it } from 'vitest'
import { GraphSession } from '../engine/session'
import type { GameGraph, SubFlowPackDef } from '../schema/graph-schema'
import { node, scnOf } from './test-fixtures'

it('snapshot exposes activeBlueprintId and callStack titles', () => {
  const main: GameGraph = {
    nodes: [node('wrap', { subFlowPack: { id: 'enemy-turn', version: '1' }, durationMs: 100 })],
    edges: [],
  }
  const packGraph: GameGraph = { nodes: [node('tele', { durationMs: 100 })], edges: [] }
  const pack: SubFlowPackDef = { id: 'enemy-turn', version: '1', entry: 'tele', graph: packGraph, title: '敌方回合' }
  const scn = {
    ...scnOf(main),
    manifest: {
      version: 'wb-game-video.blueprint-manifest.v1' as const,
      mainPackId: 'bp-main',
      packs: {
        'bp-main': { id: 'bp-main', title: '主蓝图', entry: 'wrap', graph: main },
        'enemy-turn': { id: 'enemy-turn', title: '敌方回合', version: '1', entry: 'tele', graph: packGraph },
      },
    },
  }
  const session = new GraphSession(scn, { rootBlueprintId: 'bp-main' })
  const snap = session.start()
  expect(snap.activeBlueprintId).toBe('enemy-turn')
  expect(snap.callStack).toEqual([
    { blueprintId: 'bp-main', callerNodeId: 'wrap', title: '主蓝图' },
  ])
})
```

- [ ] **Step 2: Run — expect FAIL**（字段缺失）

```bash
cd packages/marketplace/extensions/wb-game-video && bunx vitest run src/runtime/__tests__/session.blueprint-follow.test.ts
```

- [ ] **Step 3: Implement projection in `session.ts`**

1. `GraphSessionOptions` 增加 `rootBlueprintId?: string`。
2. 构造：
```ts
const rootId =
  opts.rootBlueprintId
  ?? (scenario as GraphLibraryDocument).manifest?.mainPackId
  ?? '__root__'
this.runtime = new GraphRuntime(scenario.graph, scenario, components, opts.packs ?? [], rootId)
this.blueprintTitles = /* Map from manifest.packs id→title */
```
3. `freshSnapshot` / `apply` 末尾同步：
```ts
this.snapshot.activeBlueprintId = this.runtime.getActiveBlueprintId()
this.snapshot.callStack = this.runtime.state.callStack.map((f) => ({
  blueprintId: f.returnBlueprintId,
  callerNodeId: f.callerNodeId,
  title: this.blueprintTitles.get(f.returnBlueprintId),
}))
```
4. `cloned()` 拷贝 `callStack: [...s.callStack]`（或 map 浅拷）。
5. `jump`：
```ts
jump(nodeId: string, opts?: { resetGlobals?: boolean; graph?: GameGraph; blueprintId?: string }): SessionSnapshot {
  return this.apply(this.runtime.jumpToNode(nodeId, opts))
}
```

- [ ] **Step 4: Run — expect PASS**；并跑既有 session 相关测试若有

- [ ] **Step 5: Commit**（默认跳过）

---

### Task 3: 纯函数 — 面包屑折叠 + pinned 高亮

**Files:**
- Create: `src/editor/shell/call-stack-view.ts`
- Test: `src/editor/shell/__tests__/call-stack-view.test.ts`

**Interfaces:**
- Produces:
```ts
export interface BlueprintCrumb {
  blueprintId: string
  title: string
}

/** 外→内：root + 栈中每次换蓝图的帧 + 当前 active（去重连续相同 id） */
export function blueprintBreadcrumbs(
  rootBlueprintId: string,
  rootTitle: string,
  callStack: ReadonlyArray<{ blueprintId: string; title?: string }>,
  activeBlueprintId: string,
  activeTitle: string,
): BlueprintCrumb[]

/** pinned 到某蓝图时：该 id 在栈上最深一帧的 caller；若 pinned===active 则 null（改用 currentNodeId） */
export function deepestCallerOnBlueprint(
  callStack: ReadonlyArray<{ blueprintId: string; callerNodeId: string }>,
  pinnedBlueprintId: string,
  activeBlueprintId: string,
): string | null
```

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { blueprintBreadcrumbs, deepestCallerOnBlueprint } from '../call-stack-view'

describe('blueprintBreadcrumbs', () => {
  it('collapses same-graph subflow frames', () => {
    const crumbs = blueprintBreadcrumbs(
      'main', '主蓝图',
      [
        { blueprintId: 'main', title: '主蓝图' }, // 同图 subFlow
        { blueprintId: 'main', title: '主蓝图' }, // 仍在 main 再进 pack 前
        { blueprintId: 'pack', title: '战斗' },   // 若栈帧语义是 returnBlueprintId，见下
      ],
      'pack', '战斗',
    )
    // 正确语义：栈帧的 blueprintId = returnBlueprintId（caller 所在图）
    // crumbs = [main, pack] 当 active=pack
    expect(crumbs.map((c) => c.blueprintId)).toEqual(['main', 'pack'])
  })
})

describe('deepestCallerOnBlueprint', () => {
  it('picks deepest caller on pinned blueprint', () => {
    const stack = [
      { blueprintId: 'main', callerNodeId: 'turn' },
      { blueprintId: 'main', callerNodeId: 'combat' },
    ]
    expect(deepestCallerOnBlueprint(stack, 'main', 'pack')).toBe('combat')
    expect(deepestCallerOnBlueprint(stack, 'pack', 'pack')).toBeNull()
  })
})
```

面包屑算法（与 SPEC 对齐）：

```ts
export function blueprintBreadcrumbs(
  rootBlueprintId: string,
  rootTitle: string,
  callStack: ReadonlyArray<{ blueprintId: string; title?: string }>,
  activeBlueprintId: string,
  activeTitle: string,
): BlueprintCrumb[] {
  const out: BlueprintCrumb[] = [{ blueprintId: rootBlueprintId, title: rootTitle || rootBlueprintId }]
  for (const f of callStack) {
    const last = out[out.length - 1]
    if (last && last.blueprintId === f.blueprintId) continue
    out.push({ blueprintId: f.blueprintId, title: f.title || f.blueprintId })
  }
  const last = out[out.length - 1]
  if (!last || last.blueprintId !== activeBlueprintId) {
    out.push({ blueprintId: activeBlueprintId, title: activeTitle || activeBlueprintId })
  } else {
    last.title = activeTitle || last.title
  }
  return out
}

export function deepestCallerOnBlueprint(
  callStack: ReadonlyArray<{ blueprintId: string; callerNodeId: string }>,
  pinnedBlueprintId: string,
  activeBlueprintId: string,
): string | null {
  if (pinnedBlueprintId === activeBlueprintId) return null
  for (let i = callStack.length - 1; i >= 0; i--) {
    if (callStack[i]!.blueprintId === pinnedBlueprintId) return callStack[i]!.callerNodeId
  }
  return null
}
```

说明：栈帧 `blueprintId` = caller 所在图（`returnBlueprintId`）。进 pack 后栈顶帧是 `{ blueprintId: 'main', callerNodeId: 'combat' }`，`activeBlueprintId = 'pack'` → crumbs `主 › 战斗包`。

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/marketplace/extensions/wb-game-video && bunx vitest run src/editor/shell/__tests__/call-stack-view.test.ts
```

- [ ] **Step 3: Implement `call-stack-view.ts` as above**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**（默认跳过）

---

### Task 4: `GraphPlaySurface` — follow / pinned / 面包屑 / jump

**Files:**
- Modify: `src/editor/shell/GraphPlaySurface.tsx`
- 手工验收为主；可选浅测取图逻辑抽到纯函数则单测（非必须）

**Interfaces:**
- Consumes: `SessionSnapshot.activeBlueprintId` / `callStack`；`useGraphScenario` 的 `blueprints` 或 `scn().manifest.packs`；`blueprintBreadcrumbs` / `deepestCallerOnBlueprint`
- Produces: 浮层 UI 行为（无新导出）

- [ ] **Step 1: 改 session 构造，传入 rootBlueprintId**

`GraphPlaySurface` 里 `new GraphSession(...)` 时：
```ts
const st = useGraphScenario.getState()
const scn = st.scn() // 或 play 用的文档
const rootId = scn.manifest?.mainPackId ?? st.mainBlueprintId
const s = new GraphSession(scn, { rootBlueprintId: rootId })
```
确认试玩全量入口用的是主蓝图根（与今日 `scn()` 一致）。若此处实际用 `playScn()`，则 `rootId = st.activeBlueprintId` 或 play 根——与现调用对齐，**必须**把同一 id 传给 session。

- [ ] **Step 2: 本地 view 态 + 派生显示图**

```ts
const [viewMode, setViewMode] = useState<'follow' | 'pinned'>('follow')
const [pinnedBlueprintId, setPinnedBlueprintId] = useState<string | undefined>()

const packs = useGraphScenario((s) => s.blueprints) // Record<id, BlueprintDoc>
const rootBlueprintId = /* session 开跑根，可存 ref 或从 snap+栈推：栈空时 active 即 root */

const displayBlueprintId =
  viewMode === 'pinned' && pinnedBlueprintId
    ? pinnedBlueprintId
    : (snap?.activeBlueprintId ?? rootBlueprintId)

const displayGraph =
  packs[displayBlueprintId]?.graph
  ?? packs[rootBlueprintId]?.graph
  ?? graph // last-resort；正常不应落到编辑 store.graph 当唯一源

useEffect(() => {
  // follow：无需；pinned 时引擎 active 变也不自动 unpin（SPEC）
}, [snap?.activeBlueprintId])

const activeNodeId = (() => {
  if (!snap) return null
  if (displayBlueprintId === snap.activeBlueprintId) return snap.currentNodeId
  return deepestCallerOnBlueprint(snap.callStack, displayBlueprintId, snap.activeBlueprintId)
})()

const crumbs = snap
  ? blueprintBreadcrumbs(
      rootBlueprintId,
      packs[rootBlueprintId]?.title ?? rootBlueprintId,
      snap.callStack,
      snap.activeBlueprintId,
      packs[snap.activeBlueprintId]?.title ?? snap.activeBlueprintId,
    )
  : []
```

- [ ] **Step 3: 面包屑 UI +「跟随执行」**

在 `DraggablePanel` 标题旁或画布上方渲染：
- 每段可点 → `setViewMode('pinned'); setPinnedBlueprintId(id)`
- 按钮「跟随执行」→ `setViewMode('follow'); setPinnedBlueprintId(undefined)`
- 标题区分：follow 时 `蓝图状态机 · 跟随执行`；pinned 时 `蓝图状态机 · 回看`

- [ ] **Step 4: GraphCanvas 绑 displayGraph**

```tsx
<GraphCanvas
  graph={displayGraph}
  onChange={() => {}}
  overlays={overlays}
  activeNodeId={activeNodeId}
  traversedEdgeIds={displayBlueprintId === snap?.activeBlueprintId ? traversed : undefined}
  onJump={(nodeId) => {
    const packNode = displayGraph.nodes.find((n) => n.id === nodeId)
    const packRef = packNode ? getSubFlowPack(packNode.data) : undefined
    if (
      viewMode === 'pinned'
      && displayBlueprintId !== snap?.activeBlueprintId
      && packRef
      && snap?.callStack.some((f) => f.callerNodeId === nodeId)
    ) {
      setViewMode('follow')
      return
    }
    setSnap(sessionRef.current!.jump(nodeId, {
      blueprintId: displayBlueprintId,
      graph: displayGraph,
    }))
    setViewMode('follow')
  }}
  readOnly
/>
```

- [ ] **Step 5: 手工验收清单**

1. 试玩打开「蓝图」→ 进 nodia 战斗 pack → 浮层自动显示子蓝图节点高亮  
2. 面包屑点「主蓝图」→ 见 pack 容器高亮；点「跟随执行」回子图  
3. 子图内点节点 jump → 仍在子图 seek  
4. 同图子流程高亮不回归  

- [ ] **Step 6: Commit**（默认跳过）

---

### Task 5: `GraphStudio` 试玩高亮对齐（同一 bug）

**Files:**
- Modify: `src/editor/shell/GraphStudio.tsx`

**Interfaces:**
- Consumes: `snap.activeBlueprintId` / `snap.callStack` / `blueprints`
- Produces: 左侧画布在 `playOpen` 时显示执行图（或至少当 `activeBlueprintId !== activeBlueprintId(store)` 时用执行图覆盖高亮源）

- [ ] **Step 1: Session 构造传 rootBlueprintId**

```ts
const session = useMemo(() => {
  const st = useGraphScenario.getState()
  return new GraphSession(st.playScn(), { rootBlueprintId: st.activeBlueprintId })
}, [runKey, entitySig, activeBlueprintId, playNonce])
```

- [ ] **Step 2: playOpen 时画布图跟随执行（follow-only，不做 pinned UI）**

最小对齐（YAGNI：Studio 侧可不做面包屑，只 follow）：
```ts
const playGraph =
  playOpen && snap.activeBlueprintId
    ? (blueprints[snap.activeBlueprintId]?.graph ?? canvasGraph)
    : canvasGraph
// GraphCanvas graph={playGraph}
// activeNodeId / traversed / nameOf 基于 playGraph
```

注意：编辑时仍用 `canvasGraph`；仅 `playOpen` 时换执行图。不要 `selectBlueprint(snap.activeBlueprintId)`。

- [ ] **Step 3: jump 从 Studio 画布**

若 `playOpen` 且点击 jump：
```ts
sessionRef.current.jump(nodeId, {
  blueprintId: snap.activeBlueprintId,
  graph: playGraph,
})
```

- [ ] **Step 4: 手工点验** — Studio 试玩浮层开着时进子蓝图，左侧高亮跟着走

- [ ] **Step 5: Commit**（默认跳过）

---

### Task 6: 回归闸

- [ ] **Step 1: 跑相关单测**

```bash
cd packages/marketplace/extensions/wb-game-video && bunx vitest run \
  src/runtime/__tests__/engine.blueprint-follow.test.ts \
  src/runtime/__tests__/session.blueprint-follow.test.ts \
  src/editor/shell/__tests__/call-stack-view.test.ts \
  src/runtime/__tests__/engine.flow.test.ts
```

Expected: all PASS

- [ ] **Step 2: typecheck（可选但推荐）**

```bash
cd packages/marketplace/extensions/wb-game-video && bun run lint
```

- [ ] **Step 3: 对照 SPEC §1.3 成功标准勾选一遍**

---

## Spec 覆盖自检

| SPEC 要求 | Task |
|---|---|
| D2/D3 snapshot + CallFrame.returnBlueprintId | T1, T2 |
| D4 rootBlueprintId | T1, T2, T4, T5 |
| D5 浮层按 id 取图 | T4 |
| D6 follow/pinned | T4 |
| D7 面包屑折叠同图 | T3, T4 |
| D8 jump 可选 graph | T1, T4, T5 |
| D9 不拽编辑选中 | T4, T5 |
| D10 不改 callStack 寿命 | T1（只加字段） |
| GraphStudio 对齐 | T5 |
| 成功标准 1–6 | T4 手工 + T6 |

---

## 修订记录

| 日期 | 说明 |
|---|---|
| 2026-07-24 | 初稿：引擎位置字段 → snapshot → 纯函数 → Play 浮层 → Studio 对齐 |
