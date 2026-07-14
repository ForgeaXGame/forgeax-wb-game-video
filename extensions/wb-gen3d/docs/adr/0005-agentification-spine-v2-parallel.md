# ADR-0005 — agent 化为主轴 · v2 动作库并行异步 · 打磨附属

- **Status**: Accepted（2026-06-17）—— 本轮开发路线的优先级定调。落地清单见 [`PLAN-2026-06-17-agentification-and-v2-roadmap.md`](../PLAN-2026-06-17-agentification-and-v2-roadmap.md)。
- **Date**: 2026-06-17
- **Deciders**: laurenceelu（gen3d owner，拍板"按推荐方案推进，回头 review"）
- **Extends/Amends**: 承接 [ADR-0003](./0003-rig-motion-lowpoly-pipeline.md)（M13 rig/motion/lowpoly 产线）已落地的现状；不改 ADR-0001/0002/0003/0004 任何决策。本 ADR 只决定"下一步先做什么、按什么序"。
- **Inputs**: 半月报《gen3d 从混元沙盒到 ForgeaX 产线与下一步》§6；技术方案《gen3d motion_retarget_v2 48 动作库解锁方案》。

## Context

gen3d 经五阶段（沙盒→产品化 M0–M13→质量体验→交付收尾）主体成型，已并入三仓 main。
半月报 §6 列出四条后续线：6.1 近期收尾 / 6.2 agent 化（标"核心方向"）/ 6.3 v2 48 动作库 / 6.4 配套。
需要一个明确的优先级定调，避免主轴被外部依赖卡住而停摆。

定调前做了一次代码核实（2026-06-17 grep + 读码），得到两个**反直觉、且决定方案形态**的发现：

1. **agent 化不是翻 `exposedToAI` boolean 就完成。** 工具进入某 agent 的 LLM 工具清单需要：工具
   `exposedToAI:true` **且** 某 agent manifest 声明 `provides.agent.tools:["gen3d:*"]` 白名单
   **且** host-tools 桥真的注入。核实：当前**无任何 agent 声明 `gen3d:*`**；`exposedToAI` 在
   `packages/server/src` / `packages/cli/src` **零消费**（唯一消费者在 `packages/interface`
   的 surface 注册 + BusAdminPanel 可视化），**找不到 server/cli 里 `agent.tools`→exposedToAI 的注入实现**。
   ⇒ 桥的实现状态存疑，须先 de-risk。
   > ⚠️ **2026-06-21 复核更正**：此判断有误——grep 漏扫了 `packages/server/builtin/`。桥早在 2026-05-30
   > （commit `8b86459`）落地于 `builtin/kits/host-tools/extensions/host_tool_bridge.ts`（`:149-151` 按
   > `exposedToAI`+allow glob 过滤、`:175` 注入 agent 工具表），`agent-reel-storyboard`/`agent-kotone` 等已在用。
   > **桥已通；A0 降级为配置确认，"需 operator 授权实现桥"分支取消。** 详见文末「复核更新」+ PLAN §0.1。
2. **"游戏加载 gen3d 角色"这一跳从未跑通、且跨插件边界。** 引擎能加载 skinned GLB（`apps/hello/skin`），
   但游戏走 pack+GUID（`game-default/main.ts`），而 gen3d 写的是裸 `.glb` 文件；`packages/games`
   里无任何游戏引用 `assets/3d`。这座桥属引擎/game-template/skill 层，超出 gen3d 插件边界。

## Decision

**三线分优先级，不混轴：**

1. **A 主轴 = agent 化端到端。** 理由：①这是把 gen3d 从"人在 Workbench 点"变成平台真实价值
   （Forge 自动产角色）的那一步，与 ForgeaX chat-driven 本质对齐；②它绝大部分现在可编码；
   ③v1 的 8 动作已够证明端到端链路。
2. **B 并行异步 = v2 48 动作库（M14）。** 理由：技术方案自己已论证其**关键路径在上游
   @raineejiang 的权威清单/形态**，不在代码——故**不能当主轴**（主轴不能被外部卡死），
   正确做法是立刻把上游三问 + 探测脚本发出去，让它在后台跑，等回应再做增量集成（约 0.5–1 天）。
3. **C 附属 = 打磨（HDR/视图器/评分 UI）。** 只做 A 链路需要的，其余按需插空。

**两个发现转为方案约束（不是可选项）：**

- A 线第一步（PLAN §2.A0）是 **host-tools 桥确认**：桥已存在（见 Context 复核更正 + 文末复核更新），
  A0 只需照抄 `agent-reel-storyboard` 的 `provides.agent.tools` 模板 + 跑一轮对话确认；~~桥若缺失需 operator 授权实现~~ 不再适用。
- end-to-end 最后一跳（PLAN §2.A5）**跨边界、需 operator 授权 / 可单独立项**；gen3d 插件职责
  到"per-game GLB 资产 + manifest 落盘"为止。

**推迟出本期：** P4 AI 视觉评分（卡 server 多模态授权）、低模带贴图 re-bake（Blender/xatlas，单独立项）。

## Consequences

- **正面**：主轴始终可推进（不被上游/operator 卡死）；v2 解锁周期最长的环节（上游）最早启动；
  下个 agent 不会误以为"翻 boolean = agent 化完成"而交付一个没人能调、没游戏能加载的工具集。
- **代价/风险**：① ~~若 A0 发现桥缺失，需 operator 授权改 server~~ → 复核已确认桥存在，此风险消除；
  **改为新增迁移风险**：`evolve/extract-orchestration` 会删整个 `builtin/kits/`（含本桥），合入后 `agent-gen3d`
  需改走 forgeax-core 显式 tools 注入 API（见文末复核更新）；
  ② A5 端到端依赖跨边界授权，可能本期只到"插件职责边界"为止、闭环留待立项；③ v2 上线时间不可控
  （上游依赖），故 v1 8 动作必须持续作为产线可用回退。
- **回退**：B 线全程 feature-gate，不阻塞 A；v2 是 v1 的超集旁路，不替换 v1。

## 复核钩子

下个 agent / reviewer 接手时先复核本 ADR 两个发现是否仍成立（桥状态、引擎加载边界）——
它们随 server/engine/agent 代码演进可能变化；若已变，更新本 ADR + PLAN §0 再继续。

## 复核更新（2026-06-21）

接手复核（读码 + git log + 远端 diff 评估）对 Context 两个发现的结论：

1. **发现①（桥状态）已更正 → 桥早已存在且在用**：`packages/server/builtin/kits/host-tools/extensions/host_tool_bridge.ts`
   （2026-05-30 commit `8b86459`；`:149-151` 过滤 `exposedToAI`+allow glob、`:175` 注入）。链路：
   `provides.agent.tools` → `ensureAgentPersonaKitOverrides`（`core/session.ts:182`、`agents/host-tools-overrides.ts:42`）
   写 `agent.json kits.config['host-tools'].allow` → 桥注入 → LLM；CLI 路 `api/tools.ts:42`。初稿误判源于
   grep 只扫 `src/`、漏 `builtin/`。**模板可直接抄 `agent-reel-storyboard`。** ⇒ A0 降级为配置确认，A 线无"授权实现桥"分支。
2. **发现②（引擎加载边界）仍成立**：未复核出反例，A5 仍跨边界、需授权 / 单独立项。
3. **新增：迁移风险**。`origin/evolve/extract-orchestration`（未合 main）将删 `builtin/kits/`（含本桥）、改 forgeax-core
   原生显式 tools 注入。对策：现在基于当前 main 推进；该分支合入前跑通 A1 并留记录；与作者 ruibinmao 对时间点。
