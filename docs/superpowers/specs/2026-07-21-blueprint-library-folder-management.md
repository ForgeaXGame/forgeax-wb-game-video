# wb-game-video 蓝图库 · 多蓝图管理 · 设计规格

> 状态：🟢 SPEC（方案 A 已定稿并落地数据层）  
> 初稿：2026-07-21 · 修订：2026-07-22（方案 A：单文件 SSOT，废弃 `blueprints/` 文件夹）
>
> 目标：把「每个 game 只有一张主蓝图 + 内联 `meta.packs` 子蓝图」升级为
> **一等公民的「蓝图库」**：可从入口新建很多子蓝图、在任意蓝图里直接引用彼此；
> UI 排版对齐「规则」tab（左列表 + 右详情）。
>
> 前提（用户已确认）：**完全不兼容历史数据**，直接按新格式落地，不做旧 `meta.packs` /
> 旧 `BlueprintProject{manifest,blueprints,sharedMeta}` / `blueprints/` 文件夹迁移。

---

## 0. 方案 A（相对初稿的决策变更）

初稿曾规划「`blueprints/` 目录 + `manifest.json` 索引为唯一真相，`scenarios.graph.json` 派生」。  
**已否决**，改用方案 A：

| 项 | 初稿（否决） | 方案 A（现行） |
|---|---|---|
| SSOT | `blueprints/` 多文件 | **单文件** `scenarios.graph.json` |
| 文档形状 | `{ manifest, blueprints, sharedMeta }` | **原 `GameScenario` / nodia 同构** + 嵌套 `manifest` |
| 共享 meta | 嵌套 `sharedMeta` | **留在根上**（`variables` / `entities` / `ui` / …） |
| 主蓝图 | 仅文件夹文件；根 `graph` 派生 | 根 `graph` **与** `manifest.packs[mainId].graph` **双源同步**（故意冗余） |
| `manifest.packs` | `BlueprintEntry[]`（仅索引 + file） | `Record<id, BlueprintDoc>`，**含 main**（编辑库入口）+ 全部子蓝图 |
| engine 消费 | 派生 `packs` | **开跑 = 根 `graph`**；执行中遇 `subFlowPack` → 查 `manifest.packs`；**无根级 `packs` 数组** |

**为何 `manifest.packs` 含 main：** 后续编辑库、列表、跨引用、校验都只读这一份 map，少一套「主蓝图另入口」；与根 `graph` 双源不影响——保存/规范化时以 manifest 为准同步根 `graph`（无根级 packs 数组）。

---

## 1. 背景与现状

- 每个 game 的图存 `.forgeax/games/<slug>/game-video/scenarios.graph.json`
  （盘上包裹为 `{ version:1, activeId, items:[{id,title,scenario}] }`，`scenario` =
  `GraphLibraryDocument`）。
- 已有「子蓝图」运行形态：节点上 `subFlowPack` 指针；本体在 `manifest.packs`。
- 「规则 / 界面」tab = `GraphConfigView` + `CatalogShell`（左分区列表 + 右预览）。
- 持久化两处实现须同步：Vite `/__graph__/store`（`vite.config.ts`）与生产
  `server/tool-handlers.ts` 的 `gvid:get-graph` / `gvid:save-graph`。

## 2. 目标与非目标

### 2.1 目标
1. **蓝图库入口**：可「+ 新建蓝图」建任意多张子蓝图。
2. **跨蓝图引用**：任意蓝图内可引用库里其它蓝图（复用 `subFlowPack`）。
3. **单文件存储**：`scenarios.graph.json` 为唯一真相（原 scenario 字段 + `manifest`）。
4. **库视图 UI**：「蓝图」tab = 左列表（主 + 全部子）+ 右 `GraphStudio`；节点编辑逻辑不变。
5. **SSOT 无漂移**：读写只认该单文件；不再维护 `blueprints/` 文件夹。

### 2.2 非目标（YAGNI）
- 不做嵌套子文件夹 / 分组树（左侧平铺）。
- 不做旧数据迁移 / 双路径兼容（含旧 `blueprints/`、旧三件套 `BlueprintProject`）。
- 每张子蓝图**不**拥有独立的实体/变量/公式/界面/规则——全 game 共享，根上 SSOT。

## 3. 数据模型

### 3.1 共享假设
`实体 / 变量 / 公式 / 界面(ui.overlays) / textStylePresets` = **全 game 共享**，
SSOT 在文档**根上**（与 nodia.graph.json 同构）。每张蓝图文档只多带自己的 `graph`（及 id/title/entry）。

### 3.2 蓝图文档（`BlueprintDoc`）

```ts
interface BlueprintDoc {
  id: string
  title: string
  entry: string
  graph: GameGraph
  version?: string                 // 内容版本钉（指针 `subFlowPack.version`）
  requires?: { vars?: string[]; entities?: string[] }
}
```

### 3.3 Manifest（嵌在 scenario 根上）

```ts
interface BlueprintManifest {
  version: 'wb-game-video.blueprint-manifest.v1'
  mainPackId: string
  /** 含主蓝图 + 全部子蓝图完整文档（编辑库唯一入口；与 subFlowPack 用语对齐） */
  packs: Record<string, BlueprintDoc>
}
```

### 3.4 完整落盘文档（`GraphLibraryDocument`）

```ts
type GraphLibraryDocument = GameScenario & {
  // GameScenario.version = 'wb-game-video.graph.v1'
  formulas?: Record<string, unknown>
  manifest: BlueprintManifest
}
```

要点：
- 根 `graph` = 主蓝图图（**运行开跑入口** / 与历史 scenario 同构）。
- 入口标记只在 `manifest.mainPackId`（根上不再镜像该字段）。
- `manifest.packs` 含 **main**（编辑库）+ 子蓝图；engine **执行中**按 id 从此表取依赖。
- **无根级 `packs` 数组**（旧 `GameScenario.packs` 已删）；库本体在 `manifest.packs`。
- 规范化时以 manifest 为准同步根 `graph`；**不读**旧字段 `schemaVersion` / `mainBlueprintId` / `blueprints`。

### 3.5 盘上布局

```
.forgeax/games/<slug>/game-video/
├─ scenarios.graph.json          # 【唯一真相】scenario + manifest
└─ scenarios.graph.versions/     # 版本快照（整份 GraphLibraryDocument）
```

**不再使用** `blueprints/` 目录。

## 4. 内存态（store）

`graphScenarioStore` 为「蓝图集合 + 当前选中」：

- `blueprints` / `activeBlueprintId` / `mainBlueprintId` + 根级 `meta`。
- 对外 `graph` = **当前选中**蓝图的图；`setGraph` 写回当前选中。
- `authoringProject()` / 落盘文档 = `documentFromBlueprints(...)` → 完整 `GraphLibraryDocument`。
- `authoringScenario()` / `scn()` / 试玩：默认主蓝图为根；子蓝图「从此试玩」可用
  `playDocument(doc, rootBlueprintId)`。
- `setGraph` / `setScenario`：写回 **activeBlueprintId**（视频 tab 编辑子蓝图时不得写进 main）。
- 动作：`createBlueprint` / `renameBlueprint` / `deleteBlueprint` / `selectBlueprint` /
  `setMainBlueprint`。

> 「规则 / 界面 / 视频」里基于 `graph.nodes` 的选择器反映**当前选中蓝图**——可接受。

## 5. 持久化流程

一次传输整份文档（端点字段名仍可叫 `project`，类型为 `GraphLibraryDocument`）：

- **共享序列化**（Vite + tool-handlers）：`readDocument` / `writeDocument` /
  `readVersionDocument`（`blueprint-store-fs.ts`）；纯函数在 `blueprint-project.ts`
  （`documentFromBlueprints` / `documentFromScenario` / `normalizeDocument` /
  `playDocument` / `validateDocument`）。
- **端点**：
  - `GET …/store` → `{ project, versions }`（`project` = 文档或 null）。
  - `PUT …/store { project }` → 写 `scenarios.graph.json` + 版本快照。
  - `GET …/version?id=` → 该版本文档。
- **进入优先级**：草稿 > 磁盘最新 > 内置 demo（`NODIA_DEMO_PROJECT`）。

## 6. UI —「蓝图」tab 库视图

布局同「规则」：左列表 + 右 `GraphStudio`。

- 顶部「＋」旁固定浮层输入新建（Enter/添加、Esc/点外取消）；勿用阻塞 `prompt`。
- 主蓝图置顶 + 「入口」徽标 + 不可删；子蓝图可重命名 / 删除 / 设为入口（⌂）。
- 「设为入口」= 改 `mainBlueprintId`（旧主降为子，不删）。
- 全量「试玩」tab：主蓝图入口；画布「从此试玩」：当前选中蓝图为根。
- 「从此试玩」开合浮层**不得**自动 `fitView`（可手动居中/排版时再给右侧留白）。
- 同图子流程：切嵌套只改属性并新建专用入口节点；双击才下钻。入口默认无 `durationMs`。
- 试玩收尾：`ClipPerformanceEndGate` 防止「时长上限 + 旧 video onEnded」误收下一节点（穿链下钻后被立刻弹走）。

## 7. 跨蓝图引用交互

- 任意蓝图「添加引用」→ 库中其它蓝图选择器（排除自己 + 防环）。
- 双击引用节点 → 左侧切到被引用蓝图（扁平导航，替代 `packDrill`）。
- 防环：自引用与 A→…→A 在插入/保存时拦截。
- 同图 `subFlow` 下钻保持原样。

## 8. 内置 demo 播种

`demo/nodia.graph.json` → `documentFromScenario` → `NODIA_DEMO_PROJECT`：主图 → `bp-main`，
内联 packs → 子蓝图，写入 `manifest.packs`（含 main）。无盘数据时播种并落盘。

## 9. 边界与错误处理

- 删除被引用的子蓝图 → 拦截并列出引用者。
- `mainPackId` 不在 `manifest.packs` → `validateDocument` 报错；读盘规范化失败 → 回落 demo。
- 悬空 `entry`（节点已删）→ `resolveGraphEntry` 回退到最左根节点（`docToPack` / setGraph 同步）。
- 引用已删 id → 沿用现有 resolve 失败路径。

## 10. 实施触点

- `runtime/schema/graph-schema.ts`：`BlueprintDoc` / `BlueprintManifest` / `GraphLibraryDocument`。
- `editor/persist/blueprint-project.ts`、`blueprint-store-fs.ts`、`persist-client.ts`、
  `graphScenarioStore.ts`。
- `vite.config.ts` + `server/tool-handlers.ts` + `forgeax-extension.json`。
- `editor/shell/BlueprintLibraryView.tsx`、`GraphStudio.tsx`；`graph/edit/blueprint-refs.ts`。
- `editor/demo/demo.ts`。

## 11. 风险

- **两处持久化同步**：必须共用 `blueprint-store-fs`。
- **双源同步纪律**：写盘前 `normalizeDocument` / `documentFromBlueprints` 必须以
  `manifest.packs` 同步根 `graph`，避免只改一侧；依赖解析勿再写 `packs`。
- **store 语义**：`graph` = 当前选中图；全量校验/试玩走 `authoringScenario()` /
  `playDocument`。
- **旧草稿**：localStorage / 磁盘若仍是旧三件套或 `blueprints/`，不会当库文档加载——需清草稿或重存 demo。
