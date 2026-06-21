# PLAN 2026-06-21 — Meshy 公网 API 接管绑骨 / 动画（公测版）

> **状态**: 🟡 PROPOSAL（待 review，未开始编码）
> **日期**: 2026-06-21 Asia/Hong_Kong
> **Owner**: laurenceelu
> **决策**: [`docs/adr/0006-meshy-public-api-rig-anim-for-beta.md`](./adr/0006-meshy-public-api-rig-anim-for-beta.md)（🟡 Proposed）
> **取代（部分）**: [`docs/adr/0003-rig-motion-lowpoly-pipeline.md`](./adr/0003-rig-motion-lowpoly-pipeline.md) §Decision 1/2 在**公测语境**下的「全程混元」前提
> **审阅入口**: 本文是可拆 ticket 的执行 + 契约 SSOT。先读 §0、§1、§8（开放决策），再决定是否进入 P0。

---

## §0 背景与硬约束（先读）

1. **公测版本 = 公网。** 上级指示：公测版要让 3D 能力跑在公网上。混元 3D 的 `auto_rigging` /
   `motion_retarget` 是**内网 OpenAPI**（`HUNYUAN_BASE_URL` 指向内网 host），**公测环境无法 egress 到内网** →
   现有 M13 绑骨/动画产线在公测里**根本跑不通**。
2. **Meshy 是现成公网退路，且已被 ADR-0003 预留。** ADR-0003 §Alternatives 明确写：
   「若…混元 Gate 0 不通，Meshy 的 `/v1/rigging` + `/v1/animations` 是现成退路（同 provider 抽象可加）」。
   本计划就是**把这条退路从备选升级为公测主线**。
3. **本期 = 文档 + 契约 + 计划，不写实现。** 用户要求先归档方案/ADR/handoff，后续由其他 agent review plan 再编码。
4. **范围边界**：插件目录内（`packages/marketplace/plugins/wb-gen3d/`）。复用既有 `cos-uploader` /
   `/api/game-assets` 路由 / cache / audit / RateGuard / per-asset 锁，**不新增 Studio server 路由、不动
   `packages/server` 与 `packages/engine`**。

---

## §1 现状 GAP（file:line）

| 能力 | 现状 | 公测可用? |
|---|---|---|
| 生成 text/image/views/refine | **已 Meshy 化**：`MeshyProvider` 走 `/openapi/v2/text-to-3d`、`/openapi/v1/image-to-3d`、`/openapi/v1/multi-image-to-3d`（`server/providers/meshy.ts:22-24`），`resolveProvider` 支持 `provider:'meshy'`（`server/tool-handlers.ts:209-213`） | ✅ 公网 ready |
| 绑骨 `gen3d:auto-rig` | **硬编码混元内网**：`autoRig()` 只认 `getHunyuanEnv()` + `HunyuanRestProvider.autoRig({glbUrl})`（`server/tool-handlers.ts:646-657`），否则 mock | ❌ 内网不可达 |
| 动画 `gen3d:apply-motion` | **硬编码混元内网 + 8 个固定动作**：`VALID_MOTION_TYPES=[9..16]`（`server/tool-handlers.ts:687`），`applyMotion()` 走 `HunyuanRestProvider.applyMotion({fbxUrl, motionType})`（`:728-739`） | ❌ 内网不可达 |
| `MeshyProvider` 绑骨/动画方法 | **不存在**：`meshy.ts` 只有 generation 模式（`MeshyMode='text'\|'image'\|'views'\|'refine'`，`meshy.ts:29`） | — 待新增 |

> 结论：**生成已公网化；缺口只在绑骨 + 动画两步。** 计划的全部代码量集中在「给 Meshy 加 rig/animate 方法 +
> 让 `autoRig`/`applyMotion` 按 provider 分派 + 泛化动作标识 + 处理 rig_task_id 生命周期」。

---

## §2 Meshy 公网 API 契约（绑骨 / 动画）

> **凭证**：`MESHY_API_KEY`（`msy_` 前缀）+ 可选 `MESHY_BASE_URL`（默认 `https://api.meshy.ai`），由
> `getMeshyEnv()` 解析（`server/env.ts:91-104`）。鉴权 `Authorization: Bearer <key>`，无签名。
> **账号已开通**（2026-06-18 零积分探测确认）：Text/Image/Multi-Image to 3D、Retexture、Remesh、Convert、
> **Auto-Rigging、Animation**、UV-Unwrap、Resize 全部 enabled。

### 2.1 端点

| 步骤 | 方法 + 路径 | 关键入参 | 异步? | 积分 |
|---|---|---|---|---|
| 绑骨 | `POST /openapi/v1/rigging` | `input_task_id`（Meshy mesh 任务 id）**或** 公网模型 URL（见 §8-Q5）；`height_meters` 等可选 | 是（submit→poll） | **5** |
| 动画 | `POST /openapi/v1/animations` | `rig_task_id`（绑骨任务 id）+ `action_id`（动作库 id） | 是（submit→poll） | **3** / 次 |
| 动作库 | `GET /openapi/v1/animations/{rig_task_id}/actions`（按 rig 过滤）；公开全量 `GET https://api.meshy.ai/web/public/animations/resources` | — | 否 | 0 |
| 余额 | `GET /openapi/v1/balance` | — | 否 | 0 |

> ⚠️ 与混元 REST 的关键差异：混元 `auto_rigging`/`motion_retarget` 是**同步**单次 POST
> （`server/providers/hunyuan-rest.ts:185,200`）；**Meshy rig/anim 是异步任务**，要 submit→poll，形态更接近
> `MeshyProvider` 现有的 generation poll（`meshy.ts:185-202`），但结果字段不同（见 §2.3）。

### 2.2 任务信封（submit / poll 响应）

```jsonc
{
  "id": "019ee8f9-1c43-72ef-b148-c43b0e9258a4",
  "type": "rig" | "animate",
  "status": "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED", // 大写
  "progress": 100,
  "created_at": 1782025106841,   // epoch ms
  "started_at":  1782025106869,
  "finished_at": 1782025129948,
  "expires_at":  1782284329948,  // ≈ created_at + 3 天（259_200_000ms）
  "task_error": null,
  "result": { /* 见 2.3 */ },
  "consumed_credits": 5
}
```

- **`expires_at` ≈ 创建后 3 天**（实测 rig: 1782025106841→1782284329948 ≈ 3.00 天）；`result` 里的签名 URL
  也带同样的 `Expires=`。⇒ **产物 URL 短命，必须立刻下载落库**（与 ADR-0001「provider URL 只是 request-time
  传输 URL」一致）。
- **`rig_task_id` 本身约 3 天后失效** → 影响「事后再加动画」（见 §6.3 / §8-Q3）。

### 2.3 result 字段（实测 keys）

**绑骨 `result`**（`type:"rig"`）：
- `rigged_character_glb_url` — 绑骨后 GLB（canonical，自包含贴图）
- `rigged_character_fbx_url` — 绑骨后 FBX
- `basic_animations` — **免费附带**（不额外扣分）：
  `walking_glb_url` / `walking_fbx_url` / `walking_armature_glb_url` /
  `running_glb_url` / `running_fbx_url` / `running_armature_glb_url`

**动画 `result`**（`type:"animate"`）：
- `animation_glb_url` — 动画 GLB（canonical）
- `animation_fbx_url` — 动画 FBX
- `processed_usdz_url` / `processed_armature_fbx_url` / `processed_animation_fps_fbx_url` — 可空（本次实测为空串）

### 2.4 动作库（PER-DOCS，待实现期确认）

- 公开全量约 **680 个 `action_id`**，字段含 `name` / `category` / `rigType`（如 `style_01` / `style_02`）/
  `isFree` / 预览 GIF。
- **rigType 兼容性**：动画的 `rigType` 需与绑骨产出的骨架类型匹配；实测 `action_id=28`（`style_02`）对本次绑骨
  成功 → 但「rig 产物到底是什么 rigType、如何过滤可用动作」**需在 P2 用 `/animations/{rig_task_id}/actions`
  落实**（绑骨响应里没直接回 rigType 字段）。
- `isFree=true` 的动作仍走 `/animations`，**是否扣 3 分以 `consumed_credits` 为准**（免费 walk/run 是绑骨附带，
  与单独调 `/animations` 是两回事）。

---

## §3 数据模型变更（`shared/manifest.ts`）

1. **泛化动作标识。** 现 `MotionType = 9|10|...|16`（`manifest.ts:46`，混元 v1 专用）。Meshy 用任意 `action_id` +
   `rigType` + 文案。提议新增 provider-tagged 描述符（保留混元 9–16 作为子集，**向后兼容**）：
   ```ts
   // 二选一，留给 review 定（§8-Q2）：
   // A) 扩成判别联合：
   type MotionRef =
     | { provider: 'hunyuan_rest'; motionType: 9|10|11|12|13|14|15|16 }
     | { provider: 'meshy'; actionId: number; label: string; rigType?: string; isFree?: boolean };
   // B) 统一字符串 key（"hy:14" / "meshy:28"）+ 旁挂 label/rigType。
   ```
   `ManifestFile.motionType`（`manifest.ts:68`）、`SidecarDependency.motionType`（`:180`）、`apply-motion`
   幂等判定（`tool-handlers.ts:721-723`）、UI 动作格都要跟着改。
2. **绑骨产物存 Meshy 链路标识。** 新增（建议落 `AssetSidecar.custom` / manifest 私有区，`manifest.ts:198-212`）：
   `rigProvider: 'meshy'|'hunyuan_rest'`、`rigTaskId: string|null`、`rigType: string|null`。
   动画步骤需要 `rigTaskId` 作 `/animations` 入参——这是 Meshy 与混元的**本质差异**：混元只需本地 rigged FBX 的 URL，
   Meshy 需要它**自己的 rig 任务 id**。
3. **readiness 不变**：`computeReadiness()`（`manifest.ts:235-243`）的 `rigged`/`animated` 语义对两家通用。
4. **免费 walk/run 落库**：绑骨返回的 `basic_animations` 可作 `animated_model`（`motionRef = meshy walk/run, isFree`）
   直接附加（§8-Q6 决定是否默认落库）。

---

## §4 Provider 抽象变更

### 4.1 `server/providers/meshy.ts` 新增

```ts
const PATH_RIGGING   = '/openapi/v1/rigging';
const PATH_ANIMATION = '/openapi/v1/animations';

interface MeshyRigInput     { inputTaskId?: string; modelUrl?: string; heightMeters?: number; }
interface MeshyAnimateInput { rigTaskId: string; actionId: number; }

// 复用现有 submit→poll 骨架，但单独的结果提取（rig/anim result 字段≠generation 的 model_urls）
async rig(input):     Promise<{ sourceJobId; rigType?; glb; fbx; basicAnimations: {...} }>
async animate(input): Promise<{ sourceJobId; glb; fbx; usdz?|null }>
async listActions(rigTaskId): Promise<MeshyAction[]>   // P2
```
- poll 复用 `status` 大写判定 + `task_error`（`meshy.ts:185-202`），但成功后读 §2.3 的 rig/anim result keys，
  逐个 `downloadImpl()` 成字节（同 generation：URL 立刻下载）。
- 仍走 `RateGuard`（提交前 `check()`）+ `audit()`。

### 4.2 `server/tool-handlers.ts` 分派

- 抽一个 rig provider 选择：**Meshy 优先（公测默认）→ 混元 REST（内网/dev，gated）→ mock**。
- `autoRig()`（`:631-679`）：
  - Meshy 路径：源资产若由 Meshy 生成且 mesh task 未过期 → 直接 `input_task_id`；否则 `shareAssetFileUrl(source_mesh,glb)`
    走公网 URL 入参。拿到 rigged glb+fbx → `appendDerivedFiles(role:'rigged_model', skeleton{...})`，并写
    `rigTaskId/rigType/rigProvider`；可选把 `basic_animations` 附为免费 `animated_model`。
  - 保留混元分支（env 在时）作 dev/内网。
- `applyMotion()`（`:702-756`）：
  - 入参从 `motionType:int` 泛化到 `motionRef`（§3）。Meshy 路径要 `rigTaskId`（从 manifest 读，缺失/过期→§6.3）；
    调 `animate({rigTaskId, actionId})` → 下载 animation glb → `appendDerivedFiles(role:'animated_model', motionRef)`。
  - 幂等键从 `motionType` 换成 `motionRef` 等价键。

### 4.3 env（`server/env.ts`）

`getMeshyEnv()`（`:91-104`）已够用（baseUrl/apiKey/poll/rate/defaultPolycount）。如需，可加
`MESHY_ANIM_CATALOG_TTL_MS` 缓存动作库；非必须。

---

## §5 任务清单（P0–P3，可拆 ticket）

| # | 任务 | 产出 | 验证（zero-credit 优先） | 闸门 |
|---|---|---|---|---|
| **P0** | MeshyProvider 加 `rig()`/`animate()` + 类型 + 结果提取 + audit | `meshy.ts` | 注入 `fetchImpl/downloadImpl` 的 smoke：submit→poll→download，零网络/零积分 | — |
| **P0** | 泛化动作标识（§3-1）+ 绑骨链路字段（§3-2），改 `manifest.ts` + sidecar round-trip | `manifest.ts` | typecheck + 既有混元 9–16 仍 round-trip | §8-Q2 定 A/B |
| **P1** | `autoRig`/`applyMotion` 按 provider 分派（§4.2），rig_task_id 落库 | `tool-handlers.ts` | 注入 smoke 全链；混元分支不回归 | — |
| **P1** | rig_task_id 过期处理（§6.3） | `tool-handlers.ts` | 模拟 404/过期 → 自动 re-rig 重试 | §8-Q3 |
| **P2** | 动作库拉取 + 缓存 + 公测精选集（§8-Q1） | catalog 模块 + schema | 一次真机 `GET resources`，无积分 | §8-Q1 |
| **P2** | `apply-motion` schema/UI：action_id + rigType 过滤 + 免费/付费徽标 + 预览 GIF | `schemas/apply-motion.*` + UI | 视觉 | §8-Q1 |
| **P3** | 错误/积分护栏（§6）、`exposedToAI` 翻 true、`forgeax-plugin.json` 文案改 Meshy | plugin.json | **一次真机全链**（已预跑，见 §7） | operator 拍板 |

> 与既有 mock-first 一致：无 `GEN3D_ENABLE_REAL_PROVIDERS=1` + key 时全部回退 mock，零积分零网络。

---

## §6 错误 / 积分 / 重试

1. **HTTP 语义**（探测确认）：400 缺参 / 401 鉴权 / **402 积分不足** / 404 未开通功能 / 429 限流。
   映射到现有 `provider_*` code 体系（`meshy.ts:210-212`）。
2. **积分护栏**：付费调用（rig 5 / anim 3）前可选 `GET /balance` 预检 + 复用 `RateGuard`；UI 显示余额。
3. **rig_task_id 过期（~3 天）**：`/animations` 若因 rig 任务失效报错 → 用 manifest 里存的 `source_mesh` GLB
   **自动 re-rig**（再扣 5 分）拿新 `rig_task_id` 再重试动画。**注意**：本地存了 rigged FBX 也没用——Meshy 动画
   只认它自己的 `rig_task_id`，不接受外部 FBX。这点必须在 §8-Q3 拍板（自动 re-rig vs 报错让用户点）。
4. **rigType 不匹配**：选了与 rig 不兼容的 `action_id` → 预期报错；P2 用 `/animations/{rig_task_id}/actions`
   只列兼容动作来规避。

---

## §7 Live verification evidence（2026-06-21，真机真账号，已跑通）

> 全链已用真 key 跑通一遍（**共消耗 8 积分**：rig 5 + anim 3；另生成阶段 15 分），并在**本插件真实
> `ModelViewer`（`src/components/ModelViewer.tsx`，three.js + `AnimationMixer`）里真机播放确认**挥手 + 走路动画。

| 步骤 | 任务 id / 入参 | 结果 | 耗时 | 积分 |
|---|---|---|---|---|
| 源网格（text-to-3d, meshy-5 preview+refine） | `019ee8f3-28e9-7204-b013-fb7fba63eae6` | 带贴图 T-pose 人形机器人 | — | 5+10 |
| **绑骨** `/openapi/v1/rigging`（`input_task_id`） | rig task `019ee8f9-1c43-72ef-b148-c43b0e9258a4` | rigged glb(6.89MB)+fbx + **免费 walk/run**；24 关节人形骨架；`SUCCEEDED` | ~23.1s | **5** |
| **动画** `/openapi/v1/animations`（`rig_task_id`+`action_id=28`） | anim task `019ee8f9-c01d-71f4-928c-aee0a8026c09` | `Animation_Big_Wave_Hello_withSkin.glb`(6.96MB)+fbx；`SUCCEEDED` | ~11.9s | **3** |
| 余额 | 694 → 686 | 差 8 = 5(rig)+3(anim)；免费 walk/run 不额外扣 | — | — |

- `expires_at` 均 = 创建 +3 天（retention 实证）；签名 URL 同步过期。
- 三个 GLB 经结构校验（skins/joints/animation channels 齐全）+ 真机 ModelViewer 播放（骨骼自动识别、AnimationMixer
  自动播）通过。
- 复现脚本/产物在 `/tmp/meshy_verify/`（`rigchain.log` / `rig_resp.json` / `anim_resp.json` / `*.glb`，**非仓库内、临时**）。

---

## §8 开放决策（请 reviewing agent 重点拍板）

| # | 问题 | 选项 | 默认建议 |
|---|---|---|---|
| **Q1** | **公测动作范围**：暴露多少动作? | (a) 全 680；(b) 精选 ~20–40（按 category）；(c) 仅免费 walk/run + 极少付费 | **(b)**：公测精选集，控成本 + 控质量；schema 只暴露精选 |
| **Q2** | **动作标识泛化**：§3-1 的 A（判别联合）还是 B（字符串 key）? | A / B | **A**：类型更稳、利于下游/引擎 |
| **Q3** | **rig_task_id 过期**：动画时 rig 失效怎么办? | (a) 自动 re-rig 重试（再扣 5 分）；(b) 报错让用户确认 | **(a) 但需用户可见提示**（避免静默扣分） |
| **Q4** | **混元 rig/anim 去留**：公测里 | (a) 完全下线；(b) 留作内网/dev gated 备选 | **(b)**：env 在才走，零额外风险 |
| **Q5** | **绑骨入参**：优先 `input_task_id` 还是公网 `model_url`? | 视源是否 Meshy 生成 | 源是 Meshy 且未过期→`input_task_id`，否则 COS 公网 URL |
| **Q6** | 免费 walk/run 是否默认落库为 `animated_model`? | 是 / 否（按需） | **是**（白嫖，丰富 readiness） |
| **Q7** | 与 B 线（混元 `motion_retarget_v2` 48 动作，blocked on @raineejiang）关系 | Meshy 是否事实上取代它? | 公测用 Meshy；混元 v2 作内网增强，长期再议 |

---

## §9 验证 plan（成功判据）

- **P0/P1 单测**：注入 `fetchImpl/downloadImpl` 跑 rig→animate 全链，断言「恰好 N 次 submit / 正确 path /
  Bearer / result 字段提取 / 下载字节 / append 后 readiness 翻转 / 混元 9–16 不回归」——**零积分零网络**。
- **P2**：一次真机 `GET …/resources`（0 积分）核对动作库字段；schema/UI 视觉。
- **P3**：一次真机全链（已预跑，§7）；核对 `consumed_credits` 与余额；错误注入（402/过期）走通护栏；
  最后翻 `exposedToAI`。
- **回归**：`bun run typecheck && bun run build` 通过；改 `src/**` 后**必须 rebuild dist**（见 HANDOFF「铁律」）。
