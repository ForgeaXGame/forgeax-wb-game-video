# PLAN 2026-06-13 — 视图器渲染增强 · 五维质量评分 · Provider 专属参数

状态：🟢 ACCEPTED（2026-06-14 grill 评审收尾，11 项执行细节与 operator 敲定，见下「2026-06-14 grill 修订」块；可转 writing-plans / 执行）
日期：2026-06-13 Asia/Hong_Kong
范围：`packages/marketplace/extensions/wb-gen3d/`（一处插件外授权例外见 §8）
关联：ADR-0001（生产工具架构 / 评分立场）、ADR-0002（per-game 存储）、ADR-0003（rig/motion）、**ADR-0004（按需混合质量评分，本轮新增）**

> 一份 spec 覆盖三条**相互解耦**的工作流（operator 选择 one-spec）。三块共享一处
> manifest 数据模型改动（§7），其余互不依赖，可分期独立实现（§10）。

---

## 2026-06-14 grill 修订（评审收尾）— 本块为 SSOT，优先于下文冲突处

一轮 `grill-with-docs` 评审把 spec 跟现网代码逐条对齐，敲定 11 项执行细节（D1–D9 + P4 推迟未动）。
下文凡与本块冲突处，以本块为准。

**范围 / 排期**：本轮做 **P1+P2+P3+P5**（P4 AI 视觉评推迟）；按解耦分批提交（P1→P2 视图器 / P3 评分 /
P5 参数），三条独立便于 review。P2 的 `.hdr` 缺失时以 builtin RoomEnvironment 兜底，不阻塞。

**A 视图器**
- **A1 范围**：仅做中栏 `ModelViewer` 渲染质量 + `渲染设置` popover + **相机类轻量 chrome**（视角预设
  前/后/左/右/顶/透视 + 复位聚焦 + 角落 XYZ `ViewHelper`），保留现有 网格/骨骼/播放 开关。**不做**模型
  变换 gizmo（只读预览、无可持久化的 transform）；**不做** mockup 里的 DCC 外壳（顶部 tab、资源树重设计、
  场景层级、材质/动画列表）——那是未来另立项。
- **A2 默认观感 = 影棚 lite**：亮色中性渐变背景 + RoomEnvironment IBL + ACES + `ShadowMaterial` 软阴影；
  **不做镜面反射地面**（mockup B 的倒影留后续 Reflector）。统一措辞：**默认背景 = 亮色中性渐变**（消解
  A.1「渐变默认」与 D9「B 默认」的张力；D9 不变、B 仍为默认观感）。
- **A3 本轮不做 `viewer/capture.ts`**：P4 已推迟、mock 桩不需要截图、客观评分走 mesh 遍历、库缩图已有
  `preview_image`。capture 随 P4 一起加。

**B 五维评分（Phase A）**
- **B1 数据流**：客户端新增轻量 extractor（遍历 `gltf.scene` → 纯数据 `ObjectiveMetrics`）→
  `shared/quality/heuristics.ts`（纯/无 DOM/可单测）**在客户端打分** → `gen3d:score-quality` **只做
  merge + 持久化、不重算**（服务端无 three.js，拿不到已渲染场景）。
- **B2 `sidecarToManifest` 透出**：读出 `custom.quality`（→ `manifest.quality` 数值）+ 透出目标
  `faceCount`（`Gen3DAssetManifest` 加一个可选字段）。`topology` 有目标用 `100*(1-clamp(|actual-target|/target))`，
  无目标（mock/老资产/lowpoly 派生）回退「密度均匀度为主」或置 null。
- **B3 落库 + 并发**：`AssetStorage` 加 `updateAssetQuality(slug, assetPath, report)`，用**同一把
  `withAssetLock`** 串行化 read-modify-write，只改 `custom.quality`、不动 `dependencies`。
- **B4 派生资产 `prompt_fidelity` 继承推迟到 P4**：本轮显示 null + 「继承自源（待 AI 评分）」提示；客观四维
  对派生 mesh **重算**（lowpoly 几何/贴图已变，不能继承）。
- **B5 计算/落库时机 = lazy**（修订 ADR-0004 Phase A）：客观项**每次选中即时在客户端算 + 即显、不单独
  写盘**；仅人工覆盖或（未来 P4）AI 评分发生时才经 `score-quality` 落库（落库带上重算的客观维）。原「首次算
  即落库」作废，避免浏览资产库即写 sidecar。
- **B6 本轮「AI 评分」按钮置灰** + tooltip「AI 视觉评分待 server 授权后开放（P4）」，留位不误导。

**C Provider 参数**
- **C1 校验分层**：JSON schema 里 `providerParams` 声明为**开放对象**（`type:object`）；逐字段校验放
  **服务端 `buildPayload`**——按 `shared/provider-params.ts` 的 `verified + appliesToModes + 类型白名单`
  过滤，未声明/未验证字段直接丢弃。**不建 schema 生成器**，单一真相在 param-spec。
- **C2 `verified` = 「官方文档确认字段存在」**（文档级，沿用 PROVIDER_PARAMS §0 铁律）：doc-verified +
  appliesToModes 即渲染/进 buildPayload；参数**仅在该 provider 真机跑时生效**，mock/无 key 时惰性（与
  mock-first 姿态一致）。provider 是否真机验证过是另一根轴（catalog exposure），不阻断参数暴露。落地需扩
  `MeshyGenerateInput`/`RodinGenerateInput` + 各自 `buildPayload` 转发新字段。

---

## 1. 背景与目标

`wb-gen3d` 当前的三处缺口：

1. **五维质量评分是纯占位**。`QualityScore`（geometry/topology/texture/pbr/prompt_fidelity/total）
   永远 `null`（`shared/manifest.ts` `emptyQuality()`）；UI `InspectorReserved`
   （`src/components/AssetLibrary.tsx`）渲染 disabled 占位；`gen3d:provider-status`
   只回传维度名（`QUALITY_RUBRIC`）。ADR-0001 当前立场是"评分手动/带外、不在生成时产出"。
2. **视图器渲染朴素**。`ModelViewer.tsx` 仅有纯色背景 `0x14171c` + 环境光/双方向光 +
   网格/骨骼/播放开关 + 面数 HUD，缺线框、渐变背景、HDR/IBL、地面投影、环境背景开关。
3. **Provider 参数是最小公共集**。UI（`SetupSidebar.tsx`）只暴露 provider/模式/槽/
   prompt-图-视图/姿态/面数档/PBR；各家实际可调参数（尤其 Meshy）远不止于此。

目标：把评分器落地为**按需混合评分**、把视图器升级到接近 DCC（Maya/Blender）实时预览观感、
把各 provider 的专属参数**先成文档、再以小型 param-spec 暴露高价值子集**。

## 2. 决策摘要（operator 已拍板，勿重新 litigate）

| # | 决策点 | 选择 |
|---|---|---|
| D1 | 推进方式 | **一份统一 spec**，三块解耦、可分期 |
| D2 | 评分形态 | **混合**：客观项自动算 + 可选 AI 视觉评 + 人工可覆盖 |
| D3 | 评分刻度 | **内部 0–100**，UI 可折算 5 星显示 |
| D4 | 评分 AI 接线 | **本期只交付 mock 桩**（`gen3d:score-quality` 的 `aiPass` 返回 `usedMock` + 两维 null）；真实接线（授权 server 路由 + 网关多模态 + vision 模型）**推迟**，operator 暂不授权 server |
| D5 | HDR 来源 | three 内置 `RoomEnvironment` 作默认 + operator 提供的少量 **1k `.hdr` 懒加载** |
| D6 | 视图器观感 | 切 **ACESFilmicToneMapping** + **默认开地面投影**（最像 DCC 实时渲染） |
| D7 | Provider 参数 | **先 `docs/PROVIDER_PARAMS.md`，再小型 param-spec 暴露各家高价值子集**；只暴露已验证参数 |
| D8 | 评分立场 | 新增 **ADR-0004**，把 ADR-0001 的"不评分"演进为"按需混合评分"，并在本 spec 引用 |
| D9 | 视图器默认观感 | **默认 = mockup B（影棚 HDRI / Material-Preview）**；A（实色渐变 / Solid）、C（HDR 环境作背景 / Rendered）作切换态；视觉基调按 mockup（深色 + 柠檬绿 chrome + `渲染设置` popover） |

## 3. 设计原则与约束

- **解耦优先**：三块各自的纯逻辑放 `shared/`（可单测、无 DOM/网络），编排放 `server/`，渲染放 `src/`。
- **配额安全/mock-first**：评分 AI 环节缺模型配置时回退 mock（返回 null + `usedMock`），与现有 provider 一致。
- **只暴露已验证**：provider 专属参数遵循 `CAPABILITY_MATRIX` 铁律，未验证字段不进 UI/AI schema。
- **dist 铁律**：改 `src/**` 后必须 `bun run build` 重建 `dist/` 再硬刷新 Workbench（HANDOFF 2026-06-13 踩坑）。
- **生成纯净**：评分**不在生成时触发**（保持生成路径无副作用），改为选中资产时按需计算并持久化。

---

## 4. Workstream A — 视图器渲染增强

### A.0 模块化拆分（前置重构）

当前 `ModelViewer.tsx` ~377 行单文件，叠加五项会膨胀到 700+ 行。先拆为 `src/components/viewer/`：

| 模块 | 职责 |
|---|---|
| `viewer/scene.ts` | renderer / 相机 / OrbitControls / RAF 生命周期 / resize / dispose（现有逻辑迁入） |
| `viewer/environment.ts` | IBL（RoomEnvironment / HDR PMREM）、渐变背景纹理、背景三态、亮度/环境强度 |
| `viewer/shadows.ts` | shadowMap 配置 + key 光 castShadow + `ShadowMaterial` 地面 |
| `viewer/wireframe.ts` | 线框三态（实体 / 线框 / 实体+线框）应用与还原 |
| `viewer/capture.ts` | 离屏多角度截图（供 §5 AI 评分复用） |
| `ModelViewer.tsx` | React 壳 + 控件 + 状态，仅编排上述模块 |

约束：拆分**不改变**现有"脚底锚定 y=0 / 相机 framing 缓存 / 动作 GLB 切换 teardown-reload / WebGL context 泄漏防护"等已验证行为，仅搬运 + 抽接口。拆分本身需 typecheck/build + 视觉回归通过后再叠加新功能。

### A.1 渐变背景（新默认）+ 背景三态

- 用 `CanvasTexture`（竖向渐变，Maya 风：中部偏亮、上下渐暗，取 `tokens.css` 的中性色域）设为 `scene.background`，而非纯 CSS 背景——保证离屏截图（§5）与画面一致。
- **背景三态**：`渐变`（默认） / `纯色`（保留旧 `0x14171c` 作为可选） / `HDR 环境`（见 A.5）。三态 × IBL 强度组合出 D9 的三个观感预设：A 实色(Solid) / **B 影棚(默认)** / C 环境(Rendered)。
- 渐变作为 `scene.background` 与 `renderer.alpha:true` 兼容；HDR 态时切换为环境贴图。

### A.2 HDR / IBL + 亮度

- **默认 IBL**：three 内置 `RoomEnvironment` → `PMREMGenerator.fromScene()` → `scene.environment`，零文件即得中性影棚反射/环境光，显著改善 PBR 观感。
- **HDR 预设**：operator 提供的 `.hdr`（建议 1k）放 `public/hdr/`（vite 会拷进 `dist/` 根，经插件 same-origin 静态路由送达）；**选中某预设时才 `RGBELoader` 懒加载**并 PMREM 处理，不预载全部，控制 dist 体积与首屏。
  - 预设清单以 `viewer/environment.ts` 内的 `HDR_PRESETS: { id, label, file }[]` 声明；`builtin-neutral`（RoomEnvironment，无文件）恒在列首作默认。
- **亮度**：切 `renderer.toneMapping = ACESFilmicToneMapping`（D6），曝光滑块绑 `renderer.toneMappingExposure`（默认 1.0，范围 0.2–3.0）。
- **环境强度**（可选独立旋钮）：`scene.environmentIntensity`（默认 1.0）控制 IBL 强度，与曝光区分。
- ⚠️ **观感变更**：切 ACES 会改变现有画面（更"摄影"化），属预期；拆分后第一步先单独验证 ACES + 默认 RoomEnvironment 下既有 mock/real 资产观感可接受，再叠加其余。

### A.3 地面投影（默认开，D6）

- `renderer.shadowMap.enabled = true`，`type = PCFSoftShadowMap`。
- key 方向光（现 `(3,5,4)`）`castShadow=true`，`shadow.camera` 视锥按模型包围盒动态收紧（避免阴影模糊/缺失）；模型 `castShadow`。
- y=0 处加一张 `ShadowMaterial`（透明、仅接收阴影）地面，与现有"脚底锚定 y=0"和网格地面共面协调（网格在上、阴影面在下，避免 z-fighting）。
- 开关：`地面投影` toggle（默认 on）。后续可升级为接触软阴影（render-target 模糊投影），本轮不做。

### A.4 线框

- 分段控件三态：`实体` / `线框` / `实体+线框`。
  - `线框` = 遍历材质设 `wireframe=true`（缓存原值以还原）。
  - `实体+线框` = 在 shaded 模型上叠 `LineSegments(WireframeGeometry)`（DCC 风 shaded-wireframe），切走时 dispose 叠加层。
- 与 §A 其它 `.visible` 风格开关一致：切换不重建场景。

### A.5 控件布局 + 环境背景开关 + 持久化

- **环境背景开关**（"环境作背景"）：off → 背景用渐变/纯色但 `scene.environment` 仍提供 IBL（即 DCC"实时渲染但不显示环境球"）；on → `scene.background = 选中 HDR 的等距贴图`，可选 `scene.backgroundBlurriness`（默认 0.1）+ `scene.backgroundIntensity`。仅在选了非 builtin 的 HDR 预设时可开。
- **布局**：快速开关（网格 / 骨骼 / 播放 / 线框）保留 inline 工具条；新增重控件（HDR 预设下拉 / 曝光滑块 / 环境强度 / 地面投影 / 环境背景）收进一个 `渲染设置` popover，避免工具条溢出。
- **持久化**：渲染设置（曝光、预设、阴影、背景模式、线框态）存 `localStorage`（按插件维度，跨资产/会话记忆）；动作切换 / 资产切换不重置用户偏好。
- 视觉细节（渐变配色、popover 版式）属真正的视觉问题——可在实现前用静态 mockup 定稿（见 §13）。

---

## 5. Workstream B — 五维质量评分（按需混合）

### B.1 数据模型（详见 §7）

- 保留 `QualityScore` 数值字段作**跨插件契约**（向后兼容）。
- 新增富结构 `QualityReport` 持久化到 sidecar `custom.quality`：每维 `{ value: 0–100 | null, source: 'auto'|'ai'|'manual' }` + `total` + `method` + `rater` + `notes` + `scoredAt`（对齐 `CAPABILITY_MATRIX` 的 rater/timestamp/notes 要求）。

### B.2 客观自动项（Phase A — 无 LLM，客户端从已加载 three 场景计算）

复用 `ModelViewer` 已有的 `model.traverse` 统计（面/顶点/skeleton），扩展为评分输入；纯函数放 `shared/quality/heuristics.ts`，可单测。刻度 0–100。

| 维度 | 计算 | null 条件 | 备注 |
|---|---|---|---|
| `geometry` | 100 起扣分：退化/零面积三角占比、离散碎块数（超期望）、法线缺失/无效、包围盒比例异常 | 无（恒可算） | 阈值在 `heuristics.ts` 常量集中声明 |
| `topology` | 面数对目标预算贴合度 `100*(1-clamp(\|actual-target\|/target,0,1))` × 密度均匀度 | 无 | ⚠️ **GLB 恒三角化，四边/三角拓扑信息已丢**；只能"预算+密度"+引用生成时请求的 `topology` 参数，文档诚实标注局限 |
| `pbr` | baseColor/metallicRoughness/normal/occlusion 贴图存在性加权 + 取值范围有效性；emissive 加分 | `enablePbr=false` 或无 PBR 材质 | 从 glTF 材质introspection |
| `texture` | 贴图最大分辨率分档（≥2048 高）+ UV 集存在 + 贴图存在 | 无贴图/无 UV | "接缝/溢色"质量交 AI（B.3） |
| `prompt_fidelity` | 仅由 AI 评（B.3）填充 | 未跑 AI、或模式无 prompt/参考图 | 派生资产（refine/lowpoly）继承源资产 |

- `total` = 非 null 维度的加权平均（默认五维各 0.2，跳过 null 后重新归一）；权重在 `heuristics.ts` 可调。
- **时机**：选中资产时按需算客观项 → 经 `gen3d:score-quality` 持久化（首次算即落库，之后读缓存）。**不在生成时触发**。

### B.3 主观项（Phase B — AI/VLM，复用 Studio 模型，D4）

> ⏸ **本期只交付 mock 桩**：`aiPass:true` 直接返回 `usedMock:true` + `prompt_fidelity`/`texture` 两维 null（不报错、不触网）。下方真实链路（取图 → server 路由 → 网关多模态 → JSON）为 P4 推迟项的设计，等 §8 授权后实现。`viewer/capture.ts` 取图工具可随 P1 先落（mock 桩也用它生成预览缩图）。

- **取图**：`viewer/capture.ts` 用现有 renderer 离屏渲染 N 个角度（默认 4：前/右/后/俯）→ `toDataURL()`，复用视图器，无需服务端 glTF 渲染。**这是三条工作流之间唯一的耦合点**：B 的 Phase B 复用 A 的截图工具（其余 A/B/C 完全解耦）。该工具体量小，可随 P1 落地，或在未做 P1 时以最小独立实现先行。
- **调用链**：前端 `gen3d:score-quality { assetPath, images[], aiPass:true }` → 插件 server tool → **授权 server 路由 `POST /api/gen3d-score/vision`**（§8）→ `llm-gateway`（多模态 `content:[{type:text},{type:image_url}]`，选 vision-capable 模型）→ 严格 JSON 回包 `{ prompt_fidelity, texture, notes }`。
- **mock-first**：`LITELLM_PROXY_*` 未配置 / 路由不可用 → 返回 `usedMock:true` + 该两维 null，不报错。
- **产物**：`prompt_fidelity` 与 `texture`（覆盖客观 texture 或与之并存，取 AI 值并标 `source:'ai'`）+ `notes` 写入 `QualityReport`。
- prompt 取 `manifest.prompt`（text 模式）或标注"图生/多视图，无文本 prompt，仅评观感"。

### B.4 人工覆盖 + provenance

- UI 可手动改任意维 + 写 notes；被改维 `source:'manual'`，`rater` 记当前 operator 标识（先用固定 `local` 占位，后续接 Studio 用户态）。
- `method` 记录该报告综合来源（`auto` / `auto+ai` / `manual` / 混合）。

### B.5 UI — `QualityInspector`（取代 `InspectorReserved`）

- 五维进度条（0–100，可切 5 星显示），每维带 `source` 徽标（自动/AI/手动）。
- 操作：`计算客观项`（即时）、`AI 评分`（触发 Phase B，显示 mock/real 徽标 + 配额提示）、`手动` 编辑、notes 文本域。
- 空/禁用态：未选资产、AI 未配置（回退说明）、派生资产继承说明。

### B.6 工具 `gen3d:score-quality`

- 入参：`{ slug, assetPath, objective?: ObjectiveMetrics, images?: string[], aiPass?: boolean, manual?: Partial<QualityReport> }`。
- 行为：合并客观/AI/人工三来源 → 写 sidecar `custom.quality` + 同步 `manifest.quality` 数值字段 → 返回更新后的 manifest。
- `exposedToAI: false`（初期），`confirm:false`；AI 环节 mock-first。
- schema：新增 `schemas/score-quality.args.json` / `.returns.json`，注册进 `forgeax-extension.json`。

---

## 6. Workstream C — Provider 专属参数（先文档 → 小型 param-spec）

### C.1 文档 SSOT — `docs/PROVIDER_PARAMS.md`（新建）

逐家列全参数：字段名 / 类型 / 取值范围 / 默认 / 适用模式 / 是否已验证 / 备注。**已成稿**（2026-06-14，据官方文档 + 竞品工具截图核对，见 `docs/PROVIDER_PARAMS.md`）。

### C.2 框架 — `shared/provider-params.ts`（新建）

```
type ParamField = {
  key: string; label: string;
  type: 'enum' | 'bool' | 'int' | 'text';
  options?: { value: string; label: string }[];   // enum
  min?: number; max?: number;                      // int
  default?: unknown; help?: string;
  appliesToModes: ('text'|'image'|'views'|'refine')[];
  verified: boolean;                               // 未验证 → 不渲染/不进 schema
};
const providerParamSpec: Record<GenProvider, ParamField[]>;
```

同一 spec 驱动四处：① `SetupSidebar` 新增"高级参数（provider 专属）"折叠区动态渲染；
② 工具 args 透传（`BaseGenArgs` 增 `providerParams?: Record<string,unknown>`）；
③ JSON schema 生成/校验；④ `providers/*.ts` 的 `buildPayload` 读取并下发。

### C.3 高价值子集（已据官方文档 + 竞品工具截图定稿，详见 `docs/PROVIDER_PARAMS.md`）

> 仅暴露官方文档已验证的原生参数；竞品有但文档查无对应字段者标 ⏳ 不接（见 PROVIDER_PARAMS §6）。

| Provider | 拟暴露字段（verified） |
|---|---|
| **Meshy(meshy-6)** | `ai_model(5/6)`、`model_type(standard/lowpoly)`、`should_remesh`+`topology(triangle/quad)`、`target_polycount` 或 `decimation_mode(关/超高/高/中/低)`、`pose_mode(无/A/T)`（`enable_pbr` 已有） |
| **Rodin(Gen-2)** | `tier`/`quality`(档位)、`material(PBR/Shaded/All/None)`、`mesh_mode(Quad/Raw)`、`TAPose`、`geometry_file_format`、`quality_override`(自定义面数)、`use_original_alpha` |
| **Hunyuan workflow** | 维持 `FaceCount`/`EnablePBR`/8 视图槽/`enableFbxUrl`；`PolygonType`、`GenerateType` 列 ⏳（先验内网端点） |

- ❌ 已废弃删除：Meshy `art_style`、`symmetry_mode`、`negative_prompt`（文档确认 deprecated/无效）。
- ❌ 非 provider 字段（竞品后处理）：自动尺寸、原点位置——本期不做（Tripo 接入时可直连其原生 `auto_size`/`pivot_to_center_bottom`）。
- 现有共享参数（provider/模式/槽/面数档/PBR/姿态）不动；专属参数**附加**在折叠区，默认收起。
- 切 provider 时按 `appliesToModes` + `verified` 过滤可见字段；未验证字段保持 hidden。

### C.4 与 A/B 无耦合

参数框架只影响生成入参链路，不触达视图器/评分。

---

## 7. 数据模型变更（共享）

`shared/manifest.ts`：

```
// 新增（持久化进 sidecar custom.quality；不破坏跨插件契约的数值 QualityScore）
type QualityDimSource = 'auto' | 'ai' | 'manual';
interface QualityDim { value: number | null; source: QualityDimSource; }
interface QualityReport {
  geometry: QualityDim; topology: QualityDim; texture: QualityDim;
  pbr: QualityDim; prompt_fidelity: QualityDim;
  total: number | null;
  method: 'auto' | 'auto+ai' | 'manual' | 'mixed';
  rater: string; notes: string; scoredAt: string;
}
```

- `Gen3DAssetManifest.quality`（现 `QualityScore` 数值）保留并由 `QualityReport` 同步派生（取每维 `value`）。
- `AssetSidecar.custom` 增 `quality?: QualityReport`；`sidecarToManifest` / `appendDerivedFiles` 读写需带上。
- `emptyQuality()` 旁新增 `emptyQualityReport()`。

## 8. 边界与授权（唯一插件外改动 — ⏸ 本期推迟）

> ⏸ **operator 暂不授权动 `packages/server`**（D4）。本期 Phase B 仅交付 mock 桩，**不**新增任何 server 路由、**不**改 `llm-gateway`。本节为后续单独授权时的实现参照。
> 另注（调研发现）：现 `llm-gateway` 为**纯文本**（`ChatMessage.content: string`，见 `packages/server/src/lib/llm-gateway/transports/litellm.ts`），真实视觉评分需扩展网关支持多模态 `content[]`，或路由直连 LiteLLM 代理 `/chat/completions`——届时一并纳入授权范围。

唯一触达插件外的是评分 AI 路由（D4 复用 Studio 模型）：

- **新增**：`packages/server/src/main.ts` 挂载 `POST /api/gen3d-score/vision`（或独立 router），入参 `{ slug, images: string[](base64/dataURL), prompt, mode }`，包 `llm-gateway.complete()` 多模态调用，返回 `{ ok, prompt_fidelity, texture, notes, usedMock }`；校验 safe-slug、图片数量/大小上限，model 走 env（`LITELLM_PROXY_*` 缺失 → `usedMock`）。
- 与既有授权例外（`/api/game-assets/:slug/*`、`/api/gen3d-blobs/*`）同级，read-mostly、范围受限。
- **实现细节待定（impl-plan 阶段确认）**：插件 server tool 触达该能力的机制（专用 HTTP 路由 vs 服务端向插件 tool 注入 LLM capability）取决于 Studio 如何加载/上下文化插件 backend；本 spec 推荐**专用授权路由**以保边界清晰。
- ⚠️ 此项需 operator 明确授权后再动 `packages/server`（工作区规则）。

## 9. 文件触达清单

| 区 | 新增 | 修改 |
|---|---|---|
| A 视图器 | `src/components/viewer/{scene,environment,shadows,wireframe,capture}.ts`、`public/hdr/*`(operator) | `src/components/ModelViewer.tsx`、`src/styles.css` |
| B 评分 | `shared/quality/heuristics.ts`、`src/components/QualityInspector.tsx`、`schemas/score-quality.{args,returns}.json` | `shared/manifest.ts`、`src/components/AssetLibrary.tsx`(移除 InspectorReserved)、`src/App.tsx`、`src/types.ts`、`server/tool-handlers.ts`、`server/per-game-store.ts`(sidecar quality)、`forgeax-extension.json` |
| C 参数 | `docs/PROVIDER_PARAMS.md`、`shared/provider-params.ts` | `src/ui-meta.ts`、`src/components/SetupSidebar.tsx`、`src/types.ts`、`server/tool-handlers.ts`、`server/providers/*.ts`、`schemas/{text,image,views}-to-3d.args.json`、`docs/CAPABILITY_MATRIX.md` |
| 文档 | `docs/adr/0004-on-demand-hybrid-quality-scoring.md` | `HANDOFF.md`、`CONTEXT.md`（术语：QualityReport / 渲染设置） |
| 边界 | — | `packages/server/src/main.ts`（§8，需授权） |

## 10. 分期与里程碑（一 spec，分期落地）

| 期 | 内容 | 阻塞 |
|---|---|---|
| **P1** | A.0 视图器模块化拆分（行为不变，回归通过） | 无 |
| **P2** | A.1–A.5 渐变/HDR/ACES/投影/线框/popover/持久化 | operator 的 `.hdr` 文件（缺则仅 builtin 可用） |
| **P3** | B 评分 Phase A（数据模型 + 客观启发式 + QualityInspector + `gen3d:score-quality` 持久化 + 人工覆盖）+ ADR-0004 | 无（纯插件内） |
| **P4（⏸ 推迟）** | B 评分 Phase B 真实 AI 视觉评 + §8 授权 server 路由 + 网关多模态 | ⏸ operator 暂不授权 server；本期 Phase B 仅 mock 桩交付（含 `viewer/capture.ts` 取图，real 调用回退 mock） |
| **P5** | C param-spec 框架 + 高价值子集进 UI（`PROVIDER_PARAMS.md` 已成稿） | 无（参数调研 ✅ 已定稿） |

并行性：P1→P2 一条线；P3（Phase A 客观+人工）独立、不依赖 P1/P2；P5 独立。唯一跨线依赖是
**P4 复用 P1 的 `viewer/capture.ts`**（见 B.3）——若要早于 P1 做 P4，则先补一个最小截图工具。

## 11. 验证策略

- **A**：每期 typecheck + `bun run build` + 视觉回归（standalone :15175 + Studio 内嵌硬刷新）；切 ACES/默认 RoomEnvironment 后对既有 mock/real 资产目视；阴影/HDR 懒加载/背景三态/线框三态逐项核对；确认 WebGL context 不泄漏（连续切多资产）。
- **B**：`heuristics.ts` 单测（构造退化网格/无 UV/无 PBR 等夹具断言分数）；`gen3d:score-quality` mock 全链（客观→持久化→读缓存→人工覆盖幂等）；Phase B 在 `LITELLM_PROXY_*` 配齐后跑一笔真机视觉评，校验 JSON 解析 + mock 回退。
- **C**：param-spec 驱动的 UI 随 provider/模式过滤正确；透传到各 `buildPayload` 的字段与文档一致；schema 校验拒绝未声明字段。

## 12. 风险与回退

| 风险 | 缓解 |
|---|---|
| ACES 改变既有观感、operator 不满意 | 曝光/环境强度可调；保留纯色背景态；不满意可回退默认 tone mapping（开关化） |
| HDR 懒加载体积/加载失败 | builtin RoomEnvironment 恒可用作回退；HDR 失败回退 builtin + toast |
| 阴影视锥/性能 | 视锥按 bbox 收紧；地面投影可关；单模型预览开销可控 |
| GLB 三角化致 topology 维信息缺失 | 文档诚实标注；该维以"预算+密度"为主，必要时引用生成参数 |
| 评分 AI 非确定性/配额 | mock-first + 人工可覆盖；`source` 标注来源；AI 为可选触发非默认 |
| param-spec 误暴露未验证参数 | `verified` 门控；未验证字段不渲染/不进 schema |
| 插件 backend 触达 server LLM 的机制不确定 | impl-plan 阶段先确认加载/上下文模型；P4 单独成期、不阻塞 P1–P3、P5 |

## 13. 开放项（落地前补齐）

1. **operator 固化 `.hdr` 预设文件**：占位目录已建 `public/hdr/`（README + `presets.json`，纳入 git、换机不丢）；
   待放真实 1k `.hdr` 并登记 `presets.json.custom[]`。缺则 P2 仅 builtin 中性环境。
2. ✅ **provider 参数**：`docs/PROVIDER_PARAMS.md` 成稿（官方文档 + 竞品工具截图），C.3 已定稿。
   剩余 ⏳（实现时再核）：Meshy 4K 纹理、Rodin 几何指令/纹理模式/HighPack/seed、混元 PolygonType/GenerateType（验内网端点）。
3. ✅ **视图器观感**：operator 选 **mix** → 默认 = mockup B（影棚 HDRI），A（实色/Solid）+ C（HDR 环境/Rendered）作切换态（见 D9）。三张 mockup 存档于 `docs/mockups/viewer-mockup-{a-solid,b-studio,c-hdri}.png`。
4. ⏸ **§8 server 授权**：operator 暂不授权 → Phase B 本期仅 mock 桩；真实 AI 接线推迟到后续单独授权。
5. ⏸ **Phase B vision 模型 id**：随 P4 推迟；届时定 env 名/默认值并确认代理端点收图能力。
