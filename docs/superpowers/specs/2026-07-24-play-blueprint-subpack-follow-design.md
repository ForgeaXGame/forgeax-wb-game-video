# wb-game-video · 试玩蓝图浮层：子蓝图执行跟随

> 状态：🟢 SPEC（已定稿，待实现）  
> 日期：2026-07-24  
> 读者：实现本能力的开发 / AI agent  
> 范围：试玩「蓝图」浮层跟随跨图 `subFlowPack` 执行；`SessionSnapshot` 暴露当前蓝图与调用栈；面包屑回看父图；跨图 jump。  
> 不做：把子蓝图节点 inline 进父图；双栏/画中画；面包屑展示同图 `subFlow` 帧；试玩时改动编辑器库「当前选中蓝图」。  
> 相关：[`2026-07-21-blueprint-library-folder-management.md`](./2026-07-21-blueprint-library-folder-management.md)；[`node-runtime-spec.md`](../../node-runtime-spec.md)（callStack / descend）；[`2026-07-24-bgm-runtime-scope-stack-design.md`](./2026-07-24-bgm-runtime-scope-stack-design.md)（共用 callStack 寿命，本能力只读暴露）。

一句话：**调试视图缺的不是高亮，而是「当前在哪张蓝图」；默认跟随执行图，面包屑可钉住回看父图。**

---

## 1. 背景与目标

### 1.1 产品语义

- 同图子流程（`subFlow`）：成员节点在同一张图里，试玩高亮本来就能看见跑到哪。
- 跨图子蓝图（`subFlowPack`）：本体在 `manifest.packs`，引擎 `descend` 时 `switchGraph`；今日试玩「蓝图」浮层仍渲染编辑器 `store.graph`（多半是主图），`currentNodeId` 对不上 → 看起来像「进了子蓝图就没进度」。
- 目标体验（选项 3）：**默认跟随**进子蓝图看内部进度；同时用**调用栈面包屑**随时回看父图上的容器上下文。

### 1.2 现状缺口

| 层 | 现状 |
|---|---|
| `GraphRuntime` | 有 `activeGraph` + `callStack: { callerNodeId, returnGraph }`，无蓝图 id |
| `SessionSnapshot` | 只有 `currentNodeId` / `traversedEdgeIds`，无 `activeBlueprintId` / 栈帧 |
| `GraphPlaySurface` | 蓝图浮层：`graph={store.graph}`，与执行图脱钩 |
| `jumpToNode` | 总是 `switchGraph(rootGraph)` + 清栈；子蓝图内点节点会错 |

### 1.3 成功标准

1. 主图进入 `subFlowPack` → 浮层自动显示子蓝图，当前节点高亮正确。
2. 子蓝图内推进 → 高亮跟随；弹回父图 → follow 下自动回父图并高亮续跑节点。
3. 面包屑点父层 → 见父图且容器呈「已下钻」高亮；点「跟随执行」回到子图当前节点。
4. 子蓝图内 jump → 在该图内 seek，不再误切 `rootGraph`。
5. 同图 `subFlow` 不回归。
6. 单测覆盖 snapshot 字段与 pack 进出、可选参 jump。

---

## 2. 已锁定决策

| # | 决策 | 说明 |
|---|---|---|
| D1 | 方案 A：执行跟随 + 调用栈面包屑 | 非「仅父图高亮容器」、非双栏 |
| D2 | Snapshot 暴露位置 | `activeBlueprintId` + `callStack: CallStackFrameSnap[]` |
| D3 | `CallFrame` 补 `returnBlueprintId` | UI/日志用稳定 id；`returnGraph` 保留给引擎弹回 |
| D4 | 根蓝图 id | session 开跑时记下 `rootBlueprintId`（「从此试玩」可以是子蓝图，≠ 永远 main） |
| D5 | 浮层数据源 | 按 id 从 `manifest.packs` / `blueprints` 取图；**不**用编辑选中 `store.graph` |
| D6 | 视图模式 | `follow`（默认）\| `pinned`；显式「跟随执行」回 follow |
| D7 | 同图 subFlow | 面包屑**不**多一层蓝图名；本期专治跨图 pack |
| D8 | Jump | 缺省保持今日「清栈回 root」；Play 传入当前查看图则在该图内 seek |
| D9 | 不拽编辑焦点 | 试玩跟随**不**改 `activeBlueprintId`（store 编辑选中） |
| D10 | 与 BGM 栈 | 共用引擎 `callStack` 寿命；本能力只读暴露，不改 push/pop 时机 |

---

## 3. 数据面（引擎 → Snapshot）

### 3.1 CallFrame 增量

```ts
export interface CallFrame {
  callerNodeId: string
  returnGraph: GameGraph
  /** 压栈时所在蓝图 id；根图 = session 的 rootBlueprintId */
  returnBlueprintId: string
}
```

`descend` 时：

- 同图 `subFlow`：不改 `activeBlueprintId`，压栈且 `returnBlueprintId = 当前蓝图`。
- 跨图 `subFlowPack`：`switchGraph(pack.graph)` 且 `activeBlueprintId = pack.id`（与 `manifest.packs` 键一致；版本钉死仍用 id，解析走现有 `resolvePack`）。

### 3.2 SessionSnapshot 增量

```ts
export interface CallStackFrameSnap {
  blueprintId: string   // caller 所在蓝图
  callerNodeId: string
  title?: string        // 蓝图标题，面包屑用
}

export interface SessionSnapshot {
  // ...existing...
  /** 引擎当前执行图所属蓝图 */
  activeBlueprintId: string
  /** 从外到内；空 = 在开跑根图 */
  callStack: CallStackFrameSnap[]
}
```

- `visited` / `traversedEdgeIds`：仍按**当前 activeGraph** 暴露（与今日一致）。
- 面包屑回看父图时：父图高亮用该层 `callerNodeId`，不假装父图边的 traversed。
- `title`：session 从 `manifest.packs[id].title` 填充；缺失则用 id。

### 3.3 失败回退

- `activeBlueprintId` 在 packs 中找不到 → 浮层回退开跑根图 + 日志一行，不崩。
- 跨蓝图节点 id 撞名 → 只在**当前显示图**内解析，不跨图猜。

---

## 4. 蓝图浮层 UI

### 4.1 本地状态

```ts
viewMode: 'follow' | 'pinned'
pinnedBlueprintId?: string  // 仅 pinned
```

| 模式 | 画布图 | activeNodeId |
|---|---|---|
| follow | `packs[snap.activeBlueprintId].graph` | `snap.currentNodeId` |
| pinned 且 == active | 同上 | `snap.currentNodeId` |
| pinned 且为栈中父图 | 该 `blueprintId` 的图 | 对应帧的 `callerNodeId`（「已下钻」容器态） |

- 引擎 `activeBlueprintId` 变化：follow → 跟过去；pinned → 保持钉住，直到用户点「跟随执行」。
- 容器「已下钻」可用现有徽标/描边与「正在执行的叶子」区分（实现时复用 GraphCanvas 既有 active 样式即可，必要时加 `activeKind: 'executing' | 'descended'`）。

### 4.2 面包屑

示例：`主蓝图 › 战斗包 › 敌方回合`（外 → 内）。

- 点非末段 → `pinned` 到该 `blueprintId`。
- 点末段或「跟随执行」→ `follow`。
- 过长：`主 › … › 当前`，点 `…` 展开。
- 「从此试玩」以子蓝图为根：面包屑从该根开始，不假装有 main。
- **面包屑按蓝图 id 去重折叠**：snapshot 仍投影完整引擎 `callStack`（含同图 `subFlow` 帧）；UI 生成面包屑时合并连续相同 `blueprintId`，故同图子流程**不**多出一层蓝图名。pinned 回某蓝图时，高亮该 id 上**最深一帧**的 `callerNodeId`（例如 main 内先下钻回合再进 pack → 回看 main 时高亮 pack 容器，不是外层回合容器）。

### 4.3 Jump

| 场景 | 行为 |
|---|---|
| 查看图 == 开跑根图，点节点 | 保持现语义：清栈、回根、jump |
| 查看图 == 某子蓝图，点该图节点 | 以该图为执行根 jump：`switchGraph(该图)`、清栈、`enterNode`（不再强制 `rootGraph`） |
| pinned 父图、点非容器节点 | 以该父图为根 jump |
| pinned 父图、点正在下钻的 pack 容器 | 不 seek；切到 follow / 进入子图预览 |

API 方向：

```ts
jumpToNode(id: string, opts?: { resetGlobals?: boolean; graph?: GameGraph; blueprintId?: string })
```

- 缺省 = 今日行为（旧单测零改）。
- Play 浮层传入当前查看图（或 `blueprintId`）。

### 4.4 同图子流程

- 节点仍在同一张图；试玩浮层 **readOnly 全图显示**（不套编辑器 `drillStack` 隐藏成员）。
- 最低要求：跨图 pack 正确；全图已渲染则子流程零改动。

### 4.5 改动面

- 必改：`engine.ts`（CallFrame / activeBlueprintId）、`session.ts`（snapshot）、`GraphPlaySurface`（浮层）。
- 顺手：`GraphStudio` 试玩高亮若同样钉死 `store.graph`，对齐同一套 snapshot 字段；**不**重做 Studio drillStack。
- 不改：编辑库选中随试玩跳动。

---

## 5. 与 BGM callStack

- 共用同一条引擎 `callStack` 寿命，不另造调试栈。
- BGM（若已合入）仍读 caller 节点 `data.bgm`；本能力只增加 `returnBlueprintId` 与 snapshot 投影。
- 实现可先于或并行 BGM；**不依赖** BGM 字段；勿分叉第二套栈。

---

## 6. 实现落点（指引，非任务拆解）

| 区域 | 方向 |
|---|---|
| `engine.ts` | `activeBlueprintId`；`CallFrame.returnBlueprintId`；descend/pop/start/jump 维护 |
| `session.ts` | snapshot 填 `activeBlueprintId` / `callStack`（含 title）；`jump` 透传 graph/blueprintId |
| `GraphPlaySurface.tsx` | follow/pinned；面包屑；按 id 取图；jump 带当前查看图 |
| `GraphStudio.tsx`（可选对齐） | 试玩高亮用 snapshot 的执行图，而非仅 `store.graph` |
| 单测 | snapshot 进出 pack；jump 带 graph；同图 subFlow 不回归 |

无新落盘 schema；不改 `scenarios.graph.json` 形状。

---

## 7. 风险与测试要点

| 风险 | 缓解 |
|---|---|
| 浮层仍绑 `store.graph` | 验收清单第 1 条；code review 盯数据源 |
| jump 默认清回 root 漏改 Play 调用点 | Play 必传查看图；单测子图 jump |
| pinned 时引擎推进用户困惑 | 标题区分「跟随 / 回看」；显式「跟随执行」 |
| 多层面包屑过长 | 中间缩略 |
| 与编辑选中混淆 | D9：不写 store.activeBlueprintId |

最低单测：

1. start 后 `activeBlueprintId === rootBlueprintId`，`callStack` 空  
2. 进入 subFlowPack → `activeBlueprintId === pack.id`，栈顶帧含 caller + 父 blueprintId  
3. 弹回 → 恢复父 `activeBlueprintId`，栈缩短  
4. `jumpToNode(id, { blueprintId: pack.id })` 在 pack 图内 seek，不依赖 root 节点表  
5. 同图 subFlow：`activeBlueprintId` 不变；`callStack` 可加深；面包屑蓝图名层数不变；`currentNodeId` 仍在同图可解析  


---

## 8. 修订记录

| 日期 | 说明 |
|---|---|
| 2026-07-24 | 初稿定稿：方案 A；snapshot 位置字段；follow/pinned；跨图 jump；与 BGM 共栈只读 |
| 2026-07-24 | 自检：明确面包屑按 blueprintId 折叠；pinned 高亮同图最深 caller |
