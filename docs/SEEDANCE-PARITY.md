# 视频游戏 · Seedance / 交互原型 对齐清单（SSOT）

> **状态**：living doc（2026-07-15 对齐 **edges=路由 / reactions=副作用 / overlays=UI**）。  
> 旧 FMV / `Scene` / `ui.hud` / `TimelineElement` / `edge.data.effects` 路径已退役。

## 1. 配置套路（原型 → graph）

| 原型分组 | 现行字段 | 说明 |
|---|---|---|
| **演出** | `NodeData.media` + `mediaPlayMode` + `durationMs` | 视频 ref / 循环·单次 |
| **界面** | `scenario.ui.overlays` + `overlayNodes` | 可复用 Overlay；节点只挂引用 |
| **选项** | overlay child `InkYingMo` / `BattleSkill` / `TextOption` + 对应组件事件边 | 点选副作用走组件 emit → reactions / 边 |
| **限时 QTE** | overlay child `InkKou` / `BattleParry` + `trigger` / `window` / `timeoutMs` | 成败走组件事件 → 边 |
| **热区** | overlay child / 后续特化节点 | detour 用显式边或 `subFlow` |
| **标记 / 属性** | `reactions[].do` effect（`{expr}` 可引用 attrs/vars）+ `edge.data.condition` | 声明式，无函数入库 |

## 2. 能力矩阵

| 能力 | 现行实现 | 状态 |
|---|---|---|
| 分支选择 | `InkYingMo` / `BattleSkill` / `TextOption` child + 组件事件边 | 🟢 |
| Loop 待机 | `mediaPlayMode: 'loop'` + `<video loop>` | 🟢 |
| 限时选择 / QTE | `timeoutMs`/`windowMs`/`durationMs` 归一 | 🟢 |
| call/return | `subFlow` / `subFlowPack`；叶子无出边自动弹栈 | 🟢 |
| 回环 | 显式边（不用 `returnsToCaller`） | 🟢 |
| Boss / 血条 | overlay `BattlePlayerHpBar` / `BattleEnemyHpBar`（绘制时接收已解析 props） | 🟢 |
| 结算扣血 | node/mount `reactions` effect（可 `{expr}`） | 🟢 |
| 条件分支 | `edge.data.condition` + 节点/挂载 reactions（无局级 scenario.reactions） | 🟢 |
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
| Overlay 契约 | `src/runtime/schema/node-config-schema.ts` |
| 类型 SSOT | `src/runtime/schema/node-config-schema.ts` + `graph-schema.ts` |
| 组件 props / 注册 | `src/runtime/component-host/RuntimeComponentHost.tsx` · `component-host/index.ts` · `components/index.ts` · `components/manifest.ts` |

当前内建 catalog 以 `components/index.ts` 的 11 个 manifest 为准。历史数据、旧 fixture 或设计记录中
可能出现 `choice`、`skill`、`qte`、`battleHpBar` 等小写名称；它们不是当前隔离 catalog 的注册 ID，
不能据此推断运行时仍注册对应旧组件。
