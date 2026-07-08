# Reel-Studio · 互动影游图像管线标准

本文档是**真实代码的快照**，所有数值、默认值、字段来源都标了代码路径。改代码时请同步改此文档。

---

## 一、图像规格一览

| 维度 | 规格 | 来源 |
|------|------|------|
| 生成模型 | Azure OpenAI · **gpt-image-2** | `src/llm/GptImageProvider.ts` |
| 端点模式 | Azure Deployment 模式 | 同上 |
| URL 模板 | `POST {apiBase}/openai/deployments/{deployment}/images/generations?api-version={version}` | 同上 |
| 认证 | `api-key: <key>` header | 同上 |
| 默认 API 版本 | `2024-02-01` | `vite.config.ts:171` |
| 默认 Deployment | `gpt-image-2` | `vite.config.ts:173` |
| Key 来源 | `key/llm_key.json` → Vite define `__RS_IMG_KEY__` 等 | `vite.config.ts:69-172` |
| Key 是否进 bundle | ❌ 构建时注入，**不进** git | `vite.config.ts:145` |

### 请求体（gpt-image-2 最小字段集）

```json
{
  "prompt": "…最终提示词字符串…",
  "n": 1,
  "size": "1024x1024"
}
```

> `gpt-image-2` **不接受** `response_format`，传了会回 400 `unknown_parameter`；默认就返回 `b64_json`。这一点与 dall-e-3 不同，见 `GptImageProvider.ts:77-86`。

### 响应体

```json
{ "data": [ { "b64_json": "…" } ] }
```

Provider 把 b64 包装成 `data:image/png;base64,…` 形式的 **dataUrl**，并同时保留原始 base64 与 mimeType，返回给调用方。

### 图像尺寸与用途

| 尺寸 | 用途 | 调用点 |
|------|------|--------|
| `1024x1024` | 角色三视图参考 · 批量生场景轻量路径 | `forgeImagePipeline.ts:403` · `forgePasses.ts:191` · `batchImageGen.ts:174` |
| `1536x1024` | 场所基准图 · 分镜关键帧（主要生产尺寸，**电影感核心**） | `forgeImagePipeline.ts:417, 473` · `forgePasses.ts:205` · `forgeShotRefine.ts:101` |
| `1024x1536` | 保留在 TypeScript 类型里，目前没调用点 | `types.ts:74` |

> 互动影游默认用 **1536×1024**（3:2 横向，最接近 gpt-image-2 支持尺寸中的电影感）；
> 「角色三视图板」这种"正方形拼图"才走 1024×1024。
> **画幅电影感在 prompt 里补**：`buildShotKeyframePrompt` 收尾强制拼入
> `2.39:1 anamorphic letterbox / film grain / no UI overlays`，让 1536×1024
> 原生画布产生变形宽银幕观感（黑边由模型自发让出）。

### 文件格式

- 始终返回 **PNG**，Provider 显式设 `mimeType: 'image/png'`。
- 编辑器侧统一用 `dataUrl`（`data:image/png;base64,…`）在内存流转，落盘时由 `mediaStore` 决定是否转 Blob。

### 重试策略 · `GptImageProvider.generate()`

- 最多 **5 次**（首次 + 4 次重试）
- 可重试条件：`shouldRetryHttp()` 命中（429 / 5xx）或 `shouldRetryError()` 命中（网络异常）
- 间隔：`computeBackoffMs(attempt)` 指数退避 + jitter；**优先读 `Retry-After` 头**
- 不可重试：4xx（非 429）直接抛 `[HTTP n]` 错误，让上层记为 failed
- 参见 `src/llm/retryPolicy.ts` 与 `GptImageProvider.ts:95-146`

---

## 二、整体管线：从「想法」到「每镜关键帧」

```
┌─ Pass 1 · schemaForgePass ──────────────────────────────────────┐
│  入口：forgeScenarioFromIdea / forgeScenarioFromScript          │
│  系统 prompt：scenario-architect.skill.md / script-structurer   │
│  模型：Claude Opus 4.6（流式）                                  │
│  产出：Scenario（含 characters / locations / scenes / shots[]）│
│  文件：src/llm/forgePasses.ts, promptForge.ts                   │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─ Pass 2 · qteEnhancePass（仅 script 模式）─────────────────────┐
│  逻辑：本地启发式 pickQteCandidates，不再回调 LLM               │
│  产出：在 1-2 场关键戏追加默认 QTE                              │
│  文件：src/llm/forgePasses.ts, qteHeuristic.ts                  │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─ Pass 3 · characterRefPass · 一致性地基 ──────────────────────┐
│  并发度：默认 2（forgePasses.ts:182）                           │
│  a) 每个 Character → buildCharacterTurnaroundPrompt            │
│     → 1024x1024 生三视图 → onCharacterRef 回调                 │
│  b) 每个 Location → buildLocationPrompt                        │
│     → 1536x1024 生「空场基准图」→ onLocationRef 回调           │
│  落地：调用方把 ImageResult 写入 mediaStore，id 写回 Scenario   │
│  文件：src/llm/forgePasses.ts, forgeImagePipeline.ts            │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─ Pass 4 · runForgeImagePipeline · 分镜关键帧 ─────────────────┐
│  并发度：默认 3（forgeImagePipeline.ts:406）                    │
│  展开任务：∑(scene.shots.length) 条                             │
│  每条：buildShotKeyframePrompt + pickPrimaryRefForShot          │
│         → 1536x1024 带参考图生图 → onSceneShotKeyframe 回调    │
│  开关：skipShots=true 时可跳过本段，留给作者在剧情树里按场景精跑│
│  文件：src/llm/forgeImagePipeline.ts                            │
└─────────────────────────────────────────────────────────────────┘
```

### 关键约定

1. **两阶段顺序**：Pass 3 必须先于 Pass 4，否则 Shot 生图拿不到参考图。`runForgeImagePipeline` 内部已经强制串行（先 `await charsResult` 再跑 shots）。
2. **失败隔离**：每个生图任务通过 `runWithConcurrency` 调度，单条失败不阻断其它。failures 存在 `BatchResult.failed`，UI 需展示"M/N 成功，X 场报错"。参见 `src/llm/batchImageGen.ts:56-97`。
3. **幂等跳过**：调用方可自己检查 `character.turnaroundRefImageId` / `location.refImageId` / `shot.keyframeMediaRef` 是否已存在，再决定是否加入任务列表。

---

## 二·B、分镜脚本生成管线（v3.7 新增 · scene 级 · 按需触发）

不在 Forge 向导主流程里一次性跑（Token 太重、质量不稳）。改为**单场景按钮触发**，
允许作者反复重跑单个 scene 的分镜，直到满意。

### 触发点

- Editor · Scene 详情抽屉：「生成分镜脚本」按钮（TODO · UI 未接入）
- 批处理：调用方可对多个 scene 并发跑（`runWithConcurrency` 包一层）

### 流程

```
 forgeStoryboard(llm, { scene, characters, location, visualStyle, ... })
           │
           │  1) buildStoryboardUserPrompt()  // 纯函数
           │       └─ 拼入：标题 / 全局风格 / UI / 场所 / 角色锚点 / 舞美 / 节拍 /
           │                原文 / 已有台词 / 期望镜数
           │
           │  2) streamOrFallback(llm, systemPrompt=SKILLS.storyboardDirector, ...)
           │       └─ temperature=0.8 · jsonMode=true · maxTokens=6000
           │
           │  3) parseJSONLoose(raw) + normalizeStoryboardShots()
           │       ├─ id 重签 <sceneId>-shNN
           │       ├─ framing 字典对齐六基准
           │       ├─ durationSec 只允许 5|10（就近吸附）
           │       └─ bokehState 白名单 + 中文别名
           │
           └─▶ Shot[]（带 audioHint/subtext/performance/dialogueText/bokehState/durationSec）
                   │
                   ▼
             调用方写回 scene.shots[]，再触发 runForgeImagePipeline 生关键帧
```

### 范本级输出质量要求（写在 storyboard-director.skill.md）

- **≥6 镜**（范本要求 6–8，本仓 `clampShotCount` 允许 4–10）
- **至少三种景别**（不得连续三个同景别）
- **开场建立镜 + 末镜收紧/留白转场接口**
- **空间守恒**：光源方向、服装细节、核心道具跨镜不得跳变
- **音效视觉化**：`audioHint` 里的每个声音元素必须能找到对应的画面证据
- **durationSec ∈ {5, 10}**：至少 1 镜 = 10（情绪），至少 1 镜 = 5（节奏）

### 分镜产出会被谁消费

- **`buildShotKeyframePrompt`（生图阶段）**：读 audioHint / dialogueText / subtext / performance / bokehState，拼成"音效视觉化 / 表演外化 / 焦外策略"段落
- **视频生成（`forgeVideoPrompt`）**：读 shot.prompt + cameraHint + durationSec
- **TTS / 字幕（未来）**：读 dialogueText + performance 驱动语音合成
- **时间轴剪辑 UI**：读 durationSec 拼出"6 镜 × 5–10 秒 ≈ 一个完整 scene 时长"

### 关键文件

- `src/llm/forgeStoryboard.ts` · 入口 + 纯函数（buildStoryboardUserPrompt / normalizeStoryboardShots / clampShotCount）
- `src/llm/skills/storyboard-director.skill.md` · 系统 prompt（分镜导演 skill）
- `src/llm/__tests__/forgeStoryboard.test.ts` · 16 条单测

---

## 三、参考图（referenceImageDataUrl）注入规则

`ImageRequest.referenceImageDataUrl` 是**单张** dataUrl。底层 gpt-image-2 当前只接一张参考；未来底层升级为 multi-image 时只需扩展 `pickPrimaryRef*`。

### 分镜关键帧的参考图优先级（`pickPrimaryRefForShot`）

1. **场所基准图**（`Scene.locationId → Location.refImageId`）—— 首选，锁住空间光影
2. **主角三视图**（本镜 `shot.characterIds[0]` 或退化到 `scene.characterIds[0]` → `Character.turnaroundRefImageId`）
3. **主角旧版单视图**（`Character.refImageId`，v1 兼容）
4. 都没有 → 不传参考，走纯文生图

> 文件：`src/llm/forgeImagePipeline.ts:206-235`（shot 级）· `248-273`（scene 级兜底）

### 为什么优先 Location 而不是角色

- 场所基准图提供**构图 / 光影 / 空间关系**，这是"跨镜一致性"最容易崩的维度
- 角色三视图解决"脸一致"，但 prompt 文本里再复述一遍 appearance，也有约 70% 的稳住能力
- 两张都有时，`pickPrimary*` 选 location，因为光影一致比脸一致更难靠 prompt 抢救

---

## 四、Prompt 组装器（纯函数层）

所有函数均为纯函数，无副作用、可单测。位置：`src/llm/forgeImagePipeline.ts`。

### 4.1 `buildCharacterTurnaroundPrompt(character)`

用途：角色三视图参考板（front / side / back 一张 1024×1024 拼图）。

结构固定四段：

```
Character turnaround reference sheet (front, side, back three views in one image).
Character name: {character.name}.
Appearance: {character.prompt}.
Plain neutral background, no text, no watermark, full body, consistent proportions across views, high detail.
```

### 4.2 `buildLocationPrompt(location)`

用途：场所"空场"基准图（1536×1024），后续可叠角色。

```
Empty location reference (no characters present).
Location: {location.name}.
Description: {location.prompt}.
Cinematic composition, consistent lighting, no people, no text,
leave room for characters to be composited later.
```

### 4.3 `buildShotKeyframePrompt(args)` · 核心（v3.7 分层堆叠版）

组装顺序遵循**分层堆叠架构**（信息权重由高到低，逐段 `\n` 连接）：

| # | 段落（内部 key） | 条件 | 作用 |
|---|------|------|------|
| 1 | `Visual style: {uiStylePrompt}.` | 有 uiStyle 时 | 全局风格统一 |
| 2 | `Location: … Match the lighting, spatial orientation, and mood of the provided reference image of this location.` | 有 location 时 | 把参考图效力显式声明 |
| 3 | `Characters present (visual anchors up-front): {name (appearance); name (appearance)}. Keep each character consistent with their provided turnaround reference — face, wardrobe, proportions, distinctive accessories.` | 有出场角色时 | **视觉锚点前置**：角色名 + 外观细节一次性砸在前面 |
| 4 | `Scene mood and staging: {scene.background}.` | 有 background 时 | 舞美速记（不念、不字幕） |
| 5 | `Scene action (scene level): {scene.prompts.scene}.` | 有 scene 提示词时 | 整场动作兜底 |
| 6 | `Shot N of M.` + `{FRAMING_DESCRIPTIONS[shot.framing]}` | 总是有 | 本镜摄影骨架 |
| 7 | `Camera direction: {shot.cameraHint}.` | 有 cameraHint 时 | 运镜/机位/焦段 |
| 8 | `This shot shows: {shot.prompt}.` | 有本镜 prompt 时 | 本镜画面核心（150–300 字） |
| 9 | **音效视觉化** —— `Audio cues to externalize visually (AI cannot render sound — translate to visible physical evidence): {shot.audioHint}. For each sonic element, render a matching physical cue — e.g. raindrops crown-splashing on metal, dust floating in a beam of light, breath condensing into white mist, ripples on a puddle.` | 有 `shot.audioHint` 时 | 把声音翻成画面证据 |
| 10 | **表演 / 潜台词外化** —— `Performance & subtext: Character speaks (do NOT render text/subtitles): "{dialogueText}" · Performance direction: {performance} · Subtext to externalize: {subtext}. Translate emotion into tensed jaw, whitened knuckles, reddened eye rims, shoulder posture, not into written words.` | 任一 `dialogueText/performance/subtext` 非空时 | 把情绪翻成面部肌肉 + 身体语言 |
| 11 | `Background state: {sharp / blurred-bokeh / dynamic-in-motion}.` | 有 `shot.bokehState` 时 | 焦外策略（定义光斑） |
| 12 | `Transition to next shot: {transitionHint}. Compose the end of this frame so it flows naturally into that transition.` | 有 transitionHint 时 | 末态构图引导 |
| 13 | **电影幅比锚点** —— `Cinematic widescreen composition, 2.39:1 anamorphic letterbox aesthetic, film grain texture, high detail, no text, no watermark, no UI overlays.` | 总是有 | **强制电影剧照感**（letterbox / 胶片颗粒） |

景别英文描述表（`FRAMING_DESCRIPTIONS`）覆盖 6 种：

| framing | 英文描述要点 |
|---------|------------|
| `wide` | Wide establishing · camera far · full environment & spatial relationships |
| `medium` | Waist-up framing · context visible but subject dominant |
| `close` | Tight frame · emphasis on facial expression or single key object |
| `insert` | Extreme close-up on a small but significant detail |
| `ots` | Over-the-shoulder · from behind one character, looking toward another |
| `pov` | Point-of-view · camera = subject's eyes |

> 不直接用单词 `close-up` / `wide shot`，因为不同模型对短语敏感度不同，用**完整英文句子**最稳。

### 4.3.1 `Shot` 数据结构扩展（v3.7）

除了旧字段（`framing / cameraHint / prompt / transitionHint / characterIds / keyframeMediaRef`）之外，新增 5 个可选字段，由 `forgeStoryboard` 或作者手工填写：

| 字段 | 类型 | 来源 | 作用于 prompt 哪一段 |
|------|------|------|--------------------|
| `audioHint` | string | storyboard LLM / 作者 | 段 9 · 音效视觉化 |
| `dialogueText` | string | storyboard LLM / 原剧本 | 段 10 · "Character speaks" |
| `subtext` | string | storyboard LLM | 段 10 · "Subtext to externalize" |
| `performance` | string | storyboard LLM | 段 10 · "Performance direction" |
| `bokehState` | `'sharp' \| 'blurred' \| 'dynamic'` | storyboard LLM / 作者 | 段 11 · Background state |
| `durationSec` | `5 \| 10 \| number` | storyboard LLM / 作者 | **不影响图像 prompt**；供视频生成/剪辑读 |

> 设计约束：所有新段落都是**条件拼接**，字段为空就不输出该段。老剧本（没这些字段）产出的 prompt 语义不变，不破坏历史再生图。

### 4.4 视觉风格前缀（`composeVisualPrompt`）

**所有**生图任务在发给 client 之前必须过一次 `composeVisualPrompt(rawPrompt, visualStyle)`。

- 写法：`"{promptPrefix} —— {rawPrompt}"`
- 前缀从 `VISUAL_STYLE_PRESETS` 取，当前 6 种：`photoreal` / `anime` / `cartoon` / `pixelart` / `watercolor` / `ink`
- `visualStyle` 为 undefined/未知 → 原样返回 rawPrompt（向后兼容）
- **不是幂等**：调用方保证只在最终写 `ImageRequest.prompt` 时套一次

> 文件：`src/llm/visualStylePresets.ts`

### 4.5 单镜 LLM 修改（`forgeShotRefine`）

作者在 SHOT tab 点「修改本镜」输入意图后：

1. `buildShotRefineContext()` 把前/当/后镜 + `scene.background` + 出场角色拼成 storyContext
2. 调 `forgeImagePrompt`（cinema-image-prompt skill）重写 shot.prompt，80-150 字中文单段
3. 用新 prompt 调 `imgClient.generate({ size: '1536x1024' })` 出图
4. 返回 `{ newPrompt, imageResult }`，由调用方写回 store

> 文件：`src/llm/forgeShotRefine.ts` · 系统 prompt 全部来自 `skills/cinema-image-prompt.skill.md`

---

## 五、LLM 技能文件（.skill.md · 系统提示词）

位置：`src/llm/skills/`，由 `skills/index.ts` 以 Vite `?raw` 形式打包成字符串常量。

| 文件 | 谁在用 | 作用摘要 |
|------|--------|----------|
| `scenario-architect.skill.md` | `forgeScenarioFromIdea` | 从一个想法产出完整 Scenario JSON（characters/locations/scenes/shots），含写作铁律与 JSON schema |
| `script-structurer.skill.md` | `forgeScenarioFromScript` | 从既有剧本文字结构化成 Scenario JSON |
| **`storyboard-director.skill.md` (v3.7 新增)** | **`forgeStoryboard`** | **把单个 scene 炸成 6-8 张电影分镜**：每个 shot 含画面 prompt + audioHint + dialogueText + subtext + performance + bokehState + durationSec + transitionHint |
| `cinema-image-prompt.skill.md` (v3.7 重写) | `forgeImagePrompt` / `forgeShotRefine` | 把"场景意图 + 上下文"改写为 **150-300 字**的中文电影镜头提示词；遵循**分层堆叠**（风格→人物→构图→动态→场景→光影→技参）；强制音效视觉化、表演外化、2.39:1 letterbox |
| `cinema-video-prompt.skill.md` | `forgeVideoPrompt` | 给 Seedance 类视频模型的中文运镜提示词 |
| `dialogue-craft.skill.md` | `forgeDialogue` | 给场景生对白，遵循角色语气 |

### 公共约束（所有 skill 都遵守的写作口径）

1. **语言**：中文简体，单段自然语句，不用条目符号
2. **禁止输出**：水印、字幕、UI、文字、时间码
3. **光影统一**：跨镜沿用同一场景的光位与色温
4. **角色一致性**：出现角色名时必须复述 appearance 关键词，避免模型凭空补
5. **不准编造角色**：只能用 Scenario 已定义的 character

### 用法（以 cinema-image-prompt 为例）

```ts
// 系统 prompt（全文）
import { SKILLS } from './skills'
const sys = SKILLS.cinemaImagePrompt

// 用户 prompt（由 promptForge 拼）
const user = [
  `故事语境：${storyContext}`,
  `画面意图：${intent}`,
  `镜头景别：${framing}`,
  `运镜：${cameraHint ?? '未指定'}`,
].join('\n')

const { text } = await textClient.generate({ systemPrompt: sys, userPrompt: user })
```

---

## 六、数据结构锚点

`src/scenario/types.ts`（摘关键字段）：

```ts
interface Scenario {
  characters: Character[]
  locations: Location[]
  scenes: Record<string, Scene>
  ui?: {
    visualStyle?: VisualStyle   // 全局风格，注入每张图的 prompt 前缀
    authoringHints?: string
  }
}

interface Character {
  id: string
  name: string
  prompt: string                        // Appearance 描述
  refImageId?: string                   // v1 单视图
  turnaroundRefImageId?: string         // v2 三视图（优先）
}

interface Location {
  id: string
  name: string
  prompt: string
  refImageId?: string                   // 场所"空场"基准图
}

interface Shot {
  id: string
  framing: ShotFraming                  // wide|medium|close|insert|ots|pov
  cameraHint?: string
  transitionHint?: string
  prompt: string                        // 本镜画面
  characterIds?: string[]
  keyframeMediaRef?: string             // 生图结果在 mediaStore 的 id
  videoConfig?: VideoConfig
}
```

---

## 七、批量生成任务调度（`batchImageGen.ts`）

### `pickBatchTasksFromScenario(scenario)`

展开成形如 `{ kind: 'character'|'location'|'shot', target, prompt, size }[]` 的任务序列。默认：

- characters → `size: 1024x1024`
- locations → `size: 1536x1024`
- shots → `size: 1536x1024`

### `runWithConcurrency(tasks, worker, { concurrency })`

- `pickBatchTasksFromScenario → batchGenerateImages` 里的默认 `concurrency = 4`（`batchImageGen.ts:167`）
- `characterRefPass` 内部自定义默认 `2`（`forgePasses.ts:182`）
- `runForgeImagePipeline` 的 shot 阶段默认 `3`（`forgeImagePipeline.ts:406`）
- 任一 task 抛错 → 计入 `failed[]`，不取消其它
- 返回 `{ ok: Result[], failed: { task, error }[] }`
- UI 层用这份 `failed` 展示 "M/N 成功 · X 场失败" 的错误 toast

---

## 八、常见踩坑备忘

| 问题 | 根因 | 对策 |
|------|------|------|
| 生图 400 `unknown_parameter: response_format` | dall-e-3 和 gpt-image-2 字段集不同 | 代码里**禁止**给 gpt-image-2 传 `response_format`，已在 Provider 里删除 |
| 跨镜脸/光不稳 | 没传 referenceImageDataUrl 或优先级选错 | Pass 3 必须先跑完；检查 `pickPrimaryRefForShot` 的实际返回 |
| 全局风格切换后老剧本不变 | `composeVisualPrompt` 只在新生成时注入 | 切风格后需要重跑 Pass 4；不会对历史 ImageId 做追写 |
| "改了 demoScenario 刷新没生效" | `scenarioPersistBoot` 会从 localStorage 复原老版 | 已加 `signScenarioRuntimeSurface` + `refreshBuiltinDemoInDb`，bundled 为权威 |
| 生图成功率偶发下跌 | Azure 侧 429/5xx 拥塞 | Provider 已内建 5 次 + 退避 + Retry-After；继续失败走 failed 上报 |

---

## 九、改动本文档时的自检清单

- [ ] 改了尺寸默认值？同步 `GptImageProvider` / `forgeImagePipeline` / `batchImageGen` / 本文档第一章
- [ ] 改了 prompt 组装器？同步第四章 4.3 的 13 段顺序表
- [ ] 改了 `Shot` 类型？同步 4.3.1 表、`normalizeStoryboardShots`、storyboard-director skill 的输出契约
- [ ] 新增了 visualStyle？同步 `VISUAL_STYLE_PRESETS` 列表并在 cinema-image-prompt skill 里加入兼容口径
- [ ] 新增了 skill？同步 `skills/index.ts` 导出 + `promptForge`/`forgeStoryboard` 装配 + 本文档第五章
- [ ] 改了分镜脚本规则？同步 `storyboard-director.skill.md` 与第二·B 章的"范本级输出质量要求"
- [ ] 换了 LLM 供应商？检查 `vite.config.ts` 的 define 注入是否有新 key，并在本文档第一章更新
- [ ] 改了导演流派列表？同步 `directorPersonas.ts`、`DirectorStyleId` 类型、UI 下拉选择、第十章流派表
- [ ] 改了 A/B 帧策略决策规则？同步 `storyboard-director.skill.md` + `buildShotKeyframePrompt` + 第十章决策表
- [ ] 改了节点时长算法？同步 `forgeStoryboard.computeShotQuota` + 第十一章公式表
- [ ] 改了 kinetic video prompt 规则？同步 `kinetic-video-prompt.skill.md` + `forgeKineticVideo.sanitize*` + 第十二章字段表
- [ ] 改了视频编排（Planner/Scheduler/Runner）？同步第十三章 13.2 职责分工表 + `forgeVideoPlan` + `videoSchedule` + `videoPipelineRunner`
- [ ] 改了模型能力位？同步 `modelCapabilities.ts`（含 `asOf` 时间戳）+ 第十三章 13.3 时长策略表
- [ ] 改了 `clampDurationSec` 范围？同步 `Shot.durationSec` 类型注释 + `normalizeStoryboardShots` 测试用例
- [ ] 改了审计日志格式？同步 `llmAuditLog.buildAuditRecord` + 第十三章 13.8 格式示例

---

## 十、导演流派 Persona（v3.8 新增 · 智能体 + A/B 策略）

### 10.1 为什么要有 persona

v3.7 之前的分镜 skill 是**通用电影感导演**——输出稳定但"没有口味"。作者反馈："我想要一个整体悬疑电影感，不是每一镜都贴'悬疑'标签。" 所以 v3.8 把"剪辑语法/镜头语言/节奏"从 skill 里**提出来**，放 `src/llm/directorPersonas.ts` 作为一份可选档——每个作品可以绑一个 persona，所有 scene/shot 共享其风格。

Persona 不进 `Shot`，进 `Scenario`（作品级）：

```ts
// src/scenario/types.ts
export interface Scenario {
  // ...
  directorStyle?: DirectorStyleId      // 预设 7 个 + 'custom'
  directorCustomPersona?: string       // id='custom' 时的自由文本
}
```

### 10.2 预设流派（共 8 项 · 按 UI 列表顺序）

| id | 显示名 | 剪辑签名 | 镜头签名 | 节奏签名 |
|----|-------|---------|---------|---------|
| `villeneuve-epic` *(default)* | 维伦纽瓦 · 史诗 | 3-5 镜/场、每镜 10-20 秒 | extreme wide 压 70%、静止机位或极慢 dolly-in、24-35mm | 地质级慢，静默即配乐 |
| `fincher-noir` | 芬奇 · 黑色惊悚 | 长镜 + 2-3 帧硬切不对称 | close + medium、固定机位、85/100mm 压缩、单光源 | 精准钟表节拍，台词呼吸 0.3-0.5s |
| `hitchcock-suspense` | 希区柯克 · 悬疑 | POV + 反应镜交替、延迟揭示 | OTS + extreme close-up、Dolly Zoom、顶光半脸阴影 | 心电图式：10-15s 静 + 0.5s 动 |
| `shinkai-anime` | 新海诚 · 日漫高光 | 3 秒一切、空镜组（3-5 镜）过门 | wide + close-up 两极、缓 pan/升 crane | 平稳推进，情绪点准在 2/3 处 |
| `wong-karwai` | 王家卫 · 情绪 | 非线性、动作多速重叠、溶解转场 | 从框缝窥视、50-85mm f/1.2、手持轻晃 | 散文诗，无固定节拍 |
| `miller-kinetic` | 乔治·米勒 · 动能派 | 中心构图法则、1-2s 切、子弹时间 | medium + close、低角度跟拍、甩镜、24-35mm | 过山车，加速—失重—再加速 |
| `cyberpunk-neonoir` | 赛博霓虹 · 都市雨夜 | FPV 长跟拍 + 屏幕 UI 极短切、穿物体转场 | extreme wide + close、3 种光源、f/1.4 霓虹大光斑 | 心跳过速，背景永远在动 |
| `custom` | 自定义 | 作者自由文本 | （同） | （同） |

代码：`src/llm/directorPersonas.ts`  
UI 列表：`listDirectorStyleOptions()`  
注入 LLM：`serializePersonaToPrompt(persona)` 作为 system prompt 前缀，与 `storyboardDirector` / `kineticVideoPrompt` skill 拼接。

### 10.3 A/B 双帧策略决策表

每个 shot 由 `storyboard-director` agent 决定一个 `keyframeStrategy`：

| 策略 | 语义 | 何时用 | 视频生成路径 | 关键帧落点 |
|------|------|-------|------------|-----------|
| `single` | 只生一张代表帧 | 静态氛围、慢运镜、情绪长镜、对白戏 | 图 + `kineticVideoPrompt` 生成运镜 | `shot.keyframeMediaRef` |
| `ab` | 首帧 A + 尾帧 B | 大动作、快速运镜、明显位移、物理状态突变 | A/B 作为首尾锚点 + `kineticVideoPrompt` | `shot.startFrameMediaRef` + `shot.endFrameMediaRef` |

决策由 LLM 自动做（见 `storyboard-director.skill.md` 第 §1 条）。决策依据 = **动作幅度 × 运镜复杂度**：

- 动作 ≥ 明显位移（跑、跳、推门、挥臂）→ 倾向 `ab`
- 运镜 ≥ 大幅甩镜 / Dolly Zoom / FPV 穿越 → 倾向 `ab`
- 其余（眼神戏、独白、定场）→ 倾向 `single`

### 10.4 A/B 物理守恒（必须遵守）

生成 A/B 两帧时，`buildShotKeyframePrompt` 会追加守恒约束，防止首尾帧不是同一镜。实现：`src/llm/forgeImagePipeline.ts > buildShotKeyframePrompt`。

守恒维度：

- **光源**：同一方向、同一色温（雨夜的霓虹顶光不能突然变成顶灯）
- **道具**：A 里存在的物体 B 里仍在（可换位置，不能凭空消失/新增）
- **物理累积**：A 里湿的，B 里至少一样湿（水不能自己干）；A 里有伤口，B 里至少一样重
- **角色**：wardrobe、发型、道具持握物不变

守恒违反 = 视频模型插帧崩坏，所以 Shot normalize 时 **A/B 任一缺失 → 自动降级为 single 并告警**（见 `normalizeStoryboardShots`）。

### 10.5 "视频覆盖图像"占位契约

```
未生视频：  Timeline 渲染 shot.keyframeMediaRef 或 startFrameMediaRef（图像）
已生视频：  Timeline 渲染 shot.videoMediaRef（视频），图像作 fallback 保留不删
```

字段写入顺序：
1. `forgeStoryboard` → 写 prompt / 策略 / A/B prompts
2. `forgeImagePipeline` → 写 `keyframeMediaRef`（single）或 `startFrameMediaRef` + `endFrameMediaRef`（ab）
3. `forgeKineticVideoPrompt` → 写 `kineticVideoPrompt`
4. `batchVideoGen` → 写 `videoMediaRef`，**不删**之前的图像 ref

删视频回退：UI 层只需清 `videoMediaRef`，图像自然顶上来。

---

## 十一、节点多镜时长算法

`forgeStoryboard` 接收 `sceneDurationSec`（作品定义的节点目标时长，秒），自动推镜数：

| `sceneDurationSec` | 默认镜数 | 备注 |
|-------------------|---------|------|
| ≤ 10s | 2 → 夹到 4 | 2 镜 × 5s = 10s 过短，强制 4 |
| ≤ 20s | 3 → 夹到 4 | 同上 |
| ≤ 40s | 5 | 5 × 5-10s = 25-50s，匹配 |
| ≤ 60s | 7 | 7 × 5-10s = 35-70s，匹配 |
| > 60s | 9 | 超长戏上限 |

实现：`forgeStoryboard.computeShotQuota()`  
守恒：所有 `shot.durationSec` 之和应 ≈ `sceneDurationSec`（±10s 内，超了记 warning 不阻塞）  
单个 `durationSec` 只允许 `5` 或 `10`（Seedance 原生档位）。

`sanitizeSceneDuration`：
- 缺省 / NaN / ≤0 → 回退 60s
- <5s → 夹到 5s
- >300s → 夹到 300s（AI 不适合规划 5 分钟以上连续戏）

---

## 十二、图生视频提示词管线（v3.8）

### 12.1 职责

`forgeKineticVideoPrompt` = **翻译器**，不是生成器。输入 Shot，输出**可直接喂视频模型**的中文提示词，写回 `shot.kineticVideoPrompt`。后续 `batchVideoGen` 把这串字符串 + keyframe 图片发给 Seedance / Sora / Kling。

```
forgeStoryboard         → shots[]（画面/台词/音效/A-B 帧）
forgeKineticVideoPrompt → shot.kineticVideoPrompt（本章）
batchVideoGen           → prompt + keyframe → 视频 URL
```

### 12.2 黄金三角结构

skill：`src/llm/skills/kinetic-video-prompt.skill.md`

提示词必须由三段构成（单段中文，不带结构标记）：

```
[Camera 运镜] + [Action 动作] + [Environment 环境]
```

三段缺一不可；例："镜头从低角度缓慢推进 + 雨中人影转身抬眼 + 霓虹色被打湿的地面映出扭曲倒影"。

### 12.3 persona 注入

`forgeKineticVideoPrompt` system prompt = persona + kinetic skill。同一 Scenario 的所有 shot 共享同一 persona，保证**整体电影感**一致（不是每镜贴悬疑标签，是整部作品的剪辑/运镜节奏都属于那个流派）。

### 12.4 输出规范

| 规则 | 值 | 实现 |
|------|-----|------|
| 语言 | 中文（允许少量英文运镜术语锚点，如 FPV / Dolly Zoom） | skill 内规定 |
| 长度 | 150-350 字 | `sanitizeKineticVideoPrompt` 校验 |
| 结构 | 单段纯文本，**无** markdown / JSON / 编号 | 同上 |
| A/B 模式 | 描述首尾帧之间**如何演变**，不再描述画面本身（画面由 A/B 图锚定） | skill §A/B 双帧约束 |
| 安全底线 | <80 字记警告，>450 字截断记警告 | `sanitizeKineticVideoPrompt` |
| code fence 剥离 | 自动去 \`\`\`…\`\`\` 与 "好的，"/"以下是" 前缀 | 同上 |

### 12.5 调用方式

```ts
import { forgeKineticVideoPrompt } from '@/llm/forgeKineticVideo'

const { prompt } = await forgeKineticVideoPrompt(llmClient, {
  shot,
  scene,
  directorStyle: scenario.directorStyle,
  directorCustomPersona: scenario.directorCustomPersona,
  visualStyle: scenario.visualStyle,
})
// 写回 shot.kineticVideoPrompt
```

批量：对 `scene.shots` 并发跑，建议 concurrency = 3-4（比图像低，因为要等 LLM 流式完成，但每个 prompt 短）。


---

## 十三、视频编排管线（v3.8 · Planner + Scheduler + Runner）

把"生成整个 scene 的若干秒视频"从**单 shot 独立生成**升级为**场景级编排**，让 1s 快切、30s 连续长镜、跨 shot 一镜到底都能被统一表达。

### 13.1 为什么要这一层

单 shot 独立调用的毛病：
- 不知道一个 shot 的 `durationSec=30` 对模型来说**不可能一次生成**
- 不知道"追逐戏的 3 镜"应该**物理连续**（前镜尾帧 → 后镜起始）
- 不知道什么时候应该**并行**多段加速，什么时候**串行**等待尾帧

**Planner / Scheduler / Runner 三层**专门解这三件事：

```
 ┌─────────────────────────────────────────────────────────────┐
 │  Scenario（剧本，权威不可变）                                │
 │    scenes[].sceneText / characters / locations / prompts     │
 └──────────────────────┬──────────────────────────────────────┘
                        │
               ┌────────▼────────┐
               │  forgeStoryboard │   shots[]（每镜基础数据）
               └────────┬────────┘
                        │
               ┌────────▼─────────┐
               │  forgeVideoPlan   │   VideoPlan { segments[] }
               │  (Planner)        │    语义决策：continuityGroup
               │                   │    段内 prompt：kineticVideoPrompt
               └────────┬──────────┘
                        │
               ┌────────▼─────────┐
               │  videoSchedule    │   VideoDag（纯函数）
               │  (Scheduler)      │    waves[][]：按波次执行
               └────────┬──────────┘
                        │
               ┌────────▼─────────┐
               │ videoPipelineRunner│  真的调 VideoClient
               │  (Runner)         │   同组自动截尾帧给下段
               └────────┬──────────┘
                        │
                  SegmentRunResult[]
                        │
                  写回 Shot.videoMediaRef（调用方负责）
```

### 13.2 职责分工（严格边界）

| 层 | 决策权 | 输入 | 输出 | 副作用 |
|----|--------|------|------|--------|
| `modelCapabilities.ts` | 物理事实（max 秒 / 支持 A/B） | — | 能力表 | 无 |
| `forgeVideoPlan.ts` | **语义**（哪些 shot 同组） | scene + shots | VideoPlan | LLM 调用 |
| `videoSchedule.ts` | DAG 形态（串 / 并） | VideoPlan | VideoDag | 无 |
| `videoPipelineRunner.ts` | 实际调度 + 尾帧截取 | VideoDag + clients | SegmentRunResult[] | VideoClient / DOM |

**关键不变量**：
- LLM 只做语义判断（相邻镜是否同一段叙事）
- 纯函数做所有物理计算（30s 按 10s 上限拆 3 段）
- DOM 仅在 Runner 层出现（`createBrowserTailFrameExtractor`）

### 13.3 短镜与长镜（ duration 策略 ）

| 情形 | 生成方式 | prompt 要点 |
|------|---------|------------|
| **1-2s 快切** | 生完整视频（5s 下限档），**prompt 里锁死"动作在第 1 秒完成"** | §8.2 Crisp-Cut Lock |
| 3-9s 紧凑镜 | 单段视频，prompt 含时间刻度（§8.1） | 时间刻度必须 |
| 10s 标准镜 | 单段视频，情绪 + 运镜 + 物理反馈三段式 | 同上 |
| **10s+ 连续长镜** | `splitDurationToSegments` 均匀拆段；同 groupId；**串行**：前段尾帧作下段 startFrame | Runner 自动截尾帧 |
| 跨 shot 物理连续 | LLM 打同一 `continuityGroupId`；Scheduler 串成同组链 | §13.5 |

### 13.4 VideoSegment 字段契约

```ts
{
  id: 'sc1-shot1-seg00',   // scene-shot-segNN
  sceneId, shotId,
  segmentIndex: 0,         // 本 shot 内的第几段
  durationSec: 10,         // ≤ modelCapabilities.maxSingleClipSec
  prompt: '...',           // kineticVideoPrompt 产出的纯中文
  continuityGroupId: 'grp-shot1',  // 同组必串行
  dependsOnSegmentId?: 'sc1-shot1-seg00',  // 有依赖就等前段尾帧
  startFrameStrategy:      // 起手图从哪来
    'shot-keyframe' |      //   同组首段，用 shot.keyframeMediaRef
    'shot-start-frame' |   //   ab 策略同组首段，用 shot.startFrameMediaRef
    'prev-segment-tail' |  //   同组非首段，截前段视频尾帧
    'text-only',           //   无图可用，文生视频（fallback）
  shotOrder: 0,
}
```

### 13.5 连续组（Continuity Group）

**谁打标**：`forgeVideoPlan.decideContinuityGroups` 调 LLM 一次，返回 `{ groupId, shotIds[] }[]`；LLM 依据 persona 的剪辑语法（慢派合并更多，快派合并更少）。

**物理规则**：
- 同 `continuityGroupId` 的 segment 按 `(shotOrder, segmentIndex)` 升序**串行**
- 组内第一段：`startFrameStrategy` 取决于 shot 的 keyframeStrategy
- 组内非首段：`startFrameStrategy = 'prev-segment-tail'`，`dependsOnSegmentId = 前段 id`
- 跨组段：`waitFor = []`，在波次 0 并行启动

**作者覆盖**：未来可加 UI 让作者手动调整 `continuityGroupId`（当前版本仅 LLM 决策）。

### 13.6 DAG 执行：波次模型

`videoSchedule.layerizeDag` 把 DAG 切成波次：
- 波次 0 = 所有 `waitFor=[]` 的段（跨组并行）
- 波次 N = 所有前置在波次 ≤N-1 完成的段
- 同波段并发 ≤ `recommendedConcurrency`（取自 modelCapabilities）

**环检测**：`buildVideoDag` 用 Kahn 算法跑一遍拓扑，若有环则告警 + 强制打断所有依赖（避免死锁）。

### 13.7 尾帧截取

Runner 的 `extractTailFrame(videoUrl)` 注入项：
- **浏览器**：`createBrowserTailFrameExtractor()` 用 `<video crossorigin>` + canvas.toDataURL
- **Node 测试**：传 `async () => undefined`（下段 fallback 到 shot 起手图）

失败场景（全部静默 fallback，不中断）：
- CORS 视频不让 canvas 读 → 下段失去物理连续性但不会崩
- 视频元数据超时 → 同上

### 13.8 LLM 审计日志

**位置**：`.reel-scenarios/audit/<YYYY-MM-DD>.jsonl`（当前 v1 仅浏览器 localStorage 缓冲 200 条；下一版 vite plugin 落盘）

**格式**：一行一条 JSON
```json
{
  "at": "2026-05-07T15:30:00.000Z",
  "kind": "plan|continuity|text|image|video",
  "provider": "anthropic", "model": "claude-opus-4-6",
  "context": { "scenarioId": "s1", "sceneId": "sc1", "stage": "kineticVideo" },
  "status": "ok",
  "durationMs": 3200,
  "request": { "userPromptLen": 540, "userPromptPreview": "前 200 字…" },
  "response": { "textLen": 320, "textPreview": "前 200 字…" }
}
```

**设计原则**：
- **不存完整 prompt**（preview 仅 200 字） —— 防止磁盘膨胀
- **显式调用** —— 业务层决定哪些 call 要审计，不自动 wrap TextClient
- **按天切文件** —— 肉眼翻查容易

### 13.9 调用示例（未来接入 UI 后）

```ts
import { forgeVideoPlan } from '@/llm/forgeVideoPlan'
import { runVideoPlan, createBrowserTailFrameExtractor } from '@/llm/videoPipelineRunner'

// 1) 规划
const plan = await forgeVideoPlan(llmClient, {
  scene,
  scenario,
  modelId: 'seedance-doubao',
  directorStyle: scenario.directorStyle,
})

// 2) 执行
const result = await runVideoPlan({
  plan,
  client: videoClient,
  extractTailFrame: createBrowserTailFrameExtractor(),
  resolveStartFrame: async (seg, prevResult) => {
    if (seg.startFrameStrategy === 'prev-segment-tail' && prevResult) {
      return await extractTailFrame(prevResult.url)
    }
    if (seg.startFrameStrategy === 'shot-start-frame') {
      return await mediaStore.getDataUrl(shot.startFrameMediaRef)
    }
    return await mediaStore.getDataUrl(shot.keyframeMediaRef)
  },
  onProgress: (ev) => console.log(ev),
})

// 3) 写回 scenario（调用方负责）
result.segmentResults.filter(r => r.ok).forEach(sr => {
  // 同一 shot 的多 segment → 作者在 UI 做 concat 预览；
  // 单 segment shot → 直接落 shot.videoMediaRef
})
```

### 13.10 模块边界检查清单

- [ ] `modelCapabilities.ts` 是否唯一事实源？所有策略层 import 它？
- [ ] `clampDurationSec` 是否允许 1-60 整数秒？没有 5/10 硬档位？
- [ ] `Shot.sourceTextSpan` 是否被 buildShotKeyframePrompt / forgeKineticVideoPrompt 看见？
- [ ] `continuityGroupId` 同组段 `dependsOnSegmentId` 链是否完整？
- [ ] `videoSchedule.buildVideoDag` 是否能检测并断环？
- [ ] `createBrowserTailFrameExtractor` 在 Node 下调用会不会崩？（应返回 undefined）
- [ ] 审计条 `userPromptPreview` 是否截断到 200 字？
- [ ] 未知 `modelId` 调 `getCapability` 是否回退 DEFAULT_MODEL 而非抛异常？

