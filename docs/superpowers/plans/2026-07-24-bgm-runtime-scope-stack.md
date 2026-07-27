# BGM 作用域栈 Implementation Plan

> [!CAUTION]
> **状态：SUPERSEDED（2026-07-27）—— 本文档的 BGM 语义整体作废，只作历史实现记录读。**
>
> 语义 SSOT 一律以 [`../specs/2026-07-24-bgm-runtime-scope-stack-design.md`](../specs/2026-07-24-bgm-runtime-scope-stack-design.md)
> 的 **v2** 为准（同一份 SPEC 已改版；见其 §10 修订记录）。本计划写的是**初版**：节点层的寿命
> 绑在节点上，离开节点就 pop。v2 把它整个翻过来了——**配了就一直播**（D5），离开节点不是结束信号。
>
> 因此本文中下列内容**与代码和 SPEC 相反，不要照着改代码**：
> - 栈 API `popIfOwner`（现已不存在；结束只有 `stop()` 与 `clear()` 两条）
> - 「`popIfOwner(B) → 回到 A`」「普通节点离开 → `popIfOwner`」这类离场即 pop 的时序
> - `BgmStackFrame` 带 `mode`（帧上不再记 mode）、`NodeBgm.ref` 必填且无 `stop`
> - Task 6 的校验规则「`mode` ∈ push|replace」（现为 push|replace|**stop**）
>
> 仍然有效的只有非语义部分：文件结构、资产落盘（决策 A）、测试落点这些实现记录。
> **不重写下面的任务清单**——它记录的是当时按初版做了什么，不是今天该做什么。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **Spec SSOT:** [`../specs/2026-07-24-bgm-runtime-scope-stack-design.md`](../specs/2026-07-24-bgm-runtime-scope-stack-design.md)

**Goal:** 在 wb-game-video runtime 落地跨节点 BGM 作用域栈：`doc.bgm` + `node.data.bgm`，与 `callStack` 对齐的 push/pop，音频资产进 `assets/manifest`（`kind: 'audio'`），Play 壳可真实播放。

**Architecture:** 纯 TS `BgmStack` 管栈语义；`GraphRuntime` 在 start / descend / 普通节点 enter-leave / callStack pop 发 `bgm` directive；`GraphSession` 暴露当前床轨快照；Play 壳用独立 `<audio>` + `resolveAsset` 播。引擎只传 id，不进 URL。

**Tech Stack:** TypeScript · vitest · 现有 `GraphRuntime` / `GraphSession` / `GamePlayer` · `assets/manifest` media registry

## Global Constraints

- SSOT：仅 `GameScenario.bgm?` + `NodeData.bgm?`；**不读** `BlueprintDoc.bgm`
- 不新增 `type: 'bgm'` 节点；不做时间轴床轨 clip；不做 duck/sting；不做 Trigger/`at` 卡点
- Pop 仅当 owner 作用域结束；任意 `callStack.pop` 不得一律 pop BGM
- returning 容器路径不得二次 push
- 资产决策 A：`MediaKind` 含 `audio`；不以 `wb-bgm` 的 `audio/` 为 play SSOT
- Schema 已有本 SPEC 作目标形态同意书；实现时改 `graph-schema.ts`
- **提交：非用户明确要求不 commit**（下列 Commit 步骤默认跳过）

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/runtime/schema/graph-schema.ts` | `DocumentBgm` / `NodeBgm`；`GameScenario.bgm`；`NodeData.bgm`；可选 `getNodeBgm` |
| `src/runtime/engine/bgm-stack.ts` | 纯栈：apply/push/replace/pop/clear；续播规则 |
| `src/runtime/engine/directives.ts` | `BgmDirective`（setTop / clear）加入 `RuntimeDirective` |
| `src/runtime/engine/engine.ts` | 挂生命周期钩子；emitting bgm directives |
| `src/runtime/engine/session.ts` | 应用 bgm directive → `bgm` 快照字段 |
| `src/runtime/play/BgmPlayer.tsx`（或内联 GamePlayer） | `<audio>` 播栈顶；resolveAsset |
| `src/runtime/play/GamePlayer.tsx` | 挂 BgmPlayer；传入 resolveAsset |
| `src/editor/assets/registry-types.ts` | `MediaKind` += `'audio'` |
| `src/editor/shell/media.ts` | resolve 路径接受 audio（与 video 同构即可） |
| `src/runtime/validate/validate.ts`（或现有 validate 入口） | ref / volume / mode 校验 |
| `src/runtime/__tests__/bgm-stack.test.ts` | 栈纯函数单测 |
| `src/runtime/__tests__/engine.bgm.test.ts` | 引擎钩子 + 栈序 e2e（合成图） |
| `src/editor/shell/NodeInspector.tsx`（或邻近表单） | 节点 `data.bgm` 最小编辑 |
| 场景/游戏设置 UI（现有 inspector 入口） | `doc.bgm` 最小编辑 |
| Demo（可选后置） | `combat` subFlowPack 拆分；本 plan 以合成图单测为硬验收 |

不改时间轴 `MaterialTimeline` / `AudioItem` 落盘模型。

---

### Task 1: Schema — `DocumentBgm` / `NodeBgm`

**Files:**
- Modify: `src/runtime/schema/graph-schema.ts`
- Test: `src/runtime/__tests__/bgm-schema.test.ts`（浅类型/helper 测即可）

**Interfaces:**
- Produces:
  - `export interface DocumentBgm { ref: string; volume?: number; fadeInMs?: number; loop?: boolean }`
  - `export interface NodeBgm { ref: string; mode?: 'push' | 'replace'; volume?: number; fadeInMs?: number; fadeOutMs?: number; restart?: boolean }`
  - `GameScenario.bgm?: DocumentBgm`
  - `NodeData.bgm?: NodeBgm`
  - `export function getNodeBgm(d: GameNodeData): NodeBgm | undefined`

- [ ] **Step 1: Write failing helper test**

```ts
import { describe, expect, it } from 'vitest'
import { getNodeBgm, type NodeData } from '../schema/graph-schema'

describe('getNodeBgm', () => {
  it('returns undefined when missing', () => {
    expect(getNodeBgm({ name: 'x' })).toBeUndefined()
  })
  it('returns bgm when present', () => {
    const d: NodeData = { name: 'c', bgm: { ref: 'bgm-battle', mode: 'push' } }
    expect(getNodeBgm(d)?.ref).toBe('bgm-battle')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**（`getNodeBgm` / `bgm` 尚不存在）

```bash
cd packages/marketplace/extensions/wb-game-video && bunx vitest run src/runtime/__tests__/bgm-schema.test.ts
```

- [ ] **Step 3: Add types + helper on `NodeData` / `GameScenario`**

按 SPEC §3.1–3.2 原样加入；`getNodeBgm` 读 `(d as NodeData).bgm` 且校验 `ref` 为非空 string。

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**（默认跳过）

---

### Task 2: 纯 `BgmStack` + 单测

**Files:**
- Create: `src/runtime/engine/bgm-stack.ts`
- Create: `src/runtime/__tests__/bgm-stack.test.ts`

**Interfaces:**
- Produces:
```ts
export type BgmOwner = '__doc__' | string

export interface BgmStackFrame {
  owner: BgmOwner
  ref: string
  mode: 'push' | 'replace'
  volume: number
  fadeInMs: number
  fadeOutMs: number
  restart: boolean
  loop: boolean
}

export interface BgmApplyInput {
  owner: BgmOwner
  ref: string
  mode?: 'push' | 'replace'
  volume?: number
  fadeInMs?: number
  fadeOutMs?: number
  restart?: boolean
  loop?: boolean
}

/** 给壳层的「当前应播什么」；null = 停播 */
export interface BgmPlaybackCommand {
  ref: string | null
  volume: number
  fadeInMs: number
  fadeOutMs: number
  loop: boolean
  /** true = 必须从头；false = 同 ref 可续播 */
  restart: boolean
}

export class BgmStack {
  apply(input: BgmApplyInput): BgmPlaybackCommand
  popIfOwner(owner: BgmOwner): BgmPlaybackCommand | null  // 不匹配则 null（无指令）
  clear(): BgmPlaybackCommand
  top(): BgmStackFrame | undefined
  frames(): readonly BgmStackFrame[]
}
```

默认：`mode='push'`，`volume=1`，`fadeInMs=0`，`fadeOutMs=0`，`restart=false`，`loop=true`（文档床）/ 节点可默认 `loop=true`。

续播：`push` 且 `!restart` 且新 `ref ===` 将成栈顶的同 ref（含 replace 到同 ref）→ `restart: false` 的 command。

- [ ] **Step 1: Write failing tests**

覆盖：
1. doc push → top owner `__doc__`
2. push A then push B → depth 2；popIfOwner(A) 在 B 仍在顶时 **不**弹；popIfOwner(B) → 回到 A
3. replace 不加深
4. clear 清空
5. 同 ref push `restart:false` → command.restart === false

- [ ] **Step 2: Run — FAIL**

```bash
bunx vitest run src/runtime/__tests__/bgm-stack.test.ts
```

- [ ] **Step 3: Implement `BgmStack`**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**（默认跳过）

---

### Task 3: `BgmDirective` + Session 快照

**Files:**
- Modify: `src/runtime/engine/directives.ts`
- Modify: `src/runtime/engine/session.ts`
- Modify: `src/runtime/__tests__/directives.test.ts`

**Interfaces:**
- Produces:
```ts
export interface BgmDirective {
  type: 'bgm'
  ref: string | null
  volume: number
  fadeInMs: number
  fadeOutMs: number
  loop: boolean
  restart: boolean
}
```
- Session 快照增加 `bgm: BgmDirective | null`（或等价 Playback 字段）；`applyDirective` 遇 `bgm` 更新快照。
- `export function isBgm(d: RuntimeDirective): d is BgmDirective`

- [ ] **Step 1: 扩展 directives 联合类型 + `isBgm`；directives 单测加一条**

- [ ] **Step 2: Session 处理 `case 'bgm':` 写入 snap**

- [ ] **Step 3: 现有 session/directive 测试全绿**

```bash
bunx vitest run src/runtime/__tests__/directives.test.ts src/runtime/__tests__/engine.start.test.ts
```

- [ ] **Step 4: Commit**（默认跳过）

---

### Task 4: 引擎挂钩子

**Files:**
- Modify: `src/runtime/engine/engine.ts`
- Create: `src/runtime/__tests__/engine.bgm.test.ts`

**Interfaces:**
- Consumes: `BgmStack`, `getNodeBgm`, `DocumentBgm`
- `GraphRuntime` 持有 `private bgm = new BgmStack()`
- 每次栈变化 `emit({ type: 'bgm', ...command })`（`ref: null` 表示停）

钩子（与 SPEC §4.2 一致）：

| 时机 | 行为 |
|---|---|
| `start()` 成功进入后 | 若 `scenario.bgm` → `apply({ owner:'__doc__', ...doc.bgm, loop: doc.bgm.loop ?? true })` |
| `runIntent` `descend` | `pushCall` 之后：若 `getNodeBgm(caller.data)` → apply(owner=`<蓝图 id>::<caller.id>`)（**非** returning） |
| `enterNode` 普通 perf | 非容器、且非「刚被 descend 成 entry」的瞬间重复：若有 bgm → apply |
| 普通节点离开 | 在 `traverse` / 换节点前：若 top.owner === 离开节点的 owner 且非容器 → `popIfOwner` |
| `callStack.pop` | `popIfOwner(\`${frame.returnBlueprintId}::${frame.callerNodeId}\`)` |
| returning 再 enter 容器 | **跳过** apply 该容器 bgm |
| `jump` / 清局 / 会话结束 | 三者行为**各不相同**，见 SPEC §4.2 的三行表（默认 jump 只退作用域层、文档床继续响；`resetGlobals` 才清栈重 derive；会话结束引擎不发指令，停播归壳层 unmount）。**别在 `ended` 上补停播**——D6 要求 `win` 不写 pop，补了会让 §6.2「win 节点 → bgm-story」变假、每次通关静音。 |

实现注意：
- 容器节点：只在 **descend** apply，不要在 returning/`beginResume` 再 apply。
- 普通节点：在 `beginPerform` 路径 apply；离开时在走边换 `currentNodeId` 之前 pop。
- owner **必须**带蓝图前缀：`nodeId` 只在单张蓝图内唯一（`switchGraph → indexGraph` 按蓝图重建节点索引），
  可复用包里的 `combat` / `enter` / `end` 这类通名跟主图 caller 撞车是常态（本平台由 agent 铸 id）。

- [ ] **Step 1: Write `engine.bgm.test.ts`（合成小图，无真实音频）**

最小图 A：
- doc.bgm = story
- 节点 `n1`（perf 短 duration）无 bgm → start 后 session 快照 bgm.ref === story
- 节点 `s` 有 bgm battle，无 subFlow → 进入 s 后 ref===battle；performanceEnd 到 `n2` 后回 story

最小图 B（subFlow）：
- `wrap` subFlow→`inner`，`wrap.data.bgm = battle`
- 进 inner 时 callStack=[wrap]，bgm=battle
- inner 无出边 pop → 回 wrap returning → advance 到 `after`：bgm 回到 story
- 内层再套一层无 bgm 的 subFlow：内层 pop **不**改变 battle

最小图 C（subFlowPack）：同 B，用 inline packs 注入（参照现有 pack 测试）

- [ ] **Step 2: Run — FAIL**

```bash
bunx vitest run src/runtime/__tests__/engine.bgm.test.ts
```

- [ ] **Step 3: Wire `engine.ts`**

- [ ] **Step 4: Run engine.bgm + 现有 engine.flow / engine.e2e — PASS**

```bash
bunx vitest run src/runtime/__tests__/engine.bgm.test.ts src/runtime/__tests__/engine.flow.test.ts src/runtime/__tests__/engine.e2e.test.ts
```

- [ ] **Step 5: Commit**（默认跳过）

---

### Task 5: Play 壳 — `BgmPlayer` + resolve audio

**Files:**
- Create: `src/runtime/play/BgmPlayer.tsx`
- Modify: `src/runtime/play/GamePlayer.tsx`
- Modify: `src/editor/assets/registry-types.ts`（`MediaKind = 'image' | 'video' | 'audio'`）
- Modify: `src/editor/shell/media.ts`（确保 audio id 可走同一 resolve；勿过滤 kind）
- Modify: `src/editor/shell/GraphPlayer.tsx`（若需把 resolve 传入）

**Interfaces:**
```tsx
export function BgmPlayer(props: {
  bgm: { ref: string | null; volume: number; loop: boolean; restart: boolean; fadeInMs: number; fadeOutMs: number } | null
  resolveAsset: (id: string | undefined) => string | undefined
}): null  // 无 UI，只挂 audio
```

行为：
- `ref` 变了或 `restart` → 换 `src` / `load`+`play`
- 同 ref 且 `!restart` → 不重载，只调 volume
- `ref===null` → pause + 清 src
- fade：v1 可用简易 `volume` 步进或瞬时；有则实现线性 fadeIn/Out，无则直接设 volume
- 与 `<video muted>` **解耦**；BGM 默认尝试 play（浏览器策略失败时静默 catch，可 `console.warn`）

- [ ] **Step 1: `MediaKind` 加 `'audio'`；类型相关编译通过**

- [ ] **Step 2: 实现 `BgmPlayer`，在 `GamePlayer` 读 session 快照挂载**

- [ ] **Step 3: 手动或用 happy-dom 测「ref 变化会改 audio.src」**（可选轻量测）

- [ ] **Step 4: Commit**（默认跳过）

---

### Task 6: Validate

**Files:**
- Modify: 现有 `src/runtime/validate/validate.ts`（或 `validateScenario` 所在文件）
- Create/Modify: 对应 validate 测试

规则（SPEC §3.3）：
- `bgm.ref` 非空
- `volume` ∈ [0,1]（若有）
- `fade*Ms` ≥ 0
- `mode` ∈ push|replace
- manifest 能解析 audio：无资产表时 **warning**；有表且缺失 → warning（与现网 media 校验级别对齐）

- [ ] **Step 1: 加非法 volume 的 error 用例**

- [ ] **Step 2: 实现校验**

- [ ] **Step 3: `bunx vitest run` 相关 validate 测试 PASS**

---

### Task 7: 编辑器最小录入

**Files:**
- Modify: `src/editor/shell/NodeInspector.tsx`（节点 `data.bgm`：ref 文本或资产下拉、mode、restart）
- Modify: 场景级 inspector（搜索现有 variables/entities 编辑入口；同级加「默认 BGM」）
- 资产选择：复用现有 media picker；filter `kind==='audio'`（无资产时允许手填 id）

- [ ] **Step 1: 节点面板可读写 `data.bgm.ref` / `mode` / `restart`**

- [ ] **Step 2: 文档级 `scenario.bgm.ref` 可读写**

- [ ] **Step 3: 保存/加载 blueprint 后字段不丢（手测或 persist 测）**

**不做：** 时间轴音频轨、包级 BlueprintDoc.bgm UI。

---

### Task 8: Demo / 合成验收（硬验收用测试；demo 可拆 PR）

**Files:**
- Prefer: 保持 Task 4 合成图为 CI 硬门
- Optional Modify: `src/editor/demo/nodia.graph.json` + packs — 主图加 `combat` + `bp-combat`（工作量大，**独立 PR 可接受**）

Optional demo 验收清单（人手 Play）：
1. 设 `doc.bgm` + `combat.data.bgm`
2. 叙事听 story → 进战斗听 battle → 多回合不断 → 出胜负回 story

- [ ] **Step 1: CI 绿 — 全 runtime 相关 vitest**

```bash
cd packages/marketplace/extensions/wb-game-video && bunx vitest run src/runtime/__tests__/
```

- [ ] **Step 2:（可选）拆 nodia combat 包并手测**

- [ ] **Step 3: Commit**（默认跳过）

---

## Spec 覆盖自检

| SPEC 项 | Task |
|---|---|
| D2 schema 两处 | T1 |
| BGM 栈语义 / 续播 / replace | T2 |
| directive + session | T3 |
| 钩子 / returning / 容器 vs 普通节点 | T4 |
| 资产 A + Play 壳 | T5 |
| validate | T6 |
| 编辑器最小 | T7 |
| Demo D11 | T8 可选；合成图 T4 覆盖语义 |
| 不做 Trigger/duck/时间轴 | 全 plan 未引入 |

---

## 修订

| 日期 | 说明 |
|---|---|
| 2026-07-24 | 初稿：按 SPEC 作用域栈；排除 Trigger；commit 默认跳过 |
