# 蓝图库 · 多蓝图管理 Implementation Plan

> **For agentic workers:** 以同目录上级
> [`../specs/2026-07-21-blueprint-library-folder-management.md`](../specs/2026-07-21-blueprint-library-folder-management.md)
> 为 SSOT。本 plan 已按 **方案 A** 修订；初稿中的 `blueprints/` 文件夹序列化任务作废。

**Goal:** 蓝图库（多蓝图 + 跨引用 + 库 UI）；落盘为单文件 `scenarios.graph.json` =
原 scenario 形状 + `manifest`（`blueprints` **含 main**）。

**Architecture（方案 A）：**
- SSOT = `scenarios.graph.json` 内 `items[0].scenario`（`GraphLibraryDocument`）。
- 根上保留 `graph` / `variables` / `entities` / …；`manifest.packs` 含主+子完整
  `BlueprintDoc`。**开跑用根 `graph`**；执行中依赖查 `manifest.packs`；**无根级 `packs` 数组**（库在 `manifest.packs`）。
- 前端 store 内存仍拆 `blueprints` + `meta` + `activeBlueprintId`；落盘经
  `documentFromBlueprints` 拼回扁平文档。
- Vite `/__graph__` 与 `gvid:*` 共用 `blueprint-store-fs`（`readDocument` /
  `writeDocument`）。端点 JSON 字段名可仍叫 `project`，类型是 `GraphLibraryDocument`。

**Tech Stack:** TypeScript · React · zustand + zundo · Vite · bun:test / vitest。

## Global Constraints

- **不兼容历史数据**：不做旧 `meta.packs` / 旧三件套 `BlueprintProject` /
  `blueprints/` 文件夹迁移。
- **SSOT**：只认单文件 `scenarios.graph.json`；**禁止**再写 `blueprints/`。
- **双源纪律**：`manifest.packs[mainId].graph` ↔ 根 `graph` 在
  `normalizeDocument` / `documentFromBlueprints` 时对齐；编辑库以
  `manifest.packs` 为入口。
- **共享 meta 在根上**：无 `sharedMeta` 嵌套。
- **两处持久化同步**：只经 `blueprint-store-fs`。
- **version**：根文档 `'wb-game-video.graph.v1'`；manifest
  `'wb-game-video.blueprint-manifest.v1'`。蓝图/包文档不再单独挂 shape 字段
  （内容钉死用可选 `version` 字符串）。
- **id**：主蓝图默认 `bp-main`；新建 `bp-<base36>-<seq>`。
- **提交**：非用户明确要求不 commit。

---

## 文件结构（现行）

| 文件 | 职责 |
|---|---|
| `src/runtime/schema/graph-schema.ts` | `BlueprintDoc` / `BlueprintManifest` / `GraphLibraryDocument` / `resolveGraphEntry` |
| `src/editor/persist/blueprint-project.ts` | `documentFromBlueprints` / `documentFromScenario` / `normalizeDocument` / `playDocument` / `validateDocument` / `docToPack` |
| `src/editor/persist/blueprint-store-fs.ts` | 单文件 read/write + 版本快照（**无** `blueprints/`） |
| `src/graph/edit/blueprint-refs.ts` | 引用收集 / 引用者 / 成环检测（入参 `BlueprintMap \| GraphLibraryDocument`） |
| `src/editor/demo/demo.ts` | `NODIA_DEMO_PROJECT` |
| `src/editor/persist/persist-client.ts` | load/save/draft/version（`project` 字段 = 文档） |
| `src/editor/persist/graphScenarioStore.ts` | 蓝图集合 + 选中 + 派生 |
| `vite.config.ts` / `server/tool-handlers.ts` / `forgeax-extension.json` | 端点与工具说明 |
| `src/editor/shell/BlueprintLibraryView.tsx` / `GraphStudio.tsx` | 库 UI + 试玩入口 |

---

## 任务进度（相对初稿）

### Task 1–4 · 类型 / 派生 / 引用 / demo — ✅ 已按 A 落地

- Manifest：`packs: Record<string, BlueprintDoc>`（含 main）+ `mainPackId`，**不是** `BlueprintEntry[]`。
- 文档类型：`GraphLibraryDocument`，不是 `{ manifest, blueprints, sharedMeta }`。
- 派生入口：`documentFromScenario` / `documentFromBlueprints` / `playDocument` /
  `validateDocument`（无旧字段兼容 shim）。
- 测试：`blueprint-types.test.ts`、`blueprint-project.test.ts`、`blueprint-refs` 相关。

### Task 5 · 序列化 — ✅ 已重做（单文件）

- `readDocument` / `writeDocument` 只碰 `scenarios.graph.json` + `scenarios.graph.versions/`。
- 旧「写 `blueprints/manifest.json` + 每蓝图一文件」**作废**。

### Task 6 · 端点 — ✅ 对齐文档契约

- GET/PUT 仍可返回/接收 `{ project }`；语义 = `GraphLibraryDocument`。
- `forgeax-extension.json` 文案已写明「scenario + manifest.packs（含主）」。

### Task 7 · persist-client + store — ✅

- `authoringProject()` → `documentFromBlueprints`。
- 试玩：`playDocument` / `playScn`；子蓝图「从此试玩」传 `activeBlueprintId`。

### Task 8 · 库 UI + 引用 — ✅ 主体已完成

已落地要点：新建浮层输入、⌂ 设为入口、去 `packDrill`、引用防环、双击跳转、
`fitReserveRightPx` 等。若手测发现缺口，按 spec §6–§7 补，**勿**回退文件夹落盘。

---

## 2026-07-22 跟进（方案 A 收尾）

已对齐：库在 `manifest.packs` / `mainPackId`；无根级 packs 数组与根级 mainBlueprintId；engine 依赖查 `manifest.packs`；
同图子流程专用入口；空入口无默认 `durationMs`；试玩浮层不自动 fit；`ClipPerformanceEndGate`；
`setScenario`/`视频 tab` 写 **active** 蓝图；节点配置引用候选含 main。

文档：`SKILL.md` / `AGENTS.md` / 本目录 spec 已按 A 修订。

仍属可选债务（非阻塞）：NodeInspector 仍用 `packs`/`onPacksChange` 命名（底层已 `importBlueprint`）。
`ScenarioMetaFields` / `documentFromScenario` 已去掉对旧 `packs` 的兼容。

## 验证清单

```bash
cd packages/marketplace/extensions/wb-game-video
bun test src/editor/persist/__tests__/blueprint-project.test.ts \
         src/runtime/__tests__/blueprint-types.test.ts \
         src/editor/shell/__tests__/clipPerformanceEndGate.test.ts \
         src/graph/__tests__/graph-edit.test.ts
```

手测：
1. 保存后磁盘仅有 `scenarios.graph.json`（含根 `graph` + `manifest.packs` 含 main），**无** `blueprints/`、**无** 根 `packs`。
2. 刷新后库列表与图一致；设入口 / 新建 / 删被引用拦截正常。
3. 主蓝图试玩与子蓝图「从此试玩」入口正确；从此试玩不挪动画布。
4. 序章（带 durationMs）→ 同图子流程 → 子蓝图：子流程视频应播完，不被旧 onEnded 跳过。
5. 在子蓝图上打开「视频」tab 改素材，应写回该子蓝图而非 main。
6. 旧草稿若加载失败 → 清 localStorage draft 或重置 demo。

---

## Self-Review（对照修订后 spec）

| Spec | 实现要点 |
|---|---|
| §0/§3 方案 A 单文件 + manifest 含 main | `GraphLibraryDocument` + `buildManifest` |
| §3.5 无 `blueprints/` | `blueprint-store-fs` |
| §4 store 选中语义 | `graphScenarioStore` |
| §5 端点整本文档 | persist-client / vite / tool-handlers |
| §6–§7 库 UI / 引用 | BlueprintLibraryView + GraphStudio + blueprint-refs |
| §9 entry heal | `resolveGraphEntry` |

**已知风险：** 根 `graph` 与 `manifest.packs[main].graph` 若有人手改一侧未走
`normalizeDocument`，会短暂不一致——所有写路径必须走规范化。
