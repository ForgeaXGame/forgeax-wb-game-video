# ADR-0006 — 公测版绑骨/动画改用 Meshy 公网 API（替换混元内网）

- **Status**: 🟡 Proposed（2026-06-21 提出，待 review；真机全链已预验证通过——见 PLAN §7）
- **Date**: 2026-06-21
- **Deciders**: laurenceelu（+ 待 reviewing agent）
- **Extends**: ADR-0001（生产工具方向 + provider 解耦）、ADR-0002（per-game 文件资产）。
- **Supersedes（部分 / 限公测语境）**: ADR-0003 §Decision 1（「下游产线全程用混元」）与 §Decision 2（动作仅混元 v1 的 8 个 `motion_type` 9–16）。ADR-0003 的其余决策（贴图存活、GLB canonical、append 到同资产、humanoid 软门控、per-asset 锁、motion 结构化存储）**继续成立**。
- **执行计划**: [`docs/PLAN-2026-06-21-meshy-public-rig-anim.md`](../PLAN-2026-06-21-meshy-public-rig-anim.md)

## Context

- 上级指示：**公测版本接入公网**。混元 3D 的 `auto_rigging` / `motion_retarget` 是**内网 OpenAPI**
  （`HUNYUAN_BASE_URL` = 内网 host），公测环境**无法 egress 到内网** → 现有 M13 绑骨/动画产线
  （`server/tool-handlers.ts:631-756`，硬编码 `getHunyuanEnv()` + `HunyuanRestProvider`）在公测里跑不通。
- **ADR-0003 已预留这条路**：其 §Alternatives 写明「若…混元 Gate 0 不通，Meshy 的 `/v1/rigging` +
  `/v1/animations` 是现成退路（同 provider 抽象可加）」。本 ADR 把该退路**升级为公测主线**。
- **生成链已公网化**：`MeshyProvider` 的 text/image/views/refine 已走通（`server/providers/meshy.ts`），
  `resolveProvider` 已支持 `provider:'meshy'`（`tool-handlers.ts:209-213`）。缺口只在绑骨 + 动画两步。
- **Meshy 能力已实证**（2026-06-21 真机，见 PLAN §7）：`/openapi/v1/rigging`（5 分，~23s，返回 rigged
  glb+fbx + 免费 walk/run）→ `/openapi/v1/animations`（`rig_task_id`+`action_id`，3 分，~12s，返回动画
  glb+fbx）；产物在本插件 `ModelViewer` 真机播放确认。动作库约 680 个，远超混元 v1 的 8 个。

## Decision

1. **公测版绑骨/动画主线 = Meshy 公网 API**：绑骨 `POST /openapi/v1/rigging`、动画
   `POST /openapi/v1/animations`（均异步 submit→poll）。这是**部署约束驱动**（公网）+ **能力更优**
   （动作库 ~680 vs 8）的双重选择。
2. **混元 REST 绑骨/动画降级为内网/dev gated 备选**：仅当 `getHunyuanEnv()` 配置齐全（内网开发机）才走，
   公测环境天然 null → 自动不启用。**不删代码**（零额外风险，保留内网增强可能）。
3. **动作标识从混元专用 `MotionType`(9–16) 泛化为 provider-tagged 描述符**（保留 9–16 作子集，向后兼容）。
   绑骨产物额外持久化 `rigProvider` / `rigTaskId` / `rigType`——因为 **Meshy 动画必须用它自己的
   `rig_task_id` 作入参**（不接受外部 FBX URL，这是与混元的本质差异）。
4. **沿用 ADR-0001/0003 的资产契约**：provider URL 短命（Meshy 产物 + 签名 URL 均 ~3 天过期）→ 立即下载落库；
   rig/anim 产物 **append 到同一角色资产**（GLB canonical + FBX 中转），readiness 随之翻转；贴图存活
   （Meshy rigged/animated GLB 自包含）。
5. **mock-first + 真机门控不变**：无 `GEN3D_ENABLE_REAL_PROVIDERS=1` + `MESHY_API_KEY` 时全部回退确定性 mock；
   付费调用前过 `RateGuard` + 可选余额预检；`exposedToAI` 仅在真机全链 + 护栏验证后翻 true。

## Alternatives considered

- **坚持「全程混元」（ADR-0003 原决策）**：公测被否——内网不可达，公测根本跑不通。内网/dev 仍可用（Decision 2）。
- **仅「混元失败时才回退 Meshy」**：被否——公测环境**根本没有**混元可用，「回退」语义不成立；公测应直接以 Meshy 为主线。
- **自建绑骨/动画**：被否——远超本期范围与价值，Meshy 公网方案现成且已验证。
- **接混元 `motion_retarget_v2`（48 动作，B 线）**：仍 blocked on 上游 @raineejiang，且仍是内网。公测用 Meshy；
  混元 v2 作长期内网增强（PLAN §8-Q7）。

## Consequences

**正面**：
- 公测 3D 绑骨/动画**能在公网跑通**（核心诉求达成）。
- 动作库从 8 → ~680，且绑骨**白送 walk/run**。
- 复用既有 provider 抽象 / `cos-uploader` / `/api/game-assets` / cache / audit / RateGuard / per-asset 锁；
  **零新增 Studio server 路由、零 `packages/server`/`engine` 改动**。
- 生成链已是 Meshy，公测 provider 栈统一到 Meshy，心智简单。

**负面 / 风险**：
- **要花 credits**（rig 5 / anim 3 每次）→ 需余额预检 + RateGuard + 公测动作精选集控成本（PLAN §8-Q1）。
- **`rig_task_id` ~3 天过期** → 「事后再加动画」可能要**自动 re-rig**（再扣 5 分）；本地存 rigged FBX **无法**
  规避（Meshy 动画只认 `rig_task_id`）。需拍板自动 re-rig vs 报错（PLAN §8-Q3）。
- **rigType 兼容**：动画需匹配 rig 的 rigType；要用 `/animations/{rig_task_id}/actions` 过滤可用动作。
- **契约改动**：动作标识泛化触及 `manifest.ts`（`MotionType`/`ManifestFile.motionType`/`SidecarDependency`）、
  `apply-motion` schema/UI、幂等键——需 round-trip 测试保混元 9–16 不回归。

## Implementation notes

- 详见 PLAN §3–§6（数据模型 / provider 抽象 / 任务清单 / 错误护栏）。
- 端点 / 任务信封 / result 字段 / 积分 / 3 天过期 等契约细节见 PLAN §2，并附 2026-06-21 真机实测 keys（PLAN §7）。
- Meshy rig/anim 是**异步**（submit→poll），复用 `MeshyProvider` 现有 poll 骨架但需单独的 result 提取
  （rig/anim result ≠ generation 的 `model_urls`）。
