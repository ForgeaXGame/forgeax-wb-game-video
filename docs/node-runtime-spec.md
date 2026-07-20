# 节点运行时标准化：NodeKind 契约 + 注册表

> 状态：🟢 SPEC（已定稿，实施中）· 2026-07-20
> 目标：把「节点如何执行」从引擎里一段硬编码分支流程，收敛成 **NodeKind 契约 + 注册表**；
> 引擎只做**调度 + 跨节点状态**；新增节点类型 = 在 `runtime/nodes/` 加一个文件 + 注册，即按规范执行。
> 与「组件 = manifest + 注册表」同构。

## 定稿决策（评审通过）
- **契约 = `execute` + 可选 `next`**（合并原 enter/tick/onEnd）；`tick`(at/window) 留引擎通用层，不入契约。
- **接口 + 注册表（组合）**，非 class 继承；`next` 缺省 = advance 由引擎兜。
- **扩展走 `NextIntent` / `ctx`**，不靠加方法。`NextIntent = advance | await | descend{entry,graph?} | return | end`。
- **`ctx` 全量可读写 state**（改全局/变量/实体）；引擎用**写屏障**（execute 前 seedWatch、后 checkRules）保一致。
  节点**不碰** callStack/phase/redirect/走边，只返回意图。
- **判别符 = `GameNode.type`**（不新增 `NodeData.type`）：`resolveNodeType` 现按 `subFlow/subFlowPack` 数据派生
  perf/subflow/subflowPack；以后往 `GameNode.type` 加真类型是**叠加式**（回退 perf、老图零影响，届时按 AGENTS.md 征同意改 schema）。
- **subflowPack 保持现状**：同引擎 + `switchGraph` 到 pack 图 + `callStack` 弹回、**共享态**（不起新 flow 实例）；
  参数化需求走「共享变量传参」轻约定。
- **代码组织**：节点实现放 `src/runtime/nodes/`（每类型一文件 + `index.ts` 注册）；依赖单向 `engine → nodes`。

## 实施状态
- ✅ 阶段 1：`runtime/nodes/`（`node-kind.ts` 契约+注册表+`resolveNodeType` / `perf.ts` / `subflow.ts` / `subflow-pack.ts` / `index.ts`）已建，纯新增、tsc+测试绿。
- ⏳ 阶段 2：把 `engine.ts` 的 `enterNode` 顶部分支 + perf 块改为「`registry.resolve(node).execute(ctx)` → 按 NextIntent 调度」；`onPerformanceEnd` → `kind.next`。行为不变，用现有 e2e 护栏。
- ⏳ 阶段 3：回归全绿 + 文档化「加新节点类型」。

---

## 1. 现状（as-is，`src/runtime/engine/engine.ts`）

- **节点只有一种 type**：`GameNodeType = 'perf'`。所谓「子流程容器 / 子蓝图容器」不是独立 type，而是
  `NodeData` 的数据变体（`subFlow` / `subFlowPack`，用 `getSubFlow` / `getSubFlowPack` / `isSubflowContainer` 读）。
- **执行流程散在引擎几个方法里，按 data 分支**（非按类型注册）：
  - `enterNode(id)`：防跑飞 → 分支（subFlowPack 下钻 / subFlow 下钻 / 容器弹回不重播）→ 普通节点：重置本节点态
    （fired/windows/spawn/watch 基线）→ `playClip`（换片清叠层）→ `setPhase('playing')` → 跑 `enter` 元素（先表现层后交互）
    → `enter` 相位 reactions 副作用 → 交互则挂起(`awaitInteraction`)；否则瞬时节点立即 `advanceAuto`。
  - `tick(ms)`：`at` 反应 + `window` 时段显隐。
  - `onPerformanceEnd()`：演出/时长结束 → `advanceAuto`。
  - `advanceAuto()`：`complete` 反应副作用 → `selectAutoEdge`（默认边，多条按权重）→ traverse / 弹栈返回 / `finishEnd`。
  - 跨节点调度态：`callStack`（子流程返回）、`redirect`+`consumeRedirect`（state 规则/交互 advance 的硬打断）、
    `phase`、`returningTo`（容器弹回跳过再下钻）、`checkRules`（写屏障后求值 state 反应）。

**痛点**：加一种「新节点行为」要改 `enterNode` 的 `if` 分支，不是「注册即用」；节点行为与引擎调度耦合在一起。

## 2. 目标模型（to-be）

### 2.1 关注点切分（关键）

引擎分两层：

- **调度层（引擎保留，跨节点、不下放）**：`callStack` 压/弹、`redirect` 抢占与 `consumeRedirect`、`phase` 迁移、
  `traverse`/`selectAutoEdge`/`pickWeighted`（走边）、`switchGraph`、`checkRules`（state 反应）、`seedWatch`、
  `runExit`、防跑飞 guard、指令队列 `emit/drain`。
  > 这些是**跨节点的编排逻辑**，天然不属于「单个节点」，必须留在引擎。
- **节点类型层（NodeKind，可注册、可插拔）**：只描述「本类型进入时干什么、时间推进时干什么、想怎么往下走」。

### 2.2 NodeKind 契约（草案）

```ts
interface NodeRuntimeCtx {
  node: GameNode
  state: MutableState
  elapsedMs: number
  emit(d: RuntimeDirective): void          // 发 playClip / renderOverlay / openInteraction…
  runElement(el: OverlayInstanceChild): void
  childrenOf(node): OverlayInstanceChild[]
  // 只读调度信息（不让节点直接改栈/相位）
}

/** next 的意图：由引擎据此走边 / 弹栈 / 挂起 / 结束（节点不自己动栈与相位）。 */
type NextIntent =
  | { kind: 'advance' }       // 沿默认出边推进（引擎 selectAutoEdge → traverse）
  | { kind: 'await' }         // 挂起等交互/时钟（awaitInteraction）
  | { kind: 'descend'; entry: string; graph?: GameGraph }  // 下钻子流程/子蓝图（引擎压栈+切图）
  | { kind: 'return' }        // 弹回 caller（引擎 pop callStack）
  | { kind: 'end' }           // 结束本局

interface NodeKind {
  type: string                                   // 节点类型 id（注册键）
  enter(ctx: NodeRuntimeCtx): NextIntent | void  // init + 首帧 execute；返回意图或 void(=引擎按默认判定)
  tick?(ctx: NodeRuntimeCtx, ms: number): void   // 时间线 execute（at/window 已在引擎通用层，可选补充）
  onEnd?(ctx: NodeRuntimeCtx): NextIntent | void // 演出/时长结束
  next?(ctx: NodeRuntimeCtx): NextIntent         // 没被 redirect 抢占时，如何往下
}
```

> 说明：`redirect`（state 规则 / 交互 `advance`）永远**抢在** NodeKind 的 next 之前——由引擎 `consumeRedirect` 处理，
> NodeKind 不感知。这样「硬打断」逻辑集中一处，不散进各类型。

### 2.3 三个内置 NodeKind（把现状无损映射进去）

| type | enter | onEnd / next |
|---|---|---|
| `perf`（演出/交互） | 重置本节点态 → `playClip` → 跑 enter 元素 → 有交互 `{kind:'await'}`；瞬时(无 media/duration/interaction) `{kind:'advance'}` | onEnd → `{kind:'advance'}` |
| `subflow`（同图子流程容器） | `{kind:'descend', entry: getSubFlow(data)}`；弹回态 → `{kind:'advance'}` | — |
| `subflowPack`（跨图子蓝图容器） | `{kind:'descend', entry, graph: pack.graph}`；弹回态 → `{kind:'advance'}` | — |

## 3. 现状 → 目标 映射表

| 现有代码 | 去向（已落地） |
|---|---|
| `enterNode` 防跑飞 / 认领当前节点 / 清弹回标记 / elapsedMs 原点 | **引擎调度层**（execute 前的公共入场） |
| `enterNode` 重置态 / seedWatch / playClip / phase | 下放为 `ctx.beginPerform()`（perf 调）/ `ctx.beginResume()`（容器弹回调） |
| `enterNode` 里 subFlowPack/subFlow 分支 | `subflowPack.execute` / `subflow.execute` 返回 `descend` |
| `enterNode` 普通节点跑 enter 元素 + 瞬时判定 | `perf.execute`（跑元素 → 返回 await / advance） |
| `tick` 的 at/window | 引擎通用 tick（保留）；NodeKind.tick 可选扩展（暂未加） |
| `onPerformanceEnd → advanceAuto` | 引擎调 `NodeKind.next` → 得 NextIntent → `runIntent` 执行（缺省 advance） |
| `advanceAuto`（complete 反应 + selectAutoEdge + 弹栈/finishEnd） | **引擎调度层**；`runIntent` 分发 NextIntent：advance→advanceAuto、descend→pushCall/switchGraph/enter、end→finishEnd |
| `callStack` / `redirect` / `checkRules` / `consumeRedirect` / `traverse` / `switchGraph` | **引擎调度层**（不下放） |
| `returningTo`（容器弹回跳过下钻） | 引擎调度层；`ctx.returning` 供容器 execute 决定 `advance` vs `descend` |

## 4. 落地路径（二选一，涉及 schema 的要你点头）

- **路径 A（不改 schema，推荐先做）**：节点**派生**出 runtime 类型 = 引擎内一个纯函数
  `resolveNodeKind(node) → 'perf'|'subflow'|'subflowPack'`（读 `getSubFlow`/`getSubFlowPack`），注册表按它派发。
  `graph-schema.ts` 的 `GameNodeType` **不动**，落盘数据不变。先把 enterNode 重构成「引擎调度 + 三个 NodeKind」。
- **路径 B（改 schema）**：给 `GameNode.type` 扩成真正的多类型（`perf | subflow | pack | …`），落盘直接带 type。
  更直白，但**要改 `graph-schema.ts` + 迁移 demo/存档数据**——需你专门同意。

> 建议 A 先行：先把执行标准化落地、可注册；是否把 type 写进 schema 作为后续单独决策。

## 5. 分阶段 & 落地状态（每阶段 tsc + vitest 必须绿）

1. ✅ 定义 `NodeKind` / `NextIntent` / `NodeRuntimeCtx` + `NodeKindRegistry` + `resolveNodeType`（`runtime/nodes/node-kind.ts`）。
2. ✅ `enterNode` 拆成「引擎调度骨架 + `nodeCtx` + `runIntent`」+ 调 `kind.execute`；`perf` / `subflow` / `subflowPack` 三内置类型放 `runtime/nodes/`（路径 A `resolveNodeType` 派发，回退 `perf`）。
3. ✅ `onPerformanceEnd` 改为「取 `kind.next` → NextIntent → `runIntent`」；`advanceAuto` 保持引擎调度层。
4. ✅ 回归：`tsc --noEmit` clean；runtime 单测 **137/0**、editor 62/0、graph 20/0 全绿（整套 219 pass，唯 4 个 `injectStyle` DOM-env 失败为改动前既有，与本方案无关）。`runtime/nodes` 层另有 `__tests__/node-kinds.test.ts` 锁派发规则。
5. 新节点类型 = `runtime/nodes/<type>.ts` 实现 `NodeKind` + 在 `runtime/nodes/index.ts` 的 `CORE_NODE_KINDS` 登记（届时按需扩 `GameNodeType`）。

> **写屏障**：内置 kind 的所有副作用都经 `runElement` / `applyEnterReactions` 走既有屏障（`applyAndReact → checkRules/checkWatch`），`beginPerform` 内 `seedWatch()` 为前屏障。引擎**不**在 `execute` 外围无条件补 `checkRules()`——否则 `visited.add(id)` 等入场副作用会让依赖 `visited` 的 state 规则比旧逻辑更早命中，破坏 1:1 parity。将来加「直接改 state 的自定义节点」时，经受控 `ctx.mutate`（带屏障）表达，不在调度层无条件 checkRules。

## 6. 风险与非目标

- **风险**：`callStack` 弹回、`redirect` 抢占、`awaitInteraction` 挂起、`returningTo` 不重播——这几处跨节点状态最容易在拆分时出错；
  务必**留在引擎调度层**，NodeKind 只返回意图，不直接改栈/相位。以现有 e2e 为护栏，逐阶段验证。
- **非目标**：不改组件（kind/component）体系；不改 overlay/inputs 契约；不引入运行时对 `component`/`inputs` 的新读法。
- **判定权**：交互判定仍在皮肤（emit 事件）——本方案只标准化「节点」这一层，不回退组件层的决策。

## 7. 决策记录（已定）
1. **路径 A**（`resolveNodeType` 从 `data` 派生 subflow/subflowPack，否则用 `node.type`，回退 `perf`）。`GameNodeType` 已改为**开放联合**、合法集合以 `NodeKindRegistry` 为 SSOT（详见 §8）——加节点无需回改 schema。
2. 「调度层 vs NodeKind 层」切分已按 §2.1 落地：跨节点态（callStack/redirect/phase/returningTo/走边/切图）留引擎，节点只返回意图。
3. `NextIntent` 收敛为 **advance / await / descend**：删去 `return` 与 `end`——**结束与弹回都由 `advance` 自然涌现**（`advanceAuto` 无出边时：有栈 pop 弹回 caller、栈空 `finishEnd` 结束本局）。「能走到哪就停在哪」，节点不显式发结束/弹回意图。将来有真实消费者再按需扩。

## 8. 自定义节点类型（路径 A，已开口子）
- ✅ `GameNodeType = 'perf' | (string & {})`（开放联合，`graph-schema.ts`）；合法集合 SSOT = `NodeKindRegistry`。
- ✅ `isGameGraph` 浅守卫放宽为「type 为非空字符串」；`validate.ts` 据 `defaultNodeKindRegistry` 查未知 type（`node.type.unknown`，fail-loud）。
- ✅ 加内置节点 = `runtime/nodes/<type>.ts` 实现 NodeKind + 入 `CORE_NODE_KINDS`；引擎经 `createCoreNodeKindRegistry` 自动派发，无需改 schema/引擎。
- 授权/创建入口（画布新建该类型节点：`graph-edit.ts` / `GraphCanvas.tsx` / `GraphStudio.tsx` 的出厂 `type`）仅在要 UI 编排时才加。
- 第三方（非内置）插件节点的注册表注入：待有需求再做。

## 9. 尚未落地（有意延后，需要时再做）
- **`NodeKind.tick`**：at/window 触发目前是引擎全局逻辑；自定义节点定制「时间驱动」行为的可选钩子未加。
- **引擎触发的异步（LLM/加载）suspend/resume**：保持同步核心，将来经「命令 directive + `resume(token)`」表达（见宿主已有的 `performanceEnd`/`tick`/`submit` 恢复模式），不把 `execute`/`next` 改 async。
