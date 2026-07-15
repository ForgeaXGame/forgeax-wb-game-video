# 视频游戏 · Seedance / 交互原型 对齐清单（SSOT）

> **状态**：living doc（2026-07-15 对齐 **edges=路由 / reactions=副作用 / overlays=UI**）。  
> 旧 FMV / `Scene` / `ui.hud` / `TimelineElement` / `edge.data.effects` 路径已退役。

## 1. 配置套路（原型 → graph）

| 原型分组 | 现行字段 | 说明 |
|---|---|---|
| **演出** | `NodeData.media` + `mediaPlayMode` + `durationMs` | 视频 ref / 循环·单次 |
| **界面** | `scenario.ui.overlays` + `overlayNodes` | 可复用 Overlay；节点只挂引用 |
| **选项** | overlay child `choice`/`skill` + 边 `opt:*` | 点选副作用可挂 `option.effects` |
| **限时 QTE** | overlay child `qte` + `trigger`/`windowMs`/`timeoutMs` | 成败走 exits → 边 |
| **热区** | overlay child / 后续特化节点 | detour 用显式边或 `subFlow` |
| **标记 / 属性** | `reactions[].do` effect（`{expr}` 可引用 attrs/vars）+ `edge.data.condition` | 声明式，无函数入库 |

## 2. 能力矩阵

| 能力 | 现行实现 | 状态 |
|---|---|---|
| 分支选择 | choice child + `opt:*` 边 | 🟢 |
| Loop 待机 | `mediaPlayMode: 'loop'` + `<video loop>` | 🟢 |
| 限时选择 / QTE | `timeoutMs`/`windowMs`/`durationMs` 归一 | 🟢 |
| call/return | `subFlow` / `subFlowPack`；叶子无出边自动弹栈 | 🟢 |
| 回环 | 显式边（不用 `returnsToCaller`） | 🟢 |
| Boss / 血条 | overlay `surface:'hud'` + skins | 🟢 |
| 结算扣血 | node/mount `reactions` effect（可 `{expr}`） | 🟢 |
| 条件分支 | `edge.data.condition` + 局级 `scenario.reactions`（state→goto） | 🟢 |
| 结局标记 | **无** `data.end`；无出边且栈空 → ended | 🟢 |

## 3. 编辑器验收

选中蓝图节点后：

- [x] 演出：循环/单次、视频绑定
- [x] 嵌套：同图子流程 / 子蓝图 pack
- [x] 覆盖物：只读显示 `overlayNodes[].overlay`（细编走「视频」「界面」）
- [x] 出边：handle / 目标 / condition / weight / label（无 edge effects）
- [x] 视频 tab：字幕/飘字/QTE/选项/滤镜/特效写入该节点专属 overlay children

## 4. 权威文档

| 主题 | 文档 |
|---|---|
| Overlay 契约 | `docs/superpowers/specs/2026-07-13-wb-game-video-screen-slot-contract-design.md` |
| 类型 SSOT | `src/runtime/schema/node-config-schema.ts` + `graph-schema.ts` |
| 皮肤契约 | `src/runtime/skins/components/CONTRACT.md` |
