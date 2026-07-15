# ADR-0003 — Rig / motion / low-poly pipeline (Hunyuan-first, append-to-asset)

- **Status**: Accepted（2026-06-12 grill 收尾；对照混元三份官方 PDF + 代码 review 完成）
- **Date**: 2026-06-12
- **Deciders**: laurenceelu
- **Extends**: ADR-0002（per-game 文件资产存储）。ADR-0001 的生产工具方向 + 模块解耦仍成立。

## 2026-06-12 grill 修订（贴图存活 → 产线重排）

第二轮 grill 对照混元三份官方 PDF（`low_poly` / `auto_rigging` / `motion_retarget`）+ 真实代码后，
新增/修订以下决策（与下文 Decision 冲突处以本块为准）：

- **贴图存活 = 硬约束**：最终动画产物必须带原模型材质/贴图。
- **核心产线 = 带贴图高模直绑**：`带贴图 GLB → auto_rigging(glb_url) → motion_retarget(fbx_url)`。
  auto_rigging 文档明文"确保绑骨后的材质效果与原模型一致"，GLB 输入内嵌贴图、无需另传贴图
  （`texture_image_url/pbr_*` 仅 OBJ 输入路径用）。
- **GLB = canonical**：auto_rigging / motion_retarget 都同时输出 `glb_url`+`fbx_url`，且输出
  schema 无独立贴图 url ⇒ 均自包含。每跳存 GLB 作主体（预览/引擎），FBX 仅作 rig→motion 中转。
  ⇒ 原"FBX 外链贴图伴随文件"问题不存在（仅 OBJ 输入有外链贴图）。
- **low_poly 降级为可选几何/LOD 旁路**（非绑骨前置）：它纯几何、不保贴图、quad 换 UV，先减面=灰模动画。
- **download 纠正**：每跳取齐 `data[]` 全部产物（glb+fbx），不只 fbx_url。
- **trade-off**：四边面好拓扑 vs 贴图存活，混元无 re-bake 二者不可兼得；v1 选保贴图（直绑高模），
  "低模+带贴图"需外部 re-bake，列后续。

## Context

`wb-gen3d` 已能生成高面数网格（混元/Meshy/Rodin 的 text/image/views）。下一步要接
混元 3D 的下游产线，让生成物可绑骨、可动画：**绑骨 → 动作**（减面/LOD 为可选旁路；
原"减面（拓扑）→ 绑骨 → 动作"已于 2026-06-12 grill 修订，见顶部修订块）。

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

1. **下游产线全程用混元**（2026-06-12 与用户确认）：绑骨=`auto_rigging`、动作=
   `motion_retarget` v1、减面=`low_poly`（**可选旁路**）。这是**产品策略选择**（混元为主线），
   不是技术受限。Meshy/Rodin 这轮不接绑骨/动画。（**grill 修订：产线顺序 = 带贴图高模 → 绑骨 →
   动作；low_poly 不前置——见顶部修订块。**）

2. **动作只用 v1（8 个固定动作，`motion_type` int 9–16）**。8 个动作映射已由操作员
   拍板（2026-06-12）：9 跨步 / 10 摔倒 / 11 跳跃 / 12 踢腿 / 13 挥击 / 14 步行 /
   15 跑步 / 16 跳舞（详见 PLAN §③）。`motion_retarget_v2` 保持封锁、不进 UI/AI
   schema（ADR-0008 静默回退风险未解）。

3. **资产模型 = 在同一网格资产上"追加"派生文件**，而非每步造新主资产：
   - `low_poly` 输出是完整低模 GLB → 落**新派生 GLB 资产**（`writeAsset`，
     `sourceInputAssetPaths=[高模]`）。**高模默认保留**（2026-06-12 拍板，可再出别的
     LOD），删除由用户手动操作，工具不自动删。
   - `auto_rigging` / `motion_retarget` **同时输出 GLB+FBX**：GLB（自包含含贴图）作
     `rigged_model`/`animated_model` 的**主体附属**（预览/引擎），FBX 作**中转附属**（motion
     强制要 `fbx_url`，故 rigged FBX 须留作 motion 输入；animated 文件名带 `motion-<k>`
     多动作并存）。`readiness.rigged / animated` 随之翻动。（**grill 修订：落库主体是 GLB，不是 FBX**。）
   - 理由：契约本就为"资产累加文件"设计（`computeReadiness` + `selectFile` +
     注释）；且 `PerGameAssetStore.writeAsset` 强制主文件是 GLB `source_mesh`，让
     FBX 当"新主资产"反而要大改存储层。append 既符合设计意图又改动最小。

4. **FBX 是绑骨/动画的载体格式**，且**只有经过验证的绑骨步骤才置**
   `hasSkeleton=true / skeletonProfile=humanoid / animationInputReady=true`
   （生成步骤永远不置——延续 manifest 契约与 HANDOFF 既定规则）。GLB/OBJ 转 FBX
   不等于可动画。

5. **混元内网 fetch 公网 COS 是显式验证门（Gate 0）**。给混元的输入都是 `cos-uploader`
   产出的临时 transport URL，不是资产引用；混元返回的 URL 立即下载成字节再落库。

6. **为支持 append，扩展插件内契约**（非跨插件契约）：`SidecarDependency`(+`ManifestFile`) 加可选
   骨架字段 + **`motionType`(int 9–16)** 使 rig/anim 附属文件能 round-trip（**motion_type 结构化、
   不靠文件名**——幂等/枚举/下游选取都走它）；`AssetStorage` 加 `appendDerivedFiles` + `readAssetFile`；
   修 `sidecarToManifest` 还原附属文件真实 role/format/骨架标志/motionType。

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
- **low_poly 作绑骨前强制前置**（原计划）：**被否（2026-06-12 grill）**。混元三接口 contract
  实证：low_poly 纯几何、不保贴图（输出 obj 无 mtl、quad 重拓扑换 UV），且 motion 不重传贴图、
  只继承绑骨 FBX 的材质——故先减面 = 灰模动画，与"贴图必须存活"冲突。改为带贴图高模直绑，
  low_poly 降级为可选几何/LOD 旁路；"四边面+带贴图"需 re-bake（超范围），列后续。

## Consequences

**正面**：
- 一个角色资产能逐级累积 source→rigged→animated，readiness 标志直接反映进度；
  下游 agent 用 `selectFile(files, 'rigged_model'|'animated_model')` 取文件。
- 复用现有 `cos-uploader` + `/api/game-assets` 路由 + cache/audit/RateGuard，
  **无新增 Studio server 路由**。
- 存储层改动集中在 `per-game-store.ts` + `asset-storage.ts` + `manifest.ts`（插件内）。

**负面 / 风险**：
- 混元链有两处未验证（`auto_rigging` 端到端、内网拉公网 COS），靠 Gate 0/1 先验。
- ~~产出是 FBX，引擎实时播放还需 FBX→GLB 转换~~（**grill 修订：已不成立**——rig/motion 本就
  输出 GLB，引擎直接吃 glTF；但 ModelViewer 需补 `AnimationMixer` 才能**播放**动画 clip，否则只能静态预览）。
- `auto_rigging` / `motion_retarget` 仅人形/结构清晰模型，非人形会失败 → `assetSlot=characters`
  软门控 + AI schema 注明"仅双足人形" + 失败回显 reason（不做绑骨前人形检测）。

## Implementation notes

- 详细任务见 `docs/PLAN-2026-06-12-rig-motion-lowpoly.md`（M13-0..M13-4 + 任务清单）。
- 三步均 mock-first、真机门控 `GEN3D_ENABLE_REAL_PROVIDERS` + `HUNYUAN_API_KEY`。
- low_poly 异步两段（submit→poll task），其余两步同步——给 `HunyuanRestProvider`
  分别加 `lowPoly()`(异步) / `autoRig()` / `applyMotion()`(同步)。
- **append 并发安全**：`appendDerivedFiles`/`deleteAsset` 是对资产 sidecar 的 read-modify-write，
  须用进程内 per-asset 异步锁（键 `${slug}:${assetPath}`）串行化——同一角色并发挂多动作否则丢条目 + 留孤儿。
- 已消解开放问题（2026-06-12 grill）：FBX→GLB 不需要（rig/motion 输出 GLB）；
  auto_rigging 贴图入参仅 OBJ 路径需要（GLB 内嵌贴图直喂）。剩余后续项：
  "低模+带贴图" re-bake、ModelViewer AnimationMixer 播放。