# 开发计划：混元角色绑骨 + 动作系统（+ low_poly 可选旁路）

> Status: 🟢 ACCEPTED（2026-06-12 grill 收尾；对照混元三份官方 PDF + 代码 review 完成，可执行）
> Branch: `laurenceelu/feat-20260609-hunyuan3d-meshy-pipeline-card`（studio + marketplace 子模块同名；M3–M12 已合入三仓 main）
> 里程碑代号：**M13**（承接 `docs/PLAN-2026-06-11-rodin-cos-pergame.md` 的 M9–M12）
> 来源：2026-06-12 与用户的方案讨论（逐项确认，见下"已确认的关键决策"）。
> SSOT 决策记录：`docs/adr/0003-rig-motion-lowpoly-pipeline.md`（与本计划同批起草）。
>
> **本文件是这次新增工作（绑骨 / 动作 / 减面）的执行 SSOT。** 它新增 M13，
> 不改动 M0–M12 的已落地结论；只在插件层新增工具 / schema / UI / 存储能力。

---

## 2026-06-12 grill 修订（贴图存活 → 产线重排）— 本块为 SSOT，优先于下文冲突处

第二轮 grill 对照混元三份官方 PDF（`low_poly` / `auto_rigging` / `motion_retarget`，
均已逐字核对）+ 真实代码，确认「贴图必须存活」后，**推翻了原"减面前置"的产线顺序**。
下文凡与本块冲突处，以本块为准：

1. **贴图存活 = 硬要求**（用户 2026-06-12 拍板）：最终动画产物必须带原模型材质/贴图。
2. **核心产线改为"带贴图直绑"**：`带贴图高模 GLB → auto_rigging(glb_url) → motion_retarget(fbx_url)`。
   - auto_rigging 文档明文"**确保绑骨后的材质效果与原模型一致**"；GLB 输入**内嵌贴图、无需**
     单独传 `texture_image_url/pbr_*`（那些只给 OBJ 输入路径）。
   - auto_rigging / motion_retarget **都同时输出 `glb_url` + `fbx_url`**；三接口输出 schema 里
     **没有任何独立贴图 url** ⇒ 其 FBX/GLB 都是**自包含（内嵌贴图）**的。
3. **GLB 作落库主体（canonical）**：每跳存 GLB（自包含、引擎原生 glTF）作预览/引擎；
   **FBX 仅作 rig→motion 的中转输入**（motion 强制要 `fbx_url`），单文件落库即可。
   ⇒ 原先担心的"FBX 外链贴图伴随文件命名"问题**不存在**（仅 OBJ 输入才有外链贴图，我们不走）。
4. **low_poly 从"绑骨前强制前置"降级为"可选的几何/LOD 旁路工具"**：low_poly 是纯几何/拓扑
   操作——文档零"贴图/材质/UV"字眼，输出 `obj_url` 无配套 `mtl_url`（OBJ 无 MTL = 无材质），
   `quadrilateral` 又是重拓扑换 UV。**先减面 = 灰模动画**，与 (1) 冲突。
5. **"四边面好拓扑 + 带贴图"二选一**：混元三接口都不做"减面后把原贴图重烘焙到新 UV"。
   v1 选**保贴图**（直绑带贴图高模，资产偏重但可用，用户已接受）；**"低模化 + 带贴图的游戏就绪
   动画"需 re-bake（Blender/xatlas，超插件边界），列为后续单独立项**。
6. **下载步骤纠正**：每跳取齐 `data[]` 里所有产物（**glb_url + fbx_url**，low_poly 另含 image_url），
   不再"只取 fbx_url"——只取 fbx 会丢掉更该落库的 GLB。
7. **Gate 仍测 low_poly 贴图行为**：喂带贴图 GLB，实测输出 GLB 是否留贴图+UV。若它其实做了
   重烘焙（文档未提、置信度低），low_poly-first 才重新可行。

决策记录见 `docs/adr/0003-rig-motion-lowpoly-pipeline.md`（已同步修订）。

---

## 一句话目标

把"AI 生成的带贴图高模网格"接上混元 3D 的下游产线——**绑骨 → 动作**（减面/LOD 作可选旁路；
原"减面→绑骨→动作"已于 2026-06-12 grill 修订）——让 `wb-gen3d` 能产出**带骨骼、带动画的角色资产
（GLB 落库 + FBX 中转）**，落进 per-game 资产库，供
下游引擎 / agent 使用。

## 已确认的关键决策（2026-06-12 与用户逐条确认，执行时不要再改）

1. **Provider 策略 = 混元优先**。绑骨用混元 `auto_rigging`、动作用混元
   `motion_retarget` v1。Meshy / Rodin 这轮**不接**绑骨/动画（背景见下"Provider
   能力对比"，结论记进 ADR-0003）。
2. ~~**额外做 low_poly 减面**，作为绑骨前的"模型拓扑"前置环~~（**2026-06-12 grill 修订：
   low_poly 降级为可选旁路、不再前置**——见顶部修订块 #4/#5；用户"前置模型拓扑"的诉求改由
   后续 re-bake 方案承接）。
3. **动作丰富度 = 基础够用**：先用混元 `motion_retarget` v1 的 8 个固定动作
   （`motion_type` int 9–16）。`motion_retarget_v2`（动作库）保持封锁、不暴露。
4. **动作输入吃"带骨骼的 FBX"**（用户强调）：`auto_rigging` 必须取 FBX 输出
   （带 skeleton/skin），作为 `motion_retarget` 的输入；`rigged_model` 角色 =
   FBX，且只有这步绑骨能置 `hasSkeleton/skeletonProfile/animationInputReady`。
5. ~~**落地顺序 = 产线顺序**：高面数模型 → 减面 → fbx 带骨骼 → 动作 motion。~~（**2026-06-12 grill 修订**：
   核心产线改为 `带贴图高模 GLB → 绑骨 → 动作`，low_poly 旁路可选——见顶部修订块 #2/#4。）
6. **验证先行**：第一笔真机调用要先打通"**混元内网能否 fetch 我们的公网 COS
   URL**"（Gate 0，HANDOFF 标注的待验证风险）。三步都 mock-first、真机门控在
   `GEN3D_ENABLE_REAL_PROVIDERS` + `HUNYUAN_API_KEY`。
7. **资产模型 = 在同一资产上"追加"**（详见"资产模型决策"）：`auto_rigging` /
   `motion_retarget` 把**输出的 GLB（主，自包含含贴图）+ FBX（中转）**作为同基名附属文件
   **追加**到该网格资产，并翻动 `readiness.rigged / animated`。low_poly（若用）产出**新的派生
   GLB 资产**。（**2026-06-12 grill 修订**：落库主体是 GLB，不是 FBX——见顶部修订块 #3。）
8. **范围**：全部落在插件层（新增工具 + schema + UI 步骤 + 存储 append 能力）；
   复用已授权的 `cos-uploader` 与 `/api/game-assets/:slug/*` 路由；**不新增 Studio
   server 路由、不碰引擎 / interface / server 核心**。

## 目标产线与数据流（2026-06-12 grill 修订）

```
带贴图高模 GLB             带骨 GLB+FBX(自包含,含贴图)            动画 GLB+FBX(自包含,含贴图)
(source_mesh)      ──①──►  (rigged_model: glb 主预览 + fbx 中转)  ──②──►  (animated_model: glb 主 + fbx)
                 auto_rigging                                  motion_retarget v1
                 glb_url 输入, 保材质                            fbx_url 输入, motion_type 9–16

旁路(可选,不保贴图): 带贴图高模 GLB ──low_poly(quad/detail_level)──► 低模 GLB (几何/LOD, 新派生资产)
```

```mermaid
flowchart LR
  gen["带贴图高模 GLB 资产\n(assets/3d/characters/<n>.glb)"] -->|"COS shareUrl(glb)"| rig["gen3d:auto-rig\n混元 auto_rigging (同步)"]
  rig -->|"带骨 GLB+FBX(自包含含贴图)"| store2["追加 rigged_model\n<n>.rigged_model.glb (主预览) + .fbx (motion 中转)"]
  store2 -->|"COS shareUrl(fbx)"| mo["gen3d:apply-motion\n混元 motion_retarget v1 (同步)"]
  mo -->|"动画 GLB+FBX(自包含含贴图)"| store3["追加 animated_model\n<n>.animated_model.motion-<k>.glb (+.fbx)"]
  gen -. 可选旁路 .->|"COS shareUrl(glb)"| lp["gen3d:retopo-lowpoly\n混元 low_poly (异步,几何/LOD,不保贴图)"]
  lp -.->|"低模 GLB"| storeLP["新派生 GLB 资产\n<n>-lowpoly.glb (无贴图几何)"]
  gen & store2 & store3 -->|"/api/game-assets/<slug>/*"| viewer["ModelViewer 预览(GLB)"]
```

要点：每一步给混元的输入都是**库里某文件经 `cos-uploader` 上传出的公网预签名
URL**（transfer URL，非资产引用）；混元返回的 URL **立即下载成字节**再落库
（沿用 ADR-0001 "下游消费稳定资产路径、不消费临时 provider URL"）。**每跳取齐 `data[]`
里 glb_url + fbx_url 两者**（见顶部修订块 #3/#6）。

## Provider 能力对比（为什么全程混元；Meshy/Rodin 现状）

| 环节 | 混元（内网 `hunyuanapi.woa.com`） | Meshy（公网） | Rodin / Hyper3D（公网） |
|---|---|---|---|
| 拓扑/减面 | ✅ `low_poly` REST（本计划接入） | `topology=quad`+`should_remesh`+`decimation_mode`（生成时） | `mesh_mode=Quad`+档位（生成时） |
| rig 前置姿态 | `pose_standardization`（图层，已做） | `pose_mode=a/t-pose`（生成时） | `TAPose=true`（生成时） |
| 绑骨 | ✅ `auto_rigging`（本计划接入） | ✅ `POST /openapi/v1/rigging`（需带贴图人形 GLB） | ❌ 无（只能生成"易绑骨"模型） |
| 动作 | ✅ `motion_retarget` v1（8 动作）；v2 封锁 | ✅ `POST /openapi/v1/animations`（动作库丰富） | ❌ 无 |

- **Rodin 没有绑骨/动作 API**：只在前置环节有价值（Quad 拓扑 + TAPose 让模型
  rig-ready），不参与本产线的绑骨/动画。
- **Meshy 的绑骨+动作 API 其实最成熟**（纯公网、动作库大）。本轮**不接**是产品
  策略选择（混元为主线），不是技术受限；将来若要更丰富动作库可作为备选 provider
  （见 ADR-0003 "Alternatives considered"）。
- **混元这条链的两个固有风险**：① `auto_rigging` 从未端到端验证；② 混元是内网，
  需它去 fetch 我们公网 COS 的 GLB/FBX——见"风险与退路"。

## API 合约（来源已核对）

> 混元子能力 REST 路径用**下划线**、auth 是 `Authorization: Bearer <key>`（无签名）。
> 来源：① low_poly = 司内 PDF `hunyuan-3d-low-poly-v1.5.pdf`（用户 2026-06-12 提供）；
> ② auto_rigging / motion_retarget = `hunyuan3d-lab/src/hunyuan3d/providers/hunyuan_rest.py`
> + ADR-0007/0008 实证。

### ① low_poly 智能减面 —— `hunyuan-3d-low-poly-v1.5`（异步两段）

**提交** `POST /openapi/v1/3d/low_poly/generations/submission`（timeout 1min）

| 字段 | 类型 | 必选 | 说明 |
|---|---|---|---|
| `model` | string | 是 | 默认 `hunyuan-3d-low-poly-v1.5` |
| `glb_url` / `obj_url` / `fbx_url` | string | 三选一 | 高面数输入模型 URL |
| `polygon_type` | string | 否 | `triangle`(默认) / `quadrilateral`。**quadrilateral=原生四边面，动画 Deform 最佳拓扑，省去手工 Retopology** |
| `detail_level` | string | 否 | `high`(默认)/`medium`/`low`，对应 LOD 精细度 |
| `disable_normalization` | bool | 否 | 默认 false（归一化尺寸）；true 保持输入原始大小 |
| `n` | int | 否 | 默认 1，限制为 1 |
| `footnote` | string | 否 | 水印 ≤16 字符 |

提交返回：`{ id, created, task_id }`（task_id 有效期 1 天）。

**轮询** `POST /openapi/v1/3d/low_poly/generations/task` `{ task_id }`（timeout 60s）

返回：`{ id, created, status, data[], error }`，`status ∈ {queued, running, succeeded, failed, cancelled, unknown}`；
`data[n]` = `{ fbx_url, obj_url, glb_url, image_url, quads_info(仅 quadrilateral) }`（URL 有效期 1 天）。

错误码：400 格式错 / 401 鉴权 / 422 输入或输出审核不通过 / 429 并发超限 / 500 内部错误。

> **本产线用法（旁路/可选，2026-06-12 grill 修订）**：取 `data[0].glb_url` 作低模主体落库、
> `image_url` 作预览，`detail_level` 暴露为 high/medium/low。**注意：low_poly 是纯几何操作、
> 不保贴图**（输出 obj 无 mtl；quad 重拓扑换 UV）——故**不**置于绑骨前，仅作几何/LOD 旁路。

### ② auto_rigging 自动绑骨 —— `hunyuan-3d-auto-rigging-gamestudio`（同步）

`POST /openapi/v1/3d/auto_rigging`，body：

```jsonc
{
  "model": "hunyuan-3d-auto-rigging-gamestudio",
  "glb_url": "<低模 GLB 公网 URL>",   // 或 fbx_url / (obj_url + mtl_url)，三选一
  // 可选贴图：texture_image_url / pbr_metallic_image_url / pbr_roughness_image_url
  //          / pbr_normal_image_url / pbr_image_url / footnote
  "n": 1
}
// → data[].fbx_url（带骨骼/蒙皮）+ 可能的 data[].glb_url
```

> **本产线用法（2026-06-12 grill 修订）**：喂**带贴图高模 `glb_url`**（GLB 内嵌贴图，**无需**
> 再传 `texture_image_url/pbr_*`——那些只给 OBJ 输入）→ **取齐 `data[].glb_url`（主，自包含含贴图，
> 作预览/引擎）+ `data[].fbx_url`（中转，喂下一步 motion）**。文档明文"确保绑骨后的材质效果与原
> 模型一致"。状态：endpoint 可达但从未端到端验证，列为 **Gate 1** 验证项（重点验材质是否真保住）。

### ③ motion_retarget v1 动作驱动 —— `hunyuan-3d-motion-retarget`（同步）

`POST /openapi/v1/3d/motion_retarget`，body：

```jsonc
{
  "model": "hunyuan-3d-motion-retarget",
  "fbx_url": "<绑骨后人形 FBX 公网 URL>",   // 必填
  "motion_type": 9,                          // 必填，int 9–16，共 8 个固定动作（见下表）
  "n": 1
}
// → data[].fbx_url + data[].glb_url（两者皆自包含含贴图；GLB 作落库主体/引擎，FBX 备用）
```

> 状态：lab 内已实测可用（int 9–16）。**8 个动作映射已由操作员拍板（2026-06-12）**，
> 不再依赖 motion v1 的 PDF / 探针补名：

| `motion_type` | 动作 | 游戏应用场景示例 |
|---|---|---|
| 9  | 跨步 | 战斗位移、闪避动作、战术移动 |
| 10 | 摔倒 | 死亡动画、受击倒地、失败反馈 |
| 11 | 跳跃 | 跳跃平台、翻越障碍、技能起跳 |
| 12 | 踢腿 | 格斗技能、踢击连段、交互动作 |
| 13 | 挥击 | 近战攻击、武器挥砍、打击动作 |
| 14 | 步行 | 日常巡逻、NPC 漫游、场景行走 |
| 15 | 跑步 | 追逐战斗、快速移动、冲刺动作 |
| 16 | 跳舞 | 胜利庆祝、皮肤展示、互动表演 |

> UI 动作按钮文案用「动作」列；动画文件名仍按 `animated_model.motion-<k>.fbx`（k = int 9–16）。

### ④ motion_retarget_v2 —— **封锁，不接、不暴露**

`motion_type` 为 UUID 字符串，但其有效清单未知；远端对无效值**静默回退默认动作**
并照常扣配额（ADR-0008 三组对照实证）。等 @raineejiang 给清单前保持隐藏。

## 资产模型决策：在同一资产上"追加"派生文件

混元的 manifest 契约（`shared/manifest.ts`）**早已为此设计**：`FileRole` 含
`rigged_model / animation_clip / animated_model`；`ManifestFile` 带
`hasSkeleton / skeletonProfile / animationInputReady`；`computeReadiness()` 按
files 里是否存在这些角色翻动 `readiness.rigged / animated`；契约注释明说
"rigged_model/animated_model are appended by wb-3d-pipeline"。所以方向是
**在资产上累加文件**，而不是每步造一个全新主资产。

落地映射：

- **low_poly = 新派生 GLB 资产**。输出是一个完整的低模 GLB，正好符合现有
  `PerGameAssetStore.writeAsset`（要求主文件是 GLB `source_mesh`）。命名
  `<base>-lowpoly`（或用户名），`sourceInputAssetPaths=[高模 assetPath]`，
  走现有 `generateCacheFirst` + `persistGeneration`。**几乎零存储层改动。**
- **auto_rigging = 追加 `rigged_model` FBX** 到目标网格资产（通常是低模那个）。
  FBX 作同基名附属文件 `<base>.rigged_model.fbx`，进 sidecar `dependencies[]`，
  置 `hasSkeleton=true / skeletonProfile=humanoid / animationInputReady=true`，
  `readiness.rigged` 翻 true。
- **motion_retarget = 追加 `animated_model` FBX**：`<base>.animated_model.motion-<k>.fbx`
  （文件名带 `motion_type` 以便多个动作并存 + 按动作幂等），`readiness.animated` 翻 true。

### 为支持 append 需要的存储层改动（都在插件内）

当前 `PerGameAssetStore` 只能"造新资产"，且读回写死 GLB/`source_mesh`/`hasSkeleton:false`。
要支持追加 FBX，需改：

1. **`server/asset-storage.ts`**：`AssetStorage` 接口加
   `appendDerivedFiles(slug, assetPath, files[], opts)`（写同基名 FBX 附属文件、
   更新 sidecar `dependencies[]`、重算 readiness、保留 createdAt 改 updatedAt），
   以及 `readAssetFile(slug, assetPath, role?, format?) → {data, format}`（给
   COS-share 取某个文件字节）。
2. **`shared/manifest.ts`**：`SidecarDependency`（+ `ManifestFile`）增可选
   `{ hasSkeleton?, skeletonProfile?, animationInputReady?, role?, motionType?(int 9–16) }`，
   让 rig/anim 附属文件把骨架元数据 + **动作类型**结构化 **round-trip**（现仅 path/hash/kind；
   **motion_type 不再只藏文件名**——grill 2026-06-12，幂等/枚举/下游选取都走它）。
3. **`server/per-game-store.ts`**：
   - 实现 `appendDerivedFiles`：GLB 落 `<base>.<role>[.<variant>].glb`(主) + FBX 落
     `<base>.<role>[.<variant>].fbx`(中转)，写进 `dependencies[]`（含骨架标志），重算
     `readiness`、重写 `<base>.glb.meta.json`。**并发安全（grill 2026-06-12）：进程内 per-asset
     异步锁（键 `${slug}:${assetPath}`）串行化 `appendDerivedFiles`/`deleteAsset` 的
     read-modify-write，锁内重读 sidecar 再 merge 回写——否则同一角色并发挂多动作会丢条目 + 留孤儿。**
   - 修 `sidecarToManifest()`（现 L321 起）：按 `dep.kind`/扩展名还原每个附属文件
     的真实 `role/format` 与骨架标志，**不再写死 `hasSkeleton:false`**，使
     `selectFile(files,'rigged_model','fbx')` 能拿到带 `hasSkeleton:true` + 真实
     `localUrl` 的文件。
   - `listAssets()` 仍扫 `.glb.meta.json`（rig/anim 是 GLB 资产的附属，主体仍是
     `<base>.glb`），无需改扫描规则。
   - 实现 `readAssetFile`（按 role/format 在该资产目录找对应文件读字节）。
4. **`server/cos-uploader.ts`**：`extForMime` 现只认图片 mime；补 `model/gltf-binary→glb`、
   `model/fbx`/`application/octet-stream→fbx` 之类映射（或新增 `uploadModel(data, ext)`），
   让模型文件的 COS key 带正确扩展名。content-addressed `wb-gen3d/inputs/<sha>.<ext>`
   依旧幂等。

> **注意 GLB-only 去重规则**（`planFiles` L115）只针对 `source_mesh`；rig/anim 是
> `rigged_model`/`animated_model` 角色的 FBX，不会被它丢弃。

## 里程碑

每个里程碑：mock-first；真机门控 `GEN3D_ENABLE_REAL_PROVIDERS=1` + `HUNYUAN_API_KEY`；
复用 cache / RateGuard / audit（无密钥落日志）；每步 `npm run typecheck && npm run build` 过；
再由操作员做一次真机验证。

### M13-0 — 验证探针（Gate 0/1，先做、最关键）

目的：在写大量代码前，先用最低配额验掉混元这条链的两个未知。**可先用一次性
out-of-tree 脚本（不进仓）跑，验证通过再正式落工具。**

- **Gate 0｜COS 内网可达**：把库里一个真实 GLB 经 `cos-uploader` 上传 → 拿公网
  预签名 URL → 作 `low_poly` 的 `glb_url` 提交一次。
  - 通过 = 混元内网能 fetch 我们 lightai COS 的 URL（解锁整条链）。
  - 失败退路（按优先级）：① 改用混元自有 COS / 内网可达 endpoint 托管输入；
    ② 若某接口支持字节内联则字节直传；③ 暂限手填混元可达 URL。更新 CAPABILITY_MATRIX。
- **Gate 1｜形态确认**：用 Gate 0 的低模 GLB 跑一次 `auto_rigging` → 确认
  `data[].fbx_url` 真为带骨 FBX；再用该 FBX 跑一次 `motion_retarget`（int 9–16 取一个）
  → 确认输出动画 FBX。记录真实响应形态，回填到各 provider 解析。
- 产出：一页验证记录（贴进 HANDOFF / CAPABILITY_MATRIX），确认 endpoint/字段/输出
  形态与本计划一致或据实修订。

> 顺序说明（**2026-06-12 grill 修订**）：产线主路 = **带贴图高模 GLB → 绑骨 → 动作**；
> `low_poly` 已降级为**可选几何/LOD 旁路、非绑骨前置**（原"减面→绑骨→动作"作废）。Gate 0 的第一笔
> 真机调用（`low_poly` 或 `auto_rigging` 任一）**同时就是** COS 内网可达探针——"验证先行"与产线主路不冲突。

### M13-1 — 减面 `gen3d:retopo-lowpoly`（可选几何/LOD 旁路，**非绑骨前置**）

> **2026-06-12 grill 修订**：low_poly 不保贴图（纯几何、quad 换 UV），**不接入带贴图角色的绑骨主路**；
> 仅作几何/LOD 旁路工具。带贴图角色走 M13-2 直绑高模。

- **provider**：`server/providers/hunyuan-rest.ts` 现仅同步（pose_standardization）。
  low_poly 是**异步两段**，给它加一个 `lowPoly()`：submit `/low_poly/generations/submission`
  → 轮询 `/low_poly/generations/task` 直到 `succeeded/failed`（轮询间隔 ~3–5s、设上限；
  submit 前过 RateGuard；下载 `data[0].glb_url` 字节）。可参考 `hunyuan-workflow.ts`
  的轮询写法。
- **tool**：`gen3d:retopo-lowpoly`(args: `slug`, `assetPath`(高模), 可选 `assetName`,
  `polygonType`(默认 `quadrilateral`), `detailLevel`(high/medium/low), `assetSlot`)。
  流程：`readAssetFile(高模, source_mesh, glb)` → `cos-uploader` 上传拿 URL →
  `lowPoly()` → 下载低模 GLB(+image 预览) → `persistGeneration` 落**新派生资产**
  （`sourceInputAssetPaths=[高模 assetPath]`，`mode` 复用或新增标记）。cache-first：
  `makeCacheKey('hunyuan_rest','lowpoly',{inputHash, polygonType, detailLevel, assetSlot})`。
- **高模保留（已拍板）**：减面只**新增**低模派生资产，**不动/不删高模**（高模留作可再出别的
  LOD）；删除由用户在资产库手动操作，工具不自动删、不提示删。
- **mock 回退**：无真机时复用确定性 mock GLB 字节，落一个 `-lowpoly` 派生资产（标
  `providerMode:'mock'`），保证全链路无配额可跑。
- **schema**：`schemas/retopo-lowpoly.args.json` / `.returns.json`；`forgeax-plugin.json`
  加 tool（`exposedToAI:true`）。
- 验证：mock 下高模→低模派生资产落盘、cache 命中复用、list 扫出；typecheck+build。

### M13-2 — 绑骨 `gen3d:auto-rig`（产出带骨 GLB+FBX）

- **provider**：`hunyuan-rest.ts` 加同步 `autoRig()`（POST `/auto_rigging`，沿用现有
  同步 POST + 下载模式；**取齐 `data[].glb_url`(主) + `data[].fbx_url`(中转) 下载字节**）。
- **tool**：`gen3d:auto-rig`(args: `slug`, `assetPath`(**带贴图网格资产，通常是生成的高模，
  不走低模**), 可选 `assetSlot`)。流程：`readAssetFile(assetPath, source_mesh, glb)` → COS 上传拿
  `glb_url`（GLB 内嵌贴图，无需另传贴图）→ `autoRig()` → **取齐 `data[].glb_url`(主,自包含含贴图)
  + `data[].fbx_url`(中转)** → `appendDerivedFiles(assetPath, [{glb, role:'rigged_model'},
  {fbx, role:'rigged_model'}], { hasSkeleton:true, skeletonProfile:'humanoid',
  animationInputReady:true })`。**GLB 作 rigged 预览/引擎主体，FBX 仅留作 motion 输入中转。**
- **幂等**：调用前查目标资产是否已有 `rigged_model` FBX（readiness.rigged）；有则直接
  返回，不再扣配额（cache 以 inputHash 为键也可）。
- **mock 回退**：无真机时写一个占位 FBX 字节（标 mock）以跑通 append 路径。
- **schema** + `forgeax-plugin.json` tool（`exposedToAI:true`，**描述注明"仅双足人形角色"**）。
- **人形门控（2026-06-12 拍板）**：绑骨/动作只对 `assetSlot=characters` 暴露/启用，`meshes` 槽不显示；
  不做绑骨前人形检测（混元自会拒），失败（422 等）回显"可能非人形/结构不清"。
- **UI 解锁**：右侧 inspector 里预留的"下游绑骨/动画 handoff"卡（现 disabled 占位）
  接上本工具。
- 验证：mock 下对一个网格资产 append rigged GLB+FBX、`readiness.rigged=true`、sidecar
  dep 带骨架标志、读回 `selectFile(rigged_model,glb/fbx)` 正确；typecheck+build。
- **Gate 1 真机必验（2026-06-12 grill 补）**：① **贴图真的存活**——下载 rigged GLB 在 `ModelViewer`
  里目视有材质（不是裸网格）；② **输出是 T-pose**（`motion_retarget` 的前置假设，否则重定向会歪）；
  ③ 输入若是**多 mesh / 非单一可蒙皮体**时的行为（混元是否合并/报错），记录真实响应形态回填 provider 解析。

### M13-3 — 动作 `gen3d:apply-motion`（v1，8 动作）

- **provider**：`hunyuan-rest.ts` 加同步 `applyMotion()`（POST `/motion_retarget`，
  `fbx_url` + `motion_type` int；**取齐 `data[].glb_url`(主) + `data[].fbx_url` 下载**）。
- **tool**：`gen3d:apply-motion`(args: `slug`, `assetPath`, `motionType`(int 9–16))。
  流程：`readAssetFile(assetPath, rigged_model, fbx)`（不存在则报 `not_rigged`，提示
  先绑骨）→ COS 上传拿 `fbx_url` → `applyMotion()` → **取齐 `data[].glb_url`(主,自包含含贴图)
  + `data[].fbx_url`** → `appendDerivedFiles(assetPath, [{glb, role:'animated_model'},
  {fbx, role:'animated_model'}], { variant:'motion-<k>' })`。**GLB 作动画主体/引擎，FBX 备用。**
- **多动作并存 + 幂等**：每个 `animated_model` 文件带**结构化 `motionType`(int 9–16)**（不靠文件名）；
  append 前 `files.some(role==='animated_model' && motionType===k)` 判存在 → 返回既有、不重复扣配额。
  文件名仍带 `motion-<k>` 仅作磁盘可读性，判定/枚举一律走结构化字段。
- **mock 回退**：占位动画 FBX 字节（标 mock）。
- **schema** + tool（`exposedToAI:true`）。`motion_retarget_v2` / `auto_rigging` 之外
  的混元能力保持不暴露。
- **UI**：动作选择给 8 个按钮（跨步/摔倒/跳跃/踢腿/挥击/步行/跑步/跳舞，对应 int 9–16；
  见 §③ 动作映射表），仅当目标资产 `readiness.rigged` 时可用。
- **配额/批量（2026-06-12 grill 默认，可改）**：v1 契约 = **一次调用一个 `motion_type`**，8 动作 = 8 次调用；
  **不做"一键生成全部 8 个"自动批量**（避免一键烧配额 + 触发 RateGuard 3/min）。用户/agent 按需逐个挑；
  已存在的动作走结构化 `motionType` 幂等跳过。需要批量时再做显式"批量队列"（后续增强）。
- 验证：mock 下对已绑骨资产 append 动画 FBX、`readiness.animated=true`、多动作各自成文件；
  typecheck+build。

### M13-4 — UI / 预览收尾

- 左侧 staged sidebar 主路两步：**绑骨 → 选动作**（仅在选中一个角色资产时可用）；**减面**作可选旁路入口（非主路）。
- `ModelViewer` 已有"显示骨骼"开关（仅 SkinnedMesh 时可用）——绑骨/动画结果可直接看骨架。
  **预览（2026-06-12 grill 修订）**：rig/motion 都输出 **GLB**，`ModelViewer` 现有 GLTFLoader 即可加载，
  **无需 FBXLoader、无需 FBX→GLB 转换**（原"本轮只产 FBX"的顾虑已不成立）。**但要"看到动作"
  需补 `AnimationMixer` 播放 GLB 内的动画 clip**（现 ModelViewer 只静态渲染）——否则动画无法肉眼验收。
- `AssetLibrary` 卡片显示资产 readiness（source/rigged/animated 进度）+ **已有动作列表（从 files 的
  结构化 `motionType` 枚举，不解析文件名）**，便于挑选可绑骨/可加动作的资产、按动作选播。

## 触及插件外 / 需注意

- **无新增 Studio server 路由**：rig/motion/lowpoly 的 provider 调用都走插件
  `server/tool-handlers.ts`（同现有工具）；模型文件预览复用已授权的
  `/api/game-assets/:slug/*`（已服务 `assets/3d/**` 下含 `.fbx`/`.glb`）；输入
  share 复用 `cos-uploader`。**本计划不需要改 `packages/server/`。**
- 新依赖：可能需要 `FBXLoader`（three 自带 examples，无新 npm 包）。其余无新依赖。
- 密钥：沿用插件 `.env` 的 `HUNYUAN_API_KEY` + `COS_*`（gitignored）；不进源码/schema/文档。
- 契约改动：`SidecarDependency` 加骨架字段、`AssetStorage` 加 append/read 方法属于
  插件内契约扩展，记进 ADR-0003。

## 风险与退路

| 风险 | 影响 | 退路 |
|---|---|---|
| **混元内网拉公网 COS（Gate 0）** | 整条链不通 | 混元自有/内网 COS；字节内联；手填可达 URL |
| `auto_rigging` 从未端到端验证 | 绑骨可能失败/输出形态不符 | Gate 1 先验；失败则据实修订或暂缓 |
| low_poly 真机未跑过（合约来自 PDF） | 字段/输出形态可能有偏差 | Gate 0 首调即验，按响应修订 |
| `auto_rigging` / `motion` 仅人形 | 非人形（怪物/四足/机甲/道具）绑骨失败或吐垃圾骨架 | `assetSlot=characters` 软门控 + AI schema 注明"仅双足人形" + 失败回显 reason（不做绑骨前人形检测，混元自会拒） |
| ~~FBX 不能直接进引擎播放~~ | ~~已不成立~~ | rig/motion 本就输出 GLB（canonical）；ModelViewer 需补 AnimationMixer 才能**播放**动画 clip |
| motion_retarget_v2 静默回退 | 误用会白扣配额 | **保持封锁不暴露** |

## 验证策略

- 每个里程碑：插件目录 `npm run typecheck && npm run build`。
- mock 全链路（无配额）：生成带贴图高模 → 绑骨 append GLB+FBX → 动作 append GLB+FBX
  （可选旁路：减面派生低模资产）；readiness 逐级翻动；list 扫出；delete 删净（含附属 GLB/FBX）。
- 真机（操作员授权、带 key）：Gate 0/1 各一次；M13-1/2/3 各转正一次，记录形态。
- 视觉：standalone `npm run dev`(:15175) + 嵌入 Studio 左/中栏核对三步 UI + 骨架预览。

## 执行任务清单（交接给执行 agent）

- [ ] **M13-0 验证探针**：out-of-tree 脚本跑 Gate 0（COS 内网可达）+ Gate 1
      （auto_rigging / motion_retarget 输出形态）；记录到 HANDOFF/CAPABILITY_MATRIX。
- [ ] **store-append**：`asset-storage.ts` 加 `appendDerivedFiles` + `readAssetFile`；
      `manifest.ts` `SidecarDependency` 加骨架字段；`per-game-store.ts` 实现 append +
      修 `sidecarToManifest` 还原附属文件 role/format/骨架标志；`cos-uploader.ts` 支持
      glb/fbx 扩展名。
- [ ] **M13-1 lowpoly**：`hunyuan-rest.ts` 加异步 `lowPoly()`；`gen3d:retopo-lowpoly`
      工具 + schema + plugin.json；cache-first + mock 回退。
- [ ] **M13-2 auto-rig**：`hunyuan-rest.ts` 加 `autoRig()`；`gen3d:auto-rig` 工具
      （append rigged_model FBX + 置骨架标志）+ schema + plugin.json；解锁 handoff 卡。
- [ ] **M13-3 apply-motion**：`hunyuan-rest.ts` 加 `applyMotion()`；`gen3d:apply-motion`
      工具（append animated_model FBX，文件名带 motion-<k>）+ schema + plugin.json；8 动作 UI。
- [ ] **M13-4 UI**：sidebar 三步 + ModelViewer FBXLoader/骨架预览 + AssetLibrary readiness 展示。
- [ ] **docs**：`MIGRATION_PLAN` / `CAPABILITY_MATRIX`（low_poly/auto_rigging/motion v1 行
      升 mock-first/planned 并补合约）/ `CONTEXT`（rigged/animated 术语）/ `HANDOFF` 更新；
      ADR-0003 落地确认。

## 开放问题（执行前需澄清）

> ✅ **已拍板（2026-06-12）**：
> - motion v1 的 8 个动作名（int 9–16）映射已确定，见 §③ 动作映射表
>   （跨步/摔倒/跳跃/踢腿/挥击/步行/跑步/跳舞）。
> - **low_poly 减面后高模默认保留**（可再出别的 LOD），用户可手动删除；工具不自动删、不提示删。
> - **贴图必须存活**；核心产线改为"带贴图高模直绑→动作"，**low_poly 降级为可选旁路**（见顶部修订块）。
> - **v1 直绑带贴图高模**（不强制低模化）；"低模+带贴图"需 re-bake，列为后续。

1. ~~**FBX→GLB 引擎可播**：本轮只产 FBX~~（**2026-06-12 grill 修订：已不成立**——
   auto_rigging/motion_retarget **本就输出 GLB**，落库主体即 GLB，引擎可直接吃 glTF；
   仅需给 `ModelViewer` 补 `AnimationMixer` 才能**播放**动画 clip）。
2. ~~**auto_rigging 可选贴图入参**~~（**已澄清**：`texture_image_url/pbr_*` 仅 **OBJ 输入**路径
   需要；我们走 **GLB 输入**，贴图内嵌、无需另传）。

## 文档来源（评审可追溯）

- low_poly 合约：`/Users/laurenceelu/Downloads/hunyuan-3d-low-poly-v1.5.pdf`（司内文档）。
- auto_rigging / motion_retarget：`hunyuan3d-lab/src/hunyuan3d/providers/hunyuan_rest.py`、
  `hunyuan3d-lab/docs/adr/0007-*`、`0008-*`、`PROGRESS.md`。
- Meshy / Rodin 绑骨动画现状：Meshy 官方 `docs.meshy.ai/api/{rigging,animation}`、
  Hyper3D `developer.hyper3d.ai`（2026-06 查）。
- 现有代码集成点：`server/{tool-handlers,generate,per-game-store,asset-storage,cos-uploader,env}.ts`、
  `shared/{manifest,catalog}.ts`、`forgeax-plugin.json`、`docs/PLAN-2026-06-11-rodin-cos-pergame.md`、
  `docs/adr/0002-per-game-file-asset-storage.md`。