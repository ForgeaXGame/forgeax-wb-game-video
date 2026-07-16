# 边路由统一 · 迁移规格（wb-game-video）

> 状态：🟢 DONE（已落地） · 日期：2026-07-16
> 范围：`extensions/wb-game-video` 的 overlay 事件 → reactions → 边 路由模型。
> 目标：把散落的路由/副作用来源收敛成一条链，让 runtime 固定下来，新交互不再长新字段。

---

## 0. 一句话

**overlay 组件发事件（events）→ 节点 reactions 响应（do：effect / spawn / advance）→ 边负责去哪个节点。**
「响应」只有一处（reactions），「去哪」只有一处（edge），「能发什么」只有一处（events）。

---

## 1. 三层职责（SSOT）

| 层 | 写什么 | 不写什么 |
|----|--------|----------|
| **overlay 组件 `params.events`** | 会发出哪些事件（`id` + `label` + 展示扩展如 `x/y`） | effects、目标节点、走哪条边 |
| **node `reactions[].do`** | 事件/生命周期发生时做什么：`effect` / `spawn` / `advance(edgeId)` | 目标节点（`targetNodeId`） |
| **`edges[]`** | `sourceHandle`（= 事件 id）→ `target`（唯一去节点通道），可选 `condition` / `weight` | effects |

组件的 `resolve()`（判定哪个 outcome）、`render/present`、玩法 params（qteKind/cues/prompt/皮肤）仍属组件，不进 reactions。

---

## 2. 运行时路由算法（统一）

```
交互结算 / 生命周期 / 状态变化
  → 得到 event id（或 default）
  → 跑匹配的 reactions[].do：
       effect  → applyEffects
       spawn   → 刷出瞬态组件
       advance(edgeId) → 沿指定边 traverse
  → 若 do 未含 advance 且存在 sourceHandle===event.id 的出边 → 默认 advance（先连线糖 / 边池）
  → 无 advance 且无匹配边 → 只做副作用，不换节点
```

- **auto 推进**（播完）：event = `default`；在 `default` 边池按 `condition` → `weight` 取一条。
- **同一 event 多条边**：`advance(edgeId)` 精确指定；未指定则回退「同 handle 边池 + condition」。
- **状态硬打断**：`when:{type:'state'}` 的 `do` 里显式 `advance(edgeId)`（不再 `goto targetNodeId`）。

---

## 3. Schema 变更

### 3.1 保留字：`out` → `default`
### 3.2 事件目录字段统一：`params.events`（不兼容旧 `exits`/`options`/`hotspots`）
### 3.3 去协议前缀：`opt:` / `hs:` / `cond:`
### 3.4 `NodeAction` 新增 `advance`，废 `goto`

```ts
type NodeAction =
  | { kind: 'effect'; effects: GraphEffect[] }
  | { kind: 'spawn'; from: string; params?: ...; layout?: ...; ttlMs?: number }
  | { kind: 'advance'; edgeId: string }
```

---

## 4. 三处旁路 → 目标形态

| # | 当前旁路 | 目标形态 |
|---|----------|----------|
| 1 | `resolve().effects` | **彻底移除**；作者副作用一律 `reactions.do`（continue 内部累积除外） |
| 2 | 走向由引擎隐式选边 | reactions.do 里 `advance(edgeId)`；保留「有边默认 advance」兜底 |
| 3 | 两派发路径对 `do` 处理不一致 | 两路径共用 effect/spawn/advance；`emitComponentEvent` **允许 advance 换节点** |

---

## 5. 已确认（全部锁定，2026-07-16）

- **不考虑旧数据兼容**：破坏式一刀切，无 shim。
- `resolve().effects` **彻底移除**。
- 同一 event 多条边：**允许省略 `edgeId`**，回退「同 handle 边池 + condition」。
- state 打断：**强制显式 `advance(edgeId)`**。
- 非阻塞 `emitComponentEvent`：**允许 `advance` 换节点**。
- `out` → `default`；路由信号统一为 event；overlay 只发事件。
- 有边则默认 advance（仅交互/生命周期事件，不含 state）。
- `advance` 带 `edgeId`，目标只在边；effects 收敛进 reactions。

---

## 6. 落地后的作者可见性（2026-07-16）

**单边事件应写出 `advance.edgeId`**，让 reactions / Inspector 一眼看到「去哪个节点」；运行时仍保留「有边默认 advance」兜底。

编辑器同步：

- 连非 `default` 边且该 handle **仅一条边**：回填或新建含 `advance` 的 event reaction（挂到已有 event 反应的挂载，避免写到 HUD）。
- 同 handle **多条边**：去掉独占 `advance`，走边池；Inspector 显示 `→ A | B（边池）`。
- Inspector 每个事件行展示「沿边推进 / 默认推进 → 目标」。

Demo（`nodia.graph.json`）：叙事/QTE/技能单边出口已写显式 advance；`light`/`heavy` 双权边保持无 advance（边池）。

---

## 7. ComponentEvent 边界（补丁）

`ComponentEvent` **只含** `id` / `label?` / `payload?`。

| 扩展 | 归属 | 类型 |
|------|------|------|
| 选项门控 `condition` | choice/skill 组件 params | `ChoiceOption` |
| 热区锚点 `x`/`y` | hotspot 组件 params | `HotspotSpot` |

选项门控（方案 B）：落盘只有 `condition`；皮肤用 `isOptionLocked` + `SkinCtx`（hud / runtime.state）时时求值，引擎**不**注入 `_locked`。
