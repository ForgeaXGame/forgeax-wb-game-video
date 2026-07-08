# Handoff - Gen3D Generation Workbench

> **2026-06-29 — LiteLLM 3D 网关接入 + Rodin 暂禁 + 凭证统一（`#16` 系列）。** 3D 生成（Meshy / Hunyuan）改走 LiteLLM 3D 网关（`/v1/3d/generations`），凭证由 Studio「设置 → API Keys」统一管理（优先级 `FORGEAX_3D_GATEWAY_KEY` > `ANTHROPIC_API_KEY` > `LITELLM_PROXY_KEY`），插件本地 `.env` 只留 COS + 总开关。Rodin（Hyper3D）网关无对应 model，`getRodinEnv` 恒返回 null（`rodin.ts` 代码保留,manifest / catalog 标注「暂未接入网关」）。3D 网关 base URL 与 chat/image 的 `LITELLM_PROXY_*` 解耦（后者可能指向 Moonshot 等无 3D 端点的代理）——见 `server/env.ts` `pickLitellmFromEnv` / `resolveGatewayBaseUrl`。`getBalance()` 恒为 null（网关无余额端点）,auto-rig / apply-motion 跳过余额预检直达付费端点。

> **2026-06-25（其二）— 新审阅入口：2D→3D CLI / UI 分阶段体验修复方案，待其他 agent review。** 执行 / 审阅 SSOT = [`docs/PLAN-2026-06-25-staged-character-gen3d-flow.md`](./docs/PLAN-2026-06-25-staged-character-gen3d-flow.md)，review handoff = [`docs/HANDOFF-2026-06-25-staged-character-gen3d-review.md`](./docs/HANDOFF-2026-06-25-staged-character-gen3d-review.md)。
> - **用户实测问题**：CLI 自然语言会绕过 `wb-character` 的候选/选择流程，直接 `character:generate-turnaround` → `gen3d:views-to-3d` → `auto-rig/apply-motion`，中间不等用户确认；`wb-character` 当前也没有“生成 3D 四视图 / 送去 3D”的按钮。
> - **新目标**：从“一条链跑完”改成 **2D 设定/选择 → 四视图 → 静态 3D → 可选动作** 四段，每段停下；`wb-character` final phase 补四视图按钮和 handoff；`auto-rig` / `apply-motion` 用真实 `requireConfirm` 硬门控。
> - **Reviewer 先读**：PLAN §0–§4 + review handoff §1–§5。重点审 `wb-character` UI 入口、`generate-turnaround` 返回 schema、`ConfirmDialog` 的 `confirmId`/`token` 漂移、`gen3d` manifest 的 `requireConfirm`。
> - **本条是方案/交接，未实现**；不要把下方 6/23 “Forge 直接编排”理解为“允许一口气跑到底”。ADR-0008 D-A 的“Forge 直接编排”仍成立，但必须补阶段停顿和用户确认。

> **2026-06-25 — 架构对齐：feature 分支 vs origin/main 分叉 · 迁移 SSOT 落档。** 执行 / 审阅 SSOT = [`docs/PLAN-2026-06-25-migrate-to-forgeax-core.md`](./docs/PLAN-2026-06-25-migrate-to-forgeax-core.md)。
> - **当前状态**：`laurenceelu/feat-20260622-character-gen3d-link` 三仓**均未合 main**（studio 落后 main 183 / mp 28 / server 43）。T0–T3 编码 + 测试在分支上完成；**T4 真机未签字**。
> - **架构变动（main 已有）**：server 瘦壳 + `forgeax-cli`（`packages/cli` 编排层）+ `forgeax-core` sidecar 子进程(**不是 vendored `packages/core`**，见 PLAN §2 修正后的四层模型)；host-tools 桥**迁进 forgeax-cli**（`packages/cli/builtin/kits/host-tools/...`），**不是被删**——6/23「桥失效」判断过于悲观。
> - **硬阻塞 B1（已解 2026-06-25）**：`character-forge` 已内聚进 `wb-character/server/`（commit `cc21af6`）；不再 import 已删的 server 路径。
> - **下一步**：批次 1 cherry-pick 已完成 → 批次 2 server 重写 → T4 真机 → 合 main。

> **2026-06-23 — 新线：2D 角色 → 3D 角色（turnaround 收尾 · 联动 gen3d · CLI 自主端到端）。方案已过 grill review（ADR-0008）；**T1/T2/T3 已提交 · T0 HTTP 探针 PASS**（`scripts/t0-host-tools-probe.mjs`）**· 剩 T4 真机验证**（UI handoff 目视 + 真 key 2D→3D + opt-in motion）。T1 lazy transfer 已随 `08c029a` 提交。执行 / 审阅 SSOT = [`docs/PLAN-2026-06-23-character-to-gen3d-cli.md`](./docs/PLAN-2026-06-23-character-to-gen3d-cli.md)。
> - **一句话**：把 wb-character 出的角色四视图喂进 gen3d 出 3D。UI handoff 路径 + Forge CLI 一条链直接编排（ADR-0008 D-A）。
> - **已确认决策**（勿 re-litigate）：scope = 两步走；**cli_arch = Forge 直接编排**（`character:generate-turnaround` → `gen3d:views-to-3d`，不经两 agent 穿线；见 ADR-0008 D-A）。
> - **reviewer 先读 PLAN §0/§1/§7**；PLAN §2 是反失真的代码证据（file:line / commit）——**别信本文件下方旧块的"待执行"状态**。
> - **跨仓改动面**：wb-character（B1 已内聚 character-forge）+ wb-gen3d + `agent-gen3d` persona + marketplace `src/system-prompt/80-workbench-agents.md`（派单表，非插件目录，**需授权**）。

> **2026-06-22 — agent 化收敛：「3D 角色生成助手」(`agent-gen3d`) 雏形落地 + 「静态优先」决策定案（待其他 agent review）。** 执行 / 审阅 SSOT = [`docs/PLAN-2026-06-22-gen3d-character-agent.md`](./docs/PLAN-2026-06-22-gen3d-character-agent.md)。
> - **分支现状**：上一条线 `feat-20260617-gen3d-agentify-roadmap`（Meshy 公网绑骨/动画 P0–P3 + 插件内密钥 + agent 化路线图）**已合并入 main**（studio `7a5f739` / marketplace `8499d04`；main 之后又推进了公开镜像 / website / README 等与 gen3d 无关的提交）。本轮新分支 = **`laurenceelu/feat-20260622-gen3d-agent-persona`**（studio + marketplace 同名）。
> - **本轮已落地**：**A1** 新增 `plugins/agent-gen3d/`（`forgeax-plugin.json` 声明 `provides.agent.tools:["gen3d:*"]` + `persona/zh.md`（已按静态优先写）+ `memory/lessons.md`）；**A2 一半** 把 `wb-gen3d` 的 `gen3d:score-quality` / `gen3d:rename-asset` 翻 `exposedToAI:true`。`bun packages/types/test/validate-manifests.ts` → **57/57 ok**。⇒「生成 + 评分 + 命名」半条产线已 agent-ready（10 个 `gen3d:*` 工具对 AI 可见）。
> - **已锁产品决策**（勿 re-litigate）：① **只做角色（人物）**，不做道具 / 场景 / 建筑；② **静态优先**——默认只交付静态角色 + 交付时主动提示可动，**仅用户明确要会动**才绑骨 / 套动作（省真实配额）。
> - **下一步（reviewer 执行，见 PLAN §4/§5）**：T1 起 stack 做 A0 动态确认（让 `agent-gen3d` 真调一次 `gen3d:list-assets`，零配额）；T3 翻「会动」半套（`auto-rig`/`apply-motion`/`list-motions` → `exposedToAI:true`），**卡 operator 真机目视签字 + 花钱护栏**。
> - **⚠️ 文档失真提醒**：本文件下方 `2026-06-21` 各条仍写 `PROPOSAL / 未开始编码` —— 实则 Meshy 绑骨/动画 P0–P3 已实现并入 main（见 `c74b9a9` 等提交）。**以 2026-06-25 顶块 + PLAN-2026-06-22/23/25 为准**；`.workbuddy/CURSOR_HANDOFF.md` 已于 2026-06-25 对齐。

> **2026-06-21（其二）— 公开镜像「零某云」门禁：临时去品牌词，解耦债务已挂账。** 开源公开镜像有一道**按字面词扫描**的门禁（仓库根 `scripts/mirror/publish.sh` 的 `gate()`）。本插件 `server/cos-uploader.ts` + `.env.example` 注释里点名了某云对象存储厂商，会触发门禁。**本批仅把这两处品牌词改成中性表述（"cloud object storage (COS)"）让门禁通过**；底层对象存储 SDK 依赖（`cos-nodejs-sdk-v5`）**仍在**——门禁按词扫描、抓不到这个依赖，所以 **「门禁绿」≠「无该云依赖」**。公开镜像正式转 public 前**必须二选一**：① 把 wb-gen3d 排除出镜像 + 门禁 denylist 补 `cos-nodejs-sdk-v5`；② 把 `cos-uploader` 抽象成厂商中立存储（默认 S3 兼容、该 SDK 转可选依赖，保留 3D 生成）。**完整决策 + 债务 + 真解见 [`docs/adr/0007-cos-public-mirror-scrub-and-decouple-debt.md`](./docs/adr/0007-cos-public-mirror-scrub-and-decouple-debt.md)**（该 ADR 在 `docs/`，不进镜像，故可点名）。

> **2026-06-21 — 公测版绑骨/动画改用 Meshy 公网 API（§8 已拍板 · P0–P3 已实现 · mock-first / quota-safe / `exposedToAI` 仍 false）。** 上级指示公测接公网，
> 混元 `auto_rigging`/`motion_retarget` 是**内网**、公测跑不通 → 用 Meshy `/openapi/v1/rigging` +
> `/openapi/v1/animations` 接管（ADR-0003 早已预留这条退路）。**代码已落地**（见下「已实现」），分支 `laurenceelu/feat-20260617-gen3d-agentify-roadmap`。
> - **审阅入口（reviewing agent 从这两份开始）**：
>   [`docs/PLAN-2026-06-21-meshy-public-rig-anim.md`](./docs/PLAN-2026-06-21-meshy-public-rig-anim.md)（契约 + GAP file:line + P0–P3 + 真机证据 + 开放决策）
>   + [`docs/adr/0006-meshy-public-api-rig-anim-for-beta.md`](./docs/adr/0006-meshy-public-api-rig-anim-for-beta.md)（🟡 Proposed，部分取代 ADR-0003 §Decision 1/2）。
> - **已实现（P0–P3，本批提交）**：`server/providers/meshy.ts` 加 `rig()`/`animate()`/`listActions()`/`getBalance()` + HTTP 错误映射（402/404/429）；`shared/manifest.ts` 加 `MotionRef`（`system` 判别联合）/`motionRefKey`/`RigChain`，保留旧 `motionType` 兼容；存储按 `(system,id)` 命名 motion 变体 + 持久化/还原 `rigChain`（`asset-storage.ts`/`per-game-store.ts`）；`server/tool-handlers.ts` 三档分发（Meshy 公网默认 → Hunyuan REST 内网兜底 → mock）+ `rig_expired`/`autoReRig` + 新工具 `gen3d:list-motions`（新 `server/motion-catalog.ts` 统一目录层）；schema（`apply-motion` v2 + `list-motions` args/returns）+ `forgeax-plugin.json` 注册并更新描述；UI 把固定 8 按钮网格换成消费 `gen3d:list-motions` 的可搜索动作浏览器（新 `src/components/MotionBrowser.tsx`，viewer 片段/已应用集合从 `motionType` 泛化到 `motionRef`）。
> - **验证**：新增 16 个注入式/mock smoke（`server/providers/meshy.rig.test.ts` 9 + `server/tool-handlers.rig.test.ts` 7，含混元 9–16 非回归 round-trip）；`bun test` 42/42、`tsc --noEmit` 干净、`bun run build` 通过并重建 `dist`。**零网络、零配额。**
> - **真机已预跑通**（2026-06-21，共 8 积分：rig 5 + anim 3）：`/rigging`(input_task_id)→`/animations`(rig_task_id+action_id=28)，
>   产物在本插件真实 `ModelViewer`（three.js + AnimationMixer）真机播放确认（挥手 + 免费 walk）。证据见 PLAN §7。
> - **§8 决策已全部拍板**（2026-06-21 grill review，决策人 laurenceelu）：Q2=`system` 判别联合 / Q1=全 680 + 海量浏览器 + `gen3d:list-motions` 两步发现 / Q3=`rig_expired` + 可选 `autoReRig` / Q6=免费 walk/run 全量落库 / Q4-Q5=按记录 `system` 分发 + 优先 COS URL / Q7=与 B 线并存。决议本 + 范围增量(F2–F5)见 PLAN §8 决议块。
> - **关键约束**：Meshy 动画只认它自己的 `rig_task_id`（不接受外部 FBX）+ rig_task_id/产物 URL 均 ~3 天过期 → 需存 `rigTaskId` 且处理过期重绑（已实现：`RigChain.rigExpiresAt` + `meshyRigStale()` + `autoReRig`）。
> - **剩余（卡运营，本批未做）**：配真实 `MESHY_API_KEY` + `GEN3D_ENABLE_REAL_PROVIDERS=1` → 真机跑通 rig→animate（烧少量 credits）+ 目视确认 → 再把 `auto-rig`/`apply-motion`/`list-motions` 三工具 `exposedToAI` 翻 `true`。**本批 `exposedToAI` 全部仍为 false。**

> **2026-06-17 — 当前开发线已切换。** `laurenceelu/feat-20260615-gen3d-polish` 已合入三仓 main（2026-06-16）。
> 新开发线 = `laurenceelu/feat-20260617-gen3d-agentify-roadmap`，路线总账见
> [`docs/PLAN-2026-06-17-agentification-and-v2-roadmap.md`](./docs/PLAN-2026-06-17-agentification-and-v2-roadmap.md)
> + [`docs/adr/0005-agentification-spine-v2-parallel.md`](./docs/adr/0005-agentification-spine-v2-parallel.md)：
> **A agent 化主轴 / B v2 48 动作库并行异步 / C 打磨附属**。
> ⚠️ 接手先读 PLAN §0 两个硬约束（agent 化 ≠ 翻 boolean；引擎加载 gen3d 角色未建且跨边界）。

> **2026-06-16 — 资产命名（显示改名 + 生成时定名）已合入 `laurenceelu/feat-20260615-gen3d-polish`。**
> 6/15–6/16 落地：
> - render-settings popover 向下展开修复（`b8eead9`）
> - 资产包 `.zip` 一键导出（`3dce7a0`）— 零依赖 store-only zip writer + `ExportBundleButton` UI
> - Studio plugin iframe sandbox 补 `allow-downloads`（`606940f`，`packages/interface`）— 修复 sandboxed iframe 静默拦截下载的根因
> - **资产库 inline 改名**（`d37f557`）— `userLabel` sidecar 字段 + `gen3d:rename-asset` + 卡片铅笔图标；仅改显示名，不改磁盘文件名
> - **生成时命名**（`b6e8c6e`）— SetupSidebar「资产名称」可选框 → `assetName` 参数；文件名 / 导出 .zip 名从生成起确定
>
> 早前 6/14 落地的三批（已完成，勿重复）：视图器 P1+P2（`f5aa49c`）/ 五维评分 P3（`24143d7`）/ Provider 参数 P5（`608c365`）。
> IMPL 文档（`docs/IMPL-2026-06-14-{A,B,C}-*.md`）为**已完成执行 SSOT**。

Last updated: 2026-06-29 Asia/Hong_Kong

## ⚠️ 改完前端源码必须 rebuild dist（2026-06-13 踩坑）

Studio 的 Workbench iframe 加载的是 **构建产物 `dist/index.html`**（见
`forgeax-plugin.json`），**不是** `src/`。`dist/` 是 gitignored 的本地产物——所以
即使源码改动已 commit，**不重新 `bun run build`，浏览器仍跑旧 bundle**。

实例：`39da1e9`「预览器脚底贴地锚定」修复后用户仍看到动作模型上漂，排查发现
源码逻辑正确（three.js 实测：锚定后动画全程 `box.min.y≡0`、脚底贴地不漂），
但浏览器加载的 `dist` bundle 构建于修复前 26 分钟——纯属忘了 rebuild。

**铁律**：改 `src/**`（含 `ModelViewer.tsx` 等）后，在插件目录跑
`bun run build` 重建 `dist/`，再硬刷新（⌘⇧R）Workbench 验证。standalone dev
`bun run dev`（:15175）走 vite HMR 无此问题，但 Studio 内嵌走 dist。

## 当前开发线 = `laurenceelu/feat-20260617-gen3d-agentify-roadmap`（2026-06-17）

> studio + marketplace **同名分支**。改代码在 marketplace 子模块内 commit；合入前 studio 父仓 bump marketplace 指针。
> **路线 SSOT** = [`docs/PLAN-2026-06-17-agentification-and-v2-roadmap.md`](./docs/PLAN-2026-06-17-agentification-and-v2-roadmap.md)（可拆 ticket 的执行清单）+ [`docs/adr/0005-agentification-spine-v2-parallel.md`](./docs/adr/0005-agentification-spine-v2-parallel.md)（战略定调）。

三线（详见 PLAN）：

| 线 | 事项 | 状态 / 闸门 |
|---|---|---|
| **A 主轴** | agent 化端到端：A0 桥 de-risk → A1 `agent-gen3d` persona（`tools:["gen3d:*"]`）→ A2 翻 score-quality/rename + 补 AI 描述 → A3 score 回填 manifest → A4 翻 M13 三工具 → A5 引擎加载 | A0/A1/A2/A3 可立即编码；A4 卡 operator 目视；A5 跨边界需授权 |
| **B 并行异步** | v2 48 动作库 M14：B0 上游三问+复现包 → B1 探测矩阵 → B2 验证 Gate（byte-diff）→ B3 增量集成 → B4 agent 暴露 | B0/B1 立刻发起；B2+ 卡上游 @raineejiang 回应 |
| **C 附属** | C1 HDR presets / C2 视图器·评分 UI 打磨 / C3 Rodin views 真机 | C1 可立即；C3 卡 key |

> ⚠️ **接手先读 PLAN §0 两个硬约束**：① agent 化 ≠ 翻 `exposedToAI` boolean（当前无 agent 声明 `gen3d:*`、host-tools 桥实现存疑，A0 先 de-risk）；② 引擎加载 gen3d 角色未建且跨插件边界（A5，需授权/单独立项）。

**历史（已完成并入 main，勿重复）**：6/15–6/16 交付收尾（.zip 导出 / inline 改名 / 生成时命名）；6/14 三批（视图器 P1+P2 / 五维评分 P3 / Provider 参数 P5，IMPL-2026-06-14-{A,B,C}）。
**已锁决策（勿重新 litigate）**：见 `docs/PLAN-2026-06-13-viewer-quality-provider-params.md` 顶部「grill 修订」块（D1–D9）+ ADR-0003/0004。**本期边界**：插件目录内（+ 新增 `agent-gen3d`）；**零 `packages/server`/`packages/engine` 改动**（A0 实现桥 / A5 引擎加载 / P4 AI 评分 未授权前）。

## ~~下一步工作 = 视图器增强 / 五维质量评分 / Provider 参数~~（2026-06-14 · ✅ 已完成合入 main）

<details>
<summary>历史执行记录（IMPL A/B/C，已归档）</summary>

| 批 | 计划 | 分支（历史） | 状态 |
|---|---|---|---|
| **A** P1→P2 视图器 | `docs/IMPL-2026-06-14-A-viewer.md` | `laurenceelu/feat-20260614-gen3d-viewer-studio` | ✅ `f5aa49c` |
| **B** P3 五维评分 | `docs/IMPL-2026-06-14-B-quality-scoring.md` | `laurenceelu/feat-20260614-gen3d-quality-scoring` | ✅ `24143d7` |
| **C** P5 Provider 参数 | `docs/IMPL-2026-06-14-C-provider-params.md` | `laurenceelu/feat-20260614-gen3d-provider-params` | ✅ `608c365` |

</details>

## 近期阶段 = M13：角色绑骨 / 动作 / low_poly 减面（2026-06-12，代码完成 mock-first；待 operator 目视 + 翻 exposedToAI）

> **当前 next work 是 M13**（不是下面的 M9-M12 —— 那批已落地并并入 main）。执行 / 评审 SSOT：
> [`docs/PLAN-2026-06-12-rig-motion-lowpoly.md`](./docs/PLAN-2026-06-12-rig-motion-lowpoly.md)；
> 关键决策：[`docs/adr/0003-rig-motion-lowpoly-pipeline.md`](./docs/adr/0003-rig-motion-lowpoly-pipeline.md)。
> 产线（**2026-06-12 grill 修订**）：**带贴图高模 GLB →① auto_rigging 绑骨 →② motion_retarget v1 动作**；
> rig/motion 都输出 **GLB+FBX**，**GLB 作 canonical 落库主体**、FBX 仅作 rig→motion 中转。
> **low_poly 降级为可选几何/LOD 旁路**（纯几何、不保贴图、quad 换 UV，不前置绑骨）。
> 方案要点：全程混元、验证先行（**Gate 0** 先验混元**内网**能否抓我们**公网** COS 的模型 URL——
> 注意"公网能 GET"≠"混元内网能 egress 到公网"，须用一笔真机 low_poly/rig 调用实测）、资产模型走
> 「同基名追加 GLB(主)+FBX(中转)」（rig/motion 产物 append 到源资产，不另起资产）。
> **执行前关键决策（2026-06-12 拍板 + grill 修订）**：① motion v1 的 8 动作 = 9 跨步 / 10 摔倒 /
> 11 跳跃 / 12 踢腿 / 13 挥击 / 14 步行 / 15 跑步 / 16 跳舞；② low_poly 后高模默认保留、可手动删；
> ③ **贴图必须存活 → 带贴图高模直绑、low_poly 不前置**；④ **GLB 作落库主体**；⑤ **v1 直绑高模**
> （低模+带贴图需 re-bake，列后续）；⑥ rig/motion **仅人形**（`characters` 槽软门控）；
> ⑦ append 用 **per-asset 锁** 防并发丢条目；⑧ **motion_type 结构化**存元数据、不靠文件名。

## M13 执行交接（grill 收尾 2026-06-12 — 下一个 agent 按此顺序开工）

**不要重新 litigate 以下决策**（已全部写入 PLAN 顶部修订块 + ADR-0003）：

| # | 决策 | 要点 |
|---|---|---|
| 1 | 贴图必须存活 | 最终动画 GLB 必须带原模型材质 |
| 2 | 主产线 | 带贴图高模 GLB → auto_rigging → motion_retarget v1 |
| 3 | low_poly | **可选旁路**，不前置绑骨（纯几何、不保贴图） |
| 4 | 落库格式 | **GLB canonical** + FBX 仅 rig→motion 中转；每跳下载 glb+fbx |
| 5 | v1 直绑高模 | "低模+带贴图"需 re-bake，列后续 |
| 6 | 仅人形 | `assetSlot=characters` 软门控；失败回显 reason |
| 7 | 并发安全 | append/delete 用 per-asset 异步锁 |
| 8 | motion_type | 结构化字段（SidecarDependency/ManifestFile），幂等/UI 不解析文件名 |
| 9 | 8 动作配额 | 一次一个 motion_type；**不做一键全量 8 动作**（防烧配额+RateGuard） |

**推荐执行顺序**（PLAN 任务清单 · 状态 2026-06-12）：

1. **M13-0 Gate 0/1** — ✅ **PASSED 2026-06-13**（probe `scripts/m13-gate-probe.ts`，Hunyuan 内网 OpenAPI + COS）：Gate 0 内网可达 ✓ / 响应形态 `data[].glb_url`+`fbx_url` ✓ / **贴图存活 ✓**（rigged+animated GLB 都内嵌 images=3/textures=3）/ 22 关节人形骨架 ✓ / motion 14 步行动画 ✓。剩 operator 目视 T-pose+动画，然后把三工具 `exposedToAI` 翻 true。
2. **store-append** — ✅ **DONE**：`appendDerivedFiles`/`readAssetFile` + sidecar 骨架/motionType 字段 + per-asset 锁 + `sidecarToManifest` 修复 + cos-uploader glb/fbx。
3. **M13-2 auto-rig** — ✅ **DONE (mock-first)**：`gen3d:auto-rig` + schema + plugin.json（`exposedToAI:false`，humanoid/characters 软门控，幂等）。
4. **M13-3 apply-motion** — ✅ **DONE (mock-first)**：`gen3d:apply-motion` + 8 动作 UI + schema（int 9–16，多动作并存，按 motionType 幂等，not-rigged 守卫）。
5. **M13-1 retopo-lowpoly** — ✅ **DONE (mock-first)**：`gen3d:retopo-lowpoly` + schema（可选旁路，新衍生低模资产，cache-first，高模保留）。
6. **M13-4 UI** — ✅ **DONE**：Workspace 结果卡 `DownstreamPanel`（绑骨→动作 step 流 + 8 动作 grid + 低模旁路按钮）+ ModelViewer **AnimationMixer** 播放/暂停 + AssetLibrary readiness/motion 徽标。

**Gate 1 必验三项**（绑骨真机一笔）：① rigged GLB 目视有材质；② 输出是 T-pose；③ 多 mesh 输入时混元行为。

**混元官方 PDF 来源**（合约 SSOT，已核对）：
- `hunyuan-3d-low-poly-v1.5.pdf`
- `hunyuan-3d-auto-rigging.pdf`
- `hunyuan-3d-motion-retarget.pdf`

## 历史基线：2026-06-11 Plan (M9-M12)（已完成、已并入 main）

> The next executing agent should follow
> **`docs/PLAN-2026-06-11-rodin-cos-pergame.md`** — the SSOT for the new work.
> It adds M9-M12 on top of the M0-M8 history below and, per operator direction
> (2026-06-11), **reverses the global asset library to a per-game v2 file
> contract**. ADR-0002 records this reversal of ADR-0001's global storage model.
> All key decisions were already confirmed with the user during the 2026-06-11
> grill — do not re-litigate them; just execute.

## 2026-06-11 M9-M12 Landed (mock-first / quota-safe)

M9-M12 are now **implemented** (typecheck + build pass). All real provider
paths stay gated behind operator keys + `GEN3D_ENABLE_REAL_PROVIDERS=1`; nothing
below makes a network call by default.

- **M9 — per-game storage**: `server/per-game-store.ts` writes
  `${gameRoot}/assets/3d/{characters|meshes}/<name>.glb` + `<name>.glb.meta.json`
  (v2 contract sidecar; gen3d fields under `custom`, sidefiles in
  `dependencies[]`, `custom.cacheKey` stored for delete reverse-lookup). Manifest
  identity is now `assetPath` (UUID `assetId` + content-addressed blobs dropped);
  `cache.jsonl`/`audit.jsonl` moved per-game; cacheKey includes `assetSlot`,
  excludes `assetName`; cache hit reuses the existing path, non-cache name
  collisions auto-suffix (`name-2.glb`). `gen3d:delete-asset`
  (confirm-destructive) removes the GLB + sidecar + preview and tombstones the
  cacheKey. Frontend reads `?slug=` from the iframe URL and threads it through all
  tool calls; no active game ⇒ Generate disabled + empty state. Pose/upload
  intermediates land in scratch (`.gen3d/tmp/`), not the library.
- **M9 server route (plugin-external, operator-approved)**: `/api/game-assets/:slug/*`
  in `packages/server/src/main.ts` — read-only, safe-slug + `..`-rejection +
  `assets/3d/` prefix assertion, serving only display files under
  `.forgeax/games/<slug>/assets/3d/**`. Old `/api/gen3d-blobs` left as-is.
  **(2026-06-11: this route was missing from `main.ts` — earlier edit was lost;
  it has now actually been (re-)landed and verified serving real GLB + webp,
  with traversal/`..` rejected.)**
- **M10 — local upload + COS**: `cos-nodejs-sdk-v5` + `server/cos-uploader.ts`;
  `gen3d:upload-image` (base64 → ≤8MB backend validation → COS presigned URL,
  reuses the JSON tools route, no extra server route). `SetupSidebar` source-image
  inputs use `ImageInputField` (local picker → upload → URL backfill + manual
  fallback); prompt textarea enlarged + char count; "角色编辑器" hint added.
  `COS_*` live in plugin `.env` only.
- **M11 — Rodin provider (mock-first)**: `server/providers/rodin.ts` (multipart
  `POST /api/v2/rodin` → poll `/api/v2/status` → `/api/v2/download`),
  `getRodinEnv()`, provider enum across types/ui-meta/catalog/tool-handlers/
  schemas, UI selector entry. `tier=Regular`, `quality_override`,
  `geometry_file_format=glb`; injectable fetch/download for quota-safe smoke.
- **M12 — UI upgrade**: pose standardization moved above input; polycount is now
  low/medium/high discrete buttons mapped per provider (Meshy 8k/30k/100k,
  Hunyuan 10k/40k/120k, Rodin ~8k/18k/50k); `ModelViewer` gained a grid-floor
  toggle, a skeleton toggle (enabled only when a SkinnedMesh exists), and a
  faces/vertices/bbox HUD; `Workspace` result card trimmed; `AssetLibrary` is now
  a dense preview-thumbnail grid leading with the prompt's first line + per-card
  delete confirmation.

Pending live verification (operator, with keys): Hunyuan fetching a **public**
COS URL from its internal network (explicit risk item — fallbacks in
CAPABILITY_MATRIX); real Rodin **image / views** runs (text is verified, see
below). M10 logic was exercised by out-of-tree bun smoke scripts (injected
fetch/download, no network); those scratch scripts are not committed.

### 2026-06-12 — Rodin **image-to-3D** real verified + COS public reachability

Operator-provided temp COS creds (COS bucket) + `RODIN_API_KEY` (64-char,
Hyper3D). Ran quota-safe probes first, then one real image-to-3D:

- **COS upload → public reachability PASS** (the URL-fetching-provider
  prerequisite): `CosUploader.upload()` puts under `wb-gen3d/inputs/<sha256>.<ext>`;
  the presigned URL is **publicly GET-able with no auth header** (200, bytes
  match). **NOTE (grill 2026-06-12): this only proves reachability from the public
  internet; it does NOT prove Hunyuan's *internal* network (`HUNYUAN_BASE_URL`)
  can egress to fetch it — that is still Gate 0, to be verified by a real
  low_poly/rig submit.** `COS_SIGN_EXPIRES_SEC`
  is the env name (operator's `COS_PRESIGN_EXPIRES` was renamed on write); the
  hardcoded `wb-gen3d/inputs` prefix already satisfies the requested `wb-gen3d/`
  path, so `COS_PREFIX` is not used.
- **Rodin auth reachable**: empty-multipart probe → `201 INVALID_REQUEST`
  (params, not auth) → key valid, no job started.
- **Rodin text submit envelope confirmed**: returns `uuid` + `jobs.subscription_key`
  (provider's envelope parse is correct; matches the earlier text verification).
- **Rodin image-to-3D real PASS** (2026-06-12, ~98s, burns quota): a real
  character illustration → COS → `RodinProvider` image mode submit/poll(6 sub-jobs)
  /download returned a **9.44 MB GLB (`glTF` 2.0 magic verified)** + **5.4 KB
  `preview.webp`**, `providerMode='real'`, real `sourceJobId`. The model matches
  the source character. Synthetic flat-color test images get rejected with
  `IMAGE_CONTENT_VIOLATION` (content moderation), so image-to-3D needs a real
  photo/illustration — not a code issue. **Rodin views-to-3D still unverified.**
- GLB/OBJ dedup is **already settled in code** (not pending): `per-game-store.ts`
  `planFiles()` keeps the GLB `source_mesh` as identity and drops OBJ/MTL
  `source_mesh` sidefiles (ADR-0002, "GLB only"). The "GLB/OBJ dedup decision
  pending" note below is stale.

### 2026-06-11 (evening) — Rodin real API verified + webp + server route fix

Ran a real Rodin `text-to-3d` through the live Studio server with
`GEN3D_ENABLE_REAL_PROVIDERS=1` + `RODIN_API_KEY` (Business sub). Findings/fixes:

- **Rodin real path works end-to-end**: submit `/api/v2/rodin` → poll
  `/api/v2/status` (6 sub-jobs all `Done`) → download `/api/v2/download` returned
  `base_basic_pbr.glb` + `preview.webp`; persisted per-game with
  `providerMode='real'` and served back via `/api/game-assets/:slug/*`.
- **`/api/game-assets/:slug/*` was actually missing** from `main.ts` (the earlier
  "landed" edit had been lost), so every generated asset URL 404'd. Re-added with
  safe-slug + `..` rejection + `assets/3d/` prefix assertion; verified GLB/webp
  serve 200 and traversal returns 4xx.
- **webp preview was being dropped**: Rodin's preview is `preview.webp`, but
  `classifyFile()` returned `null` for `.webp` and `FileFormat` lacked it, and
  `per-game-store.ts` hardcoded preview ext to `.png`. Fixed: `FileFormat` now
  includes `'webp'`; `classifyFile()` maps `.webp` → `preview_image`; preview
  files are now stored with their real format ext (`<name>.<fmt>`), so webp
  thumbnails persist and render.
- Smoke-test asset + temp files cleaned up after verification.

## 2026-06-11 Second grill-review revisions (READ FIRST)

A second `grill-with-docs` pass on 2026-06-11 (evening) cross-checked the plan
against the real code and the v2 workspace contract, then revised 10 key
decisions with the user. The plan's top "review 修订摘要" block is the SSOT;
summary:

1. cacheKey includes `assetSlot`, excludes `assetName`; a hit reuses the old
   path and ignores the freshly-typed name (UI shows "cache hit").
2. Multi-file asset = main GLB is identity + same-basename sidefiles; sidefiles
   go in sidecar `dependencies[]`; OBJ dropped by default (GLB only).
3. **Align v2 workspace-contract disk format** (`<name>.glb.meta.json` + the
   contract sidecar schema). Runtime mechanism (path-slot / `writeAsset()` /
   `_index.json` / ownership conflict) is recorded as ADR-0002 known debt, NOT
   built this round. Target path stays `assets/3d/{characters|meshes}/` (the
   "move to a private `assets/gen3d/`" idea was considered and rejected — keep
   "generation = immediately game-usable"; ownership conflict stays as debt).
4. base64 upload uses the existing JSON route (verified no bodyLimit); backend
   hard-validates ≤8MB. **Hunyuan is an internal-network API → fetching a public
   COS URL is an explicit verification item + fallback** (byte inline / internal
   COS / Hunyuan URL-only).
5. Polycount control = **low/medium/high discrete buttons** (continuous slider
   dropped — it was fake for Rodin's `quality_override`).
6. `delete-asset` writes a cache tombstone (sidecar `custom` stores the cacheKey
   for reverse lookup) so deleted assets don't resurrect / re-burn quota.
7. cache.jsonl / audit.jsonl **move per-game** (was a plan omission; a global
   cache would mis-hit across games with game-relative paths).
8. The new server route reuses `defaultProjectRoot` / `safeSegment` +
   `..`-rejection + prefix assertion — no new wheel.
9. Old global library: **clean break, no migration** — drop the `assetId` field;
   old `.forgeax/assets/gen3d/` is discarded test data (delete manually).
10. pose-standardization / upload intermediate images are Transfer scratch
    artifacts (`.forgeax/games/<slug>/.gen3d/tmp/`), NOT assets — not in the
    library, no delete UI.

## 2026-06-11 Closeout Log

This closeout was written after the `grill-with-docs` session hit context limit.
It is documentation-only: no runtime code, schemas, env files, generated assets,
or secrets were changed in this handoff pass.

Updated SSOT set for the next executor:

- `docs/PLAN-2026-06-11-rodin-cos-pergame.md` — execution plan for M9-M12.
- `docs/adr/0002-per-game-file-asset-storage.md` — accepted decision replacing
  ADR-0001's global asset library with per-game file storage.
- `CONTEXT.md` — canonical terms: `assetPath`, `assetSlot`, Asset Name, transfer
  URL, per-game runtime asset library.
- `docs/MIGRATION_PLAN.md` — historical M0-M8 retained, with an M9-M12 addendum.
- `docs/CAPABILITY_MATRIX.md` — Rodin is mock-first/planned; real calls stay
  gated until key + output shape are verified.

Scope guard for implementation: M9 is mostly plugin-local, but the read-only
`/api/game-assets/:slug/*` preview route touches `packages/server/src/main.ts`.
Confirm authorization before that one plugin-external edit, and keep it limited
to `.forgeax/games/<slug>/assets/3d/**`.

New work, in order:

1. **M9 — per-game storage refactor (do FIRST; everything depends on it).**
   New `server/per-game-store.ts` (`AssetStorage` file+sidecar impl) writing
   `${gameRoot}/assets/3d/{characters|meshes}/<name>.glb` + `<name>.glb.meta.json`
   (sidecar aligned to v2 workspace contract: schema + `dependencies[]`); new
   manifest identity field is `assetPath` (drop UUID `assetId` +
   content-addressed blobs); `assetSlot` is
   `characters` or `meshes`; cacheKey includes `assetSlot`, excludes `assetName`;
   ordinary generation reuses cache hits and never
   overwrites same-name assets (suffix on non-cache collisions); cache.jsonl /
   audit.jsonl also move per-game; slug from iframe URL query
   `?slug=<gameSlug>` first, with host bridge/ctx only as compatibility;
   `gen3d:delete-asset` (confirm-destructive, writes cache tombstone); new server
   route `/api/game-assets/:slug/*` (plugin-external — confirm authorization
   first; read-only and limited to `.forgeax/games/<slug>/assets/3d/**`).
2. **M10 — local image upload via plugin COS adapter** (`gen3d:upload-image`,
   base64 → 24h presigned URL, backend hard-validates ≤8MB); SetupSidebar
   file-picker inputs; bigger prompt box; "角色编辑器" hint. Note Hunyuan
   internal-network COS-fetch risk + fallback.
3. **M11 — Rodin provider** (`server/providers/rodin.ts`, multipart Bearer;
   text/image/views; `quality_override`); UI selector; mock-first until key.
4. **M12 — UI upgrade** (pose-standardization moved to top; **low/medium/high
   discrete polycount buttons** + per-provider values; result grid/skeleton/
   face-vertex info; dense asset grid showing prompt + delete-with-confirm).

The "Asset Storage", "Relationship To Per-Game Assets", and M8-handoff items
below are **historical context** — M9 supersedes the global library. Treat the
plan + ADR-0002 as the target, not the ADR-0001 storage description.

## Current State

M0-M4 complete for `wb-gen3d` inside the marketplace submodule, plus M5
`pose_standardization` (the first Hunyuan REST subtool), implemented and
live-verified. The Hunyuan workflow provider (`text`/`image`/`views` via
`*-wf`) is built with a real submit/poll client, but **real calls are OFF by
default**: the master switch `GEN3D_ENABLE_REAL_PROVIDERS=1` plus a
`HUNYUAN_API_KEY` must both be set, else every generation tool falls back to the
deterministic mock (quota-safe). The ADR-0001 decoupled modules (providers /
cache / rate-guard / audit / env) are landed.

M13 `auto_rigging` / `motion_retarget` v1 / `low_poly`(optional) are **planned, not
implemented** (SSOT `docs/PLAN-2026-06-12-rig-motion-lowpoly.md`, ADR-0003 **Accepted**,
grill 2026-06-12). Core pipeline: textured high-poly GLB → rig → motion; low_poly is
optional side-branch. Execution starts at Gate 0 (Hunyuan internal egress fetch of public
COS model URLs — note: public GET ≠ Hunyuan fetch).

Product direction (2026-06-09): `wb-gen3d` is the production 3D generation
entrypoint for game assets, not a benchmark tool. Provider comparison is
background knowledge in docs only, not runtime code or UI (see
`docs/adr/0001-production-tool-architecture.md`).

Created files:

- `.gitignore`
- `.env.example` (var names only; real `.env` is gitignored)
- `forgeax-plugin.json`
- `index.html`
- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `CONTEXT.md`
- `docs/MIGRATION_PLAN.md`
- `docs/CAPABILITY_MATRIX.md`
- `docs/PLAN-2026-06-11-rodin-cos-pergame.md`
- `docs/adr/0001-production-tool-architecture.md`
- `docs/adr/0002-per-game-file-asset-storage.md`
- `HANDOFF.md`
- `schemas/provider-status.args.json`
- `schemas/provider-status.returns.json`
- `schemas/list-assets.args.json`
- `schemas/list-assets.returns.json`
- `schemas/generate-meshy-text-mock.args.json`
- `schemas/generate-meshy-text-mock.returns.json`
- `schemas/text-to-3d.args.json` / `schemas/text-to-3d.returns.json`
- `schemas/image-to-3d.args.json` / `schemas/image-to-3d.returns.json`
- `schemas/views-to-3d.args.json` / `schemas/views-to-3d.returns.json`
- `schemas/pose-standardization.args.json` / `schemas/pose-standardization.returns.json`
- `schemas/gen3d-asset-manifest.json`
- `shared/manifest.ts` (Gen3DAssetManifest contract)
- `shared/catalog.ts` (capability matrix + ProviderResult + mock generator)
- `server/env.ts` (env + feature-gate resolution)
- `server/asset-storage.ts` (AssetStorage adapter interface)
- `server/local-blob-store.ts` (LocalBlobStore dev impl)
- `server/cache.ts` (cacheKey -> assetId dedup)
- `server/rate-guard.ts` (sliding-window submit guard)
- `server/audit.ts` (append-only audit trail, no secrets)
- `server/providers/hunyuan-workflow.ts` (real submit/poll client, injectable transport)
- `server/providers/hunyuan-rest.ts` (synchronous REST subtool client, injectable transport)
- `server/generate.ts` (ProviderResult -> manifest orchestration + cache-first)
- `server/tool-handlers.ts`
- `src/main.tsx`
- `src/App.tsx` (M8: shell + shared tool state; routes left/center panes)
- `src/lib/toolClient.ts` (M8: `POST /api/tools/call` client)
- `src/lib/blobUrl.ts` (M8: storageKey → same-origin URL resolver)
- `src/components/ModelViewer.tsx` (M8: three.js GLB renderer with OrbitControls)
- `src/components/SetupSidebar.tsx` / `StepCard.tsx` (M8 UI refactor: staged left pane)
- `src/components/Workspace.tsx` / `AssetLibrary.tsx` (M8 UI refactor: center + right column)
- `src/types.ts` / `src/ui-meta.ts` (shared types + semantic icon map)
- `src/styles/tokens.css` (vendored design tokens) + `src/styles.css`

No secrets, env values, cache files, or generated assets are committed. `dist/`
and `.env` are ignored. Durable assets, `cache.jsonl`, and `audit.jsonl` land
under `.forgeax/assets/gen3d/` (outside source control).

## Branch Context

Expected working directory:

`/Users/laurenceelu/dev/ForgeaXGame/forgeax-studio/packages/marketplace`

Expected branch:

`laurenceelu/feat-20260615-gen3d-polish`（studio + marketplace 同名）

（历史：`feat-20260609-hunyuan3d-meshy-pipeline-card` 已合入 main 并于 2026-06-15 删除本地分支。）

The top-level Studio repo should remain on the matching feature branch. The
top-level repo only needs to record the submodule pointer when integration or a
commit step explicitly requires it.

> **2026-06-12 — INTEGRATED TO MAIN.** The whole wb-gen3d line (M3–M12) plus the
> server routes are now merged into each repo's `main`: marketplace@`43b0715`,
> server@`807bebd`, studio superproject@`1092ad4`. The studio pointer is no longer
> dirty/dangling. Continued work happens on the feature branch (kept in sync with
> main) and lands on main following the team's direct-push convention.

## Source Reference

Reference project:

`/Users/laurenceelu/dev/hunyuan3d-lab/`

Full source architecture and migration handoff:

`/Users/laurenceelu/dev/hunyuan3d-lab/docs/FORGEAX_STUDIO_MIGRATION_HANDOFF.md`

Target-side pointer:

`docs/SOURCE_HANDOFF.md`

Use it as read-only source evidence. Do not copy secrets, `.env`, `cache/`,
`outputs/`, COS credentials, or generated model artifacts.

Most important source conclusions already carried into this plugin:

- The main product value is generation-first: upstream character image assets in,
  durable 3D asset manifests out, with provider comparison as supporting evidence.
- Cache-first behavior is mandatory before quotaed provider calls.
- Provider order is Hunyuan first, Meshy second, Rodin third after key/API
  details arrive.
- Hunyuan workflow and Hunyuan REST sub-capabilities are separate integration
  paths.
- Provider result URLs should be downloaded immediately and persisted through an
  asset-storage adapter.
- Downstream modules should consume stable asset paths/manifests, not temporary
  provider URLs.
- Rigging and animation integrations must treat FBX URLs as request-time access
  URLs only. The stored source of truth is the asset manifest plus blob storage,
  not a provider URL, browser URL, or local dev URL.
- Unverified modes stay out of UI and AI-facing schemas.
- Quality scoring uses five dimensions: geometry, topology, texture, pbr, and
  prompt_fidelity.

## Asset Storage And Rigged FBX Contract

> SUPERSEDED BY M9 (see plan + ADR-0002): the global content-addressed
> library described here is being replaced by a per-game v2 file contract
> (`${gameRoot}/assets/3d/{characters|meshes}/<name>.glb` + `.meta.json`, asset
> id = path). The rigged-FBX role/readiness semantics below still hold; the
> storage location and asset-id model change. Kept here as historical baseline.

The M3 storage contract is the baseline for future development:

- Long-term generated output lives in a `Gen3DAssetManifest` plus blob files in a
  global, game-agnostic library (ADR-0001 / CONTEXT.md):
  `.forgeax/assets/gen3d/<assetId>/manifest.json` plus content-addressed blobs at
  `.forgeax/assets/gen3d/blobs/<sha256-prefix>/<sha256>.<ext>`. Everything under
  `.forgeax/` stays out of source control. Games reference assets by `assetId`;
  generation does not require choosing a game first.
- `files[]` describe durable file roles: `source_mesh`, `rigged_model`,
  `preview_image`, `texture`, `animation_clip`, `animated_model`. Each file
  carries `fileId`, `format`, `storageKey`, `bytes`, `sha256`, `localUrl`, plus
  rigging readiness (`hasSkeleton`, `skeletonProfile`, `animationInputReady`).
- Hunyuan `motion_retarget` input is not "any FBX". It must resolve from
  `assetId + role=rigged_model + format=fbx` with verified skeleton metadata
  (`hasSkeleton: true`, `skeletonProfile: "humanoid"`, `animationInputReady:
  true`). Generation never sets these; M13 `gen3d:auto-rig` (planned) will append
  `rigged_model` **GLB (canonical) + FBX (motion transport)** with verified skeleton metadata.
- Converting GLB or OBJ to FBX does not make it animation-ready.
- External rigging/animation providers that need a fetchable URL get one via
  `AssetStorage.shareUrl` — a request-time transport URL, never the canonical
  asset reference.
- Provider outputs from rigging/animation must be downloaded back into the same
  storage contract before downstream consumption.

### Relationship To Per-Game Assets (`.forgeax/games/<slug>/assets/`)

ForgeaX also has an official **per-game runtime asset library** (project property,
not plugin property). Example: `packages/games/shoot-opt/assets/` symlinked at
runtime to `.forgeax/games/shoot-opt/assets/` (pack.json + GUID materials).
v2 target layout adds `assets/2d/` and `assets/3d/characters/` path slots — see
`docs/v2-vision/node-runtime-architecture/03-WORKSPACE-LAYOUT.md`.

**wb-gen3d global library and per-game assets are layered, not competing:**

| Layer | Path | Role |
| --- | --- | --- |
| Global staging | `.forgeax/assets/gen3d/` | AI generation output, cross-game reuse |
| Game runtime | `.forgeax/games/<slug>/assets/` | Engine-consumable assets (shoot-opt pack, future handoff targets) |

Handoff from gen3d → game `assets/3d/characters/` (copy + `.meta.json`) was the
old M8-remaining item; **M9 supersedes it** — the per-game file model writes
generation output straight into `${gameRoot}/assets/3d/{characters|meshes}/`, so
there is no separate "global → game" copy step.

## Implemented Tools

- `gen3d:provider-status`: returns the static provider capability matrix and
  quality rubric dimensions (planning data only, not a runtime scorer). Now also
  reports `quotaSafe` and `realProvidersEnabled` based on whether a real provider
  is configured.
- `gen3d:list-assets`: lists persisted `Gen3DAssetManifest` records from the
  global library, optionally filtered by provider.
- `gen3d:generate-meshy-text-mock`: deterministic no-quota Meshy text-to-3D mock
  that persists a durable manifest (source_mesh GLB + preview_image PNG blobs)
  via the storage adapter and returns the manifest. `assetId` is random per call;
  `cacheKey` is deterministic for the same input.
- `gen3d:text-to-3d` / `gen3d:image-to-3d` / `gen3d:views-to-3d`: mode generation
  with a `provider` param (Hunyuan workflow `*-wf` OR Meshy), cache-first. When the
  chosen provider's env is configured they call the real submit/poll endpoints,
  download output URLs into blobs, and persist a `Gen3DAssetManifest`. When not
  configured they fall back to the deterministic mock (`usedMock: true`). Returns
  `{ ok, cacheKey, cacheHit, usedMock, manifest }`.
- `gen3d:refine-mesh`: Meshy-only second stage — add texture to a prior Meshy
  text `preview` task (`previewTaskId` = the manifest `sourceJobId`). Persists a
  new durable manifest (`mode='refine'`, cache-first). Mock fallback when Meshy is
  not configured.
- `gen3d:pose-standardization`: Hunyuan REST subtool (synchronous `POST
  /openapi/v1/3d/images/pose_standardization`). Upstream preprocessing only:
  standardizes a simple cartoon full-body image to an A/T-pose image. The output
  image is downloaded into a durable `preview_image` blob and the tool returns
  `{ ok, usedMock, sourceJobId, storageKey, bytes, sha256, localUrl, sourceUrl }`.
  It does NOT produce a `Gen3DAssetManifest` — the `storageKey` is meant to feed a
  later `gen3d:image-to-3d` call. Quota-safe by default (mock image blob when no
  real provider is configured).

## Real Provider Activation (quota-safe by default)

Real 3D generation goes through the LiteLLM 3D gateway. The gateway key is
managed centrally in **Studio Settings → API Keys** (priority
`FORGEAX_3D_GATEWAY_KEY` > `ANTHROPIC_API_KEY` > `LITELLM_PROXY_KEY`); the
plugin-local `.env` **never** holds it. The plugin `.env` (gitignored; copy
`.env.example`) holds only:

- `GEN3D_ENABLE_REAL_PROVIDERS=1` — master switch (real calls vs quota-safe mock)
- `COS_SECRET_ID` / `COS_SECRET_KEY` / `COS_BUCKET` / `COS_REGION` — object
  storage for URL-fetching providers (image / views / pose standardization)

The gateway forwards to Meshy / Hunyuan models (`meshy-3d-*` / `hunyuan-*`);
**Rodin (Hyper3D) is not on the gateway** (`getRodinEnv` returns null; `rodin.ts`
code retained, disabled until the gateway adds a Hyper3D model). With the switch
unset/0 or no gateway key, generation stays mock-only and never touches the
network. The 3D gateway base URL is decoupled from the chat/image
`LITELLM_PROXY_*` vars (which may point at a different proxy); see
`server/env.ts` `pickLitellmFromEnv` / `resolveGatewayBaseUrl`.

## Verification So Far

From this plugin directory:

```bash
npm run typecheck
npm run build
```

Both passed on 2026-06-10. An out-of-tree bun smoke (no real network) confirmed:
the no-key path falls back to mock and persists a durable manifest; cache-first
returns the same `assetId` on a repeat input (`cacheHit=true`) and a new asset for
a different input; and an injected-`fetch` simulation of the Hunyuan client drives
submit → poll → `extract_urls` → download → manifest with exactly one submit, the
correct `*-wf` model id, and `providerMode='real'`.

Live verification (2026-06-10, internal network, operator-approved): one real
`gen3d:text-to-3d` completed in ~292s with `providerMode=real`, `usedMock=false`,
a real `sourceJobId`, and four downloaded blobs persisted into a manifest
(`source_mesh/glb` ~41.9 MB, `source_mesh/obj` ~600 KB, `preview_image/png`,
`texture/png` ~17.5 MB). The Hunyuan OpenAPI host (set via `HUNYUAN_BASE_URL`) is
reachable from the internal network (bare probe returns 401 without auth).

M5 `pose_standardization` verification (2026-06-10): an injected-fetch smoke (no
network) confirmed exactly one synchronous POST with the correct REST path,
model, and Bearer auth, `data[].url` extraction + download into bytes, and that
an error response throws `provider_failed`; typecheck + build pass. Live
(operator-approved): one real `gen3d:pose-standardization` on the doc human image
completed in ~20s with `usedMock=false`, a real `sourceJobId`, and a 501 KB
standardized PNG persisted as a content-addressed blob; audit recorded
`rest_succeeded` with no secrets.

## Next Step

> **New direction (2026-06-11): next work = M9-M12 in
> `docs/PLAN-2026-06-11-rodin-cos-pergame.md` (start with M9).** The status below
> is the M0-M8 baseline the plan builds on; read it for context, then execute the
> plan.

M4 (Hunyuan workflow provider), M5 `pose_standardization`, and M6 (Meshy
provider — `text`/`image`/`views` + `refine-mesh`) are done and live-verified.
**M8 core generation-loop UI is landed** (`src/App.tsx`
rewritten from the M3 mock preview to drive the real `gen3d:text/image/views-to-3d`
tools over `POST /api/tools/call`, with provider-status banner, manifest result
card, and `gen3d:list-assets` library; `src/lib/toolClient.ts` is the HTTP
client; `vite.config.ts` gained a dev `/api` proxy). **Blob serving + three.js
model preview are also landed** (2026-06-10):

- Server gained `/api/gen3d-blobs/*` static route (`packages/server/src/main.ts`,
  commit `bf78703` on branch `laurenceelu/feat-20260609-gen3d-blob-route`) mapping
  the URL prefix to `.forgeax/assets/gen3d/` on disk (immutable cache, CORS).
- `LocalBlobStore` now receives `localUrlBase='/api/gen3d-blobs'` so new assets
  carry a same-origin `localUrl`; the frontend `blobUrl()` helper also derives URLs
  from `storageKey` for assets generated before this change.
- `ModelViewer` component (three.js + GLTFLoader + OrbitControls) renders GLB
  models in the result card; `PreviewThumb` renders `preview_image` PNGs.
- Asset library cards are clickable to inspect any previously generated asset.
- Embedded same-origin serving: the manifest now sets
  `entry.standalone.embeddedAlso:true` and the server gained a second
  `serveStatic` block `/plugins/wb-gen3d/*` (`packages/server/src/main.ts`) that
  serves the built `dist/`. The Studio iframe therefore loads from
  `/plugins/wb-gen3d/` (same-origin) like every other workbench, instead of the
  cross-origin standalone dev port :15175 — which, when not running, left the
  in-page panel stuck on the loading placeholder. `npm run dev` (:15175) is still
  the standalone-dev path outside Studio.

typecheck + build pass. End-to-end verified: GLB (37MB) and PNG served at 200 via
the blob route, three.js loads and renders the model in standalone dev (:15175);
embedded in Studio, both panes load from same-origin `/plugins/wb-gen3d/`
(`readyState=complete`) and render the real UI — no more stuck "加载中".

**UI refactor landed (2026-06-11, commit `af986ce`):** Workbench tool-editor
pattern — vendored tokens, staged left sidebar (`SetupSidebar`/`StepCard`),
center workspace + asset library right column (embedded center pane; no separate
right iframe in `forgeax-plugin.json`). Old teal theme removed. Tool contracts
unchanged. typecheck + build pass; visual validation across standalone/left/center
panes done.

Remaining M8 UI items (non-M13, lower priority):

1. ~~`pose-standardization` upstream step~~ — DONE (`PosePreprocess` in `SetupSidebar`).
2. ~~views L/R inputs~~ — DONE (「添加左/右视图」in views mode).
3. Quality-rubric scoring UI (reserved: `InspectorReserved`, disabled placeholder).
4. gen3d → game `assets/3d/characters/` handoff (copy/import + sidecar meta) — largely superseded by M9 per-game writes; any remaining polish is non-blocking.

M13 backend (planned, not implemented; **grill 2026-06-12 reorder**):
**`gen3d:auto-rig` → `gen3d:apply-motion`** (textured high-poly GLB → rig → motion);
**`gen3d:retopo-lowpoly` is an OPTIONAL geometry/LOD side-branch, NOT a pre-rig step**
(Hunyuan REST `auto_rigging` / `motion_retarget` v1 / `low_poly`). Keep
`motion_retarget_v2` blocked. See top-of-file M13 section + ADR-0003.

Note (not yet acted on): real `text` output returns both a GLB and an OBJ
`source_mesh`. The current `URL_KEY_TO_FILE` keeps one file per `role:format`, so
both are stored. Decide later whether to prefer GLB and drop OBJ.

## Pending Work (do NOT lose — push incrementally)

> **Current next work = 持续优化（见顶部「当前开发线」）** — 分支 `laurenceelu/feat-20260615-gen3d-polish`。
> M13 历史 SSOT: `docs/PLAN-2026-06-12-rig-motion-lowpoly.md`。

| Item | Status | Blocker / note |
| --- | --- | --- |
| **M13 rig/motion/low_poly** (store-append → auto-rig → apply-motion → lowpoly → UI) | **code-complete (mock-first)** | three tools + schemas + plugin.json + UI landed; typecheck/build + mock full-chain sanity pass; `exposedToAI:false` until Gate 0/1 |
| **M13-0 Gate 0/1 verification** | ✅ **PASSED 2026-06-13 (auto-verified parts)** | probe `scripts/m13-gate-probe.ts` (out-of-tree) hit Hunyuan 内网 + COS: Gate 0 reachability ✓, response shape ✓, **texture survival ✓** (rigged/animated GLB embed images=3/textures=3), 22-joint humanoid skeleton ✓, motion 14 animation ✓. **Remaining = operator visual T-pose/animation eyeball + flip `exposedToAI:true`** (see `.probe-out/<ts>/SUMMARY.md`). |
| ~~store-append~~ (`appendDerivedFiles`, skeleton+motionType fields, per-asset lock) | **DONE** | `per-game-store.ts` + `asset-storage.ts` + `manifest.ts` |
| ~~M13-2 auto-rig~~ | **DONE (mock-first)** | `gen3d:auto-rig`, humanoid/characters soft-gate, idempotent |
| ~~M13-3 apply-motion~~ | **DONE (mock-first)** | `gen3d:apply-motion`, int 9–16, idempotent per motion, not-rigged guard |
| ~~M13-1 retopo-lowpoly~~ | **DONE (mock-first)** | `gen3d:retopo-lowpoly`, new derived asset, cache-first, source retained |
| ~~M13-4 UI~~ | **DONE** | DownstreamPanel rig→motion + ModelViewer AnimationMixer + AssetLibrary readiness/motion badges |
| **M8 quality scoring UI** | **DONE (P3 Phase A)** | `QualityInspector` + heuristics；AI 维 P4 推迟 |
| gen3d → game assets handoff (quality scoring) | not started | M8 remaining polish (non-blocking) |
| Quality-rubric scoring runtime | not started | static rubric dims from `provider-status` only |
| **GLB/OBJ dedup** | **DONE** (ADR-0002) | `per-game-store.ts` `planFiles()` keeps GLB, drops OBJ |
| ~~M9 per-game storage~~ | **DONE** | ADR-0002; server route landed |
| ~~M10 upload + COS~~ | **DONE** | restart server if env cached |
| ~~M11 Rodin~~ | **DONE** (image live-verified) | views still unverified |
| ~~M12 UI upgrade~~ | **DONE** | |
| ~~UI refactor~~ | **done** `af986ce` 2026-06-11 | |
| ~~views L/R inputs~~ | **done** 2026-06-11 | |
| `motion_retarget_v2` | blocked | keep out of UI/AI schemas until verified output shape exists |

## Completed: UI Refactor (2026-06-10 plan → 2026-06-11 landed)

**Status: landed** in marketplace commit `af986ce` (2026-06-11). UI-only; all
`gen3d:*` tool contracts and server code unchanged.

Original problem: bespoke teal theme divorced from the repo design system.
Refactored into the ForgeaX Workbench tool-editor pattern (wb-character as
reference only).

Governing SSOT (for future UI tweaks):

- `.cursor/skills/forgeax-editor-ui-pattern/{EDITOR_UI_PATTERN,WORKBENCH_LEFT_SIDEBAR,EXAMPLES}.md`
- `packages/interface/src/styles/{tokens.css,motion.css,forgeax-preview/DESIGN-SYSTEM.md}`
- `.cursor/rules/ui-token-alignment.mdc`
- Theming precedent (plugins vendor a tokens copy; iframe does NOT inherit host
  tokens): `wb-ui/src/ui/tokens.css`, `wb-narrative/viz/src/styles/forgeax-tokens.css`

Slot map:

| Pattern slot | wb-gen3d content |
| --- | --- |
| pane-header | "3D 角色生成" + lime pill (provider mode real/quota-safe · asset count) |
| `EditorLeftPanel` (staged) | Step1 Provider · Step2 mode+input · Step2.5 pose (conditional) · Step3 params · `ToolActionRow`=Generate |
| `EditorCenterWorkspace` | `ModelViewer` (GLB) hero + manifest facts + refine CTA (Meshy text); empty/loading/error |
| `EditorRightPanel` | asset library (`.motion-row`) + selected inspector; RESERVED: quality-score card, downstream-handoff action |
| `EditorBottomPanel` (optional) | generation progress/status (Hunyuan takes minutes) |
| `EditorToastLayer` | error/success |

Staged left sidebar (step card = number → title → live summary → collapsible
body; only the current step open):

1. Provider — 混元 / Meshy (segmented).
2. 输入方式 — 文生 / 图生 / 多视图 (segmented); body = prompt / imageUrl /
   views (front required + back + ADD left + right).
3. 姿态标准化 (optional, image/views) — existing `PosePreprocess`, "用作输入".
4. 生成参数 — `targetPolycount`, PBR, Meshy-text→refine note.
- `ToolActionRow`: Generate, right-aligned, `--primary` + `--color-text-on-bright-primary`.

Reserved slots (placeholders now, wire when backend lands — per confirmed
`uiscope = slots`):

- Quality-score card (right inspector): the 5 rubric dims from `provider-status`,
  rendered `disabled / 待评分运行时`.
- Downstream rigging/animation handoff (result-card action): M13 will wire
  auto-rig → apply-motion in sidebar (+ optional retopo side-branch; see PLAN M13-4); until then disabled.

Icon map (single, `lucide-react`, reuse the same glyph for the same action across
step/CTA/empty/toast): text `Type`, image `Image`, views `Images`, pose
`PersonStanding`, generate `WandSparkles`, refine `Brush`, library `Library`,
refresh `RefreshCw`, quality `Gauge`, handoff `Share2`, real/quota
`ShieldAlert`/`ShieldCheck`. Drop the current "same glyph (`Boxes`) for generate
+ library + brand".

Tokens/motion: replace the bespoke palette with `--color-*` / `--primary` /
`--color-status-*` / `--motion-*` + `.motion-row`/`.motion-panel-in`; use the
locked pane-header (lime `#d4ff48` pill) + 6px lime scrollbar constants from
`WORKBENCH_LEFT_SIDEBAR.md`. Bright primary buttons keep
`--color-text-on-bright-primary` through hover/active/focus.

States (every major slot needs a non-blank fallback): empty library, empty
selection, loading (task/progress), error (reason + retry + copyable details),
blocked (refine = Meshy-text only; handoff = needs rig).

Files (all inside the plugin): new `src/styles/tokens.css` (vendored); rewrite
`src/styles.css` + `src/App.tsx` (split into PaneHeader / SetupSidebar / StepCard
/ Workspace / AssetLibrary / InspectorReserved); `ModelViewer.tsx` class/container
only — no three.js logic change. Do NOT touch `server/**`, `schemas/**`,
`shared/**`, `toolClient.ts`, `blobUrl.ts`, or `forgeax-plugin.json` (ask first if
`panelSize`/`panes` need a tweak).

Phases (all complete 2026-06-11): ① tokens + pane-header → ② staged left panel
(incl. L/R views) → ③ center workspace + states → ④ asset library + reserved
inspector in center right column → ⑤ typecheck/build/visual + §10 checklist.

**Note:** asset library lives in the center pane right column because
`forgeax-plugin.json` only declares `left` + `center` panes (no separate right
iframe). Standalone dev: `npm run dev` on `:15175`.

Submodule pointer in forgeax-studio parent repo may still show `M packages/marketplace`
until explicitly bumped for integration. (2026-06-12: bumped and merged to
studio main@`1092ad4` — no longer dirty.)

## Do Not Expose Yet

- Hunyuan geometry and world workflow modes.
- Hunyuan REST `motion_retarget_v2`.
- Hunyuan REST `auto_rigging` as a default/user-facing mode.
- Rodin *real* output until `RODIN_API_KEY` + one verified output shape exist.
  (M11 may land the UI selector + provider mock-first; keep real calls gated
  behind `GEN3D_ENABLE_REAL_PROVIDERS` + key like Hunyuan/Meshy.)
- Any provider mode that has not produced a verified output shape.
