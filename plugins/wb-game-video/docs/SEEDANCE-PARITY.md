# 视频游戏 · Seedance / 交互原型 对齐清单（SSOT）

> **状态**：living doc，随实现更新勾选。  
> **权威参考**：
> - arrival `seedance/docs/GAME_CONFIG_DSL.md` + `prototype/game-config.js`（冷蓝悬崖）
> - 产品原型 `视频交互原型.html` 蓝图右栏节点配置分组
> - 本插件 `Scenario` v9（`gameplayTypes.ts`）

## 1. 配置套路（原型 → Scenario 映射）

原型右栏节点属性分组 **必须** 在蓝图 `BlueprintNodeConfig` 中同构呈现：

| 原型分组 | Scenario 字段 | 说明 |
|---|---|---|
| **演出** | `media` + `mediaPlayMode` | 视频编号 / 循环·单次 / 时长只读 |
| **界面** | `hudPreset` + `scenario.ui.hud` | 隐藏 / 主界面 / 战斗 / 探索 |
| **选项** | `decision.*` + `branches(kind=choice)` | 选项类型、呈现、限时窗、超时默认、跳转时点 |
| **限时 QTE** | `decision.optType=timed_qte` + `qte` + `qteKind` | 无选项列表，成功/失败走 qte_pass/fail |
| **热区** | `hotspots[]` | 画面点选；`detour` 原地对话 / `targetSceneId` 子流程 |
| **标记** | `setFlags[]` + `branch.effects` | 节点完成写标记；选项出现条件读标记 |
| **属性** | `onEnterEffects` + `branch.effects` | 数值 / 扣血（演出 cue 后续补） |
| **提示词** | `ext.prompt` 或视频 media meta | 生成视频用 |

### 选项类型（原型 `optType`）

| 原型 | `decision.optType` | 运行时行为 |
|---|---|---|
| 不限时选项 | `static` | 场景结束或 `windowEnd` 出选项 |
| 限时选项 | `timed` | 窗口内出选项 + `timeoutMs` 默认分支 |
| 限时 QTE | `timed_qte` | 窗口内 QTE；成败走 `qte_pass` / `qte_fail` |

### QTE 类型（原型 `qteKind`）

| 原型 | `decision.qteKind` / `qte` | 运行时 |
|---|---|---|
| 防反 QTE | `parry` | 单次按键/点击，窄窗口 |
| 精准时点 | `timing` | 节奏条 tap（现有 QTEOverlay） |
| 快速连打 | `mash` | 多 cue 连点 + `sequence` |
| 方向序列 | `sequence` | 按序 hit ←→↑ |
| 摇杆划动 | `sweep` | sweep 手势 cue |

## 2. 能力矩阵（seedance 五要素 + 原型）

| 能力 | seedance | 原型 HTML | wb-game-video | 状态 |
|---|---|---|---|---|
| 分支选择 | `choice` + `decision` | 选项组 + 连接点 | `ChoiceLayer` + `branches` | 🟢 loop + 边播边选 |
| Loop 待机 | `loop: true` | 演出方式=循环 | `mediaPlayMode: loop` | 🟢 |
| 限时选择 | `decision.timed` | 限时选项 + 时间轴 | `decision.optType=timed` | 🟢 |
| 限时 QTE | `qte` node | 限时 QTE + qteKind | `optType=timed_qte` | 🟢 |
| 探索热区 | `hotspots` + `detour` | §7 透明热区 | `hotspots` + `detour` | 🟢 |
| call/return | 子图 | 子蓝图 | `targetSceneId` + `returnsToCaller` | 🟢 |
| Boss / 血条 | `battle` + HUD | 战斗界面 HUD | `BossBattleOverlay` + `HudLayer` + performance | 🟢 |
| Performance 扣血 | `performance.cues` | 结算时间轴 | `Scene.performance` + Player tick | 🟢 |
| 转场叠化 | `transitions` | 转场节点 | `freeze` 硬切/叠化 | 🟢 部分 |
| 条件分支 | `Condition` | 出现条件·标记 | `Branch.condition` | 🟢 |
| 写标记 | `setFlag` effect | 标记组 | `setFlags` + `branch.effects` | 🟢 |

图例：🟢 可用 · 🟡 部分 · ⬜ 未做

## 3. 里程碑对照（历史 M1–M8）

| ID | 内容 | 状态 |
|---|---|---|
| M1 | schema v9 + gameplay 模块 | ✅ |
| M-蓝图 | BlueprintTab + 角标 | ✅ |
| M2 | HUD 骨架 | ✅ |
| M2.5 | 主预览路由 | ✅ |
| M9 | Nodia 蓝图优先 + 路由 | ✅ |
| **M3** | sequence/timeout QTE + optType | 🟢 |
| **M3b** | loop + 边播边选 + 跳转时点 | 🟢 |
| **M7** | hotspot detour + once | 🟢 |
| **M8** | 蓝图节点配置（原型分组） | 🟢 |
| M4 | 两级状态机收敛 | 🟢 `gameplayState.resolveInnerMode` |
| M5 | Boss 回合扣血 + 完美结局 | 🟢 performance 轴 + kind=battle 层 |
| M6 | HUD 规则精细显隐 | 🟢 `hudPreset` + `scenario.ui.hud` |
| M10 | Performance cue + 结算轴 | 🟢 |

## 4. 冷蓝悬崖 demo 验收（对照 game-config.js）

| 场景 | seedance 玩法 | demo 验收 |
|---|---|---|
| S1 | 旅人 hotspot detour | 🟢 hotspots + detour |
| L1 | wait + 方向键/超时默认洞穴 | 🟢 loop + timed + defaultBranch |
| S2a | 序列 QTE ←→↑ | 🟢 sequence qte |
| S2b | 节奏 QTE | 🟢 timing qte |
| Lb2 | 空格 single QTE | 🟢 parry + 空格键 |
| Boss 回合 | attackBeat 扣血 | 🟢 r1a/r1b/r2a/r2b performance |
| S4a/S4b | 胜负结局 | ✅ DAG |

## 5. 编辑器验收（对照原型右栏）

选中蓝图节点后，右侧应出现且可编辑：

- [x] 演出：循环/单次
- [x] 界面：HUD 方案四选一
- [x] 选项类型 + 选项列表 + 呈现方式
- [x] 限时：显示时间窗 + 超时默认 + 跳转时点
- [x] 限时 QTE：QTE 类型 + 判定结果只读
- [x] 热区列表：坐标/时间/detour/子流程
- [x] 标记：setFlags 列表
- [x] 分支出现条件（读标记）—— `BranchConditionsSection`

## 7. 「场景类型」(Scene.kind) 是什么？

原型 HTML **没有**单独叫「场景类型」的字段——它用 **选项类型 / 战斗调用 / 计算节点** 等分组表达玩法。我们在 Scenario v9 里收敛成 `Scene.kind` 四档，服务于 **两级状态机的内层分派**：

| kind | 运行时 | 蓝图 | 与原型对应 |
|---|---|---|---|
| `story`（缺省） | 纯播放 + 台词/热点 | 灰节点 | 普通演出节点 |
| `choice` | `ChoiceLayer` + `decision.*` | 黄节点 | 有「选项」组的节点 |
| `qte` | `QTEOverlay` + `qte` / `timed_qte` | 橙节点 | 限时 QTE / 节奏节点 |
| `battle` | `BossBattleOverlay` + `boss.*` | 红节点 | 独立回合 Boss 战（时机条） |

**和「界面 HUD 方案」(`hudPreset`) 的区别：**

- **场景类型** = **玩什么交互**（选 / QTE / 回合战 / 只看）
- **HUD 方案** = **屏幕上显示哪些条**（血条 / 分数 / 隐藏）

FMV Boss 战（冷蓝悬崖 r1a/r2a）走 **`performance` 结算轴** + `hudPreset: battle`，**不必**设 `kind: battle`。`kind: battle` 留给「视频定格 + 时机条 mini-game」那种独立 Boss 层。

## 6. 文件索引

| 区域 | 路径 |
|---|---|
| 类型 SSOT | `src/scenario/gameplayTypes.ts` |
| 运行时 | `src/player/Player.tsx`, `choiceTiming.ts`, `gameplayState.ts`, `performanceRuntime.ts`, `detour/DetourOverlay.tsx` |
| 蓝图编辑 | `src/forge/BlueprintNodeConfig.tsx`, `BlueprintGameplayPanel.tsx` |
| demo | `src/scenario/demoScenario.ts` |
| Agent | `SKILL.md`, `server/tool-handlers.ts` |
