# 图像视图基准库重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复图像分区跨 iframe 不切换的 bug，并把「风格 / UI」改成电影海报 cover-flow、在图像视图新增「小游戏」启用池，全部作为后续视频制作基准库。

**Architecture:** 工作仓库 = `forgeax-studio/packages/marketplace/extensions/wb-reel`（即 `forgeax-marketplace` 仓库工作副本）。改后须 `bun run build` 重建 dist（host 优先加载 dist）。先 bug 修复（crossPaneSync 加 imageSection），再纯数据层（presets + store action + 过滤纯函数，全 TDD），最后 UI 组件（PosterCarousel + 各分区）。

**Tech Stack:** React + zustand + zundo + Vite + vitest（happy-dom）。生图走 `GptImageProvider`，缓存仿 `sceneImageCache` 落 IndexedDB。

**关键约束（来自工作区记忆）:**
- 改 `src/` 后必须在该插件目录 `bun run build` 重建 dist，否则 host 加载旧 dist「代码改了界面没变」。
- vitest 默认 node 环境；import 浏览器模块的测试需 `// @vitest-environment happy-dom`。
- `ImageRequest.size` 仅支持 `'1024x1024' | '1024x1536' | '1536x1024'`；竖版海报用 `'1024x1536'`。
- 改完在 `packages/marketplace` 暂存指针提交父仓，勿连带 engine/bun.lock。

---

## File Structure

- 修改 `src/shell/crossPaneSync.ts` — 加 imageSection 同步
- 创建 `src/shell/__tests__/crossPaneSync.test.ts` — 桥接同步测试
- 修改 `src/llm/visualStylePresets.ts` — 加 posterPrompt / tagline
- 创建 `src/llm/uiStylePresets.ts` — UI 预设库
- 创建 `src/llm/__tests__/uiStylePresets.test.ts`
- 修改 `src/scenario/types.ts` — Scenario.enabledMinigameIds
- 修改 `src/scenario/scenarioStore.ts` — toggleEnabledMinigame action
- 创建 `src/minigames/filterEnabledMinigames.ts` — 过滤纯函数
- 创建 `src/minigames/__tests__/filterEnabledMinigames.ts` 的测试
- 修改 `src/minigames/registry.ts` — 加占位小游戏
- 创建 `src/minigames/placeholder/*.html` — 占位游戏
- 创建 `src/media/stylePosterCache.ts` — 海报生成 + IndexedDB 缓存
- 创建 `src/forge/PosterCarousel.tsx` — cover-flow 组件
- 修改 `src/forge/VisualStyleSelector.tsx` — 改用 PosterCarousel
- 修改 `src/editor/UIStylePanel.tsx` — 保留为「自定义」子面板
- 创建 `src/forge/UIStyleSelector.tsx` — UI 海报选择器
- 创建 `src/forge/MinigamePoolSelector.tsx` — 小游戏启用池
- 修改 `src/shell/shellStore.ts` — ImageSection 加 'minigame'
- 修改 `src/shell/ReelSidebar.tsx` — 侧栏加「小游戏」项
- 修改 `src/forge/ForgeWizard.tsx` — RefsPanel 分支接新组件
- 修改 `src/editor/timeline/TimelineDock.tsx` — MinigameDock 用过滤池

---

## Task 1: 修复图像分区跨 iframe 不切换（crossPaneSync 加 imageSection）

**Files:**
- Modify: `src/shell/crossPaneSync.ts`
- Test: `src/shell/__tests__/crossPaneSync.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/shell/__tests__/crossPaneSync.test.ts`：

```ts
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { installCrossPaneSync } from '../crossPaneSync'
import { useShellStore } from '../shellStore'

/**
 * crossPaneSync 通过 BroadcastChannel 在两个 iframe 间同步路由。
 * 单 jsdom/happy-dom 进程内 BroadcastChannel 会自发自收，所以这里用
 * 两个独立 channel 实例模拟两个 iframe：一个由 installCrossPaneSync 持有，
 * 另一个我们手动建来收/发对端消息。
 */
const CHANNEL = 'forgeax:wb-reel:pane-sync'

describe('crossPaneSync · imageSection 同步', () => {
  let dispose: () => void
  let peer: BroadcastChannel
  beforeEach(() => {
    useShellStore.setState({ forgeView: 'image', imageSection: 'refs' })
    dispose = installCrossPaneSync()
    peer = new BroadcastChannel(CHANNEL)
  })
  afterEach(() => {
    dispose()
    peer.close()
  })

  it('本地 setImageSection 会广播 imageSection patch', async () => {
    const got = new Promise<any>((resolve) => {
      peer.onmessage = (e) => {
        if (e.data?.patch?.imageSection) resolve(e.data.patch)
      }
    })
    useShellStore.getState().setImageSection('style')
    const patch = await got
    expect(patch.imageSection).toBe('style')
  })

  it('收到远端 imageSection patch 会 apply 到本地 store', async () => {
    peer.postMessage({
      senderId: 'peer-fake',
      seq: 1,
      patch: { imageSection: 'ui' },
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(useShellStore.getState().imageSection).toBe('ui')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun run test -- crossPaneSync`（或 `npx vitest run src/shell/__tests__/crossPaneSync.test.ts`）
Expected: FAIL（imageSection 未被广播 / 未被 apply）。

- [ ] **Step 3: 修改 crossPaneSync.ts**

import 增加 `ImageSection`：

```ts
import { useShellStore, type ShellTab, type ForgeView, type ImageSection } from './shellStore'
```

`SyncPayload.patch` 增加字段：

```ts
  patch: {
    activeTab?: ShellTab
    forgeView?: ForgeView
    imageSection?: ImageSection
    studioTab?: StudioTab
  }
```

订阅块（在 `lastForgeView` 之后）新增 `lastImageSection` 并在 subscribe 里 diff：

```ts
  let lastForgeView = useShellStore.getState().forgeView
  let lastImageSection = useShellStore.getState().imageSection
  const unsubShell = useShellStore.subscribe((state) => {
    const patch: SyncPayload['patch'] = {}
    if (state.activeTab !== lastActiveTab) {
      lastActiveTab = state.activeTab
      patch.activeTab = state.activeTab
    }
    if (state.forgeView !== lastForgeView) {
      lastForgeView = state.forgeView
      patch.forgeView = state.forgeView
    }
    if (state.imageSection !== lastImageSection) {
      lastImageSection = state.imageSection
      patch.imageSection = state.imageSection
    }
    broadcast(patch)
  })
```

接收块（在 forgeView apply 之后）新增：

```ts
      if (patch.imageSection !== undefined) {
        const shell = useShellStore.getState()
        if (shell.imageSection !== patch.imageSection) {
          lastImageSection = patch.imageSection
          shell.setImageSection(patch.imageSection)
        }
      }
```

mount 后首次全量广播加上 imageSection：

```ts
  broadcast({
    activeTab: lastActiveTab,
    forgeView: lastForgeView,
    imageSection: lastImageSection,
    studioTab: lastStudioTab,
  })
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/shell/__tests__/crossPaneSync.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 5: 提交**

```bash
git add src/shell/crossPaneSync.ts src/shell/__tests__/crossPaneSync.test.ts
git commit -m "fix(wb-reel): sync imageSection across split-pane iframes

图像分区(风格/参考图/UI)在侧栏点击后中央内容区不切换的根因是
crossPaneSync 漏同步 imageSection。补上 patch 字段+订阅广播+接收 apply。"
```

---

## Task 2: 风格预设加 posterPrompt / tagline

**Files:**
- Modify: `src/llm/visualStylePresets.ts`
- Test: `src/llm/__tests__/visualStylePresets.test.ts`（已存在，追加断言）

- [ ] **Step 1: 写失败测试**

在 `src/llm/__tests__/visualStylePresets.test.ts` 末尾追加：

```ts
import { VISUAL_STYLE_LIST } from '../visualStylePresets'

describe('visualStylePresets · 海报字段完整性', () => {
  it('每个风格都带 posterPrompt + tagline', () => {
    for (const p of VISUAL_STYLE_LIST) {
      expect(typeof p.posterPrompt).toBe('string')
      expect(p.posterPrompt.length).toBeGreaterThan(20)
      expect(typeof p.tagline).toBe('string')
      expect(p.tagline.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/llm/__tests__/visualStylePresets.test.ts`
Expected: FAIL（posterPrompt undefined）。

- [ ] **Step 3: 修改 visualStylePresets.ts**

`VisualStylePreset` 接口加两字段：

```ts
  /** 电影海报专用提示词（竖版 one-sheet），仅用于风格分区样张海报生成 */
  posterPrompt: string
  /** 中文一句宣传语，海报下方展示 */
  tagline: string
```

给 6 个预设各补 posterPrompt + tagline（统一后缀强调海报构图/标题留白）：

```ts
  photoreal: {
    // ...现有字段保留...
    posterPrompt:
      'Cinematic theatrical movie poster, photorealistic, dramatic key lighting, lone hero silhouette, deep shadows, 35mm film grain, anamorphic flare, title-safe negative space in the bottom third, no text, professional one-sheet composition, vertical 2:3',
    tagline: '电影级真实质感 · 光影叙事',
  },
  anime: {
    posterPrompt:
      'Anime theatrical key visual poster, Japanese cel-shaded, vibrant saturated sky, expressive hero pose, bloom and lens flare, dynamic composition, title-safe negative space at bottom, no text, vertical 2:3',
    tagline: '日系动画 · 热血与情绪',
  },
  cartoon: {
    posterPrompt:
      'Western animated feature movie poster, bold outlines, flat vivid colors, playful exaggerated characters, sunny palette, title-safe space at bottom, no text, vertical 2:3 one-sheet',
    tagline: '西式卡通 · 合家欢冒险',
  },
  pixelart: {
    posterPrompt:
      'Retro 16-bit pixel art game cover poster, limited palette, crisp dithered shading, heroic sprite hero, parallax background, title-safe space at bottom, no text, vertical 2:3',
    tagline: '复古像素 · 街机黄金时代',
  },
  watercolor: {
    posterPrompt:
      'Watercolor illustrated movie poster, soft wet-on-wet washes, paper texture, gentle pastel palette, lyrical mood, title-safe negative space at bottom, no text, vertical 2:3',
    tagline: '水彩晕染 · 治愈抒情',
  },
  ink: {
    posterPrompt:
      'Chinese ink-wash (shuǐ-mò) movie poster, sumi-e brushstrokes, high contrast black ink on rice paper, abundant negative space, misty mountains, title-safe space at bottom, no text, vertical 2:3',
    tagline: '东方水墨 · 写意留白',
  },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/llm/__tests__/visualStylePresets.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/llm/visualStylePresets.ts src/llm/__tests__/visualStylePresets.test.ts
git commit -m "feat(wb-reel): add posterPrompt+tagline to visual style presets"
```

---

## Task 3: UI 预设库 uiStylePresets

**Files:**
- Create: `src/llm/uiStylePresets.ts`
- Test: `src/llm/__tests__/uiStylePresets.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/llm/__tests__/uiStylePresets.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { UI_STYLE_PRESETS } from '../uiStylePresets'

describe('uiStylePresets', () => {
  it('至少 5 个预设，id 唯一', () => {
    expect(UI_STYLE_PRESETS.length).toBeGreaterThanOrEqual(5)
    const ids = UI_STYLE_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('每项含 label/tagline/promptText/posterPrompt/swatch', () => {
    for (const p of UI_STYLE_PRESETS) {
      expect(p.label).toBeTruthy()
      expect(p.tagline).toBeTruthy()
      expect(p.promptText.length).toBeGreaterThan(10)
      expect(p.posterPrompt.length).toBeGreaterThan(20)
      expect(p.swatch).toHaveLength(2)
    }
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/llm/__tests__/uiStylePresets.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 创建 uiStylePresets.ts**

```ts
export interface UIStylePreset {
  id: string
  label: string
  tagline: string
  /** 写入 scenario.uiStyle.prompt 的中文描述 */
  promptText: string
  /** 海报样张生成用的英文提示词 */
  posterPrompt: string
  swatch: [string, string]
}

export const UI_STYLE_PRESETS: UIStylePreset[] = [
  {
    id: 'obsidian-glass',
    label: '黑曜石玻璃',
    tagline: '深夜电影 · 琥珀金描边',
    promptText:
      '深夜电影质感的 UI —— 黑曜石玻璃面板 + 极薄琥珀金描边 + 衬线中文 + 微弱胶片噪点，按钮悬浮投影柔和',
    posterPrompt:
      'Game UI style sheet poster: obsidian frosted-glass panels, thin amber-gold strokes, serif typography, subtle film grain, dark cinematic mood board, vertical 2:3, no text',
    swatch: ['#1b1b1f', '#d4a34a'],
  },
  {
    id: 'retro-pixel',
    label: '复古像素',
    tagline: '街机 HUD · 8-bit 描边',
    promptText:
      '复古像素游戏 UI —— 8-bit 描边按钮 + 点阵字体 + 高饱和原色 HUD + 硬阴影，街机风',
    posterPrompt:
      'Retro pixel game UI mockup poster: chunky 8-bit bordered buttons, bitmap font, saturated primary HUD, hard drop shadows, arcade vibe, vertical 2:3, no text',
    swatch: ['#222034', '#7cd8ff'],
  },
  {
    id: 'shoujo-manga',
    label: '少女漫',
    tagline: '柔光泡泡 · 粉系花边',
    promptText:
      '少女漫 UI —— 柔光圆角面板 + 粉系花边 + 闪光星点 + 手写体中文，浪漫梦幻',
    posterPrompt:
      'Shoujo manga game UI mockup poster: soft rounded pastel panels, pink lace frames, sparkle stars, handwriting font, dreamy romantic, vertical 2:3, no text',
    swatch: ['#ffd6e7', '#ff8fb1'],
  },
  {
    id: 'cyber-neon',
    label: '赛博霓虹',
    tagline: '故障辉光 · 霓虹边框',
    promptText:
      '赛博朋克 UI —— 霓虹青紫描边 + 故障辉光 + 等宽数字字体 + 半透明扫描线 HUD',
    posterPrompt:
      'Cyberpunk neon game UI mockup poster: cyan-magenta neon strokes, glitch glow, monospace digits, translucent scanline HUD, vertical 2:3, no text',
    swatch: ['#0c0c1a', '#23e6e0'],
  },
  {
    id: 'minimal-theatrical',
    label: '极简院线',
    tagline: '留白克制 · 院线字幕',
    promptText:
      '极简院线 UI —— 大留白 + 细线分隔 + 克制中性灰 + 院线式底部字幕条，安静高级',
    posterPrompt:
      'Minimal theatrical game UI mockup poster: generous whitespace, hairline dividers, neutral grays, cinema-style bottom subtitle bar, calm premium, vertical 2:3, no text',
    swatch: ['#101012', '#e8e8e8'],
  },
]

export function getUIStylePreset(id: string): UIStylePreset | null {
  return UI_STYLE_PRESETS.find((p) => p.id === id) ?? null
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/llm/__tests__/uiStylePresets.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/llm/uiStylePresets.ts src/llm/__tests__/uiStylePresets.test.ts
git commit -m "feat(wb-reel): add UI style presets library"
```

---

## Task 4: Scenario.enabledMinigameIds + toggleEnabledMinigame action

**Files:**
- Modify: `src/scenario/types.ts`（Scenario 接口，约 1131 行 visualStyle 附近）
- Modify: `src/scenario/scenarioStore.ts`（接口 ~365 行；实现 ~1577 行 setVisualStyle 之后）
- Test: `src/scenario/__tests__/storeActions.test.ts`（已存在，追加）

- [ ] **Step 1: 写失败测试**

在 `src/scenario/__tests__/storeActions.test.ts` 末尾追加（沿用该文件已有的 store 重置/取用模式 —— 若该文件用 `useScenarioStore.getState()`，照搬）：

```ts
import { useScenarioStore } from '../scenarioStore'

describe('scenarioStore · toggleEnabledMinigame', () => {
  it('增删幂等：toggle 同一 id 两次回到空', () => {
    useScenarioStore.getState().toggleEnabledMinigame('mg-a')
    expect(useScenarioStore.getState().scenario.enabledMinigameIds).toEqual(['mg-a'])
    useScenarioStore.getState().toggleEnabledMinigame('mg-b')
    expect(useScenarioStore.getState().scenario.enabledMinigameIds).toEqual(['mg-a', 'mg-b'])
    useScenarioStore.getState().toggleEnabledMinigame('mg-a')
    expect(useScenarioStore.getState().scenario.enabledMinigameIds).toEqual(['mg-b'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/scenario/__tests__/storeActions.test.ts`
Expected: FAIL（toggleEnabledMinigame 不存在）。

- [ ] **Step 3: 实现**

`types.ts` Scenario 接口在 `visualStyle?` 之后加：

```ts
  /**
   * 本剧本启用的小游戏池 —— 作者在「图像」视图小游戏分区勾选。
   * 缺省 / 空数组 = 视为「全部可用」（向后兼容；不 bump schemaVersion）。
   * 下游剧情树剪辑 (TimelineDock.MinigameDock) 只从此池选可拖小游戏。
   */
  enabledMinigameIds?: string[]
```

`scenarioStore.ts` 接口（setVisualStyle 之后）加：

```ts
  /** 切换某小游戏在本剧本的启用状态（在 enabledMinigameIds 数组里增删） */
  toggleEnabledMinigame: (minigameId: string) => void
```

实现（setVisualStyle 实现之后）：

```ts
  toggleEnabledMinigame: (minigameId) =>
    set((s) => {
      const cur = s.scenario.enabledMinigameIds ?? []
      const next = cur.includes(minigameId)
        ? cur.filter((id) => id !== minigameId)
        : [...cur, minigameId]
      return { scenario: { ...s.scenario, enabledMinigameIds: next } }
    }),
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/scenario/__tests__/storeActions.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/scenario/types.ts src/scenario/scenarioStore.ts src/scenario/__tests__/storeActions.test.ts
git commit -m "feat(wb-reel): add scenario.enabledMinigameIds + toggleEnabledMinigame"
```

---

## Task 5: 小游戏过滤纯函数 + 占位小游戏注册

**Files:**
- Create: `src/minigames/filterEnabledMinigames.ts`
- Test: `src/minigames/__tests__/filterEnabledMinigames.test.ts`
- Modify: `src/minigames/registry.ts`
- Create: `src/minigames/placeholder/rhythm.html`、`puzzle.html`、`runner.html`

- [ ] **Step 1: 写失败测试**

创建 `src/minigames/__tests__/filterEnabledMinigames.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { filterEnabledMinigames } from '../filterEnabledMinigames'
import type { MinigameDescriptor } from '../registry'

const all: MinigameDescriptor[] = [
  { id: 'a', title: 'A', src: '/a', blurb: '', defaultDurationMs: 1000 },
  { id: 'b', title: 'B', src: '/b', blurb: '', defaultDurationMs: 1000 },
]

describe('filterEnabledMinigames', () => {
  it('enabledIds 为空/undefined → 返回全部（向后兼容）', () => {
    expect(filterEnabledMinigames(all, undefined)).toEqual(all)
    expect(filterEnabledMinigames(all, [])).toEqual(all)
  })
  it('enabledIds 非空 → 只保留池内', () => {
    expect(filterEnabledMinigames(all, ['b']).map((m) => m.id)).toEqual(['b'])
  })
  it('池里有不存在的 id → 安全忽略', () => {
    expect(filterEnabledMinigames(all, ['b', 'zzz']).map((m) => m.id)).toEqual(['b'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/minigames/__tests__/filterEnabledMinigames.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现纯函数**

创建 `src/minigames/filterEnabledMinigames.ts`：

```ts
import type { MinigameDescriptor } from './registry'

/**
 * 按启用池过滤小游戏。
 * enabledIds 为空/undefined → 视为「全部可用」（向后兼容）。
 */
export function filterEnabledMinigames(
  all: MinigameDescriptor[],
  enabledIds: string[] | undefined,
): MinigameDescriptor[] {
  if (!enabledIds || enabledIds.length === 0) return all
  return all.filter((m) => enabledIds.includes(m.id))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/minigames/__tests__/filterEnabledMinigames.test.ts`
Expected: PASS。

- [ ] **Step 5: 注册占位小游戏**

`src/minigames/registry.ts` 的 `MINIGAMES` 数组追加（在 magical-witch 之后）：

```ts
  {
    id: 'placeholder-rhythm',
    title: '节奏点击（占位）',
    src: embed('placeholder/rhythm.html'),
    blurb: '占位玩法：节奏点击，后续替换真实游戏数据。',
    tag: '节奏',
    defaultDurationMs: 30_000,
  },
  {
    id: 'placeholder-puzzle',
    title: '解谜拼图（占位）',
    src: embed('placeholder/puzzle.html'),
    blurb: '占位玩法：解谜拼图，后续替换真实游戏数据。',
    tag: '解谜',
    defaultDurationMs: 40_000,
  },
  {
    id: 'placeholder-runner',
    title: '跑酷冲刺（占位）',
    src: embed('placeholder/runner.html'),
    blurb: '占位玩法：跑酷冲刺，后续替换真实游戏数据。',
    tag: '跑酷',
    defaultDurationMs: 35_000,
  },
```

- [ ] **Step 6: 创建占位 html（三个内容相同，只改标题）**

`src/minigames/placeholder/rhythm.html`（puzzle.html / runner.html 复制后改 `<title>` 与 h1 文案）：

```html
<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<title>节奏点击（占位）</title>
<style>
  html,body{margin:0;height:100%;background:#0c0c10;color:#e8e8e8;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center}
  .wrap{text-align:center;padding:32px}
  h1{font-size:22px;margin:0 0 8px;color:#d4ff48}
  p{opacity:.7;font-size:13px;margin:0 0 24px}
  button{padding:10px 22px;border:1px solid #d4ff48;background:transparent;color:#d4ff48;border-radius:999px;font-size:14px;cursor:pointer}
  button:hover{background:rgba(212,255,72,.12)}
</style>
</head>
<body>
  <div class="wrap">
    <h1>节奏点击 · 占位</h1>
    <p>真实玩法即将上线。点击下方按钮模拟通关以继续剧情。</p>
    <button id="win">模拟通关 ▶</button>
  </div>
  <script>
    const post = (type) => parent.postMessage({ source: 'reel-minigame', id: 'placeholder-rhythm', type }, '*')
    post('minigame-ready')
    document.getElementById('win').onclick = () => post('minigame-win')
  </script>
</body>
</html>
```

注意：puzzle.html 把脚本里 `id: 'placeholder-rhythm'` 改成 `'placeholder-puzzle'`，runner.html 改 `'placeholder-runner'`。

- [ ] **Step 7: 跑全量 minigames 测试**

`vite.config.ts` 的 `reelMinigamesPlugin` 用 `resolve(rootDir, '.' + urlPath)` serve `src/minigames` 下任意嵌套路径（已确认，无需改 glob；`placeholder/rhythm.html` → `/__minigames/placeholder/rhythm.html` 直接可用，机制与 magical-witch 一致）。
Run: `npx vitest run src/minigames`
Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add src/minigames
git commit -m "feat(wb-reel): minigame enable-pool filter + 3 placeholder games"
```

---

## Task 6: 海报样张缓存 stylePosterCache

**Files:**
- Create: `src/media/stylePosterCache.ts`
- Test: `src/media/__tests__/stylePosterCache.test.ts`

设计：极简内存 + IndexedDB（复用 assetStore 已有的 idb 能力则更好，但为隔离风险此处用最小 idb 包装；若 assetStore 暴露通用 put/get 则优先复用）。海报生成走 `createImageProvider()`（缺 key 自动 MockProvider）。同一 cacheKey 只生一次，in-flight 共享 Promise。

- [ ] **Step 1: 写失败测试**

创建 `src/media/__tests__/stylePosterCache.test.ts`：

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { ensureStylePoster, __resetStylePosterCacheForTest } from '../stylePosterCache'
import type { ImageClient, ImageRequest, ImageResult } from '../../llm/types'

function fakeClient(dataUrl: string): { client: ImageClient; calls: () => number } {
  let n = 0
  return {
    client: {
      async generate(_req: ImageRequest): Promise<ImageResult> {
        n += 1
        return { dataUrl, latencyMs: 1 } as ImageResult
      },
    },
    calls: () => n,
  }
}

describe('stylePosterCache', () => {
  it('同一 cacheKey 只调用一次 provider（内存命中）', async () => {
    __resetStylePosterCacheForTest()
    const { client, calls } = fakeClient('data:image/png;base64,AAA')
    const a = await ensureStylePoster('style:photoreal', 'poster prompt', client)
    const b = await ensureStylePoster('style:photoreal', 'poster prompt', client)
    expect(a).toBe('data:image/png;base64,AAA')
    expect(b).toBe('data:image/png;base64,AAA')
    expect(calls()).toBe(1)
  })

  it('provider 抛错 → 返回 null（占位兜底由 UI 处理）', async () => {
    __resetStylePosterCacheForTest()
    const bad: ImageClient = {
      async generate() {
        throw new Error('no key')
      },
    }
    const r = await ensureStylePoster('style:anime', 'p', bad)
    expect(r).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/media/__tests__/stylePosterCache.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 stylePosterCache.ts**

```ts
import type { ImageClient } from '../llm/types'

/**
 * 风格 / UI 海报样张缓存。
 *
 * - cacheKey 唯一标识一张海报（如 'style:photoreal' / 'ui:obsidian-glass'）。
 * - 内存命中优先；in-flight 共享同一 Promise，避免并发重复生成。
 * - 落 IndexedDB（'reel-style-posters' store），刷新后复用不重复烧额度。
 * - provider 抛错（缺 key 等）→ 返回 null，UI 用 CSS 渐变占位兜底。
 *
 * 刻意不依赖 zustand —— 这是纯缓存工具，UI 用 useEffect 调 ensureStylePoster
 * 再 setState 展示即可。
 */

const DB_NAME = 'reel-style-posters'
const STORE = 'posters'

const mem = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly')
    const r = tx.objectStore(STORE).get(key)
    r.onsuccess = () => resolve((r.result as string) ?? null)
    r.onerror = () => resolve(null)
  })
}

async function idbPut(key: string, val: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(val, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

/**
 * 确保某 cacheKey 的海报存在；返回 dataUrl 或 null。
 * 顺序：内存 → IndexedDB → provider 生成（落 IndexedDB+内存）。
 */
export async function ensureStylePoster(
  cacheKey: string,
  posterPrompt: string,
  client: ImageClient,
): Promise<string | null> {
  const hit = mem.get(cacheKey)
  if (hit) return hit
  const flying = inflight.get(cacheKey)
  if (flying) return flying

  const job = (async (): Promise<string | null> => {
    const disk = await idbGet(cacheKey)
    if (disk) {
      mem.set(cacheKey, disk)
      return disk
    }
    try {
      const res = await client.generate({ prompt: posterPrompt, size: '1024x1536' })
      if (res?.dataUrl) {
        mem.set(cacheKey, res.dataUrl)
        void idbPut(cacheKey, res.dataUrl)
        return res.dataUrl
      }
      return null
    } catch {
      return null
    } finally {
      inflight.delete(cacheKey)
    }
  })()

  inflight.set(cacheKey, job)
  return job
}

/** 仅供测试：清空内存缓存（IndexedDB 在 happy-dom 下隔离，无需清） */
export function __resetStylePosterCacheForTest(): void {
  mem.clear()
  inflight.clear()
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/media/__tests__/stylePosterCache.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/media/stylePosterCache.ts src/media/__tests__/stylePosterCache.test.ts
git commit -m "feat(wb-reel): style/UI poster sample cache (idb-backed)"
```

---

## Task 7: PosterCarousel 组件（cover-flow）

**Files:**
- Create: `src/forge/PosterCarousel.tsx`

复用组件，风格 / UI 共用。纯展示 + 受控选中。Cover-flow：当前居中卡正面放大，左右卡 3D 透视倾斜 + 缩小 + 半透明；圆角 + 弧度；惯性切换（CSS transition）。支持点侧卡居中、键盘 ← →、拖拽。海报图按 `posterUrl` 显示，缺失则用 `swatch` 渐变 + tagline 做 CSS 占位海报。

无独立单测（纯展示组件，逻辑在数据层已测）；通过 build + 手测验证。

- [ ] **Step 1: 创建组件**

```tsx
import { useRef, useState, useEffect, useCallback } from 'react'
import { injectStyleOnce } from '../styles/injectStyle'

export interface PosterItem {
  id: string
  label: string
  tagline: string
  /** 已就绪的海报 dataUrl/URL；undefined 时用 swatch 占位 */
  posterUrl?: string
  swatch: [string, string]
  /** 多选模式下：是否已勾选入池 */
  selected?: boolean
}

export interface PosterCarouselProps {
  items: PosterItem[]
  /** 当前居中项 id（单选语义=同时是"选中值"；多选语义=仅"正在看"） */
  activeId: string
  /** 居中项变化（用户切换） */
  onActiveChange: (id: string) => void
  /** 点中间主海报的主操作：单选=选定；多选=切换勾选 */
  onPrimary?: (id: string) => void
  /** 主按钮文案，如 '选为风格' / '加入小游戏池' / '已选 ✓' */
  primaryLabel?: (item: PosterItem) => string
  /** 多选模式：主海报右上角显示勾选角标 */
  multiSelect?: boolean
}

export function PosterCarousel({
  items,
  activeId,
  onActiveChange,
  onPrimary,
  primaryLabel,
  multiSelect,
}: PosterCarouselProps) {
  const idx = Math.max(0, items.findIndex((i) => i.id === activeId))
  const go = useCallback(
    (delta: number) => {
      const next = Math.min(items.length - 1, Math.max(0, idx + delta))
      if (next !== idx) onActiveChange(items[next]!.id)
    },
    [idx, items, onActiveChange],
  )

  // 键盘左右
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [go])

  // 拖拽切换
  const drag = useRef<{ x: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX } }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    drag.current = null
    if (dx > 40) go(-1)
    else if (dx < -40) go(1)
  }

  return (
    <div
      className="ks-pcar"
      ref={rootRef}
      tabIndex={0}
      role="listbox"
      aria-label="海报选择"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <button className="ks-pcar-nav is-prev" onClick={() => go(-1)} disabled={idx <= 0} aria-label="上一张">‹</button>
      <div className="ks-pcar-stage">
        {items.map((it, i) => {
          const offset = i - idx
          const abs = Math.abs(offset)
          if (abs > 2) return null // 只渲染中间 ±2 张
          const isCenter = offset === 0
          const style: React.CSSProperties = {
            transform:
              `translateX(${offset * 56}%) ` +
              `scale(${isCenter ? 1 : 0.78 - (abs - 1) * 0.06}) ` +
              `rotateY(${offset === 0 ? 0 : offset < 0 ? 32 : -32}deg)`,
            zIndex: 10 - abs,
            opacity: abs > 1 ? 0.35 : 1,
            filter: isCenter ? 'none' : 'brightness(0.6)',
            pointerEvents: isCenter ? 'auto' : 'auto',
          }
          return (
            <article
              key={it.id}
              className={`ks-pcar-card${isCenter ? ' is-center' : ''}`}
              style={style}
              role="option"
              aria-selected={isCenter}
              onClick={() => (isCenter ? onPrimary?.(it.id) : onActiveChange(it.id))}
            >
              <div
                className="ks-pcar-poster"
                style={
                  it.posterUrl
                    ? { backgroundImage: `url(${it.posterUrl})` }
                    : { background: `linear-gradient(150deg, ${it.swatch[0]}, ${it.swatch[1]})` }
                }
              >
                {!it.posterUrl && <span className="ks-pcar-ph">{it.label}</span>}
                {multiSelect && it.selected && <span className="ks-pcar-check" aria-hidden>✓</span>}
              </div>
              <div className="ks-pcar-meta">
                <div className="ks-pcar-label">{it.label}</div>
                <div className="ks-pcar-tag">{it.tagline}</div>
              </div>
              {isCenter && onPrimary && (
                <button
                  className={`ks-pcar-primary${multiSelect && it.selected ? ' is-on' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onPrimary(it.id) }}
                >
                  {primaryLabel ? primaryLabel(it) : '选择'}
                </button>
              )}
            </article>
          )
        })}
      </div>
      <button className="ks-pcar-nav is-next" onClick={() => go(1)} disabled={idx >= items.length - 1} aria-label="下一张">›</button>
    </div>
  )
}

const css = `
.ks-pcar { position: relative; display: flex; align-items: center; justify-content: center;
  width: 100%; min-height: 420px; outline: none; user-select: none; }
.ks-pcar-stage { position: relative; width: 280px; height: 400px;
  transform-style: preserve-3d; perspective: 1200px; }
.ks-pcar-card { position: absolute; inset: 0; width: 280px; height: 400px;
  transition: transform .45s cubic-bezier(.22,.61,.36,1), opacity .45s, filter .45s;
  cursor: pointer; transform-style: preserve-3d; }
.ks-pcar-poster { width: 100%; height: 340px; border-radius: 18px;
  background-size: cover; background-position: center;
  box-shadow: 0 18px 48px rgba(0,0,0,.55); position: relative;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255,255,255,.08); overflow: hidden; }
.ks-pcar-card.is-center .ks-pcar-poster { box-shadow: 0 24px 60px rgba(0,0,0,.7),
  0 0 0 2px color-mix(in srgb, var(--color-brand-primary) 55%, transparent); }
.ks-pcar-ph { font-size: 26px; font-weight: 800; color: rgba(255,255,255,.85);
  letter-spacing: .08em; text-shadow: 0 2px 12px rgba(0,0,0,.5); }
.ks-pcar-check { position: absolute; top: 10px; right: 10px; width: 30px; height: 30px;
  border-radius: 50%; background: var(--color-brand-primary); color: #11150a;
  display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; }
.ks-pcar-meta { text-align: center; margin-top: 12px; }
.ks-pcar-label { font-size: 15px; font-weight: 700; color: var(--color-text-primary); }
.ks-pcar-tag { font-size: 12px; color: var(--color-text-tertiary); margin-top: 2px; }
.ks-pcar-primary { margin: 12px auto 0; display: block; padding: 7px 20px;
  border-radius: 999px; border: 1px solid var(--color-brand-primary);
  background: color-mix(in srgb, var(--color-brand-primary) 16%, transparent);
  color: var(--color-brand-primary); font-size: 13px; cursor: pointer; }
.ks-pcar-primary.is-on { background: var(--color-brand-primary); color: #11150a; font-weight: 700; }
.ks-pcar-nav { position: absolute; top: 170px; z-index: 30; width: 40px; height: 40px;
  border-radius: 50%; border: 1px solid var(--color-border-default);
  background: var(--color-background-elevated); color: var(--color-text-primary);
  font-size: 22px; line-height: 1; cursor: pointer; }
.ks-pcar-nav:disabled { opacity: .3; cursor: default; }
.ks-pcar-nav.is-prev { left: 8px; }
.ks-pcar-nav.is-next { right: 8px; }
`
injectStyleOnce('poster-carousel', css)
```

- [ ] **Step 2: 提交**

```bash
git add src/forge/PosterCarousel.tsx
git commit -m "feat(wb-reel): add PosterCarousel cover-flow component"
```

---

## Task 8: 风格分区改用 PosterCarousel

**Files:**
- Modify: `src/forge/VisualStyleSelector.tsx`

把现有 chip 行替换为 PosterCarousel；用 useEffect 调 `ensureStylePoster` 异步填海报。选中居中海报 → `setVisualStyle(id)`。

- [ ] **Step 1: 重写 VisualStyleSelector.tsx 主体**

```tsx
import { useState, useEffect } from 'react'
import { useScenarioStore } from '../scenario/scenarioStore'
import {
  VISUAL_STYLE_LIST,
  DEFAULT_VISUAL_STYLE,
  type VisualStyle,
} from '../llm/visualStylePresets'
import { PosterCarousel, type PosterItem } from './PosterCarousel'
import { ensureStylePoster } from '../media/stylePosterCache'
import { createImageProvider } from '../llm/GptImageProvider'

export function VisualStyleSelector() {
  const current: VisualStyle =
    useScenarioStore((s) => s.scenario.visualStyle) ?? DEFAULT_VISUAL_STYLE
  const setVisualStyle = useScenarioStore((s) => s.setVisualStyle)
  const [active, setActive] = useState<string>(current)
  const [posters, setPosters] = useState<Record<string, string>>({})

  useEffect(() => { setActive(current) }, [current])

  // 居中项变化时按需生成海报（缓存命中则秒回）
  useEffect(() => {
    const preset = VISUAL_STYLE_LIST.find((p) => p.id === active)
    if (!preset || posters[active]) return
    let alive = true
    const client = createImageProvider()
    ensureStylePoster(`style:${preset.id}`, preset.posterPrompt, client).then((url) => {
      if (alive && url) setPosters((m) => ({ ...m, [preset.id]: url }))
    })
    return () => { alive = false }
  }, [active, posters])

  const items: PosterItem[] = VISUAL_STYLE_LIST.map((p) => ({
    id: p.id,
    label: p.label,
    tagline: p.tagline,
    posterUrl: posters[p.id],
    swatch: p.swatch,
  }))

  return (
    <section className="ks-vstyle-carousel" aria-label="全局美术风格">
      <header className="ks-vstyle-head">
        <span className="ks-mono ks-vstyle-kicker">VISUAL STYLE · 视频制作基准</span>
        <span className="ks-vstyle-hint ks-cn">
          全局美术风格 · 影响后续生成的场景图 / 角色立绘 / 关键帧 / 视频
        </span>
      </header>
      <PosterCarousel
        items={items}
        activeId={active}
        onActiveChange={setActive}
        onPrimary={(id) => setVisualStyle(id as VisualStyle)}
        primaryLabel={(it) => (it.id === current ? '✓ 当前风格' : '选为风格')}
      />
    </section>
  )
}
```

保留底部原有 `injectStyleOnce('visual-style-selector', css)` 的 head 相关样式（`.ks-vstyle-head/-kicker/-hint`），删掉 chip/row/swatch 旧样式（已被 PosterCarousel 取代）。

- [ ] **Step 2: 类型检查 + 提交**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: 无新增错误。
```bash
git add src/forge/VisualStyleSelector.tsx
git commit -m "feat(wb-reel): style section -> poster cover-flow"
```

---

## Task 9: UI 分区改用 PosterCarousel（+ 自定义卡）

**Files:**
- Create: `src/forge/UIStyleSelector.tsx`
- Modify: `src/forge/ForgeWizard.tsx`（imageSection==='ui' 分支改渲染 UIStyleSelector，保留 UIStylePanel 作为自定义子面板）

- [ ] **Step 1: 创建 UIStyleSelector.tsx**

```tsx
import { useState, useEffect } from 'react'
import { useScenarioStore } from '../scenario/scenarioStore'
import { UI_STYLE_PRESETS } from '../llm/uiStylePresets'
import { PosterCarousel, type PosterItem } from './PosterCarousel'
import { ensureStylePoster } from '../media/stylePosterCache'
import { createImageProvider } from '../llm/GptImageProvider'
import { UIStylePanel } from '../editor/UIStylePanel'

export function UIStyleSelector() {
  const setUIStyle = useScenarioStore((s) => s.setUIStyle)
  const currentPrompt = useScenarioStore((s) => s.scenario.uiStyle?.prompt ?? '')
  const matched = UI_STYLE_PRESETS.find((p) => p.promptText === currentPrompt)
  const [active, setActive] = useState<string>(matched?.id ?? UI_STYLE_PRESETS[0]!.id)
  const [posters, setPosters] = useState<Record<string, string>>({})
  const [customOpen, setCustomOpen] = useState(false)

  useEffect(() => {
    const preset = UI_STYLE_PRESETS.find((p) => p.id === active)
    if (!preset || posters[active]) return
    let alive = true
    const client = createImageProvider()
    ensureStylePoster(`ui:${preset.id}`, preset.posterPrompt, client).then((url) => {
      if (alive && url) setPosters((m) => ({ ...m, [preset.id]: url }))
    })
    return () => { alive = false }
  }, [active, posters])

  const items: PosterItem[] = UI_STYLE_PRESETS.map((p) => ({
    id: p.id,
    label: p.label,
    tagline: p.tagline,
    posterUrl: posters[p.id],
    swatch: p.swatch,
  }))

  return (
    <section aria-label="游戏化 UI 风格">
      <header className="ks-vstyle-head">
        <span className="ks-mono ks-vstyle-kicker">GAME UI STYLE · 视频制作基准</span>
        <span className="ks-vstyle-hint ks-cn">
          游戏化 UI 风格 · 按钮 / 字幕条 / HUD 的视觉规范
        </span>
      </header>
      <PosterCarousel
        items={items}
        activeId={active}
        onActiveChange={setActive}
        onPrimary={(id) => {
          const p = UI_STYLE_PRESETS.find((x) => x.id === id)
          if (p) setUIStyle({ prompt: p.promptText })
        }}
        primaryLabel={(it) => (matched?.id === it.id ? '✓ 当前 UI' : '选为 UI 风格')}
      />
      <div className="ks-uis-custom">
        <button className="ks-uis-custom-toggle" onClick={() => setCustomOpen((v) => !v)}>
          {customOpen ? '收起自定义 ›' : '自定义 UI 风格（手动填写）'}
        </button>
        {customOpen && <UIStylePanel />}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: ForgeWizard.tsx 的 ui 分支改渲染 UIStyleSelector**

把 imageSection==='ui' 分支整段替换：

```tsx
  if (imageSection === 'ui') {
    return (
      <div className="ks-forge-step">
        <UIStyleSelector />
      </div>
    )
  }
```

并在文件顶部 import：`import { UIStyleSelector } from './UIStyleSelector'`（删掉不再直接用的 UIStylePanel import，若别处仍用则保留）。

- [ ] **Step 3: 类型检查 + 提交**

Run: `npx tsc -p tsconfig.build.json --noEmit`
```bash
git add src/forge/UIStyleSelector.tsx src/forge/ForgeWizard.tsx
git commit -m "feat(wb-reel): UI section -> poster cover-flow + custom panel"
```

---

## Task 10: 小游戏分区（启用池）+ shellStore/sidebar 接线

**Files:**
- Modify: `src/shell/shellStore.ts`（ImageSection 加 'minigame'，含 setImageSection 白名单、merge 白名单、persist 默认）
- Modify: `src/shell/ReelSidebar.tsx`（IMAGE_SECTION_DEFS 加项）
- Create: `src/forge/MinigamePoolSelector.tsx`
- Modify: `src/forge/ForgeWizard.tsx`（加 imageSection==='minigame' 分支）

- [ ] **Step 1: shellStore.ts 扩 ImageSection**

```ts
export type ImageSection = 'style' | 'refs' | 'ui' | 'minigame'
```
`setImageSection` 白名单数组、`merge` 钩子白名单数组都把 `'minigame'` 加进去：
```ts
if (section === 'style' || section === 'refs' || section === 'ui' || section === 'minigame') {
```
```ts
(['style', 'refs', 'ui', 'minigame'] as readonly string[]).includes(p.imageSection)
```

- [ ] **Step 2: ReelSidebar.tsx 加侧栏项**

`IMAGE_SECTION_DEFS` 数组末尾加：
```ts
  { id: 'minigame', label: '小游戏', hint: '本剧本启用的小游戏池 · 剪辑时可选' },
```

- [ ] **Step 3: 创建 MinigamePoolSelector.tsx（多选）**

```tsx
import { useState } from 'react'
import { useScenarioStore } from '../scenario/scenarioStore'
import { MINIGAMES } from '../minigames/registry'
import { PosterCarousel, type PosterItem } from './PosterCarousel'

export function MinigamePoolSelector() {
  const enabled = useScenarioStore((s) => s.scenario.enabledMinigameIds ?? [])
  const toggle = useScenarioStore((s) => s.toggleEnabledMinigame)
  const [active, setActive] = useState<string>(MINIGAMES[0]?.id ?? '')

  const items: PosterItem[] = MINIGAMES.map((m, i) => ({
    id: m.id,
    label: m.title,
    tagline: m.blurb,
    swatch: SWATCHES[i % SWATCHES.length]!,
    selected: enabled.includes(m.id),
  }))

  return (
    <section aria-label="小游戏启用池">
      <header className="ks-vstyle-head">
        <span className="ks-mono ks-vstyle-kicker">MINIGAME POOL · 视频制作基准</span>
        <span className="ks-vstyle-hint ks-cn">
          勾选本剧本可用的小游戏；剪辑剧情树时只从已启用的池中选择。
          {enabled.length === 0 ? '（当前未勾选 = 剪辑时全部可用）' : `（已启用 ${enabled.length} 个）`}
        </span>
      </header>
      <PosterCarousel
        items={items}
        activeId={active}
        onActiveChange={setActive}
        onPrimary={(id) => toggle(id)}
        primaryLabel={(it) => (it.selected ? '✓ 已加入池' : '加入小游戏池')}
        multiSelect
      />
    </section>
  )
}

const SWATCHES: [string, string][] = [
  ['#5b2e8c', '#d4ff48'],
  ['#1b4d6b', '#23e6e0'],
  ['#6b1b3a', '#ff8fb1'],
  ['#2b2a28', '#d4a34a'],
]
```

- [ ] **Step 4: ForgeWizard.tsx 加 minigame 分支**

在 imageSection==='ui' 分支之后加：
```tsx
  if (imageSection === 'minigame') {
    return (
      <div className="ks-forge-step">
        <MinigamePoolSelector />
      </div>
    )
  }
```
顶部 import：`import { MinigamePoolSelector } from './MinigamePoolSelector'`

- [ ] **Step 5: 类型检查 + 提交**

Run: `npx tsc -p tsconfig.build.json --noEmit`
```bash
git add src/shell/shellStore.ts src/shell/ReelSidebar.tsx src/forge/MinigamePoolSelector.tsx src/forge/ForgeWizard.tsx
git commit -m "feat(wb-reel): image view minigame enable-pool section"
```

---

## Task 11: 剧情树剪辑只显示启用池

**Files:**
- Modify: `src/editor/timeline/TimelineDock.tsx`（MinigameDock，约 672 行）

- [ ] **Step 1: MinigameDock 用过滤池**

```tsx
import { filterEnabledMinigames } from '../../minigames/filterEnabledMinigames'
import { useScenarioStore } from '../../scenario/scenarioStore'

function MinigameDock() {
  const enabledIds = useScenarioStore((s) => s.scenario.enabledMinigameIds)
  const pool = filterEnabledMinigames(MINIGAMES, enabledIds)
  const [selectedId, setSelectedId] = useState<string>(pool[0]?.id ?? '')
  const [label, setLabel] = useState('')
  const selected = pool.find((m) => m.id === selectedId) ?? pool[0] ?? null
  // ...其余沿用，把模板里两处 MINIGAMES.map / MINIGAMES.length 改为 pool
```

把 JSX 里 `MINIGAMES.length === 0` → `pool.length === 0`，`MINIGAMES.map(...)` → `pool.map(...)`。

- [ ] **Step 2: 类型检查 + 提交**

Run: `npx tsc -p tsconfig.build.json --noEmit`
```bash
git add src/editor/timeline/TimelineDock.tsx
git commit -m "feat(wb-reel): TimelineDock minigame picker honors enable-pool"
```

---

## Task 12: 全量测试 + 构建 + 跨副本同步 + 父仓指针

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: 新增测试全 PASS；已知遗留失败（turnaround-gpt.test.ts 的 3 个 prompt 断言，与本次无关）忽略。

- [ ] **Step 2: 重建 dist（关键：host 优先加载 dist）**

Run（在 wb-reel 目录）: `bun run build`
Expected: tsc + vite build 成功，`dist/index.html` mtime 更新。

- [ ] **Step 3: 同步到顶层 forgeax-marketplace 工作副本**

`packages/marketplace`(=`forgeax-marketplace` 仓库) 是改+push 处；顶层 `forgeax-marketplace/` 是同仓另一份工作副本，用 pull 同步，勿手抄致分叉。
本次在 `packages/marketplace/.../wb-reel` 提交后，顶层副本 `git pull` 即可。`wb-reel/` sibling 是 symlink 工作区，无需单独改。

- [ ] **Step 4: 提交父仓指针（仅相关项）**

在 `forgeax-studio` superproject：
```bash
git add packages/marketplace
git commit -m "chore: bump wb-reel (image view baseline refactor)"
```
勿连带 engine/harness/interface/bun.lock 等无关残留。

- [ ] **Step 5: 手测验证清单**
  - 侧栏点 风格/参考图/UI/小游戏 → 中央内容区即时切换（bug 已修）。
  - 风格：cover-flow 左右切换有弧度动效；选中写入 visualStyle；海报按需生成（缺 key 显示渐变占位）。
  - UI：同上；自定义卡可展开手填。
  - 小游戏：勾选入池；进剧情树剪辑「小游戏」tab 下拉只剩已勾选的（未勾选时全部可用）。

---

## Self-Review

**Spec coverage:**
- 图像分区不切换 bug → Task 1 ✓
- 风格海报 cover-flow + API + 缓存 → Task 2/6/7/8 ✓
- UI 海报 + 自定义 → Task 3/7/9 ✓
- 小游戏启用池 + 剧情树联动 + 占位游戏 → Task 4/5/10/11 ✓
- 视频制作基准原则 → 各 selector header 文案体现 ✓
- 前期 prompt 工具 → Task 2/3 数据 ✓

**Type consistency:** `PosterItem`/`PosterCarouselProps`、`ensureStylePoster(cacheKey, posterPrompt, client)`、`filterEnabledMinigames(all, enabledIds)`、`toggleEnabledMinigame(id)`、`ImageSection` 含 'minigame' 全文一致。`ImageRequest.size` 用合法值 `'1024x1536'`。

**Placeholder scan:** 无 TBD；每个改 code 的 step 均含完整代码或精确 diff 指令。

