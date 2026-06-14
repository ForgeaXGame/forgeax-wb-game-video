# PROVIDER_PARAMS — 各家 3D 生成 API 可开放参数调研

> 状态：🟡 调研稿（待你过目后回填 `PLAN-2026-06-13-viewer-quality-provider-params.md` §C.3）
> 日期：2026-06-14
> 数据来源：
> - Meshy 官方文档 `docs.meshy.ai/en/api/{text-to-3d,image-to-3d,multi-image-to-3d}`（2026-06-14 抓取）
> - Hyper3D / Rodin 官方文档 `developer.hyper3d.ai/api-specification/rodin-generation-gen2`
> - Tencent 混元生3D `cloud.tencent.com/document/api/1804/123447`（公网 Pro 版）+ WaveSpeed 镜像
> - Tripo `docs.tripo3d.ai/model-generation/*`
> - 竞品 **LIGHT AI**（内网 `lightai-meshy-v4-sd.lightai.woa.com`）参数面板截图 ×4（你提供，2026-06-14）

## 0. 阅读约定

- **本文区分两类“参数”**：
  - **Provider 原生参数** = 官方 API 真实接受的字段（可验证）。
  - **竞品 UI 便利项** = LIGHT AI 自己加的后处理（如“自动尺寸 / 原点位置”），**不是** provider API 字段。
- **铁律（沿用 workspace 规则）**：wb-gen3d **只暴露已在官方文档验证存在的原生参数**；竞品有、但官方文档查不到对应字段的，标 ⏳ 待验证、先不接。
- 图例：✅ 拟暴露 ｜ ⏳ 候选/待验证 ｜ ❌ 不接（deprecated / 仅后处理 / 当前实现不支持） ｜ 🧩 竞品 LIGHT AI 已暴露

---

## 1. Meshy（meshy-6，竞品标“Meshy6大模型”）

端点（插件已用）：`text-to-3d`（preview→refine 两段）、`image-to-3d`、`multi-image-to-3d`；
另有 `text-to-texture / retexture`（竞品“纹理生成”页，插件**未接**）。

| 参数 | 类型 / 取值 | 默认 | 说明 | wb-gen3d |
|---|---|---|---|---|
| `ai_model` | `meshy-5` \| `meshy-6` \| `latest`(=6) | latest | 选代际 | ✅ |
| `model_type`（仅 image） | `standard` \| `lowpoly` | standard | lowpoly 会忽略 ai_model/topology/polycount/remesh | ✅ 🧩(网格类型 标准/低面数) |
| `should_remesh` | bool | false(m6)/true | 关掉则不重拓扑 | ✅ 🧩(重建网格) |
| `topology` | `triangle` \| `quad` | triangle | 仅 `should_remesh` 时生效 | ✅ 🧩(拓扑 四边面/三角面) |
| `target_polycount` | int 100–300000 | 30000 | 目标面数 | ✅ 🧩(面数限制 slider) |
| `decimation_mode` | `1`超高/`2`高/`3`中/`4`低 | — | 自适应减面，**覆盖 target_polycount** | ✅ 🧩(自适应减面 关/超高/高/中/低) |
| `pose_mode` | `""` \| `a-pose` \| `t-pose` | "" | 角色姿态 | ✅ 🧩(姿态模式 无/A/T) |
| `enable_pbr` | bool | false | PBR 贴图（**仅 m6/latest，固定 2K**） | ✅(已有) 🧩 |
| `should_texture`（image） | bool | true | 关掉只出白模 | ✅ |
| `texture_prompt` / `texture_image_url` | string | — | refine/图生纹理引导（二选一） | ⏳(refine 阶段做) 🧩(纹理生成页) |
| `target_formats` | `glb/fbx/usdz/obj/stl/3mf` | glb | 输出格式 | ✅(已有 enableFbxUrl，可扩) |
| `moderation` | bool | false | 内容审查 | ❌(默认关) |
| `art_style` | ~~realistic/sculpture~~ | — | **❌ deprecated，m6 直接忽略** | ❌ |
| `symmetry_mode` | ~~off/auto/on~~ | — | **❌ deprecated，无效果** | ❌ |
| `negative_prompt` | ~~string~~ | — | **❌ deprecated，无影响** | ❌ |

> ⚠️ **修正点**：spec C.3 早稿曾建议暴露 Meshy 的 `art_style`/`symmetry_mode`——经文档核实**这俩已废弃**，meshy-6 忽略，**从拟暴露清单删除**。
> ⚠️ 竞品“4K高清纹理”开关：Meshy PBR 文档明确**固定 2K**，官方未见 4K 纹理参数 → 多半是竞品自家放大/重烤，标 ⏳，wb-gen3d 暂不暴露。
> ⚠️ 竞品“自动细化”= 把 preview 后自动跑 refine（两段串起来），属流程编排，非 API 字段。

---

## 2. Rodin / Hyper3D Gen-2（竞品标“Rodin2.5大模型”）

端点：`POST https://api.hyper3d.com/api/v2/rodin`（multipart；传图=图生，仅 prompt=文生）。
插件现状：`tier=Regular` 固定、`material=PBR`、`geometry_file_format=glb`、由目标面数推 `quality_override`。

| 参数 | 类型 / 取值 | 默认 | 说明 | wb-gen3d |
|---|---|---|---|---|
| `tier` | `Gen-2`/`Detail`/`Smooth`/`Regular`/`Sketch` | Regular | 模型档（质量↔速度） | ✅ |
| `quality` | `high`/`medium`/`low`/`extra-low` | medium | 预设面数档 | ✅ 🧩(模型档位 极低/低/中/高/极高) |
| `quality_override` | number（Quad 1000–200000 默 18000；Raw 500–1,000,000 默 500000） | — | 精确面数，覆盖 quality | ✅ 🧩(自定义生成面数 toggle) |
| `mesh_mode` | `Quad` \| `Raw` | Quad | Raw≈三角 | ✅ 🧩(拓扑 四边面/三角面) |
| `material` | `PBR` \| `Shaded` \| `All` | PBR | 材质类型 | ✅ 🧩(材质类型 PBR/Shaded/All/None*) |
| `geometry_file_format` | `glb/usdz/fbx/obj/stl` | glb | 输出格式 | ✅ 🧩(模型格式) |
| `TAPose` | bool | false | 人形 T/A 姿态 | ✅ 🧩(T/A Pose) |
| `use_original_alpha` | bool | false | 用原图透明通道 | ✅ 🧩(使用原始透明通道) |
| `addons` | `HighPack`（4K 纹理 / 高模） | — | 增强包 | ⏳ 🧩(HighPack / 高清纹理) |
| `seed` | int 0–65535 | — | 复现 | ⏳ |
| `bbox_condition` | [W,H,L] | — | 包围盒约束 | ❌(进阶) |
| `condition_mode` | `concat` \| `fuse` | concat | 多图：单物多视 vs 多物融合 | ⏳(多图模式接入时) |
| `images` | ≤5 file | — | 输入图 | ✅(已有) |
| `prompt` | string | — | 图生可选 / 文生必填 | ✅(已有) |
| — | 🧩 几何指令 还原/创意 | — | 竞品独有，官方表未见对应字段 | ⏳ 待文档核实 |
| — | 🧩 纹理模式（下拉）/ 🧩 纹理去光照 | — | 同上，疑似 Gen-2 新增/内测 | ⏳ 待文档核实 |

> *竞品“材质类型”多一个 **None**（只出几何），官方是 PBR/Shaded/All；None 可用“只取几何/不烤纹理”在我侧实现。

---

## 3. 混元 3D（v3.1，竞品标“混元3D v3.1大模型”）

> ⚠️ **关键区分**：插件走的是**内网 workflow API**（`*-wf` 模型，submit/poll），**不是**下面这套**公网 Pro 版** `SubmitHunyuanTo3DProJob`。
> 下表是**公网文档参数（参考基线）**；要在 wb-gen3d 暴露更多混元参数，**必须先验证内网 workflow 端点是否接受同名字段**，否则一律 ⏳。

公网 Pro 版（`cloud.tencent.com/document/api/1804/123447`）：

| 参数 | 类型 / 取值 | 默认 | 说明 | wb-gen3d |
|---|---|---|---|---|
| `Prompt` / `ImageBase64` / `ImageUrl` | string | — | 文/图输入（互斥） | ✅(已有) |
| `MultiViewImages.N` | ViewImage[] | — | 多视图（back/left/right…） | ✅(已有 8-slot views) |
| `EnablePBR` | bool | false | PBR 材质 | ✅(已有) |
| `FaceCount` | int 3000–1,500,000 | 500000 | 面数（LowPoly 时不生效） | ✅(已有) |
| `GenerateType` | `Normal`/`LowPoly`/`Geometry` | Normal | Geometry=白模(忽略 PBR) | ⏳ 待验证内网 |
| `PolygonType` | `triangle`/`quadrilateral` | triangle | 拓扑 | ⏳ 待验证内网 |
| `ResultFormat` | `GLB`/`OBJ`/`STL`… | GLB | 输出格式 | ✅(已有 enableFbxUrl) |
| `Model` | `3.0`/`3.1`… | — | 代际 | ⏳ 待验证内网 |

---

## 4. Tripo3D（v3.1，竞品标“Tripo3.1大模型”）— 候选未来 provider

> 插件**当前不含 Tripo**（providers = hunyuan_workflow / meshy / rodin）。此节仅作竞品参考；
> 接入前不暴露。H3=`v3.1-20260211`（高保真）；P1=`P1-20260311`（低模/干净拓扑，face_limit 48–20000）。

高价值参数（`text_to_model` / `image_to_model`）：`model_version`、`prompt`、`face_limit`、
`quad`(bool,+5cr)、`texture`(bool)、`texture_quality`(standard/detailed/extreme)、
`auto_size`(bool)、`smart_low_poly`、`model_seed`/`texture_seed`、`style`、`pivot_to_center_bottom`、
`flatten_bottom`、`texture_size`/`texture_format`、`texture_alignment`。
→ 与 Meshy/Rodin 高度重叠（face_limit / quad / seed / auto_size），未来接入可直接复用同一套 UI param-spec。

---

## 5. 竞品 LIGHT AI 截图 → 参数映射（对照表）

| 竞品控件（中文） | 出现页 | 对应 provider 原生参数 | 备注 |
|---|---|---|---|
| 姿态模式 无/A-pose/T-pose | Meshy 图/文 | `pose_mode`(Meshy) / `TAPose`(Rodin) | ✅ 暴露 |
| 重建网格 | Meshy 图/文 | `should_remesh` | ✅ |
| 拓扑 四边面/三角面 | 各家 | `topology`(Meshy)/`mesh_mode`(Rodin)/`PolygonType`(混元) | ✅ |
| 面数限制（slider） | 各家 | `target_polycount`/`quality_override`/`FaceCount` | ✅ |
| 自适应减面 关/超高/高/中/低 | Meshy | `decimation_mode`(1–4)+关 | ✅ |
| 网格类型 标准/低面数 | Meshy 文 | `model_type` standard/lowpoly | ✅ |
| 自动细化 | Meshy 文 | （流程：preview→自动 refine） | 流程编排，非字段 |
| 4K高清纹理 | Meshy | 官方无（PBR 固定 2K） | ⏳ 竞品后处理，不接 |
| 模型格式 glb/usdz/fbx/obj/stl | Rodin | `geometry_file_format` | ✅ |
| 材质类型 PBR/Shaded/All/None | Rodin | `material`(+None=只几何) | ✅ |
| 模型档位 极低…极高 | Rodin | `quality`(+HighPack 为极高) | ✅ |
| 自定义生成面数 | Rodin | `quality_override` | ✅ |
| 使用原始透明通道 | Rodin | `use_original_alpha` | ✅ |
| T/A Pose | Rodin | `TAPose` | ✅ |
| 几何指令 还原/创意 | Rodin | 官方表未见 | ⏳ 待核实 |
| 纹理模式 / 纹理去光照 / HighPack | Rodin | HighPack=`addons`；其余待核实 | ⏳ |
| **自动尺寸** | Meshy | **无（竞品归一化后处理）**；Tripo 有 `auto_size` | 客户端后处理，非 Meshy 字段 |
| **原点位置 底部/中心** | Meshy | **无（竞品后处理）**；Tripo 有 `pivot_to_center_bottom` | 同上 |
| 模型上传 / 文本生纹理 / 图片生纹理 / 使用原始 UV | Meshy 纹理页 | Meshy `retexture` 端点 | ⏳ 插件未接纹理端点 |

---

## 6. wb-gen3d 拟暴露汇总（回填 spec C.3）

**新增（已验证、本期可做）**：

- **Meshy**：`ai_model`(5/6)、`model_type`(标准/低模)、`should_remesh`+`topology`(三角/四边)、
  `target_polycount` 或 `decimation_mode`(关/超高/高/中/低)、`pose_mode`(无/A/T)。（`enable_pbr` 已有）
- **Rodin**：`tier`/`quality`(档位)、`material`(PBR/Shaded/All/None)、`mesh_mode`(四边/Raw)、
  `TAPose`、`geometry_file_format`、`quality_override`(自定义面数)、`use_original_alpha`。
- **混元**：维持 `FaceCount`/`EnablePBR`/`views`/`enableFbxUrl`；`PolygonType`、`GenerateType` 列为 ⏳（先验内网端点）。

**删除（早稿误列）**：Meshy `art_style`、`symmetry_mode`（均 deprecated）。

**待验证再定（⏳）**：Meshy 4K 纹理、Rodin 几何指令/纹理模式/纹理去光照/HighPack/seed、
混元 PolygonType/GenerateType/Model、Tripo 全量（接入时）。

**明确为“后处理”而非 provider 参数**：自动尺寸、原点位置（底部/中心）。
→ 决策：本期**不做**；若要，后续在导入侧做客户端归一化（Tripo 接入时可直连其原生 `auto_size`/`pivot_to_center_bottom`）。

> 实现层建议：用 spec C.2 的 `param-spec`（每参数：provider 适用集 / 类型 / UI 控件 / 默认 / 依赖关系如 lowpoly 禁用 topology），
> SetupSidebar 据此渲染，避免给每家写死一套表单。
