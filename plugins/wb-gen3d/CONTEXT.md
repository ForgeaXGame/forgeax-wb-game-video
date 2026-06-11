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

一个持久的、game 可用的 3D 产物。由 `assetId`（随机 UUID）唯一标识，拥有一组 File（按角色区分）。
下游模块通过 manifest 消费 Asset，不通过 provider URL。
同输入多次生成产出不同 Asset（3D 生成是非确定性的）；去重由 cache 层负责。

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

一次生成产出的持久化记录。包含 assetId、来源 provider/mode/job 信息、files[] 列表、状态标志。
是 wb-gen3d 与 wb-3d-pipeline 之间的传递契约。

### File（manifest 内）

一个存储的 blob。属性：role / format / storageKey / bytes / sha256。
不直接对外暴露 URL；需要时通过 storage adapter 生成临时访问地址。

### 资产存储模型

全局资产库（不绑定 game）。生成时不需要指定 gameSlug。
游戏引用资产时通过 assetId 松散关联。

```
.forgeax/assets/gen3d/
  <assetId>/manifest.json
  blobs/<sha256-prefix>/<sha256>.<ext>
```

先有资产、后决定用在哪个游戏。跨游戏复用是免费的。

**与 per-game 运行时资产库的关系：** ForgeaX 官方还有
`.forgeax/games/<slug>/assets/`（项目财产，引擎直接加载；例：`shoot-opt` 的
`*.pack.json`）。v2 目标在 `assets/2d/`、`assets/3d/characters/` 等 path slot
落盘（见 studio `docs/v2-vision/node-runtime-architecture/03-WORKSPACE-LAYOUT.md`）。
wb-gen3d 全局库是**生成 staging 层**；入戏到 game 目录是后续 handoff，不是生成时
必选步骤。

### ProviderResult

Provider 适配器的统一输出类型。包含 provider 返回的 URL 列表 + 元数据。
Provider 不知道 cache 和 asset-store 的存在；ProviderResult 是纯数据，由 tool-handler 层编排持久化。

### Cache

请求级去重。key = `(providerId, mode, normalized_payload)` 的 hash。
只存成功结果的 `hash → assetId` 映射，不存 provider 响应或 URL。
命中后直接从 asset-store 读取 manifest 返回。

设计原则：cache 不依赖 provider 响应格式（源 lab ADR-0002 精神的极致化）。
写入时机：provider 调用 + blob 下载 + manifest 写入全部成功后，cache 才追加一条映射。

## 命名与边界

| 易混淆 | 正确说法 |
|---|---|
| "生成" vs "后处理" | gen3d = 从无到有产出 mesh；3d-pipeline = mesh → game-ready |
| `pose_standardization` 归属 | 归 gen3d（图片预处理），不归 3d-pipeline |
| Hunyuan REST 归属 | 跨两个模块：pose_standardization 归 gen3d，其余归 3d-pipeline |
| `refine` | 仅 Meshy 专属的第二阶段，不泛化到其他 provider |
