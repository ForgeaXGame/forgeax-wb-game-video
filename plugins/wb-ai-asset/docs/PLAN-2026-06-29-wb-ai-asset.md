# PLAN — wb-ai-asset（Meshy AI 小物件低模资产生成插件）

> 状态：🟢 SPEC（主体已落地）· 2026-06-29（grill-with-docs 核验后修订）· 作者：laurenceelu  
> ⚠️ **2026-07-13 读前须知**：落盘路径已改为隔离的 `assets/3d/props/...`（非本文早期写的与 gen3d 共用 `meshes/`）；默认管线是 precise-lowpoly。生成时已会 cook 引擎 `*.glb.meta.json`。  
> **进行中方案**（Import UI / 与 gen3d 对齐）：见 [`../wb-gen3d/docs/PLAN-2026-07-13-import-to-engine.md`](../wb-gen3d/docs/PLAN-2026-07-13-import-to-engine.md) + 本插件 [`../HANDOFF.md`](../HANDOFF.md)。  
> 分支（历史）：`laurenceelu/feat-20260629-wb-ai-asset`  
> 蓝本：`wb-gen3d`（六模块自包含 workbench 插件范式）
>
> **方案 B 知情重申**：文档核验确认 wb-gen3d 的 `meshy.ts`（484 行）已含成熟
> submit→poll→download + `getBalance()` + RateGuard + 错误映射 + text/image/multi/refine
> 端点；本插件真正新增的只有 ~3 个 delta（`model_type:lowpoly` 标志 + remesh 方法 +
> retexture 方法）。在知道"方案 B = 重抄 484 行 + 全套基建"的真实成本后，仍选独立插件
> （独立迭代 / 不污染 wb-gen3d）。落地纪律：复制 `meshy.ts` 后**裁剪到只剩 lowpoly/
> remesh/retexture 相关**，保持单文件干净；共享包（方案 C）的门以后随时可开。

## 1. 目标

基于 Meshy API 的 AI 生成小物件 3D 低模资产插件。工作流：

```
输入(text / image / multi-image)
  → lowpoly 生成(model_type: lowpoly)
  → refine 加 PBR 纹理(可选)
  → remesh 降面到 target polycount(可选,game-ready)
  → 导出 glb → 落 .forgeax/games/<slug>/assets/3d/meshes/<assetId>/
进阶：retexture 给已有资产换风格 PBR 纹理
```

> **路径修正（grill）**：原 plan 写 `assets/3d/props/` 是凭空发明的，全仓零匹配。
> 真实约定（wb-gen3d `per-game-store.ts:5`）只有 `assets/3d/{characters|meshes}/`
> 两个 slot。小物件资产归 **`meshes`** slot，与 wb-gen3d 共用、被引擎/资产路由认得。

## 2. 定位（区别于已有 lowpoly 资产）

| 插件 | 范式 | 调 AI? | 区别 |
|---|---|---|---|
| `wb-3d-lowpoly` | 程序化 CAD（OCCT/replicad 节点图） | ❌ | 机械/建筑/齿轮/装配，不调 AI |
| `wb-gen3d` | 通用 3D 生成（多 provider） | ✅ 有 Meshy，但没用 lowpoly model_type | 通用，非低模专属 |
| `wb-lowpoly-obj` | lowpoly 角色编辑器（退役） | ❌ | 让位给 wb-3d-lowpoly |
| **`wb-ai-asset`** | **Meshy AI 生成 lowpoly** | ✅ | 聚焦小物件资产，`aiasset:` 前缀 |

**命名隔离**：避开 `lowpoly` 前缀（wb-3d-lowpoly/wb-lowpoly-obj 占用）+ `gen3d` 前缀（wb-gen3d 占用），用 `aiasset:`。matchProduces 用 `assets/3d/meshes/**/*.glb`（现有非角色 slot，与 wb-gen3d 共用）。

## 3. 能力 scope

**6 个核心 Meshy 能力**：
- `aiasset:text-to-3d` — Meshy text-to-3d，`model_type: lowpoly`，`mode: preview`
- `aiasset:image-to-3d` — 单图，`model_type: lowpoly`，需 COS 中转
- `aiasset:multi-image-to-3d` — 多视角，`model_type: lowpoly`，需 COS 中转多图
- `aiasset:refine` — Meshy text-to-3d `mode: refine`，给 preview 加 PBR 纹理
- `aiasset:retexture` — Meshy retexture，给任意已有模型换风格 PBR 纹理
- `aiasset:remesh` — Meshy remesh，对已有任务结果重拓扑降面到 target polycount

**辅助**：`provider-status` / `upload-image` / `list-assets` / `get-credentials` / `set-credentials`

## 4. 架构（照 wb-gen3d 六模块）

- `kind: workbench`，`embeddedAlso: true`，`port: 15190`，`surface: split`
- tool 前缀：`aiasset:`
- matchProduces：`**/.forgeax/games/*/assets/3d/meshes/**/*.glb`
- 后端：导出 `tools` handler 映射，跑在 forgeax-server 进程内（非独立 HTTP server），前端走 `POST /api/tools/call`
- 异步：**轮询**（submit→poll→download，`pollInterval 5s`，`pollTimeout 600s`）
- 双重门控：`AIASSET_ENABLE_REAL_PROVIDERS=1` + `MESHY_API_KEY` 才走真 API，否则确定性 mock（quota-safe）
- COS 中转：本地图 → presigned URL → Meshy URL fetch；未配置抛 `cos_not_configured`
- per-game 存储：`.forgeax/games/<slug>/assets/3d/meshes/<assetId>/`（.glb + PBR 纹理 + manifest.json）

### Meshy 端点（文档 + wb-gen3d 源码核验，batch 1 直接用）

| 端点 | 路径 | 来源核验 |
|---|---|---|
| text-to-3d（preview/refine） | `/openapi/v2/text-to-3d` | wb-gen3d `meshy.ts:23` |
| image-to-3d | `/openapi/v1/image-to-3d` | `meshy.ts:24` |
| multi-image-to-3d | `/openapi/v1/multi-image-to-3d` | `meshy.ts:25` |
| **remesh**（新增） | `/openapi/v1/remesh` | docs：`input_task_id`\|`model_url` + `topology`/`target_polycount`/`decimation_mode` |
| **retexture**（新增） | `/openapi/v1/retexture` | docs：`input_task_id`\|`model_url` + `text_style_prompt`\|`image_style_url` + `enable_original_uv` |
| balance | `/openapi/v1/balance` | `meshy.ts:31` `getBalance()` |

- **lowpoly 参数统一**：text/image/multi 三端点均用 `model_type: lowpoly`（文档核验一致）。lowpoly 时 `ai_model`/`topology`/`target_polycount`/`should_remesh` 被忽略。
- **refine 已存在于 wb-gen3d**：`MeshyMode` 已含 `'refine'`，复制时直接带过来收窄。
- **task 状态**：UPPER-CASE `PENDING`/`IN_PROGRESS`/`SUCCEEDED`/`FAILED`/`CANCELED`；`consumed_credits` 失败退 0。
- **HTTP 错误映射**：402→`provider_insufficient_credits`，404→能力未开，429→限流（`meshy.ts:422-428`）。

## 5. 关键实现点

1. **lowpoly 生成 + remesh 是两步** —— Meshy `lowpoly` 模式忽略 `should_remesh`/`target_polycount`/`topology`，所以"低模 + 降面到具体 polycount"必须先生成（lowpoly）再调 remesh。UI/工作流要体现。
2. **PBR 纹理** —— refine/retexture 返回 `texture_urls` 数组（`base_color`/`metallic`/`roughness`/`normal`），全下载 + 落盘 + manifest 记录，引擎可直接吃。
3. **glb 优先** —— 输出格式默认 `glb`（game-ready），fbx/obj 可选。
4. **余额护栏** —— submit 前查 credits + rate guard（滑动窗口限流），失败退款提示。
5. **插件自包含** —— 禁止 `import` server 内部 lib（新架构约束，PLAN-2026-06-25-migrate-to-forgeax-core §A）；工具经 forgeax-cli host-tools → forgeax-core sidecar → server adapter → plugin tool-handlers。
6. **方案 B 固有代价** —— `server/providers/meshy.ts` 会与 wb-gen3d 的 Meshy provider 逻辑重叠（submit→poll→download 框架相同，收窄到 lowpoly+retexture+remesh）。接受重复，不提前抽象。

## 6. 目录骨架

```
wb-ai-asset/
├── forgeax-plugin.json     # manifest SSOT
├── package.json / vite.config.ts / tsconfig.json / index.html
├── .env.example            # MESHY_API_KEY + AIASSET_ENABLE_REAL_PROVIDERS + COS_*
├── src/                    # React 19 + Vite
│   ├── main.tsx            # pane 检测(left/center/standalone)
│   ├── App.tsx / ui-meta.ts / types.ts / styles/
│   ├── components/         # SetupSidebar / Workspace / StepCard / ModelViewer / AssetLibrary
│   └── lib/                # toolClient / gameSlug / blobUrl / exportBundle
├── server/                 # 后端 = tool handlers(跑在 forgeax-server 进程内)
│   ├── tool-handlers.ts    # export tools map
│   ├── providers/meshy.ts  # submit→poll→download,收窄 lowpoly + retexture + remesh
│   ├── env.ts              # loadPluginEnvOnce + getMeshyEnv + getCosEnv
│   ├── cos-uploader.ts / per-game-store.ts / cache.ts / rate-guard.ts / credentials-store.ts
│   └── *.test.ts
├── shared/                 # 前后端共享:manifest.ts / catalog.ts / provider-params.ts
├── schemas/                # 每个 tool 的 args/returns JSON Schema
├── public/ / docs/ / dist/
```

## 7. 测试计划

stub-fetch 集成测（照 wb-gen3d）：
- `server/providers/meshy.test.ts` — submit→poll→download（stub fetch/sleep）
- `server/tool-handlers.test.ts` — handler 集成
- `server/tool-handlers.balance.test.ts` — 余额护栏
- `server/cos-uploader.test.ts` / `per-game-store.test.ts` / `credentials-store.test.ts`
- `shared/provider-params.test.ts` / `src/lib/exportBundle.test.ts`
- `bun test`，fetch/sleep 注入

## 8. 实现批次

- **批次 0**：骨架顶层（manifest + package.json + vite/tsconfig + .env.example + index.html + PLAN）← 当前
- **批次 1**：后端核心（env.ts + providers/meshy.ts + tool-handlers.ts + schemas）+ 一个 tool 端到端（text-to-3d lowpoly）
- **批次 2**：其余 5 个能力 tool（image/multi-image/refine/retexture/remesh）+ COS + per-game-store + cache + rate-guard
- **批次 3**：前端（main.tsx + App + SetupSidebar + Workspace + ModelViewer + AssetLibrary）
- **批次 4**：测试 + build + typecheck gate
- **批次 5**：credentials-store + set-credentials UI + export-bundle

每批次结束跑 `bun test` + `tsc --noEmit` gate。

## 9. 待确认 / 风险

### 已解决（grill-with-docs 核验）
- ✅ multi-image endpoint = `/openapi/v1/multi-image-to-3d`（wb-gen3d `meshy.ts:25`）
- ✅ retexture 输入 = `input_task_id` 或 `model_url`（可指公网 .glb，如 COS 上传后的 URL）+ style 用 `text_style_prompt` 或 `image_style_url`
- ✅ 余额 API = `/openapi/v1/balance`（wb-gen3d 已有 `getBalance()`，复制即用）

### 仍未坐实（批次 2 真机验证，不可假设）
- ⚠️ **lowpoly 任务能否被 remesh**：remesh 文档要求 `input_task_id` "must refer to a successful task from a supported model"，未明说 lowpoly 输出可作 remesh 输入。批次 2 真机验证前，remesh 对 lowpoly 源默认 mock。
- ⚠️ **lowpoly + remesh 是否冗余**：lowpoly 本身已是干净低面；remesh 仅为命中"具体 polycount 预算"。用户确认保留（全 scope），但若真机发现冲突/冗余，回头收窄。

### grill 标记的设计假设（已被用户确认，但记录在案）
- lowpoly 作为核心 primitive vs `standard + remesh` 降面 —— 哪条对小物件 game-ready 更好是经验问题，当前押 lowpoly，批次 4 真机出样后复盘。
- 骨架不可加载：manifest 引用的 `./schemas/*.json` 未落盘前插件无法被 registry 加载；批次 1/2 schema 落盘后才是可加载插件（影响"commit 骨架当 checkpoint"的语义 —— 那只是源码 checkpoint，非可运行插件）。
