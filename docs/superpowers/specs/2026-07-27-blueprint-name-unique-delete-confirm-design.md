# 蓝图库：名称唯一 + 删除二次确认

> 状态：🟢 SPEC（已与产品对齐，待实现）  
> 日期：2026-07-27  
> 读者：实现 wb-game-video 蓝图库 UX 的开发 / AI agent  
> 范围：蓝图库「新建 / 重命名」名称唯一性；无依赖删除时的二次确认。  
> 不做：节点面板「＋ 新建子蓝图」自动标题唯一性；抽公共 ConfirmDialog 组件库；允许有依赖时仍删除。

相关：`BlueprintLibraryView.tsx`、`graphScenarioStore.ts`（`createBlueprint` / `renameBlueprint` / `deleteBlueprint`）、视频库确认框参考 `VideoAssetLibrary.tsx`。

---

## 1. 目标

1. **名称唯一**：新建、重命名蓝图时，不允许与已有蓝图标题冲突（`trim` + 忽略大小写）。
2. **删除确认**：无依赖的子蓝图删除前必须二次确认；主蓝图 / 有引用时保持现有拦截提示。

成功标准：

- 连续点「＋」两次并都确认默认名「新蓝图」时，第二次失败并提示，库中只有一份
- 重命名成与另一蓝图仅大小写不同的名字时失败
- 无引用子蓝图点删除 → 出现确认对话框 → 取消则不删；确认后才删
- 有引用 / 主蓝图删除行为与今日一致（`alert` 拦截，不进入确认框）

---

## 2. 现状与缺口

| 路径 | 今日行为 | 缺口 |
|---|---|---|
| 新建 | 浮层输入 → `createBlueprint(title)`，无查重 | 默认可反复创建「新蓝图」 |
| 重命名 | `prompt` → `renameBlueprint`，无查重 | 可改成与他人同名 |
| 删除 | 直接 `deleteBlueprint`；失败才 `alert` | 成功路径零确认 |

---

## 3. 唯一性规则

- 规范化：`normalizeBlueprintTitle(title) = title.trim().toLocaleLowerCase('zh-CN')`
- 冲突：存在另一蓝图 `id !== selfId` 且规范化后相等 → 拒绝
- 重命名成「与自己当前标题规范化后相同」→ 允许（可写回 trim 后的字面量，见实现）
- 空标题（trim 后为空）：新建仍取消（与今日一致）；重命名取消（与今日 `if (t)` 一致）

校验落在 **store**：

- `createBlueprint` / `renameBlueprint` 冲突时不改 state，返回  
  `{ ok: false, reason: 'duplicate_title' }`
- 成功时返回 `{ ok: true, id }`（create）或 `{ ok: true }`（rename）
- 抽出纯函数 `isBlueprintTitleTaken(blueprints, title, excludeId?)` 供 store + 单测

UI：

- 新建：冲突时保留浮层，提示「已存在同名蓝图」
- 重命名：冲突时 `alert` 同文案，不关闭成功路径以外的状态

范围外：`NodeInspector`「＋ 新建子蓝图」自动生成标题暂不强制唯一。

---

## 4. 删除确认

点击行内 🗑：

1. 若 `id === mainBlueprintId` → 现有 `alert('主蓝图不可删')`，结束
2. 若 `blueprintsReferencing(...)` 非空 → 现有  
   `alert('被引用，无法删除：…')`，结束
3. 否则展示内联 **ConfirmDialog**（对齐 `VideoAssetLibrary` 的 backdrop/dialog/actions 模式，可本地复制轻量实现，本次不抽公共包）：
   - 标题：`删除蓝图`
   - 文案：`确定删除「{title}」？此操作不可撤销。`
   - 确认：`确认删除` → 再调 `deleteBlueprint`
   - 取消 / Esc / 点背景：关闭，不删

有依赖时**不**改成「警告后仍可删」；拦截语义不变。

---

## 5. 文件触点

| 文件 | 改动 |
|---|---|
| `src/editor/persist/blueprint-title.ts`（新）或就近纯函数模块 | `normalizeBlueprintTitle` / `isBlueprintTitleTaken` |
| `src/editor/persist/graphScenarioStore.ts` | create/rename 返回结果 + 查重 |
| `src/editor/shell/BlueprintLibraryView.tsx` | 新建错误提示；重命名处理；删除 ConfirmDialog |
| `src/editor/shell/catalogCss.ts` 或局部样式 | dialog 样式（可复用/镜像 `val-dialog*`） |
| `src/editor/persist/__tests__/graph-store-blueprints.test.ts` | store 重名失败 / 删除仍成功 |
| 纯函数单测 | trim / 大小写 / excludeId |

---

## 6. 测试计划

- 纯函数：`" 新蓝图 "` vs `"新蓝图"`；`"Ab"` vs `"ab"`；exclude 自己
- store：`createBlueprint` 第二次同名失败；`renameBlueprint` 撞名失败；无引用 `deleteBlueprint` 仍 `ok`
- 手工：蓝图库新建浮层错误态；删除对话框取消/确认；有引用仍 alert

---

## 7. 落地

- Studio worktree：`.worktrees/wb-gv-blueprint-name-delete-guard`
- PR 目标仓：`forgeax-marketplace`（扩展 `wb-game-video`）
