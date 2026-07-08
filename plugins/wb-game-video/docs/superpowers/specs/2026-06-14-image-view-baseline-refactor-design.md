# 图像视图重构设计 · 视频制作基准库

> 范围：`@forgeax-plugin/wb-reel` 的「图像」视图（`forgeView='image'`）。
> 剧情树视图本轮不动（另有智能体优化）。

## 一、北极星原则

「图像」视图下的所有模块都是**后续视频制作的基准库（baseline）**：

- **风格**：定生图 / 生视频的统一美术调性（`scenario.visualStyle`，注入所有生图/生视频 prompt）。
- **参考图**：锁角色 / 场所 / 道具的视觉一致性（关键帧生图喂 ref）。
- **UI**：定游戏化界面规范（`scenario.uiStyle.prompt`，注入 UI 元素生成）。
- **小游戏**：定本剧本可用的玩法池（`scenario.enabledMinigameIds`），下游剧情树剪辑只从池中选。

所有选择都必须能**下沉**影响后续剧情树剪辑 + 视频生成管线。

## 二、Bug 修复：图像分区不切换

### 根因

wb-reel 在主工程是分屏双 iframe（`pane=left` 侧栏 / `pane=center` 内容区），各有独立
zustand store，靠 `crossPaneSync.ts` 的 `BroadcastChannel` 镜像路由状态。
当前同步了 `activeTab` / `forgeView` / `studioTab`，**漏了 `imageSection`**。
所以侧栏点「风格/参考图/UI」只改 left store，center 永远停在它自己 localStorage
持久化的旧值（表现为「一直只显示 UI」）。

### 修法

`crossPaneSync.ts`：
- `SyncPayload.patch` 增加 `imageSection?: ImageSection`。
- 订阅 `shellStore` 变化时，对称地 diff + 广播 `imageSection`（仿 `forgeView`）。
- 接收远端 patch 时 apply `imageSection`（仿 `forgeView`，带 `isApplying` 防回环）。
- mount 后首次全量广播里带上 `imageSection`。

最小改动、零风险，与现有 `forgeView` 逻辑完全对称。

## 三、风格分区 → 电影海报 cover-flow

### 数据（A+B 结合）

- **保留**现有 6 个 `VisualStyle` 枚举不动（`photoreal/anime/cartoon/pixelart/watercolor/ink`），
  它们已接入 `composeVisualPrompt` 全生图/生视频管线，动枚举会破坏兼容。
- **扩充** `visualStylePresets.ts`，给每个预设新增：
  - `posterPrompt: string` —— 电影海报英文提示词（海报构图 / 标题留白 / 光影氛围 / 35mm grain / one-sheet layout）。
  - `tagline: string` —— 中文一句宣传语。
- 落到 `scenario.visualStyle` 的仍是 6 个枚举之一。

### 海报图来源（实时 API + IndexedDB 缓存）

新建 `media/stylePosterCache.ts`，仿 `sceneImageCache`：
- 首次展开某风格 → 调 `GptImageProvider.generate({ prompt: posterPrompt, size: '2:3' })`。
- 落 IndexedDB，key = `styleId + hash(posterPrompt)`，复用不重复烧额度。
- 缺 key → MockProvider / CSS 渐变占位兜底（用 `swatch` 双色 + tagline 文字做 CSS 海报）。

### 组件

新建 `forge/PosterCarousel.tsx`（风格 + UI 共用）：
- Cover-flow：左右卡带 3D 透视倾斜 + 缩放，中间主卡突出；圆角 + 弧度；惯性滑动。
- 支持键盘 ← →、拖拽、点击侧卡居中。
- 选中中间卡 = 回调 `onSelect(id)`。
- 海报区显示：海报图（或占位）+ label + tagline。

风格分区：`PosterCarousel` 选中 → `setVisualStyle(id)`。

## 四、UI 分区 → 海报式预设卡

### 数据

新建 `llm/uiStylePresets.ts`，定义 5-6 个预设，每个含：
`id / label / tagline / promptText（写入 uiStyle.prompt）/ posterPrompt / swatch`。
预设示例：黑曜石玻璃 · 复古像素 · 少女漫 · 赛博霓虹 · 极简院线。

### 组件

- 复用 `PosterCarousel` 展示，选中 → `setUIStyle({ prompt: preset.promptText })`。
- 末尾保留一张「自定义」卡 → 点开展开现有 `UIStylePanel`（textarea 手填），不丢手动能力。
- 海报图同样走 `stylePosterCache`（key 用 uiPreset id）。

## 五、图像视图新增「小游戏」分区（启用池）

### 类型 / 数据

- `ImageSection`: `'style' | 'refs' | 'ui'` → 加 `'minigame'`。
- `Scenario` 新增 `enabledMinigameIds?: string[]`（可选字段，向后兼容，不 bump schemaVersion；
  缺省 / 空 = 视为「全部可用」）。
- `scenarioStore` 加 action `toggleEnabledMinigame(id)`（在数组里增删该 id）。

### 侧栏 / 内容区

- `IMAGE_SECTION_DEFS` 在 UI 下方加「小游戏」项。
- 内容区 `minigame` 分区复用 `PosterCarousel`（或多选网格），每张卡 = 一个 `MINIGAMES`
  注册项，缩略图用占位/preview，**勾选/取消**写入 `enabledMinigameIds`。
- 小游戏卡为「多选」语义（与风格/UI 单选不同）；用卡片上的勾选标记表达，
  cover-flow 居中只代表「正在看」，勾选才入池。

### 联动剧情树

`TimelineDock.MinigameDock` 的下拉数据源从 `MINIGAMES` 全量改为：
```
const pool = enabledMinigameIds?.length
  ? MINIGAMES.filter(m => enabledMinigameIds.includes(m.id))
  : MINIGAMES
```
即图像视图提前选好，剪辑时只看到入池的。`enabledMinigameIds` 从 scenarioStore 读。

### 占位小游戏

magical-witch 已是真游戏可直接用。再补 2-3 个**假占位**：
- `minigames/registry.ts` 加条目（如 `placeholder-rhythm` / `placeholder-puzzle` / `placeholder-runner`）。
- 各配一个极简 `placeholder.html`（统一样式 + 「即将上线」+ 一个「跳过/通关」按钮发
  `minigame-win` postMessage，保证 Player 不卡死）。
- 后续替换真实游戏数据时只换 html + 缩略图，不动上层。

## 六、前期 Prompt 工具资产（先写好）

1. 6 个 `visualStyle` 的 `posterPrompt`（英文电影海报）+ `tagline`（中文）。
2. 5-6 个 UI 预设的 `promptText` + `posterPrompt` + `tagline`。
3. 海报生成统一质量后缀：竖版 `2:3` 院线比例、标题安全留白、无文字水印、cinematic one-sheet。

## 七、测试

- `crossPaneSync` 新增 `imageSection` 同步：单测验证 patch 含/apply `imageSection`（仿现有 forgeView 测试）。
- `visualStylePresets` / `uiStylePresets`：纯数据完整性测试（每项必含 posterPrompt/tagline/promptText，id 唯一）。
- `toggleEnabledMinigame`：store action 单测（增删幂等）。
- `MinigameDock` 过滤逻辑：纯函数抽出 `filterEnabledMinigames(all, enabledIds)` 走 TDD。

## 八、不做（YAGNI / 越界）

- 不动剧情树视图（另有智能体）。
- 不改 `VisualStyle` 枚举本身（保管线兼容）。
- 不接入真实第三方游戏资产（占位先行，避免侵权风险，待用户提供数据）。
- 海报不做服务端批量预生成；按需 + 缓存即可。
