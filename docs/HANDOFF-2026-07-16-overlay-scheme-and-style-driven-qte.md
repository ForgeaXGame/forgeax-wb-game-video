# 交接文档：Overlay 稀疏覆盖模型 + 样式驱动 QTE + QTE 拖入门槛

> 上下文接力用。写这份文档时**所有已知工作都已完成并可运行**（tsc + lint + 全量单测绿），
> 只有 3 个文件的一个小改动还没 commit（见下「未提交改动」）。没有已知 bug、没有 pending 需求。
> 完整对话原文（含本文档写不下的细节/措辞）在
> `C:\Users\cinema\.cursor\projects\e-forgeax-studio\agent-transcripts\62045b1d-a122-4378-b060-84afdb2f82f1\62045b1d-a122-4378-b060-84afdb2f82f1.jsonl`
> ——一个 json-lines 文件，每行一条 user/assistant 消息（不含工具调用细节）。想查"某句话当时到底怎么说的"就 grep 关键词读那附近几行，别整篇顺读。

## 仓库坐标

- 顶层仓：`E:\forgeax-studio`（superproject）。
- 本次工作全部发生在子模块 **`packages/marketplace`**（`git rev-parse --show-toplevel` = 该目录；
  `wb-game-video` 只是它下面 `extensions/wb-game-video/` 的一个普通文件夹，不是嵌套 submodule）。
- **重要**：在 `extensions/wb-game-video/` 里跑 `git status`/`git diff` 时路径是**相对 cwd**（显示 `src/...`）；
  但 `git show`/`git log -p` 要用**仓库根相对路径**（`extensions/wb-game-video/src/...`），俩混着用会 `fatal: path ... exists, but not in 'HEAD'`——踩过好几次坑，新窗口直接记住别再踩。
- 分支：`feat/overlay-copy-on-write`，本地领先 `origin/feat/overlay-copy-on-write` 10 个 commit（未 push）。
- HEAD = `78e6f293`（`merge: origin/main into feat/overlay-copy-on-write`）。
  这个 HEAD **已经完整包含**下面第 2、3 节说的所有模型/QTE 改动（在合并 main 之前的 checkpoint commit
  `0cd5e82e "wip: overlay style scheme + mount diff badges"` 里就有了，早于合并）。

## 未提交改动（3 个文件，本次会话新加，未 commit）

刚做完，**已验证**（`bun run lint` tsc 全过 + `bun run test` 188/188 绿），但还没 git commit，等你确认后再提交：

- `src/editor/video/graphMaterialOps.ts`：新增 `export function canAddQte(scenario, node)`（约 L877）—— QTE 拖入门槛，见第 4 节。
- `src/editor/shell/GraphVideoView.tsx`：新增 `qteDisabled`（约 L673）替换 QTE 素材卡片的 `disabledReason`（原来复用 `addDisabled`）。
- `src/editor/video/__tests__/graphMaterialOps.test.ts`：新增 3 条门槛用例（`describe('graphMaterialOps · QTE 拖入门槛...')`）。

`git status --short` 目前还看到 `?? ../../plugins/`（`packages/marketplace/plugins/` 未跟踪目录）——**不是我改的**，合并 main 带来的既有状态，与本次工作无关，别误 add。

---

## 1. 一句话心智地图

这是 chat-driven 视频游戏编辑器（wb-game-video）。核心概念栈，自底向上：

```
Overlay（可复用方案，scenario.ui.overlays[id]）
  └─ OverlayNode（节点上的一份"挂载"，NodeData.overlayNodes[]）—— 稀疏覆盖差量，见第 2 节
NodeData.styleScheme（节点的"默认样式方案"，只查表不挂载）—— 见第 2 节
ComponentManifest（inputs/events 契约）→ QteFullParams.exits 驱动"样式决定按键点"—— 见第 3 节
```

## 2. Overlay 稀疏覆盖模型（"挂载 vs 素材库"两种应用方式都在，没丢）

**SSOT**：`src/runtime/schema/node-config-schema.ts` L190-220（`OverlayNode` 接口 + 完整注释）；
`src/runtime/schema/graph-schema.ts` L211-229（`NodeData.styleScheme` 字段注释）。

用户曾担心"合并 main 后是不是把某种应用方式盖掉了"——**排查结论：没有**（用 `git log --graph` +
`git show <commit>:<path>` 逐个对照过，`0cd5e82e` 早在合并 main 之前就有完整实现）。两种方式现状：

1. **挂载（常驻）**——`NodeData.overlayNodes: OverlayNode[]`。语义 = Figma 实例覆盖 / Unity Prefab
   modifications：`overlay` 字段引用原型方案，**持续跟随**原型后续编辑；`overrides`/`added`/`removed`
   三个稀疏差量字段记录"本挂载对原型的偏离"（只存被改字段，未改的组件永远跟随原型）。合并规则见
   `expand-overlay.ts#resolveMountChildren`。UI 入口：`NodeInspector.tsx` L867-889「覆盖物事件」区块的
   「＋挂载…」下拉。
2. **默认样式（素材库，不挂载）**——`NodeData.styleScheme: string`。纯查表源：新增字幕/飘字/滤镜/特效/QTE
   时，取该方案里同 `component` 类型的第一个 child 当默认参数；不进 `overlayNodes`、不出现在时间轴/预览。
   同类型有多个时可在素材检视器「方案样式」下拉切换（`GraphVideoView.tsx` 里 `STYLE_COMPONENT` 映射控制
   哪些组件类型支持切换——**QTE 故意排除在外**，因为 QTE 的"样式"由 `component` 字段本身决定，不是同
   component 下的参数变体）。UI 入口：`NodeInspector.tsx` L849-865「默认样式」下拉。读取函数：
   `graphMaterialOps.ts` L866 `styleVariantsFor(scenario, node, component)`。

用户当年提过的"应用方案时弹窗二选一（是否将方案全部组件放到视频中？）"——**从未实现**，讨论后改成了
现在这两个并列独立入口（不是同一动作二选一），别指望代码里找得到那个弹窗。

## 3. 样式驱动 QTE 模型（用户纠偏后的最终版，已落地）

**背景**（重要，避免下一个 agent 重蹈覆辙）：中途走过一条弯路——先按"组合按键 + 每键独立结算"的理解实现了
一版（`scopedEventId`/scope 相关代码），用户纠正说理解完全错了，要求整体回退。**正确模型**：QTE 有几个
按键点、叫什么名字，**由"样式"（`component` 字段选的皮肤）决定**，不是由编辑器另开字段配置。配置层只管
"这坨 QTE 的整体时间/位置/结算反应"，具体判定逻辑在皮肤自己的运行时代码里（类似 Python 大括号模板往里填值）。

**数据形态**（对齐 `ComponentManifest.inputs/events` 心智，但 QTE 走的是精简过的专用字段，没有做成通用
"从 manifest 自动生成表单"）：

- `src/runtime/registry/core-kinds.ts` L207-208：
  ```ts
  export type QteExit = { key: string; label?: string }
  export type QteFullParams = QteParams & { exits?: QteExit[]; defaultKey?: string; timeoutMs?: number }
  ```
  `exits` = 皮肤声明的按键点列表（如双键防反皮肤 `battleParry` 声明 `[{key:'A',label:'防反'},{key:'B',label:'闪避'}]`）；
  `defaultKey` = 超时/未命中兜底 handle；`qteKind.outputs(p)` 把 `exits` 的 key 全部列为结算候选，并保证
  `defaultKey` 兜底也在候选里（即使没跟某个 exit key 撞名）。
- 结算候选**不再是硬编码** `'pass'|'good'|'fail'` 三态：`QteOutcomeHandle` 已改成裸 `string`；
  `graphMaterialOps.ts` L194 `qteOutcomeCandidates(el)` 现算 `qteKind.outputs(el.params)`，是唯一真相源。
  所有消费点（`listQteOutcomeViews`/`listAvailableQteOutcomes`/`ensureQtePassOutcomeGraph`/
  `teardownInteractionScenario` 的 `handlePrefixes` 等）都改成调这一个函数，没有第二份硬编码列表。
- 双键皮肤示例：`battleParry`（防反）——完整 demo 数据见 `node-config-schema.ts` L299-320（`OVERLAY_DEMO`
  里的 `parry` child，`exits: [A/B/miss]`）。这是用户明确要求的"当前预设样式里已有的双键 QTE"，没有凭空
  造一个新皮肤。
- 编辑器 UI：`GraphVideoView.tsx` L1056 `isBattleParry` 判断，L1204/L1311 两处条件渲染 battleParry 专属
  字段——隐藏无关的完美判定/命中 ms/触发键/形态字段，改成「时长 ms」（编辑 `params.windowMs`，见 L1182/
  L1319，同步联动 `cue.endAt = appearAt + windowMs`）+「按键 A/按键 B」（编辑 `exits[0]/[1]`）+「超时/
  未命中结算 id」（编辑 `defaultKey`，L1237）。
- 实时预览：`graphMaterialOps.ts` L518 `QTE_LIVE_PREVIEW_SKINS = new Set(['inkKou', 'battleParry'])`，
  `qteSkinPreviewInteraction`（L529 起）用这个白名单放开编辑器内实时预览（原来只放 `inkKou`）。

**明确没做的边界**（用户认可的取舍，别自己加）：没有给 `battleParry` 做一键新建入口（仍从「交互皮肤」
下拉切换）；组合键判定仍是"任一命中"语义（沿用已有 `either` 逻辑，没做 AND 语义）；`QteCue` 数据结构本身
没改（改动全在 `el.params` 这层）；没做"从 `ComponentManifest.inputs` 自动生成表单"的通用机制（字段是手写
JSX，逐皮肤加）。

## 4. QTE 拖入门槛（本次会话新加，未提交）

**触发原因**：用户问"为什么我节点没挂任何东西却还能拖 QTE 上来，这和之前的需求不符"。排查发现这不是
回归——这个门槛**从来没实现过**，只停留在用户口头需求阶段（"没被赋予含 QTE 的样式就不能拖到时间轴"），
"挂载 vs 素材库"模型和"样式驱动 QTE"模型都各自正确落地了，但没人把两者接起来做这道门槛检查。

**实现**（第 4 节开头列的 3 个文件）：

- `canAddQte(scenario, node)`：节点已挂载的 overlay（`mountedChildrenOf`，会顺带兜底读节点自己 overlay
  里已有的 qte 组件——所以给已有 QTE 轨追加按键点不受这个门槛影响，只挡"从零新建"）**或**默认样式方案
  （`styleVariantsFor(scenario, node, 'qte')`）任一含 `component === 'qte'` 的 child，即放行。
- 数据层门槛：`addMaterialGraph` 的 `template === 'qte'` 分支加 `if (!canAddQte(...)) return { scenario, selectKey: null }`（no-op，不新建）。
- UI 层门槛：`GraphVideoView.tsx` 新增 `qteDisabled`，接到 QTE `MaterialCard` 的 `disabledReason`——
  该组件的 `disabledReason` 同时控制 `disabled`（点击新增）和 `draggable`（拖拽落轨），一次接线覆盖两条路径。
- 用户确认的口径（`AskQuestion` 已问过）：来源"挂载或默认样式任一即可"；无门槛时"卡片保留展示但置灰
  禁用 + hover 提示"（不是直接隐藏）。

**未验证项**：只跑了单测（`vitest`），没有过 live 浏览器手测（本次没起 dev server）。新窗口如果要收尾，
建议先跑一遍 `bun fx start` 后在编辑器里实测：① 一个啥都没挂的节点拖 QTE 应该置灰；② 挂个含 qte 的方案后
应该能拖；③ 已有 QTE 轨的节点追加按键点应该始终能拖（不受门槛影响）。

## 5. 验证命令

在 `packages/marketplace/extensions/wb-game-video/` 下：

```bash
bun run lint   # tsc --noEmit（主 + server tsconfig）+ 模块边界检查
bun run test   # vitest run，当前 30 files / 188 tests 全绿
```

PowerShell 下 `bun run xxx` 会把子进程的 "$ tsc ..." 回显误判成 NativeCommandError 打印一堆红字——
**只看退出码，不看这条噪声**（`$LASTEXITCODE` 或 `; echo $?`）。

## 6. 其余上下文（更早的工作，供背景参考，均已完成/已 commit，不需要再动）

- QTE/选项结算 UI 恢复、`graphMaterialOps.ts` API、`listOptionBranches` 修复、`EffectsEditor` 接入——
  已完成并 PR 合并入 main（早于本轮 `feat/overlay-copy-on-write` 分支）。
- 飘字（overlay 浮动文字）公式/对象选取式交互——合并 main 后一度丢失表现，已用 `EffectsEditor` +
  `FloatValuePickEditor` 原样恢复（`GraphVideoView.tsx` 飘字检视器区块 + `graphMaterialOps.ts` 的
  `overlayEffects`/`upsertSettleEffects`），单测见 `graphMaterialOps.test.ts` 「飘字 effects/valuePick/expr」
  describe 块。
- QTE 组合键的错误理解版本（`scopedEventId`/scope 相关）已通过 `git checkout HEAD --` 整文件回退
  （`core-kinds.ts`/`kind-registry.ts`/`overlay-events.ts`/`engine.ts`/`InkKouLayer.tsx` 五个文件），
  `graphMaterialOps.ts`/`GraphVideoView.tsx` 是手动摘除 scope 相关签名/调用点（混了飘字等要保留的活）。
