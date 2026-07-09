# AGENTS.md — wb-game-video（视频游戏工坊）给 AI 看的入口

> 你（AI agent）被丢进 `packages/marketplace/plugins/wb-game-video/` 时，先读这份。
> 比 `README.md` / `SKILL.md` 浓缩，按你查信息的优先级排版。深入细节再翻那两份。
> 最后更新：2026-07-09（旧蓝图引擎已退役，全面转向 graph 引擎）。

---

## 它是什么

`@forgeax-plugin/wb-game-video` = **玩法优先的视频游戏编辑器 + 运行时**。作者/AI 把一张
**声明式图（GameGraph）**——演出节点(视频) + 条件/效果出边——拼成可序列化的 `GameScenario`
JSON；纯 TS 状态机引擎直接吃这张图确定性回放，视频上叠血条/QTE/选择等可插拔组件。

代码已按三分模块落地：
- **`src/runtime/`** — schema / 引擎 / Kind·Skin 注册 / 校验（可独立单测；**不** import editor/assets）
- **`src/graph/`** — 蓝图画布 + 图编辑纯函数
- **`src/editor/`** — 工坊壳（Studio / persist / demo / video）+ **`editor/assets/`**（视频/字体/海报）

唯一入口 `src/main.tsx → GraphApp`。皮肤字体由 `editor/init.ts` → `bootEditorSkins()` 注入 runtime（`setBrushFontUrl`）。

> ⚠️ **旧 FMV 内容生产整套已在 2026-07-09 物理删除**（一刀切，无兼容层）：
> - 前端 `src/{scenario,llm,media,editor,player,forge,storytree,qte,io,ui,stage,minigames,fx,lib,shell}/` +
>   `App.tsx` / `mount.tsx`（mount 重建为 graph-only 极简版）都没了；
> - 更早退役的旧蓝图引擎（`blueprint/blueprint-schema.ts`、`scenarioToBlueprint.ts`、`blueprint/runtime/*`、
>   `forge/BlueprintTab.tsx`、`player/BlueprintPlayer.tsx`、旧战斗皮肤）同样不存在；
> - 后端 17 个 `gvid:*` FMV 工具（forge-script/save-scenario/generate-video/…）+ 对应 schemas 已删，
>   `server/tool-handlers.ts` 重写为 graph-native 三工具（见下）；
> - `vite.config.ts` 只剩 react + `/__graph__` 存储端点（`/__reel__/*` 反代与队列、LLM/图像/TTS key 注入全删）。
>
> **别再引用/复活以上任何东西**；Scene→Blueprint 编译、`USE_BLUEPRINT_RUNTIME`、`scene.ext.qteUi` 分派、
> `gvid:*-scenario`/`generate-*` 工具全部作废。

### AI 工具（graph-native，`server/tool-handlers.ts` = `entry.backend`）
AI/agent 与工坊沟通的唯一契约 = **直接读/改 GameGraph**，只有三个瘦工具（fs 直读写 `.forgeax/games/<slug>/game-video/scenarios.graph.json`，与 `/__graph__` 同一盘上格式）：
- `gvid:get-graph` `({gameSlug?})` — 读当前 game 的 GameGraph（无盘回退 demo）。
- `gvid:save-graph` `({scenario,title?,gameSlug?})` — 结构校验（节点 id 唯一、边 source/target 存在）后整本落盘 + 版本快照（留10）。
- `gvid:list-videos` — 列内置演出视频库可绑的 `media.ref`。
驱动这套的 agent = `agent-nodia`（persona 已改写到 GameGraph）。

## 1 分钟跑起来

```bash
cd packages/marketplace/plugins/wb-game-video
npm run dev            # vite dev，端口 15185
npx vitest run         # 单测（vitest + happy-dom）
npx tsc --noEmit       # 类型检查（当前全绿）
```

---

## 硬性规则（改动前必读，不要违反）

### R1 · Schema（`src/runtime/schema/graph-schema.ts` 是 SSOT 形态；）
- **一张图 = `GameScenario`**：`{ schemaVersion, variables, entities, ui, rng, rules?, graph:{nodes,edges} }`。
- **只有一种节点类型「演出节点」(`type:'perf'`)**：每个节点**都绑视频**(`data.media`)。**判断（出手/血量/回合/胜负/变招…）
  绝不做成独立网关节点**——一律折进演出节点的**条件/加权出边**（handle `cond:N`/`else`/`opt:*`/`pass|good|fail`/`out`，边带 `weight` 即加权随机）。
  需要跨节点记忆（如先手）用变量 + 条件边表达（见 nodia 的 `mineFirst`）。
- **一切逻辑声明式、可序列化、无函数入库**：条件 `GraphCondition`(`var/flag/attr/attrRatio/attrCompare/score/hasItem/visited`)、
  副作用 `GraphEffect`(`attr/var/flag/item`，`value` 可为常量或 `{expr}` 表达式，见 `expr.ts`)。**不准把函数/代码塞进数据。**
- **实体无 hp 特权**：`entities[id].attrs` 是开放数值袋，`hp` 只是"名为 hp、attrMeta 带 max/initial 的一个 attr"的约定；
  死亡 = `attrRatio hp lte 0`。换品类（竞速等）只换 attrs，不改引擎。
- **handle 派生**：`node.inputs/outputs` 不手写、由各 kind 的 `outputs(params)` 依 `node.data` 算出；`position` 才存 json。

### R2 · Runtime（`src/runtime/engine/engine.ts` = 纯 TS 状态机，零 DOM）
- 引擎 `GraphRuntime` 吃 `GameGraph+GameScenario` → 产**泛型 directive**（playClip/openInteraction/renderOverlay/hudUpdate/banner/…）；
  **引擎绝不碰 DOM/React**。`GraphSession`(视图模型) 消费 directive 成 `SessionSnapshot`；工坊 `GraphPlaySurface` 只订阅 snapshot 渲染。
- 入口：`start()`（从 `nodes[0]`）/ `onPerformanceEnd()` / `tick(ms)` / `submitInteraction(elId,input)` / `jumpToNode(id)`。
- **`resolve` 可 `continue:true`**：多步会话保持 `awaitInteraction`；中途 `effects` 仍走 `applyAndReact`（rules 可 redirect）。结束才返回 `outcome`。
- **`requiredPlugins`**：scenario 头声明依赖；`registerPlugin` + `validateScenario` / ctor fail-loud。
- **RNG 必须走 `state.rng`（seed+step，`rng.ts`）**，同 seed 同输入必同结果（回放/测试依赖）；不准 `Math.random`。
- 加新玩法 = 注册一个 **KindPlugin**（`src/runtime/registry/kind-registry.ts`，`role: presentation|logic|interaction` + validate/outputs/run|render|present|resolve），核心/引擎/Player 都不改。
- **依赖铁律**：`runtime` 不得 import `graph/` 或工坊壳（Studio/persist/demo）。

### R3 · 持久化 / demo（v4，2026-07-09）
- **出厂 demo = 只读 `src/editor/demo/nodia.graph.json`**（`src/editor/demo/demo.ts` import；`NODIA_DEMO` 只读，副本用 `makeNodiaDemo`）。改 demo 直接改这份 json（无代码生成器）。
- **主动保存的版本落盘**：`保存` → 服务端 `PUT /__graph__/store` 写 `.forgeax/games/<slug>/game-video/scenarios.graph.json`（权威最新）+ 版本快照 `scenarios.graph.versions/`（留最近 10）。见 `persist-client.ts` + `vite.config.ts graphStorePlugin`。
- **未保存草稿只在 localStorage**（autosave，不落盘）。
- **进入优先级：localStorage 草稿 > 磁盘最新已保存版本 > demo**；无数据=空蓝图；「重置」=回 demo。
- 版本下拉从磁盘版本索引读；`loadVersion` 取磁盘快照。

### R4 · 盖在视频上的组件（皮肤：QTE/选择/血条/漂字/转场/对话）
- 都是 **`src/runtime/skins/components/` 下独立、自闭环、可替换的 React 组件**，按 `kind` 或 `component` id 注册进
  `src/runtime/skins/rendererRegistry.tsx`，渲染时以 `<Comp key=… />` 挂成子元素（各自 fiber/hook，**外层有错误边界隔离——坏组件只提示不崩引擎**）。
- **配置只记组件名**：交互元素 `params.component`、HUD `ui.hud[i].component`（+ `pos` 定位）。契约见
  `src/runtime/skins/components/CONTRACT.md`（只 import `react` + `./skinRuntime`，样式/滤镜/字体自注入）。

---

## 心智模型：数据 → 引擎 → 渲染

```
demo/nodia.graph.json (GameScenario)         ← SSOT（localStorage 草稿/版本覆盖其上）
  graph.nodes[] 全是「演出节点」(media + timeline[]: role/kind/trigger/params)
  graph.edges[]  条件/加权/效果出边（判断折在这里，无网关节点）
        ▼  src/runtime  GraphRuntime → directive → GraphSession → SessionSnapshot
        ▼  src/graph    GraphCanvas（编辑/可视化）
  src/editor/shell GraphPlaySurface / GraphStudio（工坊壳）订阅 snapshot 渲染
        └─ 皮肤从 src/runtime/skins 注册表取组件（错误边界隔离）
```

## 关键目录（改 X 看哪里）

| 你要 | 看 |
|---|---|
| 图 schema / 类型 SSOT | `src/runtime/schema/graph-schema.ts` |
| 状态机引擎 | `src/runtime/engine/engine.ts` |
| 视图模型（引擎↔UI） | `src/runtime/engine/session.ts` |
| 核心 kind / 注册 | `src/runtime/registry/core-kinds.ts` / `kind-registry.ts` |
| 表达式 / 随机 / 效果 / 条件 | `src/runtime/engine/{expr,rng,apply-effects,condition}.ts` |
| 校验 | `src/runtime/validate/validate.ts` |
| 皮肤 / renderer registry | `src/runtime/skins/` |
| 蓝图画布 / 图编辑 / 派生视图 | `src/graph/canvas/` / `src/graph/edit/` |
| 试玩 / Studio / 节点面板（工坊壳） | `src/editor/shell/` |
| demo / 持久化 / store | `src/editor/demo/` / `src/editor/persist/` |
| 内容素材（视频/字体/海报） | `src/editor/assets/` |
| 应用外壳 / 视图路由 | `src/GraphApp.tsx` / `src/editor/persist/graphViewStore.ts` |
| AI 工具后端 | `server/tool-handlers.ts` + `schemas/*.json` |

## 你 90% 会踩的坑

1. **页面没显示你改的 demo？** localStorage 的草稿/版本优先级高于 demo。点**「重置」**回到 demo json。
2. **判断别建独立节点**（R1）：出手/血量/胜负/变招 都折进演出节点条件/加权出边；先手等状态用变量 + 条件边。
3. **皮肤别 import 引擎代码**（R4）：只 `react + ./skinRuntime`，否则破坏「可独立替换」；用它就在 json 填 `component` 名。
4. **引擎里别用 `Math.random` / 别碰 DOM**（R2）。
5. **改 demo 改 `demo/nodia.graph.json`**（编辑器出厂数据源）；改运行时 game 数据走 `gvid:save-graph` 或工坊「保存」。

## 已知缺口 / Backlog

- **AI 不能生成新视频**：本引擎的演出视频只来自内置库（`src/editor/assets/zhandou/*.mp4`，`gvid:list-videos` 列出）。
  随 2026-07-09 FMV 拆除，Seedance/图生视频/关键帧那条生产链路已删除，AI/Nodia 只能**编排/绑定**已有片段，
  不能产新素材。若日后要恢复「AI 生成新视频」，需另引一条独立的视频生成链路（不复活整套 FMV）。

## 深入文档

| 你要 | 看 |
|---|---|
| 皮肤/HUD/QTE 组件契约（props/submit/ctx/自闭环/错误隔离） | `src/runtime/skins/components/CONTRACT.md` |
| 引擎设计规格 + 分期 + 实施状态（含 2026-07-09 增补） | `<repo>/docs/superpowers/specs/2026-07-06-wb-game-video-blueprint-orchestration-design.md` |
| 三态 schema（scenario/graph/…）说明 | `<repo>/docs/superpowers/specs/2026-07-06-wb-game-video-schemas.md` |
| **QTE / 数值填表 Schema + 扩展协议**（🟢 SPEC） | `<repo>/docs/superpowers/specs/2026-07-09-wb-game-video-plugin-extension-protocol-design.md` §7 |
| **模块划分 + 实施清单**（`runtime` / `graph` / `editor`） | 同上文档 §12 / §10；素材在 `editor/assets` |
| 包定位 / 媒体三态 / AI 调用指南 | `README.md` / `SKILL.md`（trigger `/gamevideo`） |
| 插件声明（surface / tool / port / permissions） | `forgeax-plugin.json` |
