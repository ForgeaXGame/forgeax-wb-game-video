# wb-reel · 互动影游「节点自动生产线」实施方案（剧本 → 锚点 → 分镜 → 图像 → 视频）

日期：2026-06-16
模块：`forgeax-studio/packages/marketplace/extensions/wb-reel`
状态：**设计已定稿，待执行**（所有开放问题已拍板；按 P 阶段逐步实现，每阶段 TDD + rebuild dist）

---

## ★ START HERE · 给执行 Agent 的话（新会话先读这段）

**本文件路径**：`forgeax-studio/packages/marketplace/extensions/wb-reel/docs/superpowers/specs/2026-06-16-auto-film-production-pipeline.md`（你正在读的就是 plan）。

**任务一句话**：把 wb-reel 互动影游做成「节点自动生产线」——一个剧情树节点，按导演风格自动拆分镜 → 调锚点出关键帧 → 出视频（必要时一镜分多段拼接），全程对话窗口可见；同时保留用户逐节点手工打磨。

**当前进度**：
- ✅ **P0 已完成**：官方 `sd2-pe`（Seedance 2.0 提示词优化器）已从 `docs/SKILL.md` 移到
  `src/llm/skills/seedance2-prompt-optimizer.skill.md` 并在 `src/llm/skills/index.ts` 注册为
  `SKILLS.seedance2PromptOptimizer`。
- ✅ **P1 已完成**（2026-06-17）：
  - P1-A 统一锚点装配器 `buildSeedanceReferenceSet`（8/8 单测通过）。
  - P1-B 角色锚点改「大头照 + 全身照」双图：类型 + 生成管线 + store + UI + 测试全落地（详见下方 P1-B 已完成小节）。
  - P1-C 半脸打码（commit `0e99720`）：vendor `face_mosaic.py` + sidecar `service.py` + `faceMaskTool.ts` 已支持 `maskMode:'half'`（默认），写实角色上传前竖切码半张脸。
    > ⚠️ **已于 2026-06 移除（去 Python）**：`face_mosaic.py`（YOLOv8/torch）+ `server/face_mask/` sidecar 已删除（仓内本就无模型权重、长期透传）。`/__ce-api__/face-mask` 现为同进程透传；`faceMaskTool.ts` 接入点保留并优雅降级。需要真打码时实现纯 TS 服务并设 `FACE_MASK_SERVICE_URL`（详见 P1-C 小节末注）。
  - 收尾：`tsc -p tsconfig.build.json` 干净；相关 vitest 全过；`WB_REEL_PLUGIN_BUILD=1 npx vite build` 已重建 dist（dist mtime > src）。
- ✅ **P2 已完成**（2026-06-17）：sd2-pe 视频提示词合成器 `src/llm/forgeSeedanceVideoPrompt.ts` 落地（纯函数骨架 + LLM 润色降级）。
  路径 A/B 分流、零绝对秒数、一镜一运镜、`<主体N>@图片N` 绑定、兜底包（画质/稳定/字幕/水印）+ 多主体双胞胎兜底 + 非写实风格锚定、音频特殊符号；
  22 个 vitest 用例全过、`tsc -p tsconfig.build.json` 干净、dist 已重建（详见下方 P2 已完成小节）。
- ✅ **P2.5 已完成**（2026-06-17）：`forgePromptTrioForAct` 增强为唯一分镜引擎。
  `normalizeActTrioRaw` 新增「时长守恒」+「镜数配额」两条非阻塞校验；放开档位 / `continuityGroupId` / `sourceTextSpan` 经 `normalizeStoryboardShots` 已透传，`batch-prompt-trio.skill.md` 文案同步（§2 放开 1–60s + 两字段必填、§5 示例、§6 反例、self-check）；新增 5 个 vitest（共 25 过），827 llm 测试全过、tsc 干净、dist 已重建。
- ✅ **P2.6 已完成**（2026-06-17）：影视质感 + 防千篇一律（纯文案，零数据结构变更）。
  `styleBlockFor` 每风格挂「子风格档 + 禁套路」差异化护栏；`cinema-image-prompt.skill.md` 加 §8（含反例/自检）；`batch-prompt-trio.skill.md §1` 加质感锚定+差异化约束；`forgeSeedanceVideoPrompt` 的 `STYLE_ANCHORS`/`composeGuardrails` 挂差异化行，保证图→视频质感一致（详见下方 P2.6 已完成小节）。新增 3 个 vitest（共 830 过）、tsc 干净、dist 已重建。
- ✅ **P3-A / P3-B 已完成**（2026-06-17）：`modelCapabilities` 加 `seedance-2-0` / `seedance-2-0-fast` 条目 + `supportsReturnLastFrame`/`supportsVideoExtend` 能力位；新建纯函数时长结算器 `settleClipDuration.ts`（`settleClipDurationSec` / `planClipSegments`）。
- ✅ **P3-C 逻辑层已完成**（2026-06-17）：`forgeVideoPlan` 按能力位选结算器（2.0 走 `planClipSegments`、旧模型沿用 `splitDurationToSegments` 零回归）+ `decideExtendStrategy`（承接段→`'continuation'`）+ `composeContinuityDeclaration`（续接段提示词明确「连续镜头」）+ `VideoSegment.extendStrategy` 字段。**续接靠「我方自截尾帧 + 参考集 + 提示词声明」，不走原生视频延长，无方舟 endpoint 依赖**。
- ⏭ **P3-C provider/runner 层 + P3-D 待做**：runner 把续接段 `referenceImageUrls` 组装成 `[尾帧, 角色锚点, 场景图…]`（reference 模式 ≤9）——无外部依赖可直接做；P3-D 尾帧交互 UI（视频卡尾帧缩略图 + 「设为下一卡首帧」）。
- ✅ **分镜化生产线 + 多智能体协同 已完成**（2026-06-19，对应 spec 的 P4 总指挥 + P5 智能体拆分；详见下方《分镜化生产线 已交付》小节）：
  - **阶段A 分镜上轴**：新增宿主工具 `reel:generate-storyboard` + `/__reel__/storyboard-queue` 端点 + 浏览器消费 `src/forge/storyboardQueueTrigger.ts`（复用 `runActBatchUpgradeOnScenario` 拆镜写回 `scene.shots[]`）；新增纯函数 `assignShotTimecodes`（7 单测）按 `durationSec` 占比铺 `startMs/endMs`，时间轴出现 N 个分镜站位（关键帧缺失时显示 hatched 占位条）。
  - **阶段B 逐镜关键帧**：`reel:generate-keyframes` + `/__reel__/keyframe-queue` + `keyframeQueueTrigger.ts`，复用 `buildShotKeyframePrompt`/`pickPrimaryRefForShot` 逐镜出关键帧 → `setSceneShotKeyframe`（幂等跳过已生成镜），时间轴站位显示缩略图。
  - **阶段C 逐镜出片 + Player 切镜**：`reel:generate-video` 升级为 shot-aware（已分镜场经 `orchestrateVideos` 逐镜入生成队列、后台并发不挡剪辑、写 `shot.videoMediaRef`；未分镜回落整场一条）；`Player.tsx` 落地 `MultiShotLayer` 按 `shot.startMs/endMs` 切镜播放（主时钟仍是 elapsed，纯渲染选镜，向后兼容）。
  - **阶段D produceNode 总指挥（P4）**：`src/forge/produceNode.ts` 串 分镜→关键帧→视频（幂等 + `stages` + `force` + 节点级树状进度）+ `reel:produce-node` 工具 + `/__reel__/produce-node-queue`。
  - **阶段E 智能体拆分（P5）**：REIA = 总导演编排；新增 `agent-reel-storyboard` / `agent-reel-visual` / `agent-reel-video` 三个专业子智能体（各自 manifest/persona/AGENT.md + 工具归属），REIA 经 `delegate_to_subagent` 派单、`reel:get-scenario` 验收；`80-workbench-agents.md` 加「这三个只接 REIA 派单、不接用户」防误派。
  - 收尾：`tsc -p tsconfig.build.json` 干净；新增/相关 vitest 全过（仅 `src/media` 5 个磁盘水合历史失败与本任务无关）；`WB_REEL_PLUGIN_BUILD=1 npx vite build` 已重建 dist。
- ✅ 历史失败已清理：`skillHygiene.test.ts` 中 `characterVoiceCaster` / `sceneBgmComposer` 两个 skill 的相邻代码块空 fence 误判已修（块间补标签文字），154/154 绿。

**所有设计决策已拍板，无需再问用户即可执行**：
- 开放问题 #4 → 见 **P2.5**：保留 `forgePromptTrioForAct` 为唯一分镜引擎并借鉴 `forgeStoryboard` 增强。
- 质感/防千篇一律 → 见 **P2.6**：只改 skill/智能体提示词文案，不动数据结构。
- 时长 → Seedance 2.0 = **4–15 整数秒**（见 §0.2 与 P3）：ceil → 夹 [4,15]、min 4、宁多勿少。
- 打码 → 新增 **半脸模式**，仅写实触发（见 P1-C）。
- 锚点 → 角色用 **大头照+全身照**（禁三视图），④⑤ 共用同一套（见 P1）。

**动手前必读（按顺序）**：
1. 本 plan 全文（尤其 §0.1 现状表、§0.2 Seedance 2.0 规格、P1–P5）。
2. 仓库根 `AGENTS.md`（用户偏好 + 工程事实：端口、submodule 归属、插件 dist 陷阱）。
3. 关键源码（实现各 P 阶段时对应读）：
   - skill 加载器 `src/llm/skills/index.ts`、新 skill `src/llm/skills/seedance2-prompt-optimizer.skill.md`
   - 导演风格 `src/llm/directorPersonas.ts`；分镜 skill `src/llm/skills/storyboard-director.skill.md`
   - 分镜生成 `src/llm/forgeStoryboard.ts`、批量三件套 `src/llm/forgePromptTrioForAct.ts` + `skills/batch-prompt-trio.skill.md`
   - 模型能力 `src/llm/modelCapabilities.ts`（需加 `seedance-2-0`/`-fast` 条目）
   - 视频分段 `src/llm/forgeVideoPlan.ts`、`src/llm/videoPipelineRunner.ts`（`runVideoPlan` 当前未被调用，P3 接通）
   - 锚点 `src/llm/buildVideoReferenceSet.ts`；视觉风格 `src/llm/visualStylePresets.ts`
   - 打码 `src/llm/faceMaskTool.ts`（接入点；2026-06 起 `/__ce-api__/face-mask` 同进程透传，旧 Python sidecar/vendor 已删除）
   - 出视频 `src/forge/orchestrateVideos.ts`、`src/llm/VideoProvider.ts`/`HostGatewayVideoProvider.ts`
   - 3D 相机调度设计稿（展位参考来源）`docs/superpowers/specs/2026-06-16-3d-camera-blocking-design.md`

**工程纪律（来自 AGENTS.md，务必遵守）**：
- 插件 `embeddedAlso` 走 dist：改完 `src/` 必须 `WB_REEL_PLUGIN_BUILD=1 npx vite build` 重建 dist，
  并核对 `src` 最新 mtime > `dist/index.html` mtime，否则 APP 看不到新版本。
- 纯函数走 **TDD**（vitest）；import 浏览器管线模块的测试文件须加 `// @vitest-environment happy-dom`。
- 生产类型检查用 `tsc -p tsconfig.build.json`（test 文件的历史类型报错与本任务无关，勿误判）。
- 密钥/.env 严禁回显、提交、硬编码；只在主工程 `.env` 集中管理。
- 中文回复用户；动手前先理清计划再实施。

**每个 P 阶段交付即更新本文件**：把「待做」改「✅ 已完成」，并把实现期发现的细节（如 P1-B 勘查结论、新增数据字段）追加回对应小节，保持本文件是唯一事实源。

---

## 0. 背景：树状自动生产线的目标

上游已把剧本拆成**剧情树**。每个树节点（scene）有 background / prompts.scene / characterIds / locationId
等基础信息。用户可在任意节点手工打磨；但我们也要支持**一键自动出片**：

```
剧情树节点(剧本/节拍)
  │ ① 锚定：导演风格 persona + 视觉风格 visualStyle
  ▼
② 节点导演决策：场景编排 / 相机调度 / 分镜指导（镜数由 时长×导演节奏 决定）
  │   一镜到底(villeneuve) · 快切(miller/fincher) · 细腻(wong-karwai) —— 拆法因导演而异
  ▼
③ 拆出 N 个镜头（分镜提示词）
  ▼
④ 每镜头调用 场景/角色/道具锚点 + 场景参考 + 展位(blockout)参考 → 生成关键帧图像
  ▼
⑤ 关键帧 + 运镜提示词 + 同一套锚点 → 生成视频（>15s 自动分段 / 原生延长 → 拼接）
  ▼
全程进度在对话窗口可见（不再后台黑盒）
```

### 0.1 当前代码现状（调研结论）

| 工序 | 现有零件 | 状态 |
|---|---|---|
| ① 导演/视觉风格 | `directorPersonas.ts`（7 流派+custom，4 段式）、`style-curator` skill | ✅ 完整 |
| ② 镜数/节奏 | `computeShotQuota`（时长→2/3/5/7/9，夹 4-10）、`clampShotCount` | ✅ 逻辑在 |
| ③ 按导演风格拆镜 | `forgeStoryboard` + `storyboard-director` skill（已注入 persona） | ⚠️ **生产从不调用** `forgeStoryboard()`；只复用了 `normalizeStoryboardShots`。实际走 `forgePromptTrioForAct` 批量三件套 |
| ④ 锚点→关键帧 | `cinema-image-prompt`、`buildVideoReferenceSet` | ✅ 接了 |
| ⑤ 视频提示词 | `cinema-video-prompt`（**带绝对秒数**）、`kinetic-video-prompt` | ⚠️ 接了但语法与 sd2-pe 冲突 |
| ⑤b 一镜分段拼接 | `forgeVideoPlan` / `runVideoPlan`、`splitDurationToSegments` | ❌ **`runVideoPlan()` 从不调用** |
| ⑤c 出视频 | `orchestrateVideos`、`VideoProvider`、`maskSeedanceContentInput` | ✅ 接了 |
| 进度可见 | 各函数有 `onProgress` 回调 | ⚠️ 没汇到对话窗口 |
| 锚点格式 | 角色 = **三视图/转身图** | ❌ sd2-pe 禁用三视图 |
| 打码 | sidecar `mode='mosaic'` 全脸；`grid` 四宫格存在但未用 | ⚠️ 需新增「半脸」模式 |

**结论**：树的零件齐全，但缺一根「节点总指挥」总线把 ②→⑤ 串成**可见、可重跑、可逐段覆盖**的自动生产；且两个「导演风格落地」零件（persona 分镜、分段延长）是断的；锚点格式与打码方式需按 sd2-pe + 用户要求改造。

### 0.2 Seedance 2.0 规格（2026-06 调研，决定多处设计）

来源：火山方舟 / API 文档 / 字节 Seed 官方。

- 模型：`doubao-seedance-2-0`（标准，时长 **4–15** 整数秒）、`doubao-seedance-2-0-fast`（4–12s）；`duration=-1` 自动；默认 5s；帧率固定 24fps。
- 分辨率 480p/720p/1080p（fast 无 1080p）；比例 7 种含 adaptive（默认 adaptive）。
- 多模态：**9 图 + 3 视频 + 3 音频**；图角色 `first_frame` / `last_frame` / `reference_image`。
- **`metadata.return_last_frame`：原生返回尾帧**。
- **原生视频延长**：用已生成视频作输入再请求额外时长（对应 sd2-pe「向后延长 @视频N」）。
- 人脸：Atlas Cloud 版放开真人脸，**即梦平台有限制**；经 litellm 网关仍按保守策略**保留打码**。

### 0.3 用户 5 项决策（已确认，贯穿全方案）

1. **④⑤ 共用同一套锚点**：场景/角色/道具锚点 + 场景参考 + 展位(blockout)参考。
2. **角色锚点改「参考图形式」**：按 sd2-pe 出**大头照 + 全身照**（替代三视图），**所有风格**都优化角色提示词，且**页面可见**；**写实风格**才走打码，打码改造为**「半脸」模式**（原图上只码半张脸，不切四宫格）。
3. **提示词不写秒数**：真实时长由发送层结算，**ceil → 夹 [4,15]、min 4、宁多勿少**。
4. **一镜到底接通 + 交互**：首段出片后提供「截取尾帧」按钮（优先用 Seedance 2.0 `return_last_frame`），尾帧可设为下一张视频卡首帧；有续拍提醒。
5. **手工/自动边界**：全部做完后，沉淀为 Agent + 子 Agent 描述与各自工具清单（P5）。

---

## P0 · sd2-pe skill 入库（✅ 已完成）

- `docs/SKILL.md` → `src/llm/skills/seedance2-prompt-optimizer.skill.md`（去掉 Cursor YAML frontmatter）。
- `src/llm/skills/index.ts` 注册 `SKILLS.seedance2PromptOptimizer`。
- 定位：`cinema-video-prompt` / `kinetic-video-prompt` 的 Seedance 2.0 升级规范。

---

## P1 · 锚点装配层 + 角色锚点（大头照+全身照）+ 打码「半脸」模式 ✅ 已完成

> 目标：让 ④⑤ 拿到**统一、合规、sd2-pe 友好**的锚点集；角色锚点由三视图升级为大头照+全身照并页面可见；写实人脸走半脸打码。

### P1-A 统一锚点装配器 `buildSeedanceReferenceSet`（纯函数，TDD）✅ 已完成

> 落地：`src/llm/buildSeedanceReferenceSet.ts` + `src/llm/__tests__/buildSeedanceReferenceSet.test.ts`，8 个用例（含排序前置、超 9 张截断、startEnd/multimodal 互斥、realisticFace、缺图告警、展位永为 reference_image）全部通过。

新文件：`src/llm/buildSeedanceReferenceSet.ts`
（与现有 `buildVideoReferenceSet.ts` 并存：前者产出 sd2-pe `@图片N/<主体N>` 契约，后者保留给旧路径，P2/P4 切换后旧者可逐步退役。）

数据结构：

```ts
export type AnchorKind = 'character' | 'location' | 'prop' | 'keyframe' | 'blockout'

export interface SeedanceRefImage {
  /** 上传顺序号，1 起；对应 sd2-pe 的 @图片N */
  ord: number
  /** mediaStore 图片 url（未打码的真图，打码在上传层做） */
  url: string
  kind: AnchorKind
  /** 主体标签：仅 character 有，对应 sd2-pe <主体N>（如「李建」） */
  subject?: string
  /** 角色锚点的细分用途，影响 sd2-pe 文案与排序（人脸最前） */
  charRole?: 'headshot' | 'fullbody'
  /** first/last/reference 角色（首尾帧模式 vs 多模态参考模式互斥，见 cap） */
  frameRole: 'first_frame' | 'last_frame' | 'reference_image'
  /** 该图是否为写实真人 → 上传层是否需要半脸打码 */
  realisticFace?: boolean
  label?: string
}

export interface SeedanceReferenceSet {
  images: SeedanceRefImage[]          // ≤ cap.maxRefImages（Seedance 2.0 = 9）
  /** 给提示词层的「主体定义」清单（sd2-pe 第一段用） */
  subjects: Array<{ subject: string; headshotOrd?: number; fullbodyOrd?: number }>
  droppedReasons: string[]            // 超限丢弃 / 缺图 等告警
}

export interface BuildSeedanceRefArgs {
  characters: Array<{ id: string; name: string; headshotMediaId?: string; fullbodyMediaId?: string; realistic?: boolean }>
  location?: { id: string; mediaId?: string }
  props?: Array<{ id: string; name: string; mediaId?: string }>
  keyframeMediaId?: string            // ④ 产出的关键帧（⑤ 用作 first_frame）
  blockoutStillMediaId?: string       // P5/3D 机位静帧（展位参考，软参考）
  mode: 'startEnd' | 'multimodal'     // 互斥：首尾帧 vs 多模态参考
  cap: ModelCapability                // 取 maxRefImages 等上限
  resolveUrl: (mediaId: string) => string | undefined
}
```

排序规则（sd2-pe「重要素材前置」）：人脸大头照 → 角色全身照 → 关键帧/首帧 → 场景 → 道具 → 展位静帧。超过 `cap.maxRefImages` 按此优先级截断并记 `droppedReasons`。

TDD 用例（`__tests__/buildSeedanceReferenceSet.test.ts`）：
1. 单角色 → headshot ord=1、fullbody ord=2、subjects 正确绑定。
2. 多角色去重 + 主体标签不冲突。
3. 图数超 9 → 按优先级截断、droppedReasons 非空。
4. `mode='startEnd'` → 关键帧落 first_frame；不混入多模态参考图。
5. `mode='multimodal'` → 全部 reference_image，含 location/prop/blockout。
6. 缺 mediaId 的锚点静默跳过、记告警。
7. `realistic` 角色 → 对应图 `realisticFace=true`（驱动上传层打码）。
8. blockout 静帧永远是 reference_image、绝不进 first_frame（防白模泄漏，沿用 3D 设计稿约束）。

### P1-B 角色锚点：大头照 + 全身照（全风格优化 + 页面可见）✅ 已完成

#### 现状勘查结论（2026-06-17）

- **生成入口**：`forgePasses.characterRefPass`（队列锻造 `forgeQueueTrigger.ts`、Chat 锻造 `ForgeChatPanel.tsx` 调用）与 `forgeImagePipeline.runForgeImagePipeline`（`ForgeWizard.tsx`、`PromptTabs.tsx` 调用）。两条路径**各对每个角色只生成一张三视图拼图**，prompt 来自 `buildCharacterTurnaroundPrompt`。
- **存储**：统一 `useMediaStore.ingestDataUrl(dataUrl, { promptKind:'character-ref' })`，scenario 侧写 `character.turnaroundRefImageId`（经 `scenarioStore.setCharacterTurnaroundRef`）。
- **展示位**：`ForgeWizard` 的 RefGrid「角色三视图」卡 + 点开的 `AssetPreviewDialog`。
- **写实判定**：原无统一函数；按 `visualStyle === 'photoreal'`（默认）语义为写实。
- **下游消费**：`buildSeedanceReferenceSet`（P1-A）已按 `headshotMediaId/fullbodyMediaId/realistic` 设计，但 `Character` 类型与生产侧此前尚无这些字段。

#### 实现清单（已落地）

1. **类型** `scenario/types.ts`：`Character` 新增 `headshotMediaId?` / `fullbodyMediaId?` / `realistic?`（保留 `turnaroundRefImageId` 作兼容兜底）。
2. **Prompt（纯函数，TDD）** `forgeImagePipeline.ts`：新增 `buildCharacterHeadshotPrompt`（仅头肩、正脸/微侧、干净背景、单格）、`buildCharacterFullbodyPrompt`（完整全身站姿 + 全套服化道、单格）、`isRealisticVisualStyle`（photoreal/undefined → 写实）。各风格走同一 `styleBlockFor`。
3. **生成管线**：`runForgeImagePipeline` 与 `characterRefPass` 改为**每角色生成 2 张**（大头照 + 全身照），新增回调 `onCharacterHeadshot` / `onCharacterFullbody`；旧 `onCharacterRef` 仍以大头照触发一次（兼容）；步数计 `characters.length * 2`。
4. **Store** `scenarioStore.ts`：新增 `setCharacterHeadshotRef`（写 headshot + 按 visualStyle 推断 realistic + 缺 turnaround 时兜底）/ `setCharacterFullbodyRef`（写 fullbody + 优先作 turnaround 兜底）。
5. **调用方接线**（4 处）：`ForgeWizard` / `PromptTabs` / `forgeQueueTrigger` / `ForgeChatPanel` 全部改用双回调 + 新 setter，ingest 时打 `tags:['headshot'|'fullbody']`。
6. **UI 展示**：`ForgeWizard` 把单个「角色三视图」RefGrid 拆为「角色大头照」+「角色全身照」两栏，分别读 `headshotMediaId` / `fullbodyMediaId`，缺图统计/重生筛选改为「任一缺失即待生成」。
7. **测试**：`forgeImagePipeline.test.ts` 新增大头照/全身照/写实判定/双回调调度用例，并把受影响的进度计数断言更新为 ×2；全套相关测试通过。

> 遗留（非阻塞，留待 P2/后续）：`AssetPreviewDialog` 的「重生成/替换」目前仍走 turnaround prompt（未按 headshot/fullbody 分流单独重生）；`buildVideoReferenceSet`(旧路径) 仍读 turnaround，待 P2/P4 切换到 `buildSeedanceReferenceSet` 后退役。

---

#### （原始设计，保留备查）调研待做：现有角色锚点生成入口（疑似 `forgeImagePipeline` / `batchImageGen` / 角色编辑面板），确认角色图当前如何生成、存哪个 mediaStore tag、页面在哪展示。

改动方向：
- 角色提示词层：在所有 visualStyle 预设下，为每个角色生成**两张**锚点：
  - **大头照**：仅头部、无夸张表情、正脸或微侧、干净背景（sd2-pe 人脸参考最佳实践）。
  - **全身照**：全身站姿、完整服化道（妆造参考）。
  - **不再生成三视图/转身图**作为 Seedance 锚点（三视图可保留给「角色设计」模块的外观确认，但**不进 Seedance 通道**）。
- 数据：`Character` 增 `headshotMediaId?` / `fullbodyMediaId?`（或在现有 anchor 结构上加 variant 标记）。`normalizeScenario` 同步兜底。
- UI：角色卡/锚点面板展示这两张图（用户可见、可重生成、可手动替换），明确标注「大头照 / 全身照」。
- 风格区分：写实风格的角色图标记 `realistic=true`（驱动上传层打码）；非写实（动漫/3D 国风等）`realistic=false`，跳过打码。

> 说明：本段涉及 UI 与现有角色管线，实现前会先开一节「现状勘查」补细节，避免方案落空。数据结构与 UI 变更点会在勘查后追加到本文件。

### P1-C 打码「半脸」模式（改造 vendor + sidecar + TS 接入）✅ 已完成（commit `0e99720`）

> 🛑 **本节已作废（2026-06 去 Python）**：下述 `face_mosaic.py`（YOLOv8/torch）与
> `server/face_mask/` Python sidecar **已删除**——它们不在工程允许的语言栈内，且仓内从未
> 入库模型权重（`face_yolov8n.pt` 被 gitignore、实际缺失），打码长期处于「透传」空转。
> 现行：宿主 `/__ce-api__/face-mask` **同进程透传**（默认不打码、不阻断生成），`faceMaskTool.ts`
> 接入点与「仅写实才打码」的 gate 仍在。若日后要恢复真打码，请实现**纯 TS** 的
> `POST /mask { image, mode?, halfSide? } → { success, image, faces }` 服务，并给宿主
> forgeax-server 设 `FACE_MASK_SERVICE_URL`，ce-api-shim 会自动反代（契约与旧 sidecar 一致）。
> 下文保留为历史设计记录。

> 落地：`face_mosaic.py` 新增半脸模式、`server/face_mask/service.py` 增 `mode`/`half_side` 透传、`src/llm/faceMaskTool.ts` 增 `maskMode:'half'`（默认）。仅写实角色（`realisticFace`）走打码，竖切码半张脸、保留另半做身份锚点；未就绪一律透传降级。模型权重 `face_yolov8n.pt` 已放回 `src/llm/faceMaskTool.vendor/`（`.pt` gitignore，不入库）。

现状（改造前）：`face_mosaic.py` 有 `mosaic`（全脸）/`grid`（四宫格，弃用）；sidecar `service.py` 只走全脸。

改动：
1. `faceMaskTool.vendor/face_mosaic.py`：新增 `half` 模式 / 新增 `apply_half_face_mosaic(img, box, ...)`：
   - 取检测人脸框，**竖切**（默认码右半：x 从 `(x1+x2)//2` 到 `x2`），只对该半区域 `apply_mosaic_cv2`。
   - 参数 `half_side: 'left'|'right'`（默认 right）。保留全脸/四宫格不动（向后兼容）。
   - **TDD**（python 端用现有测试方式或新增）：构造已知 bbox，断言「半区被改、另半与原图一致、框外完全一致」。
2. `server/face_mask/service.py`：`mask_image()` 增 `mode` 参数（`'mosaic'|'half'`，默认沿用 `'mosaic'`）；`do_POST` 透传 `req.get('mode')` 与 `half_side`。
3. `src/llm/faceMaskTool.ts`：
   - `FaceMaskContext` 增 `style?: 'realistic'|'stylized'` 或 `maskMode?: 'mosaic'|'half'`。
   - `applyFaceMask` POST body 带 `mode`。
   - **仅写实**才打码：`maskSeedanceContentInput` 依据每张图的 `realisticFace` 决定是否过打码（非写实直接透传）。需要从锚点集把 `realisticFace` 传到这里 —— 通过 `BuildSeedanceContentInput` 增字段或 ctx 携带。
4. 失败/未就绪一律**透传原图**（沿用现有熔断降级，绝不阻断生成）。

验收：写实角色上传 Seedance 的图，人脸**半张**被码、另半清晰；非写实图原样透传。

---

## P2 · sd2-pe 视频/图像提示词合成器（去绝对秒数）✅ 已完成（2026-06-17）

> 目标：把「分镜 + 锚点集」翻译成符合 sd2-pe 的工程化提示词；路径 A（单镜一段式）/ 路径 B（多镜三段论）；零绝对秒数。

### 落地结论（2026-06-17）

新文件 `src/llm/forgeSeedanceVideoPrompt.ts` + 测试 `src/llm/__tests__/forgeSeedanceVideoPrompt.test.ts`（22 用例全过）。

- **入口** `forgeSeedanceVideoPrompt(llm, args, opts)`：纯函数出骨架 → 喂 `serializePersonaToPrompt(persona)` + `SKILLS.seedance2PromptOptimizer` 让 LLM 润色合并 → 解析 JSON `{ prompt, disclosures? }`；**任何解析/调用异常一律降级回纯函数骨架**，绝不阻断生产。
- **纯函数（可断言、不打 LLM）**：
  - `decidePromptPath(shots)`：≥2 镜 → B，否则 A。
  - `composeSeedanceDraft(args)`：编辑/延长/组合任务**强制覆盖为路径 A**（单点操作）；多模态参考按镜数分流。产出 `{ prompt, path, disclosures }`。
  - `composeSubjectBindings(refSet)`：把 `refSet.subjects` 翻成 `<主体N>（name）的面部特征参考 @图片h（大头照），妆造参考 @图片f（全身照）`；并声明 `<场景1>`/`<道具N>`/展位静帧。
  - `composeShotBlock(shot, persona)`：单镜四要素「运镜 → 主体动作与表情 → 站位 → 音频」，`镜头N` 序号，**零秒数**。
  - `composeGuardrails(args)`：第三段约束包（画质/稳定/字幕/水印 默认必挂；多主体挂双胞胎兜底；非写实挂风格锚定）。
  - `pickCameraMove(shot, persona)`：从 `cameraHint` 关键词按固定优先级取**唯一**运镜 token（推/拉/摇/跟/升/固定），缺省回退 persona 默认 —— 落实「一镜一运镜」。
- **质感（P2.6 落点之一）**：`STYLE_ANCHORS` 按 `visualStyle` 给渲染质感短语 + 非写实风格锚定词，与出图质感一致。
- **音频特殊符号**：台词 `{}`、音效 `<>`（字幕 `【】`/BGM `（）` 预留给 LLM 润色挂载）。
- 验收：`tsc -p tsconfig.build.json` 干净；22 vitest 全过；`WB_REEL_PLUGIN_BUILD=1 npx vite build` 已重建 dist（dist mtime > src）。
- 遗留（非阻塞）：本模块尚未接进生产路径——`produceNode`（P4）会调用它；当前仅完成「单元可用 + 结构可断言」。

---

#### （原始设计，保留备查）

新文件：`src/llm/forgeSeedanceVideoPrompt.ts`，吃 `SKILLS.seedance2PromptOptimizer`。

```ts
export interface ForgeSeedancePromptArgs {
  shots: Shot[]                  // 本节点已拆的镜头（来自 P4 / forgeStoryboard）
  refSet: SeedanceReferenceSet   // P1 装配器产出
  persona: DirectorPersona       // 导演风格（运镜/剪辑/节奏）
  visualStyle?: VisualStyle
  taskType: 'multimodal' | 'edit' | 'extend' | 'compose'  // sd2-pe 任务分类
}
export interface ForgeSeedancePromptResult {
  prompt: string                 // 最终工程化提示词（无秒数，含 <主体N>/@图片N 绑定）
  path: 'A' | 'B'                // 单镜 or 三段论
  disclosures: string[]          // sd2-pe「优化问题」透明披露
}
```

规则要点（落实 sd2-pe）：
- 单镜或简单 → **路径 A** 一段式；≥2 镜影视化 → **路径 B** 三段论（总设定+主体定义 / 镜头分镜 / 风格+约束包）。
- 镜头用 `镜头1 / 镜头2`，**禁止 `0–3s` 绝对秒数**；秒数完全交给 P3 发送层。
- **一镜一运镜**：每镜只取 persona.cameraLanguage 里的一种运镜。
- 主体一律 `<主体N>@图片N` 绑定，禁裸 `[asset-xxx]`，禁 `@图片N` 紧接动词。
- 自动挂兜底包：画质 + 稳定 + 字幕兜底 + 水印/Logo；多主体挂双胞胎兜底；动漫风挂风格锚定。
- 音频/台词/字幕用 sd2-pe 特殊符号：`（BGM）` `<音效>` `{台词}` `【字幕】`。

纯函数拆分（便于 TDD，不打 LLM）：
- `composeSubjectBindings(refSet)` → 主体定义段文本。
- `composeShotBlock(shot, persona)` → 单镜分镜文本（运镜→动作→站位→音频四要素）。
- `composeGuardrails(args)` → 第三段约束包。
- `decidePromptPath(shots)` → 'A'|'B'。
LLM 调用只负责「润色 + 合并」，骨架由纯函数生成 → 可断言结构。

TDD：路径分流、无绝对秒数（正则断言）、一镜一运镜、主体绑定语法、兜底包齐全、多主体双胞胎兜底。

> 图像侧：`cinema-image-prompt` 基本可沿用（关键帧静图与 Seedance 语法无关），仅需让关键帧 prompt 也以同一套锚点的「主体外观」描述，保证 ④→⑤ 一致性。本期 P2 聚焦视频提示词，图像 prompt 不大改。

---

## P2.5 · `forgePromptTrioForAct` 增强（借鉴 `forgeStoryboard`，**唯一分镜引擎**）✅ 已完成（2026-06-17）

> 落地：代码侧只在 `normalizeActTrioRaw` 加了两条**非阻塞守恒校验**（时长守恒 + 镜数配额），
> 因为「放开时长档位 / `continuityGroupId` / `sourceTextSpan`」三项 `normalizeStoryboardShots` 早已支持
> （`clampDurationSec` 放开到 1–60、第 323/324 行读取两字段），仅需 skill 文案要求 LLM 填。
> `batch-prompt-trio.skill.md` 同步：§2 把 `durationSec ∈ {5,10}` 改为「1–60 整数秒、由 persona 节奏定档」+
> `continuityGroupId`/`sourceTextSpan` 列为必填；§5 输出契约示例补两字段 + 变档时长；§6 反例与 self-check 同步。
> 测试：`forgePromptTrioForAct.test.ts` 新增 5 个用例（时长守恒偏差 / 镜数配额偏离 / 合理不告警 / 30s 长镜不被夹 / 两字段保留），共 25 过；827 llm 测试全过；`tsc -p tsconfig.build.json` 干净；dist 已重建（mtime > src）。
> 遗留（非阻塞）：batch §3 的时间码 video 仍为「草稿/占位」，视频提示词权威产出由 P2 `forgeSeedanceVideoPrompt` 收口（P4 接通）。


> 决策（开放问题 #4 已拍板）：**保留 `forgePromptTrioForAct` 作为唯一分镜引擎**，把 `forgeStoryboard`
> 的优点吸收进来；不再维护两个并行的分镜生成器。`produceNode` 单节点生产 = 用「单 scene 的 act」
> 调用增强后的批量引擎。`forgeStoryboard` 本体保留（其 `normalizeStoryboardShots` 已被复用），
> 但生产路径统一收口到 batch。视频提示词唯一权威产出收口到 P2 `forgeSeedanceVideoPrompt`，
> batch §3 的时间码 video 降级为「草稿/占位」。

调研结论：`batch-prompt-trio.skill.md` 已相当深（§2 含 A/B 双帧 + 物理守恒 + 景别多样 + 相邻共享锚点；
§4 跨场一致性是其杀手锏）。仅需补齐 5 处差距：

### 改动清单

1. **放开时长档位**（skill §2 + §5 契约示例）：
   - 现：`durationSec 只能选 5 或 10`。
   - 改：放开到 **1–60 整数秒**，与 `clampDurationSec`（归一化层已是放开版）对齐；
     由 persona 节奏决定（一镜到底 → 长段；快切 → 1–4s 短段）。
   - self-check 第 5 条同步改（去掉「∈{5,10}」）。
2. **时长守恒校验**（`normalizeActTrioRaw`，借鉴 `forgeStoryboard` 第 188-193 行）：
   每个 scene `Σshot.durationSec` 与 `sceneDurationSec` 偏差 > 10s → push sceneWarning（不阻塞）。
3. **镜数配额校验**（`normalizeActTrioRaw`）：用 `computeShotQuota(sceneDurationSec)` 比对实际镜数，
   偏离过大（如 quota=7 实出 2）→ push sceneWarning。
4. **`continuityGroupId` 进契约**（skill §2 必填 + §5 示例 + self-check）：
   标记「属于同一连续动作/同一长镜的镜头组」。**这是 P3 一镜到底分段的依据**——
   同 group 的相邻镜 = 一个连续长镜，P3 据此决定哪些镜用原生延长连成一镜到底。
   `normalizeStoryboardShots` 已能读取该字段（第 324 行），仅需 skill 要求 LLM 填。
5. **`sourceTextSpan` 进契约**（skill §2 + §5）：标记本镜对应的原文片段（可审计、台词忠实）。
   `normalizeStoryboardShots` 已能读取（第 323 行）。

### TDD（`__tests__/forgePromptTrioForAct.test.ts` 增量）

- `normalizeActTrioRaw`：构造 Σdur 偏离 > 10s 的输入 → 断言 sceneWarning 含守恒提示。
- 构造镜数远离 quota 的输入 → 断言镜数配额 warning。
- 构造含 `continuityGroupId` / `sourceTextSpan` 的 shot → 断言归一化后保留。
- 构造 `durationSec=30`（长镜）的 shot → 断言不再被夹到 10（放开档位生效）。

> skill 文案改动不走 TS 单测，靠人工核对 + 实跑一次 batch 验证 JSON 结构不回归。

---

## P2.6 · 影视质感 + 防千篇一律（skill / 智能体提示词文案增强，**不改数据结构**）✅ 已完成（2026-06-17）

> 决策（已拍板）：质感词不进 `VISUAL_STYLE_PRESETS`，也不新增正交常量；**直接写进生成相关的
> skill 与智能体提示词**。目标：提质 + 避免雷同——「写实有写实的层次，卡通有精致与大众之分」。
> 作用范围：**出图（关键帧/角色/场景）+ 视频（sd2-pe 提示词）都挂载**，保证图→视频质感一致。

### ✅ 落地（2026-06-17）

- **角色/关键帧锚点质感源 `styleBlockFor`（`forgeImagePipeline.ts`）**：每个 visualStyle 在原质感词后
  追加共用「差异化护栏」`antiCliche(...)`——给出该风格大类下的子风格档（写实=纪实硬光/柔光人像/电影胶片；
  anime=精致电影级 2D/扁平 TV/厚涂；cartoon/pixelart/watercolor/ink 各自给子档），并明令「避免千篇一律的
  默认套路」。保留测试锁定关键词（photoreal 仍含 PBR/次表面散射/8k，anime 仍不含次表面散射）。
- **`cinema-image-prompt.skill.md`**：新增 §8「渲染质感锚定 + 同风格差异化」+ 反例 `cliche-photoreal`
  +自检项，要求按情绪锚定到具体一档、与角色锚点/关键帧出图质感一致。
- **`batch-prompt-trio.skill.md` §1（image）**：加「渲染质感锚定 + 同风格差异化」约束行，禁默认套路、
  要求同 Act 内出图与后续出视频质感语言一致。
- **`forgeSeedanceVideoPrompt.ts`**：`STYLE_ANCHORS` 的 tone 标注子风格档；`composeGuardrails` 对**所有**
  风格加一行「差异化：按情绪选质感层次、与出图质感一致、避免默认套路」（不触发写实「风格锚定」误判）。
- **测试**：forgeImagePipeline +2、forgeSeedanceVideoPrompt +1（共 830 全过）；tsc 0 错；dist 已重建。
- 说明：「差异化」的真正变体由 LLM 在 skill 引导下逐场景产出；确定性 prompt 构造器只负责挂「质感锚定 +
  禁套路」护栏（同一风格固定文案，跨角色/场景的差异来自各自的 core 描述与 LLM 改写）。

### 落点（在以下 skill / prompt 里加一段「质感与差异化」指导）

1. **角色锚点提示词**（P1-B，全风格优化时）：按 visualStyle 显式锚定渲染质感
   （写实摄影 / **三维渲染 CG / 3D 国风** / **二维赛璐珞质感** / 厚涂 / 水彩…），
   并要求**同风格内做出层次差异**（写实分纪实硬光/柔光人像/胶片；卡通分精致电影级 CG/大众扁平）。
2. **关键帧/场景图 skill**（`cinema-image-prompt.skill.md` + `batch-prompt-trio.skill.md` §1）：
   加「渲染质感锚定 + 差异化」要求，禁止默认套路化（如所有写实都「浅景深+8K」一个模子）。
3. **视频提示词**（P2 `forgeSeedanceVideoPrompt` 的 guardrail 段）：复用 sd2-pe 的「风格锚定」
   与「画质包」，并按 visualStyle 填入对应渲染质感词（2D 日漫 / 3D 国风 CG / 写实电影质感…），
   与出图所用质感词**保持一致**。

### 要点
- 只是**文案层**改动，零数据结构变更；nullable/向后兼容天然满足。
- 「差异化」靠 skill 里给**多档质感样例 + 反例（千篇一律）**引导 LLM，而非枚举常量。
- 不引入新的 visualStyle 枚举值（用户明确「不用搞太复杂」）。

---

## P3 · 时长结算 + 分段/原生延长 + 尾帧交互

> 目标：提示词不含秒数后，发送层自己定时长；超 15s 自动分段或原生延长；首段出片给尾帧。

### P3-A 模型能力：新增 Seedance 2.0 条目 ✅ 已完成（2026-06-17）

`src/llm/modelCapabilities.ts`：
- ✅ `VideoModelId` 增 `'seedance-2-0' | 'seedance-2-0-fast'`。
- ✅ 新增能力条目：
  - `seedance-2-0`：`maxSingleClipSec: 15`、`minUsefulClipSec: 4`、`durationRangeSec: [4,15]`、`maxRefImages: 9`、`maxRefVideos: 3`、`maxRefAudios: 3`、`supportsStartEndFrame: true`、`supportsGenerateAudio: true`、`supportsReturnLastFrame: true`、`supportsVideoExtend: true`、`asOf: '2026-06'`、notes 写明 return_last_frame + 原生延长 + 24fps。
  - `seedance-2-0-fast`：同上但 `maxSingleClipSec: 12`、无 1080p（480p/720p）。
- ✅ 能力位增（可选字段）：`supportsReturnLastFrame?`、`supportsVideoExtend?`。
- ✅ 测试：`modelCapabilities.test.ts` 加 3 个 it 锁定新条目；既有通用断言（min≤max / asOf 格式 / listCapabilities 长度）天然兼容。

### P3-B 时长结算器（纯函数，TDD）✅ 已完成（2026-06-17）

`src/llm/settleClipDuration.ts`（已落地，18 个 vitest 全过）：
- `clipFloorSec(cap)` = `durationRangeSec?.[0] ?? minUsefulClipSec ?? 4`。
- `settleClipDurationSec(needed, cap)` = ceil → 夹 [floor, max]，非法回退 floor。
- `planClipSegments(needed, cap)` = 超长均分到 [floor,max]、末段 <floor 并入前段、单段抬到 floor。
- 旧设计参考（已实现）：

```ts
/** 单段时长结算：ceil 到整数秒、夹到 [floor,max]、min 不低于 floor。宁多勿少。 */
export function settleClipDurationSec(neededSec: number, cap: ModelCapability): number
// floor = cap.durationRangeSec?.[0] ?? cap.minUsefulClipSec ?? 4
// = clamp(Math.ceil(neededSec), floor, cap.maxSingleClipSec)

/** 整镜（可能超 max）→ 分段秒数数组，每段已结算到 [floor,max] 整数秒。 */
export function planClipSegments(neededSec: number, cap: ModelCapability): number[]
// 复用/改造 splitDurationToSegments：floor 改 4、max 改 cap.maxSingleClipSec
```

TDD：
- `settleClipDurationSec(3.2, seedance2)` → 4（向上 + min floor）。
- `settleClipDurationSec(5, seedance2)` → 5。
- `settleClipDurationSec(15.9, seedance2)` → 15（夹上限）。
- `planClipSegments(30, seedance2)` → `[15,15]`；`planClipSegments(22, seedance2)` → `[11,11]`；`planClipSegments(6, seedance2)` → `[6]`；末段不留 <4s 尾巴。

### P3-C 接通分段 / 原生延长（一镜到底）

> **续接机制（已拍板）**：「一镜到底」**不走模型原生视频延长**（不回传上一段视频，
> 故与方舟 endpoint 是否支持视频续写**无关**）。做法是：**我方自截尾帧** →
> 把 `[上一段尾帧, 角色锚点, 场景图…]` 作多模态参考（reference 模式 ≤9 张）→
> **提示词里明确声明「这是同一连续镜头」**，把续接判断交给视频模型据参考帧自然完成。

**✅ 逻辑层已完成（2026-06-17）**：
- `forgeVideoPlan.buildSegmentsFromShots` 按能力位选结算器：Seedance 2.0 类（`supportsVideoExtend`
  标识）走 `planClipSegments`（P3-B，floor=4、宁多勿少），旧模型沿用 `splitDurationToSegments`
  （保留 1s 快切，零回归）。
- `decideExtendStrategy(startFrameStrategy)`：承接段（prev-segment-tail）→ `'continuation'`，
  其余 → `'standalone'`；`VideoSegment.extendStrategy?: 'continuation' | 'standalone'` 字段在拆段
  与跨 shot 承接时落定。
- `composeContinuityDeclaration()`：续接段提示词前缀，明确「连续镜头/同一镜头/不切镜/承接尾帧」，
  在 `fillKineticPrompts` 里对 `extendStrategy='continuation'` 段前置注入。
- 新增 6 个 vitest、tsc 干净。

**⏳ provider/runner 层待做**：续接段的视频请求把 `referenceImageUrls` 组装成
`[尾帧, 角色锚点, 场景图…]`（≤9 截断、reference 模式），即把 `resolveStartFrame` 的「单张起手图」
扩成「尾帧打头的参考序列」。**无外部 endpoint 依赖**，可直接做。

- 把 `runVideoPlan` / `forgeVideoPlan` 真正接进生产路径（P4 的 orchestrator 调用），或新建更直接的 `runShotVideo(shot, refSet, cap)`：
  - `planClipSegments` = 1 段 → 直接出。
  - 多段 → 首段正常生成（带 `return_last_frame:true`）；后续段用 **Seedance 2.0 原生延长**（把上一段视频 + 上一段尾帧作输入，prompt 用 sd2-pe「向后延长 @视频N」续写），最后拼接。
- 「一镜到底」= 单逻辑镜头跨多段连续延长；「快切」= 多个 ≤max 短镜头各自独立出。

### P3-D 尾帧交互（用户第 4 条）

- 视频卡：首段生成后，
  - **优先**用 `metadata.return_last_frame` 拿到的尾帧 → 存 mediaStore，显示「尾帧」缩略图。
  - 提供「**截取尾帧**」按钮（无 return_last_frame 时本地抽帧兜底）。
  - 提供「**设为下一卡首帧**」按钮 → 新建/填充下一张视频卡的 `first_frame`，并提示「已用作下一段首帧，可继续续拍」。
- 文案/提醒：当一镜被拆为多段时，UI 明确告知「本镜将分 N 段连续生成，自动用尾帧续接」。

---

## P4 · 节点生产总指挥 + 对话窗口进度

> 目标：一根总线把 ②→⑤ 串成可见、幂等、可逐段覆盖的自动生产；接通断掉的 `forgeStoryboard`(persona 分镜)。

### P4-A 节点状态机 `produceNode`

新文件：`src/forge/produceNode.ts`

```ts
export type NodeStageId = 'storyboard' | 'keyframes' | 'video'
export type StageStatus = 'idle' | 'running' | 'done' | 'error' | 'overridden'

export interface NodeProductionState {
  sceneId: string
  stages: Record<NodeStageId, { status: StageStatus; detail?: string; updatedAt: number }>
}

export interface ProduceNodeArgs {
  sceneId: string
  scenario: Scenario
  llm: TextClient
  onProgress: (ev: NodeProgressEvent) => void   // 汇到对话窗口
  signal?: AbortSignal
  /** 用户已手工打磨的阶段不被自动覆盖 */
  overrides?: Partial<Record<NodeStageId, boolean>>
}
```

流程（每阶段幂等、可单独重跑）：
1. **storyboard**：取 persona + visualStyle，调 **增强后的 `forgePromptTrioForAct`**（P2.5，用「单 scene 的 act」）→ 写回 `scene.shots` / `scene.prompts.scene`。
   - 镜数 = `computeShotQuota(sceneDurationSec)`，导演风格决定一镜到底 vs 快切（persona.editingGrammar 已表达）。
   - 整树自动铺底也走同一引擎（多 scene 的 act，享受 §4 跨场一致性）；单节点 = 1 scene。
   - `overrides.storyboard` 为 true（用户手工编辑过）→ 跳过。
2. **keyframes**：对每个 shot 用 P1 锚点集 + cinema-image-prompt 生成关键帧图。
3. **video**：对每个 shot 用 P2 提示词 + P3 时长结算/分段/延长 → 出视频。
4. 每步 `onProgress` 发**树状进度事件**（节点→阶段→镜头）。

### P4-B 对话窗口进度面板

- `NodeProgressEvent` 经 `crossPaneSync` / 现有对话流，渲染成「生产进度」时间线/树：
  - 节点级：`分镜(7镜) ✓ → 关键帧(5/7) ⏳ → 视频(0/7)`。
  - 可展开看每镜状态、失败重试、跳转打磨。
- 复用各 forge 函数已有的 `onProgress` 回调，统一映射到一种事件类型。

### P4-C 全树批量（可选，YAGNI 边界）

- 本期先做**单节点** `produceNode`（用户在树上对某节点点「自动生产」）。
- 全树批量（`produceTree`）复用 `concurrency.ts` 入队思路，留后续；先把单节点跑顺、进度可见。

---

## P5 · 沉淀 Agent / 子 Agent 描述与工具（用户第 5 条，最后做）

全部跑通后，把上述能力沉淀为 Reel Agent 的工具调用入口，并写清楚描述：

- **导演 Agent（总）**：输入 sceneId → 调 `produceNode`，按导演风格统筹全流程。
- 子 Agent / 工具（建议拆分）：
  - `tool.forgeStoryboard`（分镜导演，吃 persona）
  - `tool.generateKeyframes`（关键帧出图，吃锚点集）
  - `tool.forgeSeedanceVideoPrompt`（sd2-pe 提示词合成）
  - `tool.runShotVideo`（时长结算 + 分段/延长 + 出视频）
  - `tool.buildSeedanceReferenceSet`（锚点装配）
  - `tool.maskRealisticFace`（半脸打码，写实专用）
- 产出：每个 Agent/工具的 name / description / 入参 schema / 何时调用，落到本仓 agent 配置（具体文件实现期定）。

---

## 实现顺序与验证

```
P0 ✅ → P1(锚点装配 + 角色大头照/全身照 + 半脸打码) → P2(sd2-pe 提示词) →
P3(时长结算 + 分段/延长 + 尾帧) → P4(总指挥 + 进度可见) → P5(Agent 描述)
```

每阶段：
- 纯函数 **TDD**（vitest；浏览器管线模块加 `// @vitest-environment happy-dom`）。
- 生产类型检查 `tsc -p tsconfig.build.json`。
- 插件 `embeddedAlso` 走 dist：改完 `WB_REEL_PLUGIN_BUILD=1 npx vite build` 重建 dist，核对 `src` mtime > `dist/index.html`。
- ~~python 打码改动：跑一次 sidecar setup 并本地验证半脸输出。~~（2026-06 去 Python：打码 sidecar 已移除，`/face-mask` 现为 TS 透传，无此步。）

## 风险 / 开放问题

1. **P1-B 角色锚点**涉及现有角色管线与 UI，实现前需「现状勘查」补细节（生成入口、存储 tag、展示位）。
2. **打码触发条件**：如何稳定判定一张图是否「写实真人」？方案：以 visualStyle/角色 `realistic` 标记为准（作者侧已知），不靠图像分类。
3. **首尾帧 vs 多模态参考互斥**：一镜到底用首尾帧续接 vs 多模态参考带 9 张锚点，二者互斥 → orchestrator 需按「是否需要锚点一致性」选模式（默认多模态参考保一致性；延长段用首帧+视频）。
4. ~~`forgeStoryboard` vs `forgePromptTrioForAct`~~ **已拍板（见 P2.5）**：保留 `forgePromptTrioForAct`
   为唯一分镜引擎并借鉴 `forgeStoryboard` 增强；单节点/整树均走它；视频提示词收口 P2。
5. **3D 相机调度（展位参考）**：blockout 静帧作为 P1 锚点集的 `blockout` 项已留接口，但 3D 编辑器本体是手工精修工具，不在自动线必经路径（opt-in）。
