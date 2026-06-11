# CONTEXT — wb-gen3d 术语与领域共识

> 本文件是插件级"语言总账"。术语解释、概念边界、命名约定收敛在这里。
> 实现细节看 `docs/MIGRATION_PLAN.md`；难以反转的设计决策看 `docs/adr/`。

## 模块边界

### wb-gen3d

3D 资产**生成**入口。职责：从 prompt / image / multi-view 输入产出原始 3D mesh。
包含 `pose_standardization`（图片→标准化姿态图）作为生成的上游预处理。

Providers：`hunyuan_workflow` / `meshy` / `rodin`（待 key）。
`pose_standardization` 使用 Hunyuan REST，但归属 gen3d 因为它是图片→图片的预处理，服务于 views 生成。

输出：`Gen3DAssetManifest`（含 `source_mesh` + `preview_image`）。

### wb-3d-pipeline

3D 资产**后处理流水线**。职责：把 gen3d 产出的原始 mesh 加工成游戏可用资产。
覆盖三个阶段：拓扑优化 → 绑骨 → 动画。

Providers：Hunyuan REST（`auto_rigging` / `motion_retarget` / `low_poly`）/ 未来 Mixamo 等。

输入：`Gen3DAssetManifest`（含 `source_mesh`）。
输出：更新后的 manifest（追加 `rigged_model` / `animation_clip` / `animated_model`）。

建设时机：等 `wb-gen3d` 的 manifest 契约稳定后。

## 术语表

### Asset

一个持久的、game 可用的 3D 产物。M9 起 canonical identity 是 game 内相对路径
（例如 `assets/3d/characters/hero.glb`），不再是随机 UUID 或 provider URL。
下游模块通过 manifest + sidecar 消费 Asset，不通过 provider URL。

### Asset Path

Asset 的稳定身份字段，值是 game 内相对路径，例如 `assets/3d/characters/hero.glb`。
_Avoid_: 对新 manifest 继续使用 `assetId` 表示路径。

一次生成的**多个文件共享同一基名**：`hero.glb` 是身份主文件，`hero.png`（预览）、
`hero.texture.png`（外部单独贴图）是同基名副文件。sidecar 文件名是
**`hero.glb.meta.json`**（保留完整文件名再加 `.meta.json`），字段对齐 v2 工作区契约
schema（`schemaVersion/producer{}/createdAt/contentHash/size/type/dependencies[]/custom{}`），
副文件进 `dependencies[]`、gen3d 私有字段进 `custom{}`，身份只认主 `hero.glb`。
OBJ 默认丢弃，只留 GLB。删除即删 `hero.*` 全家桶 + sidecar。

### Asset Name

用户可读的资产文件名基底，用来形成 game 内相对路径。普通生成不会自动覆盖同名
Asset；命中同一请求时复用已有路径，需要新版本时走显式的变体生成。

### Asset Slot

Asset 在 game 里的 3D 资产槽位，值直接对应目录：`characters` 表示角色资产，
`meshes` 表示通用 3D 模型。_Avoid_: `assetType=prop`。

### Transfer URL

临时传输地址，只用于让外部 provider 读取输入图、输入模型或中间文件。
Transfer URL 不是 Asset 身份，也不是下游模块应该保存的引用；provider 返回的产物
必须下载回 per-game 资产文件后才算进入 ForgeaX 资产契约。

**临时/中转产物（非 Asset）**：`gen3d:upload-image` 上传的输入图、
`gen3d:pose-standardization` 标准化后的中间图都是**中转产物**，不是 Asset——
不落 `assets/3d/`、不进 `list-assets`、UI 不显示为资产、无删除 UI。它们落 scratch
区（`.forgeax/games/<slug>/.gen3d/tmp/`）或 COS（拿 Transfer URL 给下一步用），
生命周期=中转。判定准则：**最终游戏可用的 mesh 才是 Asset；喂给生成的输入图不是。**

## 产品定位

wb-gen3d 是**生产工具**，不是 benchmark/对比工具。
目标：用户选 provider + mode + 输入 → 产出持久的游戏可用 3D 资产。
不做：provider 横向对比报告、质量评分排行、对比集聚合。
Lab 里的 benchmark 结论（哪个 provider 擅长什么）作为选型背景知识保留在文档里，不进运行时代码或 UI。

### Provider

3D 生成 API 后端。由 `(providerId, baseUrl, apiKey)` 唯一确定。
当前：`hunyuan_workflow` / `meshy` / `rodin`（gen3d 内）；`hunyuan_rest`（跨 gen3d 和 3d-pipeline）。

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

未来加 provider 只需在已有 tool 的 provider enum 加值，不需新建 tool。
`gen3d:refine-mesh`（Meshy 专属）等 Meshy 实装时再加。

### Gen3DAssetManifest

一次生成产出的持久化记录。M9 起它描述某个 game 内路径资产及其来源
provider/mode/job 信息、文件角色和状态标志。新 manifest 用 `assetPath` 作身份字段。
它是 wb-gen3d 与 wb-3d-pipeline 之间的传递契约。

### File（manifest 内）

Asset 的一个文件角色，例如主 mesh、预览图、贴图、绑骨模型或动画片段。
文件可被 Studio 用本地预览 URL 展示；外部 provider 需要访问时必须使用临时传输 URL。

### 资产存储模型

Per-game runtime asset library。生成时必须归属一个 game；资产直接落在该 game 的
运行时资产目录里，路径本身就是稳定引用。

```
.forgeax/games/<slug>/assets/3d/
  characters/<name>.glb
  characters/<name>.glb.meta.json
  meshes/<name>.glb
  meshes/<name>.glb.meta.json
```

不再维护 gen3d 专属的全局 staging 资产库作为主模型。跨 game 复用需要显式复制
或导入，而不是共享同一个全局 assetId。

### ProviderResult

Provider 适配器的统一输出类型。包含 provider 返回的 URL 列表 + 元数据。
Provider 不知道 cache 和 asset-store 的存在；ProviderResult 是纯数据，由 tool-handler 层编排持久化。

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
