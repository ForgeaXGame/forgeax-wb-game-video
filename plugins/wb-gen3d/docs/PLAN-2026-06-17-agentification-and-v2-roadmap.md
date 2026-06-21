# wb-gen3d 执行路线方案：agent 化主轴 + v2 动作库并行（2026-06-17）

> **For agentic workers:** 本文是给**下一个执行 / review 的 agent** 的路线总账。
> 用 `executing-plans` 或 `subagent-driven-development` 逐任务执行；任务步骤用
> `- [ ]` 勾选跟踪。**先读 §0 两个硬约束**——它们推翻了"agent 化 = 翻 boolean"
> 这个直觉，是本轮最容易翻车的地方。
>
> **状态** 🟢 PLAN · 2026-06-17 · 待 operator / 其他 agent review + 执行
> **作者定调** 由 gen3d owner 拍板"按推荐方案推进"：A 主轴 / B 并行异步 / C 附属（见 [ADR-0005](./adr/0005-agentification-spine-v2-parallel.md)）
> **关联**
> - 半月报《gen3d 从混元沙盒到 ForgeaX 产线与下一步》§6（下一步开发计划）
> - 技术方案《gen3d motion_retarget_v2 48 动作库解锁方案》（B 线的独立行动方案，本文 §3 是其落地映射）
> - [ADR-0005](./adr/0005-agentification-spine-v2-parallel.md)（战略定调 + 两个被代码核实的发现）
> - 历史 SSOT：[ADR-0003](./adr/0003-rig-motion-lowpoly-pipeline.md)（M13 产线）、[ADR-0004](./adr/0004-on-demand-hybrid-quality-scoring.md)（评分）

**Goal:** 把 wb-gen3d 从"人在 Workbench 里点"推进到"**Forge / 子 agent 能一句话产出一个绑骨、带动作、引擎可加载的角色**"，并行解锁混元 `motion_retarget_v2` 的 48 动作库。

**Architecture:** 三线分优先级、不混轴——
- **A 主轴 = agent 化端到端**：让 gen3d 的 `gen3d:*` 工具进入某个 agent 的对话工具清单，跑通"意图→生成→绑骨→套动作→落 per-game 资产→引擎加载"。
- **B 并行异步 = v2 48 动作库（M14）**：关键路径在上游回应（@raineejiang），**不阻塞主轴**；现在就把上游问询 + 探测脚本发出去/备好，等回应再做增量集成。
- **C 附属 = 打磨**：HDR / 视图器 / 评分 UI，**只做 A 需要的**，其余按需。

**Tech Stack:** TypeScript（插件前端 React + 后端 bun handlers）/ 混元 REST + Meshy + Rodin provider / forgeax ECS 引擎（skinned GLB via `loadByGuid` + `Skin` + `AnimationPlayer`）/ forgeax plugin manifest（`forgeax-plugin.json` tool/agent 契约）。

**本轮边界（沿用工作区硬规则）:** 默认只动 `packages/marketplace/plugins/wb-gen3d/` + 新增 `agent-gen3d` 插件目录。**A5（引擎加载）和任何 `packages/server`/`packages/engine` 改动跨插件边界，必须先拿 operator 授权**（见 §0.2 / §2.A5）。

---

## 0 · 必读：两个被代码核实的硬约束（不要假设）

> 这两条是 2026-06-17 实际 grep + 读码核实的，不是推测。下个 agent 若跳过这节、
> 直接"把 `exposedToAI` 翻 true 就以为 agent 化完成"，会得到一个**没有任何 agent
> 能调用、也没有任何游戏能加载**的工具集。

### 0.1 agent 化 ≠ 翻 `exposedToAI` boolean

agent 真正能调用一个 `gen3d:*` 工具，需要三件事**同时成立**：

1. 工具 `exposedToAI: true`（M13 三工具当前 `false`，卡 operator 目视）。
2. **某个 agent 在 manifest 里声明 `provides.agent.tools: ["gen3d:*"]` 白名单**——
   host-tools 桥据此把 exposedToAI 的宿主工具注入该 agent 的 LLM 工具清单（opt-in，
   缺省不注入）。定义见 `packages/types/src/agent.ts:39-43`、`packages/types/src/manifest.ts:119-121`；
   AgentLoader 解析见 `packages/server/src/agents/loader.ts:368-385`。
3. **host-tools 桥真的把白名单 × exposedToAI 注入到了对话工具清单**。

**核实结论（关键风险）：**
- 当前**没有任何 agent 声明 `gen3d:*`**（全仓只有 `wb-gen3d/forgeax-plugin.json` 自己提到 `gen3d:`）。
  已声明 `tools` 白名单的 agent 只有 4 个：`agent-kotone` / `agent-reia` / `agent-mira` / `agent-lowpoly`。
- `exposedToAI` 在 `packages/server/src` / `packages/cli/src` 里**零消费**；唯一消费者在
  `packages/interface/src`：`lib/surface.ts`（UI surface 注册）+ `components/Bus/BusAdminPanel.tsx`
  （只是"哪些工具 AI 可见"的可视化面板）。**找不到** server/cli 里把 `agent.tools` glob 匹配
  exposedToAI 宿主工具、注入对话清单的实现。
- ⇒ **桥的实现状态存疑**。所以 §2.A0 是 P0：先用一笔真实 probe 证明"声明白名单 + exposedToAI ⇒ 工具真进了 agent 的 LLM 清单"。
  - 若桥已通 → A1/A4 是纯配置（写 manifest + 翻 boolean）。
  - 若桥缺失/半成品 → A0 追加一个"实现 host-tools 注入桥"的子任务（在 `agents/loader.ts` → chat 装配路径），**这属 server 改动，需 operator 授权**。

### 0.2 end-to-end 最后一跳（游戏加载 gen3d 角色）未建、且跨插件边界

- 引擎**有能力**加载 skinned GLB + 播放动画：`assets.loadByGuid<SceneAsset>` →
  `assets.instantiate` → 同实体挂 `Skin` + `AnimationPlayer`，`advanceAnimationPlayer`
  由 `createApp` 自动注册。参考实现 `packages/engine/apps/hello/skin/`（Khronos Fox 3 实例 3 动作）、
  契约 `packages/engine/packages/gltf/README.md`、`packages/engine/packages/runtime/README.md` §Skin。
- 但游戏走的是 **pack + GUID** 路径：`game-default` 模板只 `loadByGuid` 它的 `scene.pack.json`
  里按 `guid` 注册的资产（见 `packages/engine/templates/game-default/main.ts:100-189` +
  同目录 `AGENTS.md`）。
- **gen3d 写的是裸 `.glb` 文件**（落 `.forgeax/games/<slug>/assets/3d/{characters,meshes}/<name>.glb`），
  **不是 pack 条目**。核实：`packages/games` 里**没有任何游戏**引用 `assets/3d` / `.glb` /
  `AnimationPlayer`——这一跳从没跑通过。
- ⇒ "gen3d 产物 → 游戏可加载"需要一座桥（把 per-game GLB 解析成 SceneAsset/SkeletonAsset/
  AnimationClip 并注册，或产出引用它的 pack 条目）。**这座桥属引擎 / game-template / agent-skill 层，
  超出 gen3d 插件边界**，列为 §2.A5，需 operator 授权 / 单独立项。gen3d 插件的职责到
  "per-game GLB 资产 + manifest 落盘"为止。

---

## 1 · 优先级与依赖图

```
A 主轴（agent 化）              B 并行异步（v2 M14）         C 附属
─────────────────              ────────────────────         ──────
A0 桥 de-risk probe  ⟵P0       B0 上游三问+复现包 ⟵立刻发    C1 HDR presets（可立即）
   │  (若桥缺→授权实现)         B1 探测矩阵脚本（并行）       C2 视图器/评分 UI 打磨
   ▼                              │                          C3 Rodin views 真机验证
A1 agent-gen3d persona          B2 验证 Gate（§五 byte-diff）
   (tools:["gen3d:*"])            │  ⟵ 卡 B0/B1 任一出有效值
   ▼                              ▼
A2 AI 友好描述 + 翻            B3 增量集成 provider→schema
   score-quality/rename            →catalog→UI
   ▼                              ▼
A3 score 回填 manifest         B4 agent 暴露 v2 动作集
   ▼
A4 翻 M13 三工具 exposedToAI  ⟵ 卡 operator 目视
   ▼
A5 引擎加载端到端  ⟵ 跨边界，需授权 / 单独立项
```

**硬序**：A0 → A1 → A2/A3（可并行）→ A4 → A5。B 线整体与 A 并行，B2 卡 B0/B1。C 随时插空。
**立刻可动（无 operator/上游/授权门）**：A1、A2、A3、B0、B1、C1。
**卡人/上游/授权**：A0 的"实现桥"分支（授权）、A4（operator 目视）、A5（授权）、B2+（上游）、C3（key）。

**推迟出本期（明确 out-of-scope）**：见 §5。

---

## 2 · Phase A — agent 化（主轴）

### Task A0：host-tools 桥 de-risk probe（P0，先做，决定 A 线形态）

**目的：** 用一笔真实验证回答"声明 `tools` 白名单 + `exposedToAI:true` ⇒ 工具真进 agent 的 LLM 工具清单吗？"（见 §0.1）。

**Files:**
- Read: `packages/server/src/agents/loader.ts`（`tools` 解析后流向哪里）
- Read: `packages/interface/src/components/Bus/BusAdminPanel.tsx:703,2225`（运行时"AI-exposed 工具"判定）
- Read: 对话/LLM 工具装配路径（先 `rg -n "tools" packages/server/src/chat packages/server/src/sessions 2>/dev/null`，定位 claude-code driver 拿工具清单的地方）

- [ ] **Step 1：静态定位桥**。从 `agents/loader.ts:385` 的 `tools` 返回值出发，追到它在 chat/session 装配 LLM 工具清单时是否被 glob-匹配到 exposedToAI 宿主工具。记录结论文件:line。
- [ ] **Step 2：动态验证（用已 exposedToAI:true 的 gen3d 工具，零配额）**。临时给一个测试 agent（或直接给 `agent-lowpoly`）加 `tools:["gen3d:*"]`，`bash start.sh`，在 Studio 里跟该 agent 开一轮对话，让它列出/调用 `gen3d:list-assets`（已 `exposedToAI:true`、纯本地、无配额）。
- [ ] **Step 3：判定并分叉**
  - 工具出现在 agent 可调清单 + 能成功调 `gen3d:list-assets` → **桥已通**。A1/A4 走纯配置路径。把 Step 2 的临时改动回滚。
  - 工具没出现 / 调不到 → **桥缺失**。在本 PLAN §2.A0 下追加子任务"实现 host-tools 注入桥"（`agents/loader.ts` → chat 装配处，按 `agent.tools` glob 过滤 `exposedToAI:true` 的已扫描工具注入），**标记为 server 改动、需 operator 授权**，并把 A1 之后的步骤挂到它后面。

**Exit criteria:** 一句明确结论写进 HANDOFF —— "桥已通（A1=配置）" 或 "桥缺失（需授权实现，已建子任务）"。**A1 之后所有步骤都依赖这个结论。**

---

### Task A1：新建 `agent-gen3d` persona，声明 `gen3d:*` 工具白名单

**目的：** 给 gen3d 一个"会用这套工具"的 agent 人格（现成模板 = `agent-lowpoly`）。

**Files:**
- Create: `packages/marketplace/plugins/agent-gen3d/forgeax-plugin.json`
- Create: `packages/marketplace/plugins/agent-gen3d/persona/zh.md`
- Create: `packages/marketplace/plugins/agent-gen3d/memory/`（空目录占位，放 `.gitkeep`）
- Reference: `packages/marketplace/plugins/agent-lowpoly/forgeax-plugin.json`（模板）

- [ ] **Step 1：写 manifest**（命名/avatar/color 可按团队风格调，下面是具体起步值）：

```json
{
  "schemaVersion": 1,
  "id": "@forgeax-plugin/agent-gen3d",
  "version": "0.1.0",
  "kind": "agent",
  "displayName": { "zh": "Gen3D · 3D 角色生成师", "en": "Gen3D · 3D Character Artist" },
  "description": {
    "zh": "专职 3D 角色生成师。在「3D 生成工坊」(wb-gen3d) 里用 text/image/views 生成带贴图角色，按需绑骨、套动作、评分、命名，产出 per-game 的 .glb 资产。只做 3D 角色资产生产，不写引擎代码 / 不画 2D 立绘。",
    "en": "Dedicated 3D character artist. Generates textured characters (text/image/views) in the Gen3D workbench (wb-gen3d), then rigs / animates / scores / names them into per-game .glb assets. 3D character assets only — no engine code, no 2D art."
  },
  "provides": {
    "agent": {
      "id": "gen3d",
      "role": "modeling",
      "card": { "name": { "zh": "Gen3D", "en": "Gen3D" }, "color": "#E0A458", "avatar": "\ud83d\uddff" },
      "personaFile": "./persona/zh.md",
      "memoryDir": "./memory/",
      "produces": ["<active_game>.dir/**/assets/3d/**/*.glb"],
      "preferredCliProvider": "forgeax-native",
      "defaultLang": "zh",
      "multiInstance": false,
      "tools": ["gen3d:*"]
    }
  },
  "experimental": true
}
```

- [ ] **Step 2：写 `persona/zh.md`**。内容覆盖：①工作台定位（wb-gen3d）；②标准产线顺序（generate → 选中资产 → auto-rig（仅 characters）→ apply-motion（v1 8 动作）→ score-quality → rename/export）；③硬约束（贴图必须存活；rig/motion 仅人形 characters 槽；一次一个 motion，别一键全量烧配额）；④失败回退语义（非人形 auto-rig 会软门控拒绝并回显 reason；命中 cache 复用旧资产并忽略新名字）；⑤工具入参要点（`slug` 由 host 注入、`assetPath` 走结构化字段不解析文件名）。参考 `agent-lowpoly/persona/zh.md` 的体例。
- [ ] **Step 3：校验 manifest**。`ManifestSchema` 在 `packages/types/src/manifest.ts`；跑插件扫描（`bash start.sh` 看 server 日志有没有 scan 到 `@forgeax-plugin/agent-gen3d`，无 schema 报错）。

**Exit criteria:** 新 agent 出现在 Studio 的 agent roster；（依赖 A0 结论）`gen3d:*` 中已 `exposedToAI:true` 的工具能被该 agent 调用。

---

### Task A2：补 AI 友好入参/出参描述 + 翻 `score-quality`/`rename-asset` 的 `exposedToAI`

**目的：** 让 agent 看得懂每个工具干啥、何时用；把两个纯本地、无配额、无真机门的工具先开放。

**Files:**
- Modify: `packages/marketplace/plugins/wb-gen3d/forgeax-plugin.json`

- [ ] **Step 1：翻两个 boolean**（这俩纯本地：`score-quality` 是启发式只读评分，`rename-asset` 只改 `userLabel` 显示名、不动磁盘文件）：
  - `gen3d:score-quality` `exposedToAI: false → true`
  - `gen3d:rename-asset` `exposedToAI: false → true`
- [ ] **Step 2：给缺描述的工具补 `description{zh,en}`**（auto-rig/apply-motion/retopo-lowpoly 已有；补 text-to-3d / image-to-3d / views-to-3d / pose-standardization / score-quality / rename-asset / provider-status / list-assets）。每条写清"做什么 + 何时用 + 关键入参语义"，体例对齐已有的 auto-rig 描述（`forgeax-plugin.json:142-145`）。
- [ ] **Step 3：保持 `delete-asset` / `upload-image` `exposedToAI:false`**（前者破坏性、后者辅助中转），不在本步动。
- [ ] **Step 4：校验**。manifest 过 `ManifestSchema`；启动后 BusAdminPanel（`exposedToAI=true` 标记）显示这两个工具已 AI 可见。

**Exit criteria:** manifest 校验通过；BusAdminPanel 里 `score-quality`/`rename-asset` 显示 AI-exposed；其余工具带完整双语描述。

---

### Task A3：生成后自动跑客观评分，把 `QualityScore` 回填 manifest sidecar

**目的：** 给 agent 一个"这次生成质量如何 / 要不要重生成或换 provider"的决策信号，无需 agent 显式再调 score-quality。

**Files:**
- Modify: `packages/marketplace/plugins/wb-gen3d/server/tool-handlers.ts`（generate 成功落盘后调用）
- Modify: `packages/marketplace/plugins/wb-gen3d/server/per-game-store.ts`（sidecar `custom` 合并写 `qualityScore`）
- Reference: `gen3d:score-quality` 现有客观评分实现（**复用、不重写**——先读它的 handler 找到 objective 评分函数；入口在 `forgeax-plugin.json` 的 `gen3d:score-quality` → `schemas/score-quality.*` → `tool-handlers.ts`）

- [ ] **Step 1：定位现有客观评分函数**（service 五维启发式 `geometry/topology/texture/pbr/prompt_fidelity` 的 `source:'auto'` 计算），确认其入参（manifest/asset 路径）与出参（`QualityReport`/`QualityScore`）。
- [ ] **Step 2：在 generate handler 落盘成功后调用它**，把 `QualityScore`（纯数值快照，跨插件兼容字段，见 CONTEXT.md「QualityReport」）merge-only 写进 sidecar `custom.qualityScore`。**只在生成时算 objective**，不触发 ai 维度（ai 卡 server 多模态，见 §5）。
- [ ] **Step 3：幂等**。命中 cache 复用旧资产时不重算（旧 sidecar 已有分）。
- [ ] **Step 4：测试**。加一个 mock-first 单测：generate → 读 sidecar → 断言 `custom.qualityScore` 存在且五维齐全。

**Exit criteria:** mock 跑一次 generate 后，资产 sidecar 的 `custom.qualityScore` 自动带客观五维分；命中 cache 不重算。

---

### Task A4：operator 目视 sign-off 后，翻 M13 三工具的 `exposedToAI`（⟵ 卡 operator）

**目的：** M13 真机验收最后一步——把绑骨/动作/低模开放给 agent。

**Files:**
- Modify: `packages/marketplace/plugins/wb-gen3d/forgeax-plugin.json`
- Modify: `packages/marketplace/plugins/wb-gen3d/shared/catalog.ts`
- Modify: `packages/marketplace/plugins/wb-gen3d/docs/CAPABILITY_MATRIX.md`

- [ ] **Step 0（人，前置闸门）：operator 目视**。在真机跑一笔 auto-rig + apply-motion，肉眼确认：① rigged GLB 有材质（不是白模）；② 是 T-pose；③ 各动作在 viewer 里动作正确。Gate 0/1 自动探测已 PASS（见 CAPABILITY_MATRIX.md），只差这步人工目视。
- [ ] **Step 1：翻 boolean**：`gen3d:auto-rig` / `gen3d:apply-motion` / `gen3d:retopo-lowpoly` `exposedToAI: false → true`。
- [ ] **Step 2：更新 catalog `exposure`**：`auto_rigging` `experimental → available`；`motion_retarget` v1 `planned → available`；`low_poly` `planned → available`（按真机结论）。
- [ ] **Step 3：同步 CAPABILITY_MATRIX.md** 对应行的 exposure + 去掉 "pending operator visual sign-off" 字样。
- [ ] **Step 4：校验** manifest + 启动后 BusAdminPanel 三工具 AI-exposed。

**Exit criteria:** 三工具 `exposedToAI:true`；catalog/CAPABILITY_MATRIX 与之一致；agent（A1）可调绑骨/动作/低模。

---

### Task A5：端到端验证——游戏加载 gen3d 角色（⟵ 跨边界，需 operator 授权 / 可单独立项）

**目的：** 闭合"意图→…→引擎加载"的最后一跳（见 §0.2）。**注意：本任务跨出 gen3d 插件边界**，方案二选一，先与 operator 确认边界与授权。

**Files（取决于方案，均在插件外）:**
- 方案 1（推荐，改动最小）：新增一个 agent-skill / tool，把 per-game `assets/3d/<name>.glb` 转成一个引用它的引擎 pack 条目（mesh+skeleton+animation-clip GUID），写进游戏的 `assets/*.pack.json`，让游戏 `main.ts` 走既有 `loadByGuid` + `Skin` + `AnimationPlayer` 加载。落点在 game-template / skill 层。
- 方案 2：在 `game-default` 模板 / 引擎加一个"从 `assets/3d/*.glb` 文件直接 load skinned scene"的 helper（走 `packages/engine/packages/gltf` 的 `gltfDocToSceneAsset`）。改动落在 `packages/engine` / 模板，**最重**。

- [ ] **Step 0（人）：与 operator 确认边界 + 授权**（这是 server/engine/template 改动，不在 gen3d 插件默认许可内）。
- [ ] **Step 1：选方案**（默认方案 1）。
- [ ] **Step 2：实现转换/加载桥**，参考 `packages/engine/apps/hello/skin/src/main.ts`（skinned GLB → `Skin`+`AnimationPlayer`）与 `templates/game-default/main.ts:100-189`（pack 注册 + `loadByGuid` + `instantiate`）。
- [ ] **Step 3：端到端验证**：在 `packages/games` 里建/选一个游戏，加载一个 gen3d 产出的绑骨带动作角色，▶ Play 看到它在跑动画。
- [ ] **Step 4：把"agent 一句话 → 引擎里动起来"串成一条可复现脚本/录屏**，作为 agent 化交付证据。

**Exit criteria:** 一个 `packages/games` 里的游戏成功加载 gen3d 角色并在 Play 中播放动画；链路有可复现记录。

---

## 3 · Phase B — v2 48 动作库 M14（并行异步，关键路径在上游）

> 完整论证见技术方案《gen3d motion_retarget_v2 48 动作库解锁方案》。本节是其里程碑落地映射。
> **核心判断（来自技术方案 §九）：v2 不是"没接"，是 2026-06-02 实证证伪后主动封锁；
> 解锁关键不在写代码（集成约 0.5–1 天），而在拿到上游权威的 `motion_type` 形态 + 生效清单。**
> 故 B 线现在能做的只有"把问题发出去 + 备好探测/集成脚手架"，真正解锁等上游。

### Task B0（M14.0）：给上游 @raineejiang 的结构化三问 + 最小复现包（⟵ 立刻发）

**Files:**
- Create: `packages/marketplace/plugins/wb-gen3d/docs/v2-motion/UPSTREAM-ASK-2026-06-17.md`（结构化三问，把开放式求助变是非题）
- Create: `packages/marketplace/plugins/wb-gen3d/scripts/sanity-motion-retarget-v2.ts`（最小可复现，单发，零依赖外部状态）

- [ ] **Step 1：写三问文档**（附技术方案 §2.1 三组对照表 + cache JSON）：① `motion_type` 规范形态是 xlsx 英文名 string 还是 32 位 hex UUID（文档字段表与请求示例冲突）；② 给一份真正能驱动动作的字面清单（48 或可用子集），最好含 1 个"已知一定生效"样例；③ 无效 `motion_type` 能否返回 422 而非静默回退默认动作。
- [ ] **Step 2：写 sanity 脚本**（基于 `scripts/m13-gate-probe.ts` 的真机调用形态），固定一个轻量 rigged fbx，单发一笔 `motion_retarget_v2`，落 cache + 打印 输出 fbx byte size / 轨道数 / 时长。
- [ ] **Step 3：发出问询**（IM/邮件），把脚本 + 三条 cache 作为复现包附上。

**Exit criteria:** 三问 + 复现包已发出；拿到上游对"形态"的裁决 + ≥1 个"已知生效值"即解 B2 阻塞。

### Task B1（M14.1）：探测矩阵脚本（⟵ 与 B0 并行，自救方向）

**Files:**
- Modify/Create: `packages/marketplace/plugins/wb-gen3d/scripts/sanity-motion-retarget-v2.ts`（扩成对照矩阵）

- [ ] **Step 1：笛卡尔积探测** `{xlsx 英文名子集} × {大小写/连字符↔下划线变体} × {motion_type 放 body 顶层 vs 嵌套}`，每组比对输出 fbx 的 **byte size + 轨道数**。
- [ ] **Step 2：逐条读 error message 文本**（不只看 HTTP status——ADR-0007 教训：错误信息里藏真路径）。
- [ ] **Step 3：最小配额**：固定轻量 fbx，单组只跑一次，命中"输出字节不同"才扩样。

**Exit criteria:** 命中"输出 fbx byte size 随 `motion_type` 变化"（破"字节级相同"），即拿到至少一个真生效值。

### Task B2（M14.2）：验证 Gate（⟵ 卡 B0/B1 任一出有效值）

- [ ] 判定一个 `motion_type` 真生效须同时满足（技术方案 §五）：① 不同 type → 输出 fbx byte size 不同；② 轨道数/时长随动作变化（不再恒 2 轨 0.98s）；③ viewer 里肉眼可见不同动作。
- [ ] 分级：≥3 动作通过 = 部分解锁（feature-gate 内测）；覆盖 行走/跑/跳/攻击/待机 ≥8 = 可上线。

**Exit criteria:** ≥3 个 `motion_type` 通过三条判定，且对照集含一个"已知规范值"。

### Task B3（M14.3）：增量集成 provider→schema→catalog→UI（⟵ 卡 B2，约 0.5–1 天）

> **设计原则：v2 是 v1 的超集旁路，不是替换。** v1 已验证稳定，作默认回退；v2 解锁后作可选"丰富动作"路径。

**Files（全在插件内，增量）:**
- Modify: `server/providers/hunyuan-rest.ts` —— 新增 `applyMotionV2({ fbxUrl, motionType: string })` → POST `motion_retarget_v2`，model `hunyuan-3d-motion-retarget-v2.0`，原样透传 string；**保留** `applyMotion()`(v1)
- Modify: `schemas/apply-motion.args.json` —— `motionType` 扩成 `oneOf`：v1 `integer 9–16` ∪ v2 `string enum(48)`，加 `motionVersion: 'v1'|'v2'` 区分（或新建 `apply-motion-v2.args.json`）。当前文件 `motionType` 限定 `integer 9–16`（`schemas/apply-motion.args.json:15-20`）
- Modify: `shared/catalog.ts` —— `motion_retarget_v2` 的 `exposure` `blocked → planned/available`，`sourceStatus` 更新（当前 `catalog.ts:165-168`）
- Modify: per-asset sidecar —— motion 走结构化字段（`motionVersion` + `motionType` + 动作显示名），延续"非文件名解析"惯例，幂等键含 version
- Modify: `src/components/Workspace.tsx` —— 动作选择器加 v2 分组下拉（48 动作按类别：待机/移动/战斗/情绪…），显示中英文名

- [ ] 按上表逐文件改；每步保持 v1 路径不动。
- [ ] mock-first 单测：v2 apply-motion 走 mock 链路、sidecar 带 `motionVersion:'v2'`。

**Exit criteria:** `apply-motion` 可选 v2（48 动作），v1 回退在；typecheck/build 过；mock 全链路绿。

### Task B4（M14.4）：v2 动作集对 agent 暴露

- [ ] `gen3d:apply-motion` 的入参描述写清 v1/v2 选择规则（让 agent 按角色类型/叙事场景选动作集）。
- [ ] 动作集稳定后确保仍在 A1 的 `gen3d:*` 白名单内（无需额外动作，glob 已覆盖）。

**Exit criteria:** agent 能按角色类型选 v2 动作集。

---

## 4 · Phase C — 附属（按需，只做 A 需要的）

### Task C1：HDR presets 落地（⟵ 可立即；A 不依赖，但解视图器缺口）

**Files:**
- Create: `packages/marketplace/plugins/wb-gen3d/public/hdr/<name>.hdr`（真实 1k HDR，CC0 来源如 Poly Haven）
- Create: `packages/marketplace/plugins/wb-gen3d/public/hdr/presets.json`
- Reference: `docs/IMPL-2026-06-14-A-viewer.md`（视图器 HDR/IBL 接线）；ModelViewer 读 presets 的位置

- [ ] **Step 1：落 ≥3 个 CC0 1k `.hdr`**（如 studio/sunset/neutral）。
- [ ] **Step 2：写 presets.json**（起步结构，字段以 ModelViewer 实际读取为准）：

```json
{
  "presets": [
    { "id": "studio", "label": { "zh": "影棚", "en": "Studio" }, "file": "studio_small_1k.hdr", "intensity": 1.0 },
    { "id": "sunset", "label": { "zh": "日落", "en": "Sunset" }, "file": "venice_sunset_1k.hdr", "intensity": 0.8 },
    { "id": "neutral", "label": { "zh": "中性", "en": "Neutral" }, "file": "neutral_1k.hdr", "intensity": 1.0 }
  ]
}
```

- [ ] **Step 3：接 ModelViewer** 的 HDR 选择器读 presets.json（若已有读取逻辑则只补文件 + 登记；否则按 IMPL-A 接线）。
- [ ] **Step 4：rebuild dist 验证**（HANDOFF 铁律：改 `src/**` 后 `bun run build` 再硬刷新 Studio 内嵌；standalone `bun run dev :15175` 走 HMR 无此问题）。

**Exit criteria:** 视图器 HDR 下拉有 ≥3 真实 preset，切换可见环境光变化。

### Task C2：视图器 / 评分 UI 体验打磨（按需）
- [ ] 基于 `docs/IMPL-2026-06-14-A-viewer.md` / `-B-quality-scoring.md` 做迭代（反射地面、gizmo 等已列后续；评分卡交互）。**仅在 A 链路体验需要时做。**

### Task C3：Rodin views-to-3D 真机验证（⟵ 卡 key）
- [ ] 用 `RODIN_API_KEY` + `GEN3D_ENABLE_REAL_PROVIDERS=1` 跑一笔 views-to-3D（text/image 已验证，views 未）；更新 CAPABILITY_MATRIX.md 对应行。

---

## 5 · 推迟出本期（明确 out-of-scope）

| 项 | 为什么推迟 | 解锁条件 |
|---|---|---|
| **P4 AI 视觉评分**（QualityInspector 视觉维度） | 需扩 `packages/server` + llm-gateway 多模态，operator 未授权动 server | operator 授权后单独立项；本期按钮置灰是预期 |
| **低模 + 带贴图的游戏就绪动画 re-bake** | 需 Blender/xatlas 重烘焙，超插件边界 | 单独立项 |
| **独立 wb-3d-pipeline workbench** | M13 在 wb-gen3d 内先跑通；manifest append 契约稳定后再拆（若仍需要） | 见 CONTEXT.md「wb-3d-pipeline」 |

---

## 6 · 执行顺序建议 + handoff

**给下一个执行 agent 的开工顺序：**
1. 读 §0 两个硬约束 → 跑 **A0**（决定 A 线是配置还是要授权实现桥）。
2. 并行：**B0** 立刻把上游三问发出去（解锁周期最长，越早越好）；**A1 → A2 → A3** 推 agent 化可编码部分；**C1** 插空。
3. **A4** 等 operator 目视；**B1/B2** 自救探测；拿到 v2 有效值后 **B3/B4**。
4. **A5** 与 operator 确认边界 + 授权后做（端到端闭环）。

**Review 钩子（给 reviewer agent）：** 重点审 §0 两条结论是否仍成立（桥状态、引擎加载边界）、A1 manifest 是否过 schema、B3 是否守住"v2 超集旁路不替换 v1"、本轮所有改动是否守住插件边界（A5 之外不碰 server/engine）。

**本 PLAN 自检（writing-plans self-review，2026-06-17）：**
- spec 覆盖：半月报 §6.1/6.2/6.3/6.4 与技术方案 M14.0–M14.4 全部映射到 A/B/C 任务 ✓
- 无占位符：codeable 任务（A1 manifest / A2 翻 boolean / C1 presets.json / B0 三问 / B3 文件表）给了具体内容；A3/A5/B1 给了精确集成点 + 退出标准 + "复用已有 X / 需授权" 标注（不编造未核实的函数签名）✓
- 类型一致：`motionVersion`/`motionType`/`assetPath`/`QualityScore` 与 CONTEXT.md 术语一致 ✓
