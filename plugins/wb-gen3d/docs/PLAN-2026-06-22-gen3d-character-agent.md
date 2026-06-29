# PLAN 2026-06-22 — 3D 角色生成助手（agent-gen3d · 静态优先）

> **状态**: 🟢 PLAN · 2026-06-22 Asia/Hong_Kong · **待其他 agent review**
> **Owner**: laurenceelu
> **分支**: `laurenceelu/feat-20260622-gen3d-agent-persona`（studio + marketplace 同名）
> **关联**:
> - [PLAN-2026-06-17](./PLAN-2026-06-17-agentification-and-v2-roadmap.md)（agent 化主轴 A 线 —— 本文是其 A0–A4 在「只做角色 / 静态优先」产品约束下的收敛与落地）
> - [ADR-0005](./adr/0005-agentification-spine-v2-parallel.md)（agent 化战略 + host-tools 桥链路）
> - [ADR-0006](./adr/0006-meshy-public-api-rig-anim-for-beta.md)（Meshy 公网绑骨/动画，公测默认）

---

## 0 · 给 reviewer 的一句话

把「agent 化主轴」收敛成一个**范围受控、对话驱动、静态优先**的产品：**一个只做角色的 3D 角色生成助手**。用户在聊天里 @ 它、说一句自然语言 → 它跑生成流程 → 返回一个 per-game 的 3D 角色资产。

本轮（2026-06-22）已落地 **A1（建 `agent-gen3d`）** + **A2 的一半（翻 `score-quality`/`rename-asset`）**，并把 persona 对齐到「静态优先」。本文锁定产品决策、列出**剩余任务**与**开放问题**，供 review 后执行。

---

## 1 · 目标（plain）

用户在 AI 对话框里 @「3D 角色生成助手」，用一句大白话（例："我要一个科幻女战士角色"），助手就：
锁定参数 → 跑生成流程 → 把一个**静态** 3D 角色资产交回，并**主动提示**"需要的话可以让它会动"。

---

## 2 · 已锁决策（review 时不要 re-litigate，需改请显式提出）

| # | 决策 | 要点 |
|---|---|---|
| **D1 范围** | **只做角色（人物）** | 不做道具 / 场景 / 建筑。`auto-rig` / `apply-motion` 仅人形 `characters` 槽。 |
| **D2 交付默认** | **静态优先，会动按需** | 默认只生成并交付**静态角色**；交付时**主动提示**可绑骨+动作；**仅当用户明确要会动**才跑 `auto-rig`/`apply-motion`（省真实配额）。 |
| **D3 架构** | 照搬 reel/Reia 三件套 | ①persona ②工具白名单 `provides.agent.tools` ③host-tools 桥自动注入（见 PLAN-2026-06-17 §0.1，先例 `agent-reia` / `agent-reel-*`）。 |
| **D4 名称/外观** | 临时 `Gen3D / 🗿 / #E0A458` | 可后续按品牌调。 |

---

## 3 · 本轮已落地（this session，2026-06-22）

- **A1 — 新建 `packages/marketplace/plugins/agent-gen3d/`**：
  - `forgeax-plugin.json`（`kind:"agent"`，`provides.agent.tools: ["gen3d:*"]`，照抄 `agent-reel-storyboard`）。
  - `persona/zh.md`（已按 **D2 静态优先**写：生成静态→评分→命名→交付→主动提示可动→仅按需绑骨/动作）。
  - `memory/lessons.md`（占位）。
- **A2（一半）— `wb-gen3d/forgeax-plugin.json`**：`gen3d:score-quality`、`gen3d:rename-asset` 的 `exposedToAI` 翻 `true`（纯本地、无配额）。其余工具描述本就齐全。
- **校验**：`bun packages/types/test/validate-manifests.ts` → **57/57 ok**（`agent-gen3d` 识别为合法 `agent`；`wb-gen3d` 翻 flag 后仍合法）。
- **当前 AI 可见的 `gen3d:*` 工具（10 个）**：`provider-status` `list-assets` `generate-meshy-text-mock` `text-to-3d` `image-to-3d` `views-to-3d` `refine-mesh` `pose-standardization` `score-quality` `rename-asset`。
  - ⇒ 「**生成 + 评分 + 命名**」半条产线已 **agent-ready**（一旦 server 扫描到 `agent-gen3d`，桥即把这 10 个注入它的对话清单）。
- **仍 `exposedToAI:false`（未给 AI）**：`auto-rig` `apply-motion` `list-motions` `retopo-lowpoly` `delete-asset` `upload-image` `get-credentials` `set-credentials`。

---

## 4 · 剩余任务（待 review 后执行）

| # | 任务 | 说明 / 闸门 | 文件 |
|---|---|---|---|
| **T1** | **A0 动态确认**（桥真的注入了工具） | 起 stack（`claude-code` provider）→ 在 Studio 里让 `agent-gen3d` 真调一次 `gen3d:list-assets`，确认它进了对话清单。**零配额**。 | — |
| **T2** | persona 措辞校核 | 复核 `agent-gen3d/persona/zh.md` 是否准确体现 D2（本轮已改，review 把关）。 | `agent-gen3d/persona/zh.md` |
| **T3** | **A4 — 翻"会动"那半套** | 把 `auto-rig`/`apply-motion`/`list-motions` 翻 `exposedToAI:true`，同步 `catalog`/`CAPABILITY_MATRIX`。**前置闸门**：①真机目视签字（PLAN-2026-06-21 §7 已有真机 ModelViewer 播放，待 operator 认可）；②花钱护栏（见 Q-cost）。 | `wb-gen3d/forgeax-plugin.json` · `shared/catalog.ts` · `docs/CAPABILITY_MATRIX.md` |
| **T4** | A3 自动评分回填（可选） | 生成成功后把客观五维 `qualityScore` 自动写进 sidecar，agent 无需再显式评分。 | `wb-gen3d/server/tool-handlers.ts` · `server/per-game-store.ts` |
| **T5** | A5 引擎端到端（跨边界，需授权） | 让游戏引擎真的加载 gen3d 角色并 ▶Play 跑动画。**超出插件边界，单独立项**。 | engine / game-template（插件外） |

**硬序**：T1 →（T3 等 operator + Q-cost）。T2 随手。T4/T5 独立。

---

## 5 · 开放问题（review 时拍板）

| # | 问题 | 建议默认 |
|---|---|---|
| **Q-real** | 真实生成默认开还是先 mock？真出模型需先在插件内配 Meshy 等 key + 打开真实开关（`GEN3D_ENABLE_REAL_PROVIDERS=1`）；未配=出 mock 占位模型。 | 配好 key、**真实生成为默认**（mock 模型对用户无意义，仅作离线试流程）。 |
| **Q-cost** | 绑骨/动作（及真实生成）按次计费。给 agent 用前要不要加"先报价/先确认/余额预检"护栏？ | T3 前补：付费调用前 `GET /balance` 预检 + 在 persona/UI 明示消耗；保留 D2 的"按需"作第一道护栏。PLAN-2026-06-21 §6 已有错误映射基础。 |
| **Q-entry** | 用户在对话框里"@/选"到 `agent-gen3d` 的具体入口 UX 还没摸清。 | review/执行时去 `packages/interface` 摸 agent 选择/委派入口，补进文档。 |
| **Q-migrate** | `origin/evolve/extract-orchestration` 合入 main 会**删掉 host-tools 桥**（PLAN-2026-06-17 §0.3）→ 自动注入链路失效。 | 赶在它合入 main **前**把 T1 跑通留证；或与 @ruibinmao 对齐新 API 下 per-agent 工具装配写法。 |

---

## 6 · 怎么验证（成功判据）

- **manifest**：`cd packages/types && bun test/validate-manifests.ts` → 应 **57/57 ok**。
- **rebuild dist**：本轮只改 manifest JSON + 新增 agent 插件（无 `wb-gen3d/src/**` 改动）→ **无需** `bun run build`。日后若改 `wb-gen3d/src/**`，按 HANDOFF「铁律」rebuild dist 再验 Studio 内嵌。
- **live（T1）**：`bash start.sh` → Studio 切 `claude-code` provider → 对 `agent-gen3d` 发一句话，确认它能调到 `gen3d:list-assets`。

---

## 7 · 明确不在本范围（以后单独立项）

- 道具 / 场景 / 建筑生成（D1 划走）。
- 引擎端到端加载 gen3d 角色（T5 / A5，跨插件边界）。
- 混元 `motion_retarget_v2` 48 动作库（B 线，PLAN-2026-06-17 §3）。
- P4 AI 视觉评分（需 server 多模态授权）。
