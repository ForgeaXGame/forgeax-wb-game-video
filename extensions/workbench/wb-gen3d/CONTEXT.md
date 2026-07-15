# CONTEXT — wb-gen3d 术语与领域共识

> 本文件是插件级"语言总账"。术语解释、概念边界、命名约定收敛在这里。
> 实现细节看 `docs/MIGRATION_PLAN.md`；难以反转的设计决策看 `docs/adr/`。

## 模块边界

### wb-gen3d

3D 资产**生成**入口。职责：从 prompt / image / multi-view 输入产出原始 3D mesh。
包含 `pose_standardization`（图片→标准化姿态图）作为生成的上游预处理。

Providers：`hunyuan_workflow` / `meshy`（经 LiteLLM 3D 网关）；`rodin` 暂未接入网关（代码保留,`getRodinEnv` 恒 null）。
`pose_standardization` 使用 Hunyuan REST，但归属 gen3d 因为它是图片→图片的预处理，服务于 views 生成。

输出：`Gen3DAssetManifest`（含 `source_mesh` + `preview_image`）。

**M13 扩展（2026-06-12，ADR-0003；grill 修订后）**：核心产线 = **带贴图高模 GLB →
`auto_rigging` → `motion_retarget` v1**（全程混元 REST）。rig/motion 都同时输出 **GLB+FBX**，
**GLB 作 canonical 主体**（自包含含贴图、引擎原生）以同基名追加到网格资产、翻动 readiness，
**FBX 仅作 rig→motion 中转输入**。`low_poly` **降级为可选几何/LOD 旁路**（纯几何、不保贴图，
不置于绑骨前）。不另起独立 workbench。详见 `docs/PLAN-2026-06-12-rig-motion-lowpoly.md`。

### wb-3d-pipeline

3D 资产**后处理流水线**（未来独立 workbench，M13 不阻塞其存在）。职责：把 gen3d
产出的原始 mesh 加工成游戏可用资产；可覆盖拓扑优化 → 绑骨 → 动画的更深层编排。

Providers：Hunyuan REST（`auto_rigging` / `motion_retarget` / `low_poly`）/ 未来 Mixamo 等。

输入：`Gen3DAssetManifest`（含 `source_mesh`）。
输出：更新后的 manifest（追加 `rigged_model` / `animation_clip` / `animated_model`）。

建设时机：M13 在 wb-gen3d 内先跑通首版产线；独立 wb-3d-pipeline workbench 待 manifest
append 契约稳定后再拆（若仍需要）。

## 术语表

### Asset

一个持久的、game 可用的 3D 产物。M9 起 canonical identity 是 game 内相对路径
（例如 `assets/3d/characters/hero.glb`），不再是随机 UUID 或 provider URL。
下游模块通过 manifest + sidecar 消费 Asset，不通过 provider URL。

### Asset Path

Asset 的稳定身份字段，值是 game 内相对路径，例如 `assets/3d/characters/hero.glb`。
_Avoid_: 对新 manifest 继续使用 `assetId` 表示路径。

一次生成的**多个文件共享同一基名**：`hero.glb` 是身份主文件，`hero.png`（预览）、
`hero.texture.png`（外部单独贴图）是同基名副文件。

**两套 sidecar，勿混用（2026-07-07 / 2026-07-13）：**

| 文件 | 谁读 | 内容 |
|---|---|---|
| **`hero.glb.gen3d-meta.json`** | wb-gen3d 台账 | producer / contentHash / dependencies / custom（插件私有） |
| **`hero.glb.meta.json`** | 引擎 pack scanner | 仅干净 `external-asset-package`（`kind`/`importer`/`subAssets`） |

gen3d **生成时只写** `.glb.gen3d-meta.json`（避免私有字段撞引擎 `additionalProperties:false`）。  
引擎证需用户「导入到游戏 / 导出可玩角色」再办——已落地，见
`docs/PLAN-2026-07-13-import-to-engine.md`（🟢 DONE · 2026-07-14 合 main）。  
Edit 资产面板按 **subAsset** 列（如 mesh 内部名 `char1`），不是一张 `*-merged` 包卡；可玩预览 URL 用引擎 `/preview/...`。  
身份只认主 `hero.glb`。OBJ 默认丢弃。删除即删 `hero.*` 全家桶 + 两套 sidecar（可玩交付物默认保留，见 LIFE1）。

### Asset Name

用户可读的资产文件名基底，用来形成 game 内相对路径。普通生成不会自动覆盖同名
Asset；命中同一请求时复用已有路径，需要新版本时走显式的变体生成。

### Asset Slot

Asset 在 game 里的 3D 资产槽位，值直接对应目录：`characters` 表示角色资产，
`meshes` 表示通用 3D 模型。_Avoid_: `assetType=prop`。

M13 绑骨/动作（`gen3d:auto-rig` / `gen3d:apply-motion`）**仅对 `characters` 槽暴露**——混元
rig/motion 仅支持双足人形角色；`meshes`（道具/通用模型）不显示绑骨/动作入口。

### Transfer URL

临时传输地址，只用于让外部 provider 读取输入图、输入模型或中间文件。
Transfer URL 不是 Asset 身份，也不是下游模块应该保存的引用；provider 返回的产物
必须下载回 per-game 资产文件后才算进入 ForgeaX 资产契约。

**临时/中转产物（非 Asset）**：`gen3d:upload-image` 上传的输入图、
`gen3d:pose-standardization` 标准化后的中间图都是**中转产物**，不是 Asset——
不落 `assets/3d/`、不进 `list-assets`、UI 不显示为资产、无删除 UI。它们落 scratch
区（`.forgeax/games/<slug>/.gen3d/tmp/`）或 COS（拿 Transfer URL 给下一步用），
生命周期=中转。判定准则：**最终游戏可用的 mesh 才是 Asset；喂给生成的输入图不是。**

### Canonical 落库格式 = GLB（rig/motion 产物，M13）

混元 `auto_rigging` / `motion_retarget` 都同时输出 GLB + FBX，且输出自包含（内嵌贴图）。
落库主体取 **GLB**（自包含、引擎原生 glTF、可直接预览/进引擎）；**FBX 仅作 `motion_retarget`
的输入中转**（motion 强制要 `fbx_url`），故 rigged 资产须留一份 FBX 供后续加动作。
_Avoid_: 把 FBX 当 rig/anim 资产的主体或预览格式。

### 自包含产物（self-contained）

把贴图/材质内嵌进单文件的 3D 产物（GLB 恒内嵌；混元输出的 FBX 也内嵌——其输出 schema 无独立
贴图 url 即为证）。与之相对的"外链贴图"（OBJ + 独立 mtl/png；FBX 按原文件名引用外部贴图）只出现在
**OBJ 输入**路径——本产线走 GLB，不触发外链贴图的命名/搬运问题。

### 贴图存活（texture survival）

硬约束（2026-06-12）：最终动画产物必须保留原模型材质/贴图。保证手段 = 走 GLB 内嵌链路（带贴图
高模直绑），**不在绑骨前减面**（`low_poly` 纯几何、不保贴图、quad 换 UV）。"减面低模 + 带贴图"需
retopo 后重烘焙贴图（混元不提供，超范围），列为后续。

### 导入到游戏（Import to Game）

为一个资产建立或更新引擎可识别的身份，使它进入 Edit 的资产目录并可被引用。
导入到游戏**不等于**把资产放进场景，也不等于修改游戏玩法代码。
_Avoid_: 把产品按钮继续叫「导入引擎」（那是旧文案）。

### 可玩角色交付物（Playable Character Delivery）

一个自包含的蒙皮角色模型，带一套共享骨架和一组由动作档案定义的语义动作。
它是从 gen3d 工作资产交付到游戏资产目录的独立产物；
更新动作时仍视为同一个角色交付物。它的身份来自唯一的 gen3d 源资产；
显示名变化不改变身份，另一个源资产不能冒充并覆盖它。交付后它可以独立于工作资产存活；
删除源工作资产不表示应破坏游戏中可能仍被引用的交付物。
产物通常是三件套：merged GLB、引擎 `*.meta.json`、可玩接线清单。

### 动作预设（Motion Preset）

系统内置的起点模板。v1 四个：基础角色、动作冒险、平台跳跃、空白自定义。
预设本身不属于某个游戏；用户可基于它保存成游戏默认动作档案。

### 游戏默认动作档案（Game Motion Profile）

当前游戏共用的默认动作槽契约（含稳定槽 ID、是否必需、播放模式、速度、匹配关键词、root motion 策略）。
每个游戏一份，存在该游戏的 `.gen3d/` 私有目录。
_Avoid_: 说「模板只属于角色、不属于游戏」。

### 角色动作覆盖（Character Motion Override）

某个角色相对游戏默认动作档案的差异。默认编辑只影响当前角色；
只有明确「保存为游戏默认」才会改游戏档案。

### 动作映射（Motion Mapping）

把当前角色已有的生成动作指定到各个语义槽。系统可以提出推荐，用户确认后保存。
同一源动作可以填多个槽（会警告）；导出时复制成多条独立 clip。
它是角色工作资产的持久配置。档案的必需槽不完整时，不构成可玩角色交付物。
_Avoid_: 「同一动作绝对不能占两个槽」。

### 可玩接线清单（Playable Wiring Manifest）

可玩角色交付物旁的 `*.playable.json`。记录槽 ID → clip GUID、循环/速度、root motion 策略等。
它是给游戏 Agent 或人工接线的说明书，不是引擎身份证，也不会自动修改游戏代码。

### Root Motion

动画 clip 自带的角色平移。导出可玩角色时，按每个动作槽的策略在合并阶段处理
（保留 / 去掉水平位移 / 去掉全部位移）。接线清单也会记录该策略，供后续游戏接线对照。
_Avoid_: 「插件永远不改 root motion，一律留给运行时」。

## 产品定位

wb-gen3d 是**生产工具**，不是 benchmark/对比工具。
目标：用户选 provider + mode + 输入 → 产出持久的游戏可用 3D 资产。
不做：provider 横向对比报告、质量评分排行、对比集聚合。
Lab 里的 benchmark 结论（哪个 provider 擅长什么）作为选型背景知识保留在文档里，不进运行时代码或 UI。

### Provider

3D 生成 API 后端。由 `(providerId, baseUrl, apiKey)` 唯一确定。
当前：`hunyuan_workflow` / `meshy`（经 LiteLLM 3D 网关）；`rodin` 暂未接入网关（代码保留,gen3d 内）；`hunyuan_rest`（跨 gen3d 和 3d-pipeline）。

### Mode

同一 Provider 下按输入形态划分的生成模式。
gen3d 通用 mode：`text` / `image` / `views`。
Meshy 专属：`refine`（基于 preview 加贴图的第二阶段，等 Meshy 实装时加）。

### Tool 表面

按输入形态分 tool，provider 是参数（不是按 provider 分 tool）。

| tool id | 用途 |
|---|---|
| `gen3d:text-to-3d` | prompt → mesh |
| `gen3d:image-to-3d` | 单图 → mesh |
| `gen3d:views-to-3d` | 多视图 → mesh |
| `gen3d:standardize-pose` | 图片 → 标准化姿态图（views 预处理） |
| `gen3d:provider-status` | 读取 provider 能力矩阵 |
| `gen3d:list-assets` | 列出已生成的资产 |

M13 新增（**代码完成 mock-first，2026-06-13；Gate 0/1 真机验证通过；`exposedToAI:false`，待 operator 目视后翻 true**）：
`gen3d:retopo-lowpoly`（减面，可选旁路，产出新衍生低模资产）、`gen3d:auto-rig`（绑骨，
追加 rigged_model GLB+FBX，仅 characters）、`gen3d:apply-motion`（动作，motion v1 int 9–16，
追加 animated_model GLB+FBX，按 motionType 幂等）。

2026-06-14 新增：`gen3d:score-quality`（五维质量评分，objective/manual/ai 三种 source merge-only 更新）。

未来加 provider 只需在已有 tool 的 provider enum 加值，不需新建 tool。
`gen3d:refine-mesh`（Meshy 专属）等 Meshy 实装时再加。

### Gen3DAssetManifest

一次生成产出的持久化记录。M9 起它描述某个 game 内路径资产及其来源
provider/mode/job 信息、文件角色和状态标志。新 manifest 用 `assetPath` 作身份字段。
它是 wb-gen3d 与 wb-3d-pipeline 之间的传递契约。

### File（manifest 内）

Asset 的一个文件角色，例如主 mesh、预览图、贴图、绑骨模型或动画片段。
文件可被 Studio 用本地预览 URL 展示；外部 provider 需要访问时必须使用临时传输 URL。

### QualityReport（质量评分报告）

某资产的五维质量评分报告：`geometry / topology / texture / pbr / prompt_fidelity`，每维记
`value` + `source`（`auto` 客观启发式 / `ai` 视觉评 / `manual` 人工覆盖），并带
`total / method / rater / notes / scoredAt`。评分**按需**产生（选中资产时），**不在生成时触发**。
它是 `QualityScore`（纯数值、跨插件兼容字段）的富结构来源。详见 ADR-0004。
_Avoid_: 把 `QualityScore` 当评分主体（它只是 QualityReport 派生出的数值快照）；说「评分」指 QualityReport。

### 资产存储模型

Per-game runtime asset library。生成时必须归属一个 game；资产直接落在该 game 的
运行时资产目录里，路径本身就是稳定引用。

```
.forgeax/games/<slug>/assets/3d/
  characters/<name>.glb
  characters/<name>.glb.gen3d-meta.json   # 插件台账（必有）
  characters/<name>.glb.meta.json        # 引擎证（导入后才有；可与台账并存）
  meshes/<name>.glb
  meshes/<name>.glb.gen3d-meta.json
  meshes/<name>.glb.meta.json            # 同上

# 角色可玩合并产物（已落地 P1；不在 3d/ 源目录）
.forgeax/games/<slug>/assets/characters/
  <name>-merged.glb
  <name>-merged.glb.meta.json
  <name>-merged.glb.playable.json

# 游戏默认动作档案（已落地；插件私有，不进引擎 scanner）
.forgeax/games/<slug>/.gen3d/playable-character-profile.json
```

不再维护 gen3d 专属的全局 staging 资产库作为主模型。跨 game 复用需要显式复制
或导入，而不是共享同一个全局 assetId。  
姊妹插件 wb-ai-asset 落在 `assets/3d/props/{meshes|characters}/`，台账为
`*.glb.wb.json`，生成时通常已写引擎 `*.glb.meta.json`。

### ProviderResult

Provider 适配器的统一输出类型。包含 provider 返回的 URL 列表 + 元数据。
Provider 不知道 cache 和 asset-store 的存在；ProviderResult 是纯数据，由 tool-handler 层编排持久化。

### ProviderParamSpec（Provider 高级参数声明）

声明式参数规格表（`shared/provider-params.ts`）。每个 provider 暴露的高级参数在这里定义
`{ key, label, type, default, options?, min?, max?, tooltip }`。**verified 语义**：仅
官方文档存在且已验证行为的参数才列入 spec——deprecated、待验证、或会破坏持久化的字段不暴露。
`filterProviderParams(spec, rawInput)` 用 spec 做白名单过滤 + 类型强转 + 范围 clamp，
返回干净的 `Record<string, any>` 供 provider 层直接注入请求体。

当前暴露：Meshy 4 字段（topology_mode / target_polycount / should_remesh / enable_pbr）、
Rodin 3 字段（material / quality / tier）、Hunyuan 0 字段。后续加参数只需追加 spec 条目。

### Cache

请求级去重。key = `(providerId, mode, assetSlot, normalized_payload)` 的 hash。
只存成功结果的 `hash → game 内相对路径` 映射，不存 provider 响应或 URL。
命中后直接从 asset-store 读取 manifest 返回。

`assetSlot` 是 cacheKey 的一部分（`characters` 与 `meshes` 各自独立缓存，不串味）。
`assetName` **不进** cacheKey——它只是贴在结果上的标签，不是身份。命中缓存时复用
已有路径并**忽略本次新填的 `assetName`**（旧资产已有名字），UI 须明确提示"复用了
已有资产（缓存命中）"，避免用户误以为新名字已生效。

普通生成命中 Cache 时复用已有 Asset；“同输入再抽一版”是显式变体生成，不是默认行为。

设计原则：cache 不依赖 provider 响应格式（源 lab ADR-0002 精神的极致化）。
写入时机：provider 调用 + blob 下载 + manifest 写入全部成功后，cache 才追加一条映射。

**删除与 tombstone**：sidecar 的 `custom` 存一份 `cacheKey`，`gen3d:delete-asset` 删
文件时按它往 cache.jsonl 追加一条 tombstone（`{cacheKey, deleted:true}`）；`lookup`
遇 tombstone 视为未命中。这样用户故意删掉的资产**不会因 cache 命中而复活/重烧配额**。
(注：即使没打墓碑，现有 `generateCacheFirst` 在命中却读不到文件时也会穿透重生成、
不崩——但那会"删了又回来 + 白烧配额"，故 tombstone 是 UX/配额防护。)

## 命名与边界

| 易混淆 | 正确说法 |
|---|---|
| "生成" vs "后处理" | gen3d = 从无到有产出 mesh；3d-pipeline = mesh → game-ready |
| `pose_standardization` 归属 | 归 gen3d（图片预处理），不归 3d-pipeline |
| Hunyuan REST 归属 | 跨两个模块：pose_standardization 归 gen3d，其余归 3d-pipeline |
| `refine` | 仅 Meshy 专属的第二阶段，不泛化到其他 provider |
| `assetType=prop` | 说 `assetSlot=meshes`；UI 可显示“道具 / 物件” |
| 新资产身份字段 | 说 `assetPath`，不要把路径继续叫 `assetId` |
| provider URL / presigned URL | 说 `Transfer URL`；它只是临时传输手段 |
