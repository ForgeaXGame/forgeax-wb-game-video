# Reel-Studio 分镜管线说明

> **模型约束（硬规则）**
> - 图像：**Azure GPT-Image-2**（`GptImageProvider.ts`），仅此一家
> - 视频：**Seedance 2.0 · 豆包**（`VideoProvider.ts`），仅此一家
> - 视频默认档位：**1080p 横屏**（`seedanceResolution.DEFAULT_VIDEO_SIZE`）；真实档位由 `model` / endpoint 决定——想要 1080p 通常需要自建 endpoint（`ep-xxx`）
>
> 本文所有 size / 参数 / 能力位都以此为准。不要换成别的模型。

本文只讲四件事：

1. **图片/视频的规格、格式、大小**（喂给模型时到底传什么）
2. **整个管线的实现逻辑**（从一句话 idea 到成片的每一步在哪个文件）
3. **每一步对应的提示词逻辑**（哪份 skill、它里面写了什么、它决定了什么）
4. **关键参数一览**（温度、并发、max tokens、能力位）

---

## 一、图片 / 视频规格

### 1.1 静态图（GPT-Image-2 / 豆包 image2）

| 用途 | size | 比例 | 返回格式 | 回传字段 | 代码位置 |
|------|------|------|----------|----------|----------|
| 角色三视图 | `1024×1024` | 1:1 | `b64_json`（PNG base64） | `GptImageProvider.generate` → `{ base64, mimeType:'image/png', dataUrl }` | `forgeImagePipeline.ts:572` |
| 场所定版图（每场所 × 3 角度） | `1536×1024` | 3:2 近似 16:9 | 同上 | 同上 | `forgeImagePipeline.ts:588` |
| 分镜关键帧（single / A / B） | `1536×1024` | 3:2 近似 16:9 | 同上 | 同上 | `forgeImagePipeline.ts:652` |
| 场景封面（Pass 3 legacy） | `1536×1024` | 3:2 | 同上 | 同上 | `forgePasses.ts:225` |
| 单镜修改（shotRefine） | `1536×1024` | 3:2 | 同上 | 同上 | `forgeShotRefine.ts:101` |

**Provider 约束**（`GptImageProvider.ts`）：
- 只支持 `1024×1024 / 1024×1536 / 1536×1024` 三档（type `ImageClient.ImageRequest.size`）
- `response_format` 字段**不能传**（gpt-image-2 默认 b64_json，传了会 400 `unknown_parameter`）
- 每次 `n=1`，不批量生 grid
- 失败返回形如 `[EMPTY] no data` / `[HTTP 4xx]`，由 `retryPolicy` 处理重试

### 1.2 视频（Seedance 2.0 · 豆包）

> 当前工程**只用 Seedance 2.0**。`modelCapabilities.ts` 里虽登记了 sora/kling/veo/runway 的能力位骨架（留作未来接入的占位），但 **VideoProvider / settingsStore 只实例化 Seedance**，不走别的模型。

**真相订正**（2026-05 对齐火山方舟官方样例后）：Seedance 2.0 的 API 参数都走 **request body 顶层**，不是拼 prompt 尾的 CLI 风格。 `content[]` 数组里用 **`role` 标签**区分不同参考媒体（图/视频/音频）。

#### 1.2.1 请求 body 结构

```jsonc
POST ${apiBase}/contents/generations/tasks
Authorization: Bearer <api_key>
{
  "model":          "doubao-seedance-1-0-pro-250528"  或  "ep-xxxxxxxxxxxxxx-xxxxx",
  "content": [
    { "type": "text",      "text": "<prompt 原文>" },
    { "type": "image_url", "image_url": { "url": "https://…/a.jpg" }, "role": "reference_image" },  // 首帧 A（可选）
    { "type": "image_url", "image_url": { "url": "https://…/b.jpg" }, "role": "reference_image" },  // 尾帧 B（可选）
    { "type": "video_url", "video_url": { "url": "https://…/ref.mp4" }, "role": "reference_video" },// 运镜参考（可选）
    { "type": "audio_url", "audio_url": { "url": "https://…/bgm.mp3" }, "role": "reference_audio" } // BGM 参考（可选）
  ],
  "ratio":          "16:9" | "9:16" | "1:1",
  "duration":       5,                 // 秒，官方样例到 11s
  "generate_audio": true,              // 让模型直接出带音轨的视频
  "watermark":      false
}
```

**关键点**：
- **没有** `resolution` 这个 API 字段。档位（1080p/720p/480p）由 `model`——其实是 **endpoint 的注册配置**——决定。换档位 = 换 endpoint（`ep-xxx`）。
- `content` 里同一个 `role` 的多条按顺序解析：`reference_image` 第 1 张 = 首帧 A、第 2 张 = 尾帧 B（超过 2 张会被 Seedance 拒单）。
- `reference_video` / `reference_audio` 各最多 1 条。
- URL 字段**只接受公网 https/http**；`data:base64` / `file://` 会被 `buildSeedanceContent` 拦在 client 层并写 warning（API 若直接吃到会返 400）。

#### 1.2.2 规格与字段映射

| 维度 | 值 | 来源 |
|------|-----|------|
| `VideoSize` 档位（客户端表达） | `'1080p' / '1080p-portrait' / '720p' / '720p-portrait' / '720p-square' / '480p'` | `seedanceResolution.ts · VideoSize` |
| **默认** | **`1080p`（横屏 16:9 · 1920×1088）** | `seedanceResolution.DEFAULT_VIDEO_SIZE` + `settingsStore.DEFAULT.videoConfig.size` |
| 真实档位决策 | 由 `VideoConfig.model` / endpoint id 决定；`size` 字段**不**发给 API | `SeedanceProvider.createTask` |
| body.ratio | 从 `size` 推出的 16:9 / 9:16 / 1:1 | `resolveSeedanceResolution(size).ratio` |
| body.duration | `VideoRequest.durationSec ?? VideoConfig.durationSec ?? 5` | 同上 |
| body.generate_audio | `VideoRequest.generateAudio ?? VideoConfig.generateAudio ?? true` | 同上 |
| body.watermark | `VideoRequest.watermark ?? VideoConfig.watermark ?? false` | 同上 |
| 任务机制 | `POST /contents/generations/tasks` → `taskId` → 每 4s 轮询 → 6 分钟硬超时 | `VideoProvider.pollUntilDone` |
| 返回 | `{ url, durationSec, latencyMs, warnings? }` | `VideoResult` |
| 尾帧截取 | 浏览器 `<video crossorigin>` → `canvas.toDataURL('image/jpeg', 0.85)`；canvas 宽高优先 `video.videoWidth/videoHeight`，fallback 1280×720 | `videoPipelineRunner.ts` |

#### 1.2.3 档位 × 比例 实际像素（`seedanceResolution.PIXEL_TABLE`）

| tier \ ratio | 16:9 | 9:16 | 1:1 |
|------|------|------|-----|
| 1080p | **1920×1088** | 1088×1920 | 1440×1440 |
| 720p | 1280×720 | 720×1280 | 960×960 |
| 480p | 864×480 | 480×864 | 640×640 |

> 1088 是官方表里的实际高度（16 的倍数），不是 1080。

#### 1.2.4 旧像素字符串别名（持久化兼容）

`'1280x720' → 720p 16:9`、`'720x1280' → 720p-portrait 9:16`、`'1024x1024' → 720p-square 1:1`。已保存的 Scenario JSON 不需迁移；`resolveSeedanceResolution` 自动处理。

### 1.3 Seedance 2.0 能力位（`modelCapabilities.ts`，唯一在用）

| 项 | 值 | 说明 |
|------|-----|------|
| `maxSingleClipSec` | **10s** | 实测稳定上限；12s 档官方可用但画面易崩，不走 |
| `minUsefulClipSec` | **3s** | <3s 模型会忽略 prompt 里的运镜指令，但 Planner 允许（1-2s 快切由 skill 约束"动作第 X 秒完成"） |
| `supportsStartEndFrame` | ✅（v3.9 订正） | Seedance 2.0 的 `reference_image` 支持 2 张，语义上第 1=首帧 A、第 2=尾帧 B；见 `buildSeedanceContent` |
| `supportsImageToVideo` | ✅ | 主路径 |
| `supportsTextToVideo` | ✅ | 无参考图时走这条；纯文本也合法（官方样例即是） |
| `supportsReferenceVideo` | ✅（v3.9 新增） | `role: reference_video`，最多 1 段，用于镜头 / 动作参考 |
| `supportsReferenceAudio` | ✅（v3.9 新增） | `role: reference_audio`，最多 1 段，用于 BGM / 氛围参考 |
| `recommendedConcurrency` | **2** | Planner 并发上限 |
| `typicalJobLatencySec` | ~45s | 单任务排队+生成典型值 |

> `modelCapabilities.ts` 里同时登记了 sora / kling / veo / runway 的能力位骨架，**那是留给未来接入的占位**；当前 `VideoConfig.model` 只会是 Seedance，实例化的 VideoProvider 只实例化 Seedance 客户端。

**Planner 据此的行为**：
- `shot.durationSec > 10s` → 自动拆段（`splitDurationToSegments` 均匀就近，禁 <3s 尾巴段）
- `shot.keyframeStrategy='ab'` → Runner 走真 A/B 首尾帧：A 作 `reference_image` #1（首帧）、B 作 `reference_image` #2（尾帧）。

---

## 二、管线实现逻辑（6 个 Pass）

```
idea/script
   │
   ├─ Pass 1  剧本锻造          forgePasses.forgeScenarioFromIdea
   │                            forgePasses.forgeScenarioFromScript
   │                            skill: scenario-architect / script-structurer
   │                            产物: Scenario { characters, locations, scenes }
   │
   ├─ Pass 2  QTE 启发式增强    qteEnhancePass（启发式，不过 LLM）
   │
   ├─ Pass 3  角色 + 场所参考   forgeImagePipeline（character stage + location stage）
   │                            用 skill 生 prompt → 调 GptImage
   │                            产物: Character.turnaroundRefImageId
   │                                  Location.refImageId（× 3 角度）
   │
   ├─ Pass 4  分镜脚本           forgeStoryboard
   │                            skill: storyboard-director
   │                            输入: scene + persona + sceneDurationSec
   │                            产物: scene.shots[] （每 shot 含 A/B 策略 + prompt）
   │
   ├─ Pass 5  分镜关键帧         forgeImagePipeline（shot stage）
   │                            每 shot：
   │                              single → buildShotKeyframePrompt(frame=undefined) × 1
   │                              ab     → buildShotKeyframePrompt(frame='A') × 1
   │                                      + buildShotKeyframePrompt(frame='B') × 1
   │                            参考图注入: location.refImageId > character.turnaroundRefImageId
   │
   └─ Pass 6  视频编排           三层架构
              ├─ Planner   forgeVideoPlan
              │            · 纯函数 buildSegmentsFromShots 按能力位物理拆段
              │            · LLM decideContinuityGroups 打 continuityGroupId
              │            · 批量 forgeKineticVideoPrompt 填 segment.prompt
              │            产物: VideoPlan { segments[], modelId, warnings }
              │
              ├─ Scheduler videoSchedule.buildVideoDag
              │            · 纯函数：VideoPlan → VideoDag（waitFor 链 + 环检测）
              │            · layerizeDag 切波次（同组串行、跨组并行）
              │
              └─ Runner    videoPipelineRunner.runVideoPlan
                           · 按波次 runWithConcurrency
                           · resolveStartFrame:
                                shot-start-frame   → shot.startFrameMediaRef
                                shot-keyframe      → shot.keyframeMediaRef
                                prev-segment-tail  → extractTailFrame(前段 url)
                                text-only          → undefined
                           · videoClient.generate → SegmentRunResult[]
```

**数据写回**：Runner 只返回 `SegmentRunResult[]`，不动 store；调用方（UI 层）按 `continuityGroupId` 聚合，写 `shot.videoMediaRef`。

**审计**：每次 LLM 调用落 `llmAuditLog` 环缓冲（`__reel_audit_buffer__`，容量 200），DevTools 可 `readBrowserAuditBuffer()` 查。

---

## 三、关键文件索引

| Pass | 文件 | 职责 |
|------|------|------|
| 1 | `src/llm/forgePasses.ts` | idea → Scenario / script → Scenario |
| 2 | `src/scenario/qteEnhancePass.ts` | 1-2 场自动加 QTE |
| 3/5 | `src/llm/forgeImagePipeline.ts` | 三阶段（character / location / shot）并发生图 |
| 3/5 | `src/llm/GptImageProvider.ts` | Azure GPT-Image-2 HTTP 客户端 |
| 4 | `src/llm/forgeStoryboard.ts` | 单场景 → shots[]（含 A/B 决策、durationSec clamp 1-60） |
| 6 | `src/llm/modelCapabilities.ts` | 视频模型能力表（单一事实源） |
| 6 | `src/llm/forgeVideoPlan.ts` | Planner：物理拆段 + LLM continuity + kinetic prompt 批量 |
| 6 | `src/llm/forgeKineticVideo.ts` | 单段 kineticVideoPrompt 生成 |
| 6 | `src/llm/videoPlanTypes.ts` | VideoPlan / VideoSegment 类型契约 |
| 6 | `src/llm/videoSchedule.ts` | 纯函数 DAG 构建 + 波次切分 + 环检测 |
| 6 | `src/llm/videoPipelineRunner.ts` | DAG 执行 + 尾帧截取 |
| 6 | `src/llm/VideoProvider.ts` | Seedance HTTP 客户端（轮询模型） · 多模态参考 role 分发 |
| 6 | `src/llm/seedanceContent.ts` | `content[]` 构造纯函数（首/尾帧、参考视频、参考音频 + 协议防御） |
| 6 | `src/llm/seedanceResolution.ts` | 视频比例 & 像素表的唯一事实源（档位→ratio 映射 + tail-frame canvas 尺寸） |
| — | `src/llm/llmAuditLog.ts` | LLM 调用审计（浏览器环缓冲 + 未来落盘） |
| — | `src/llm/directorPersonas.ts` | 7 个预设导演 persona + custom |
| — | `src/llm/skills/` | 所有 system prompt 存这里（见第四章） |
| — | `src/llm/promptForge.ts` | 单镜 prompt / 视频 prompt / 对白锻造的轻量入口 |
| — | `src/llm/forgeShotRefine.ts` | 单镜"让她更靠近镜头"式改写 |

继续见第四、五章（提示词逻辑 + 参数表）。

---

## 四、提示词逻辑（每份 skill 决定了什么）

所有 system prompt 都落在 `src/llm/skills/*.skill.md`，被 `SKILLS` 对象以原文字符串导入。下面按 **Pass → Skill → 它决定了什么** 列出。

### 4.1 `scenario-architect.skill.md` —— Pass 1 剧本锻造（idea 模式）

- **调用者**：`forgePasses.forgeScenarioFromIdea`
- **输入**：用户一句话 idea + 可选偏好（角色数、场景数、风格 hint）
- **输出契约**：完整 Scenario JSON（characters / locations / scenes / 每 scene 含简要 prompts）
- **参数**：`temperature 0.85`, `maxTokens 7000`, `jsonMode: true`
- **核心规则**：
  - 必须产出一份**自洽世界观**（角色设定、场所地理、时间线不冲突）
  - 每个 character 有 `appearanceAnchor`（外观锚点，20–40 字），让后续三视图不飘
  - 每个 scene 给 `prompts.scene` / `prompts.background` 作为 Pass 4 的 hint（不是最终 prompt）

### 4.2 `script-structurer.skill.md` —— Pass 1 剧本锻造（script 模式）

- **调用者**：`forgePasses.forgeScenarioFromScript`
- **输入**：用户贴的完整剧本原文
- **输出契约**：与 architect 同形状（共用 `buildScenarioSchemaBlock`），但 **scenes[].sceneText 原文保留**
- **参数**：`temperature 0.3`（低温 · 结构化抽取不发散）, `maxTokens 7000`, `jsonMode: true`
- **宪法第一条**：**绝对忠于原文**——禁止补充 / 改写 / 压缩；hint.sceneCount 只作参考不作硬约束

### 4.3 `storyboard-director.skill.md` —— Pass 4 分镜脚本 ⭐

- **调用者**：`forgeStoryboard.forgeStoryboard`
- **输入**：`scene.sceneText + scene.prompts + sceneDurationSec + 导演 persona + characters + locations`
- **输出契约**：严格 JSON `{ shots: [...] }`
- **参数**：`temperature 0.8`, `maxTokens 6000`, `jsonMode: true`
- **它决定了什么**：
  - **镜数公式**（按 `sceneDurationSec`）：≤10s → 1-2 镜，≤20s → 2-3 镜，≤40s → 4-6 镜，≤60s → 6-8 镜，>60s → 8-10 镜
  - **durationSec 守恒**：所有镜之和 ≈ sceneDurationSec（±5s）
  - **keyframeStrategy 分配**：6 镜中通常 2-3 镜 `ab`，其余 `single`；大动作/大运镜 → `ab`，静态氛围/缓慢运镜 → `single`
  - **persona 注入**：`{{DIRECTOR_PERSONA}}` 占位被 `serializePersonaToPrompt(persona)` 替换；persona 对节奏、景别偏好、是否允许手持抖动有**否决权**
  - **视觉锚点承接**：相邻两镜必须共享至少一个视觉元素，写进 `transitionHint`
  - **物理守恒**：同一 scene 内光源方向、建筑、道具不能跳变
  - **AB 时**：`startFramePrompt` + `endFramePrompt` 各 120-220 字，物理连续
  - **single 时**：`prompt` 150-300 字作为代表帧；`startFramePrompt/endFramePrompt` 给空串
- **字段硬枚举**：
  - `framing`: `wide / medium / close / insert / ots / pov`
  - `bokehState`: `sharp / blurred / dynamic`
  - `keyframeStrategy`: `single / ab`
- **clampDurationSec**（`forgeStoryboard.ts`）：放开到 1-60 整数秒（旧 5/10 硬档废除）

### 4.4 `cinema-image-prompt.skill.md` —— Pass 5 / 场景封面 / 单镜修改

- **调用者**：
  - `promptForge.forgeImagePrompt`（单镜 refine / 场景封面）
  - `forgeImagePipeline.buildShotKeyframePrompt`（内部再次调 LLM 不等式，直接拿 skill 思路做规则化 prompt 拼装）
- **参数**：`temperature 0.85`, `maxTokens 480`
- **输出契约**：**单段中文 150-300 字**，无 markdown、无分行、无编号、无人名
- **七层堆叠结构**（内部顺序，输出时不暴露结构）：
  ```
  【风格定义】→【人物特征】→【构图镜头】→【主体动态】→【场景细节】→【光影氛围】→【技术参数】
  ```
- **硬规则**：
  - **视觉锚点前置**：首段锁核心人物的外貌/服饰/配饰（无人物时锁主视觉元素）
  - **电影术语必含**：景别 + 机位 + 焦段 齐全
  - **光影必含**：主光方向 + 色温 + 空气感
  - **画幅感必含**：结尾带 `2.39:1 / 变形宽银幕 / 胶片颗粒 / IMAX 画幅感` 至少一个
  - **抽象词必视觉化**：「悲伤」→「下颚紧绷、眼眶泛红、指节发白」
  - **禁品牌 / 禁 IP 名 / 禁真实人名**

### 4.5 `kinetic-video-prompt.skill.md` —— Pass 6 视频段 prompt ⭐

- **调用者**：`forgeKineticVideoPrompt`（被 `forgeVideoPlan` 批量调）
- **输入**：单 shot 的完整分镜信息 + persona + 可选 `sourceTextSpan / previousShotTail / nextShotHead / continuityGroupId`
- **参数**：`temperature 0.85`, `maxTokens 1200`, `jsonMode: false`
- **输出契约**：**150-350 字中文单段纯文本**（不 JSON、不 markdown）
- **黄金三角结构**（内容必须齐）：`[运镜方式] + [人物/主体动作] + [环境与光影变化]`
- **必含元素**（按序）：
  1. 视觉锚定（≤20 字） 2. 运镜描述 3. 主体动作（爆发性动词） 4. 环境交互 5. 光影变化 6. 结尾画幅锚定
- **时长规则**：
  - `1-2s` → 快切，必写"动作在第 X 秒完成"（crisp-cut lock）
  - `3-4s` → 紧凑镜 + 极简运镜
  - `5s` → 1 个高密度动作
  - `6-9s` → 加情绪停顿或光线变化
  - `10s+` → 完整情绪弧或运镜+情绪+反馈三段式
- **时间刻度（硬规则）**：≥3s 镜头必须显式写 `0-Xs` / `第 X 秒` 时间刻度
- **A/B 双帧约束**：有 A/B 时 → 起点=A、终点=B、中段物理连续过渡；光源方向/道具/水痕**只能累积不能消失**
- **单帧时**：把关键帧视为 50% 位置，前 50% 进入 + 后 50% 离开
- **persona 否决权**：
  - 维伦纽瓦/芬奇 → 禁止"手持晃动 / 镜头震裂"
  - 米勒/赛博 → 鼓励手持 + `Lag / Overshoot` 惯性动作
  - 王家卫 → 允许抽帧错位
- **剧本忠实**：有 `sourceTextSpan` 时关键意象/动词至少保留 60%
- **上下文桥接**：有 `previousShotTail` → 首 20 字承接；有 `nextShotHead` → 末 20 字预接
- **prompt 落位**：`sanitizeKineticVideoPrompt` 剥 markdown / "好的"前缀 / 多段合并 → `augmentPromptWithContinuityContext` 加承接锚点 → 写进 `VideoSegment.prompt`

### 4.6 `cinema-video-prompt.skill.md` —— 单镜 LLM 修改（视频路径）

- **调用者**：`promptForge.forgeVideoPrompt`
- **参数**：`temperature 0.9`, `maxTokens 1400`
- **用途**：用户在 VIDEO tab 直接敲意图（"让镜头更稳、光慢慢暗下来"）时调用，不走 Planner
- **与 `kinetic-video-prompt` 的区别**：不吃 A/B、不吃 persona 强制注入、不写时间刻度——是**轻量快改**通道

### 4.7 `dialogue-craft.skill.md` —— 台词锻造

- **调用者**：`promptForge.forgeDialogue`
- **参数**：`temperature 0.9`, `maxTokens 800`, `jsonMode: true`
- **输出**：`{ dialogueText, subtext, performance }`
- **用途**：作者只写了"这里他该说点什么有张力的"时，LLM 补齐逐字台词 + 潜台词 + 表演指导

### 4.8 Persona 注入机制（跨 skill 共用）

所有带 `{{DIRECTOR_PERSONA}}` 占位符的 skill（storyboard-director / kinetic-video-prompt）：

```
resolveDirectorPersona(scenario.directorStyle, scenario.directorCustomPersona)
   → serializePersonaToPrompt(persona)
   → 替换 {{DIRECTOR_PERSONA}}
```

预设 7 个 + custom：
`neutral / hitchcock / fincher / villeneuve / miller / wkw / cyberpunk-neon`
（定义在 `directorPersonas.ts`，含名号、剪辑语法、镜头语言、节奏偏好、典型用词）

**Persona 只进 system prompt，不改 JSON schema**——切换 persona 不用迁移数据。

---

## 五、关键参数速查

### 5.1 LLM 调用参数（全部在 `forgeXxx.ts` 源码里硬编码，如需调改代码）

| 调用 | temperature | maxTokens | jsonMode | skill |
|------|-------------|-----------|----------|-------|
| `forgeScenarioFromIdea` | 0.85 | 7000 | ✅ | scenario-architect |
| `forgeScenarioFromScript` | 0.3 | 7000 | ✅ | script-structurer |
| `forgeStoryboard` | 0.8 | 6000 | ✅ | storyboard-director |
| `forgeKineticVideoPrompt` | 0.85 | 1200 | ❌ | kinetic-video-prompt |
| `decideContinuityGroups` | 0.3 | 1200 | ✅ | 内联 system prompt（不走 skill） |
| `forgeImagePrompt`（单镜 refine） | 0.85 | 480 | ❌ | cinema-image-prompt |
| `forgeVideoPrompt`（单镜视频改） | 0.9 | 1400 | ❌ | cinema-video-prompt |
| `forgeDialogue` | 0.9 | 800 | ✅ | dialogue-craft |
| Anthropic 默认 | 0.85 | 1024 | — | （Provider 默认） |

### 5.2 图像 size 速查

| 场景 | size | 调用处 |
|------|------|--------|
| 角色三视图 | `1024×1024` | `forgeImagePipeline.ts:572` |
| 场所多角度（3 角度） | `1536×1024` | `forgeImagePipeline.ts:588` |
| 分镜关键帧 | `1536×1024` | `forgeImagePipeline.ts:652` |
| 单镜修改 | `1536×1024` | `forgeShotRefine.ts:101` |
| 批量生图兜底 | `1024×1024` | `batchImageGen.ts:174` |

### 5.3 视频参数速查

| 项 | 值 | 位置 |
|------|-----|------|
| 默认 size | **`1080p`**（横屏 16:9 · 1920×1088） | `seedanceResolution.DEFAULT_VIDEO_SIZE` / `settingsStore.ts` |
| 合法档位 | `1080p / 1080p-portrait / 720p / 720p-portrait / 720p-square / 480p` | `seedanceResolution.VIDEO_SIZE_CHOICES` |
| body.ratio 推导 | 从 `size` 决定 `16:9 / 9:16 / 1:1` | `resolveSeedanceResolution(size).ratio` |
| 真实档位 | 由 `VideoConfig.model` / endpoint（`ep-xxx`）决定；API 不接受 `resolution` 字段 | — |
| 首帧 role | `reference_image`（`content[]` 第 1 张） | `buildSeedanceContent` |
| 尾帧 role | `reference_image`（`content[]` 第 2 张） | 同上 |
| 参考视频 role | `reference_video`（最多 1 段） | 同上 |
| 参考音频 role | `reference_audio`（最多 1 段） | 同上 |
| URL 约束 | 所有媒体 URL 必须公网 `https://` / `http://`；`data:` 会被跳过 + warning | 同上 |
| generate_audio 默认 | `true`（让 Seedance 自出 BGM） | `SeedanceProvider.DEFAULT_GENERATE_AUDIO` |
| watermark 默认 | `false` | `SeedanceProvider.DEFAULT_WATERMARK` |
| 轮询间隔 | 4000 ms | `VideoProvider.pollUntilDone` |
| 轮询超时 | 6 分钟 | 同上 |
| 尾帧格式 | `image/jpeg` @ quality 0.85 | `videoPipelineRunner.ts` |
| 尾帧超时 | 10 000 ms | 同上 |
| 尾帧 canvas 宽高 | 优先 `video.videoWidth/videoHeight`，fallback 1280×720 | 同上 |

### 5.4 Planner / Scheduler 约束

| 项 | 规则 |
|------|------|
| `Shot.durationSec` 范围 | 1-60 整数秒（`clampDurationSec`） |
| 拆段策略 | 均匀就近，禁 `<minUsefulClipSec` 的尾巴段 |
| 并发上限 | `modelCapability.recommendedConcurrency`（Seedance=2） |
| 同 `continuityGroupId` | 串行：前段完成 → 截尾帧 → 作下段 startFrame |
| 跨 `continuityGroupId` | 并行到并发上限 |
| DAG 环检测 | Kahn 算法；发现环 → 强制打断 + `warnings` 记录 |

### 5.5 审计日志

- **位置**：`localStorage['__reel_audit_buffer__']`
- **容量**：环缓冲 200 条
- **读取**：DevTools Console `readBrowserAuditBuffer()`
- **字段**：`{ kind, provider, model, context:{scenarioId,sceneId,shotId,stage}, status, durationMs, request:{userPromptLen,preview(200字),temperature}, response:{textLen,preview(200字),error?} }`
- **未来**：Vite plugin 接口 `/__reel_audit__` 落盘 `.reel-scenarios/audit/YYYY-MM-DD.jsonl`

### 5.6 API Key 注入

| Key | 文件 / 字段 | 注入方式 |
|------|-------------|---------|
| Azure GPT-Image-2 | `llm_key.json`（gitignore） | Vite define → `__RS_IMG_KEY__` / `__RS_IMG_BASE__` |
| Seedance 视频 | UI 设置面板 → `settingsStore.videoConfig.apiKey` | localStorage |
| Claude（Azure） | 同 image 源 | Vite define |

---

## 六、读这份文档之后

- 要改**图像尺寸** → `forgeImagePipeline.ts` 对应 stage 的 `size` 字段（GPT-Image-2 仅支持 `1024×1024 / 1024×1536 / 1536×1024` 三档，不要传别的）
- **不要换图像模型**：图像固定走 Azure GPT-Image-2（`GptImageProvider.ts`）
- **不要换视频模型**：视频固定走 Seedance 2.0（`VideoProvider.ts`）；`modelCapabilities.ts` 里的其他条目是未来占位，动了也不会被实例化
- 要改**某个 skill 的写作规则** → 直接编辑 `src/llm/skills/*.skill.md`（构建时 inline 为字符串）
- 要看**某次 LLM 调用传了什么** → DevTools `readBrowserAuditBuffer()`
- 要**加新 persona** → `directorPersonas.ts` 加 union + 定义；不用改 skill 模板
- 要**加新 Pass** → 在 Pass 1-6 之间插，但必须保持 Planner/Scheduler/Runner 三层纯函数分离
