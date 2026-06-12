# ADR-0003 — Rig / motion / low-poly pipeline (Hunyuan-first, append-to-asset)

- **Status**: Proposed（2026-06-12，随 `docs/PLAN-2026-06-12-rig-motion-lowpoly.md`
  一起待 review；执行启动后转 Accepted）
- **Date**: 2026-06-12
- **Deciders**: laurenceelu
- **Extends**: ADR-0002（per-game 文件资产存储）。ADR-0001 的生产工具方向 + 模块解耦仍成立。

## Context

`wb-gen3d` 已能生成高面数网格（混元/Meshy/Rodin 的 text/image/views）。下一步要接
混元 3D 的下游产线，让生成物可绑骨、可动画：**减面（拓扑）→ 绑骨 → 动作**。

三家 provider 的下游能力不对等（见 PLAN "Provider 能力对比"）：

- **混元**：有 `low_poly`(减面) / `auto_rigging`(绑骨) / `motion_retarget` v1(动作,
  8 个固定动作)。是内网 API。`auto_rigging` 从未端到端验证；`motion_retarget_v2`
  动作库被封锁（ADR-0008）。
- **Meshy**：有最成熟的公网绑骨(`/v1/rigging`)+动作(`/v1/animations`，动作库丰富)，
  但消耗 credits、是外部服务。
- **Rodin**：无绑骨/动作 API，只能生成"易绑骨"模型（Quad+TAPose）。

manifest 契约（`shared/manifest.ts`）早已预埋 `rigged_model / animation_clip /
animated_model` 角色、骨架 readiness 标志、`computeReadiness()`，注释写明这些由
下游 pipeline "appended"。

## Decision

1. **下游产线全程用混元**（2026-06-12 与用户确认）：减面=`low_poly`、绑骨=
   `auto_rigging`、动作=`motion_retarget` v1。这是**产品策略选择**（混元为主线），
   不是技术受限。Meshy/Rodin 这轮不接绑骨/动画。

2. **动作只用 v1（8 个固定动作，`motion_type` int 9–16）**。`motion_retarget_v2`
   保持封锁、不进 UI/AI schema（ADR-0008 静默回退风险未解）。

3. **资产模型 = 在同一网格资产上"追加"派生文件**，而非每步造新主资产：
   - `low_poly` 输出是完整低模 GLB → 落**新派生 GLB 资产**（`writeAsset`，
     `sourceInputAssetPaths=[高模]`）。
   - `auto_rigging` 的**带骨 FBX** 作 `rigged_model` 同基名附属文件**追加**到目标
     网格资产；`motion_retarget` 的**动画 FBX** 作 `animated_model` 追加（文件名带
     `motion-<k>` 以多动作并存）。`readiness.rigged / animated` 随之翻动。
   - 理由：契约本就为"资产累加文件"设计（`computeReadiness` + `selectFile` +
     注释）；且 `PerGameAssetStore.writeAsset` 强制主文件是 GLB `source_mesh`，让
     FBX 当"新主资产"反而要大改存储层。append 既符合设计意图又改动最小。

4. **FBX 是绑骨/动画的载体格式**，且**只有经过验证的绑骨步骤才置**
   `hasSkeleton=true / skeletonProfile=humanoid / animationInputReady=true`
   （生成步骤永远不置——延续 manifest 契约与 HANDOFF 既定规则）。GLB/OBJ 转 FBX
   不等于可动画。

5. **混元内网 fetch 公网 COS 是显式验证门（Gate 0）**。给混元的输入都是 `cos-uploader`
   产出的临时 transport URL，不是资产引用；混元返回的 URL 立即下载成字节再落库。

6. **为支持 append，扩展插件内契约**（非跨插件契约）：`SidecarDependency` 加可选
   骨架字段使 rig/anim 附属文件能 round-trip；`AssetStorage` 加 `appendDerivedFiles`
   + `readAssetFile`；修 `sidecarToManifest` 还原附属文件真实 role/format/骨架标志。

## Alternatives considered

- **用 Meshy 做绑骨/动画**（API 最成熟、公网无内网风险、动作库大）：本轮被否，
  混元是主线。**保留为后续备选**——若需要更丰富动作库或混元 Gate 0 不通，Meshy
  的 `/v1/rigging` + `/v1/animations` 是现成退路（同 provider-抽象可加）。
- **每步造一个独立新资产**（rigged FBX / animated FBX 各自当新主资产）：被否。
  `PerGameAssetStore` 主文件强制 GLB `source_mesh`，FBX 当主文件要改 `planFiles` /
  `sidecarToManifest` / sidecar 命名 / list 扫描多处，比 append 更重；且会让资产库
  每个角色膨胀成 3+ 条目，丢失"同一角色逐级 source→rigged→animated"的语义。
- **把 low_poly 也做成对高模资产的 append**：被否。低模是一个可独立绑骨的完整网格，
  当高模的附属反而让"主体是高模、绑骨基于附属低模"语义混乱；低模作派生资产更清晰。
- **接 motion_retarget_v2 拿大动作库**：被否（ADR-0008 封锁未解，静默回退白扣配额）。

## Consequences

**正面**：
- 一个角色资产能逐级累积 source→rigged→animated，readiness 标志直接反映进度；
  下游 agent 用 `selectFile(files, 'rigged_model'|'animated_model')` 取文件。
- 复用现有 `cos-uploader` + `/api/game-assets` 路由 + cache/audit/RateGuard，
  **无新增 Studio server 路由**。
- 存储层改动集中在 `per-game-store.ts` + `asset-storage.ts` + `manifest.ts`（插件内）。

**负面 / 风险**：
- 混元链有两处未验证（`auto_rigging` 端到端、内网拉公网 COS），靠 Gate 0/1 先验。
- 产出是 FBX，引擎（Three.js/WebGPU）实时播放还需 FBX→GLB 转换（本轮不做）。
- `auto_rigging` 仅人形/结构清晰模型，非人形会失败。

## Implementation notes

- 详细任务见 `docs/PLAN-2026-06-12-rig-motion-lowpoly.md`（M13-0..M13-4 + 任务清单）。
- 三步均 mock-first、真机门控 `GEN3D_ENABLE_REAL_PROVIDERS` + `HUNYUAN_API_KEY`。
- low_poly 异步两段（submit→poll task），其余两步同步——给 `HunyuanRestProvider`
  分别加 `lowPoly()`(异步) / `autoRig()` / `applyMotion()`(同步)。
- 开放问题（执行前澄清）：motion v1 的 8 个动作名映射、高模是否保留、FBX→GLB 排期、
  auto_rigging 是否带 PBR 贴图入参——见 PLAN "开放问题"。