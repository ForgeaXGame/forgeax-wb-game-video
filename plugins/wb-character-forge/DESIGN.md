# wb-character-forge · DESIGN.md

> **First-class forgeax workbench plugin.** 角色资产产线 + 试玩游乐场。
> 同时作为后续 wb-* 作者的样板模板,所以这份文档刻意写清"为什么"。

## 一句话

一个插件,两个模块: **生产**(立绘 / 三视图 / 行动小人 / 换装) + **游乐场**(把生成的角色加载到 mini-battle / walk 场景试玩 + 横向对比版本)。
人(Studio UI) 和 AI(bus tool / surface dispatch) 走同一条路。

## 范围

| 阶段 | 生产 | 游乐场 | 说明 |
|---|---|---|---|
| **M1 当前**(本次落地) | 立绘 + 三视图 + 4 向 walk sprite sheet | mini canvas: 帧序列循环 + 方向切换 | 端到端跑通 / 资产落盘 / AI 可调 / Playwright 验证 |
| M2 | 换装变体 / 攻击 + 待机帧 / 多角色批量 | BattleHUD 接入(直接复用 `3rd/workbench/character-editor/battle-ui-module/`) | 横向对比抽屉 / 满意才 stamp |
| M3 | Spine parts 拆件(走 nano-banana style transfer) | Three.js mini-scene · 行走 / 攻击 / 大招 | character-editor 的 VFX 编排 |

后续模块仅声明,本次不实现。

## 架构 · 文件物理

```
packages/marketplace/plugins/wb-character-forge/
├── forgeax-plugin.json          # manifest (workbench + tools + permissions)
├── DESIGN.md                    # 本文件
├── README.md                    # quickstart
├── src/
│   ├── server.ts                # Hono router factory exported as createCharacterForgeRouter()
│   ├── panel.tsx                # React panel (forgeax interface imports直接 lazy)
│   ├── clients/
│   │   ├── seedream.ts          # 即梦 / ARK image-gen (主立绘)
│   │   ├── gemini-image.ts      # nano-banana (主 sprite + image-edit)
│   │   ├── azure-gpt-image.ts   # 备援
│   │   └── litellm-text.ts      # prompt 改写 + 角色描述结构化
│   ├── prompts/
│   │   ├── portrait.ts          # 立绘 + 三视图 (移植自 character-editor TURNAROUND_*)
│   │   └── sprite.ts            # 4-dir walk sheet (简化版 pixel-char/prompt-engine)
│   ├── lib/
│   │   ├── storage.ts           # 资产落盘 .forgeax/games/<slug>/characters/<charId>/
│   │   ├── sprite-cut.ts        # sheet 切片 (Canvas2D 纯函数,移植自 sprite-processor)
│   │   └── ids.ts               # charId 生成 + 校验
│   └── types.ts                 # 跨前后端共享类型
├── schemas/
│   ├── generate-portrait.args.json
│   ├── generate-portrait.returns.json
│   ├── generate-sprite-sheet.args.json
│   ├── generate-sprite-sheet.returns.json
│   ├── list-characters.returns.json
│   └── get-character.returns.json
└── playground/
    └── index.html               # 独立可单跑 (debug用)
```

## 接线到 forgeax 主仓

因为 bus.call / entry.backend / Bus.models 仍是 stub(见 摸底报告),走最短路径:

1. **后端 router** `packages/server/src/api/wb-character-forge.ts` 引入 plugin 的 `createCharacterForgeRouter(ctx)` 并 mount 到 `/api/wb/character-forge/*`。`main.ts` 新增一行 `app.route('/api/wb/character-forge', ...)`。
2. **前端 panel** 在 `Sidebar.tsx` 的 bus-sourced tab 命中处 (`activeEntry.kind === 'bus' && activeEntry.id === 'wb:character-forge'`) 走特例 lazy import,而不是 BusPluginPlaceholder。其他 plugin 仍走 placeholder——这就是"过渡期"的契约。
3. **settings 白名单** `settings.ts` SAFE_ENV_KEYS 追加 5 把多模态 key (ARK / GEMINI / AZURE_GPT_IMAGE / LITELLM_PROXY / KLING)。`.env` 写真值,bun --watch 重启后插件后端可直接读 `process.env.*`。
4. **资产路径** `<projectRoot>/.forgeax/games/<slug>/characters/<charId>/` 走现有 `safe-path.ts` 白名单 (已含 `.forgeax/games/`)。
5. **Ledger 事件** 后端在每次生成完成时调 `bus.events.emit({name:'character-forge.<verb>', ...})`,经现有 FileLedger 落到 `~/.forgeax/ledger/current.jsonl`。

> 当 Phase 6+ 真把 entry.backend / entry.frontend 自动加载落地,本插件 manifest 已经先写全,届时只需要删掉主仓的特例 hookup,**不需要改 plugin 自身**——这是"模板"价值的一部分。

## 双模态 (dual-modality)

UI 内调 `useSurface({ id: 'character-forge.editor', ... })` 注册 surface,actions 至少包含:

| action | args | 用途 |
|---|---|---|
| `generatePortrait` | `{ prompt, style, charId? }` | 触发立绘生成,后端走 POST /api/wb/character-forge/portrait |
| `generateSpriteSheet` | `{ charId, action: 'walk'\|'attack'\|... }` | 行动小人 |
| `selectCharacter` | `{ charId }` | 切到画廊里某个角色 |
| `playgroundPlay` | `{ charId, action, direction }` | 游乐场播放控制 |

玩家点 button 调 `dispatch('generatePortrait', ...)`;AI POST `/api/bus/ui/surfaces/character-forge.editor/action` 入队后客户端 long-poll 拉到同一 actions.run。两条路径在同一 `run()` 闭包收敛。

> 注: 这里**前端 surface 是 dispatch 的发起方**,后端 HTTP 是动作的"执行手"。所以 AI 调 surface action 触发的还是同一份 fetch '/api/wb/character-forge/...'。这样后端 router 既给 AI 直调 (`POST /api/wb/character-forge/portrait`),也给 surface 路径用。"

## tool 暴露 (provides.tools)

| toolId | args | 用途 | exposedToAI |
|---|---|---|---|
| `character-forge:generate-portrait` | `{ slug, prompt, style?, refImage?, charId? }` → `{ charId, files:[...], cost }` | 立绘 + 三视图 (一次返三张/可选) | true |
| `character-forge:generate-sprite-sheet` | `{ slug, charId, action, directions?, frames? }` → `{ charId, sheetUrl, atlas:[{dir,frames}] }` | 4 向行走表(用 charId 拿到立绘做参考图,保持角色一致) | true |
| `character-forge:list-characters` | `{ slug? }` → `{ items: [{charId, name, portrait, createdAt}] }` | 画廊读取 | true |
| `character-forge:get-character` | `{ slug, charId }` → 完整 manifest + asset url | 单角色详情 | true |
| `character-forge:rename-character` | `{ slug, charId, name }` | 重命名 | true |

后端 router 路径 1:1 映射,见 `src/server.ts`。args/returns JSON Schema 都落在 `schemas/`,虽然 bus loader 当前不读,但 Phase 6+ ready。

## consumes / 多模态 key 选型

| 通道 | 主 | 备 | env var | 备注 |
|---|---|---|---|---|
| image-gen 立绘(2K) | ARK Seedream | Gemini nano-banana | `ARK_IMAGE_KEY` / `GEMINI_API_KEY` | 立绘要大尺寸 + 中文 prompt → Seedream 占优 |
| image-edit + variation (sprite consistency) | Gemini nano-banana | Azure gpt-image-2 | `GEMINI_API_KEY` / `AZURE_GPT_IMAGE_KEY` | sprite 序列帧必须保持角色一致 |
| prompt 改写 / 看图打标 | LiteLLM gemini-3.1-pro | claude-opus-4-7 | `LITELLM_PROXY_KEY` | 已在主仓 LiteLLM 代理后,跟 chat 共用 |

混元 woa.com 内网域名不放主路径,只在 dev 时作 quota 池。

## permissions (manifest 字段,Phase 6+ 起效)

```jsonc
[
  "fs:read:.forgeax/games/{slug}/characters/**",
  "fs:write:.forgeax/games/{slug}/characters/**",
  "fs:read:.forgeax/games/{slug}/playground/**",
  "fs:write:.forgeax/games/{slug}/playground/**",
  "model:image:concept-art",
  "model:image:sprite-frame",
  "model:text:reasoning",
  "net:ark.cn-beijing.volces.com",
  "net:generativelanguage.googleapis.com",
  "net:tence-mol3yp23-swedencentral.cognitiveservices.azure.com",
  "net:llm-proxy.forgeax.com",
  "emit:character-forge.*"
]
```

## 资产 schema · character.manifest.json

落盘到 `.forgeax/games/<slug>/characters/<charId>/manifest.json`:

```jsonc
{
  "schemaVersion": 1,
  "charId": "knight_aurora",
  "name": "极光骑士",
  "createdAt": "2026-05-17T05:00:00Z",
  "updatedAt": "...",
  "prompt": { "user": "...", "style": "anime-hd-flat", "refImage": null },
  "portrait": {
    "front": "portrait/front.png",      // 路径都相对 manifest
    "side":  "portrait/side.png",       // 可选
    "back":  "portrait/back.png"        // 可选
  },
  "sprites": {                          // 行动小人
    "walk": {
      "sheet": "sprites/walk/sheet.png",
      "framesPerDir": 4,
      "directions": ["down","left","right","up"],
      "frameSize": { "w": 96, "h": 96 }
    }
  },
  "variants": []                        // 换装 / 受伤态 / 等 (M2)
}
```

参考 character-editor `exportManifest.ts` 的 `schemaVersion=1`,字段做了精简(去掉 spine slots 等下一步才用的)。

## 错误处理 / 限速

- 后端调外部 API 全部包 retry 3 次 + 指数退避 (300/600/1200ms);
- HTTP 429 → 切备援 client + alert via `bus.events.emit('character-forge.quota-exceeded', {...})`;
- 立绘 base64 流式落盘,**不存内存**,避免 Bun 内存峰值;
- sprite 切片在前端 Canvas 做,后端只存原始 sheet + 元数据;
- `bus.events` ledger 在 worker 写,主线程不阻塞。

## Playwright e2e 测试矩阵

1. **冷启**: 18900/18920 健康 + bus.status 加载到 wb-character-forge plugin
2. **UI 路径 (人)**:
   - 浏览器开 18920 → 点 sidebar 锻造 tab
   - 输入 prompt "极光甲胄骑士,蓝色发,白银盔甲" → 选预设 anime-hd → 点生成立绘
   - 等到结果 (max 30s) → 看到立绘 thumbnail
   - 点 "生成行动小人 · walk"
   - 等到 sprite sheet → playground 自动加载 → 切方向 → 看到帧循环
3. **AI 路径 (surface)**:
   - curl POST `/api/bus/ui/surfaces/character-forge.editor/action` action=generatePortrait → 客户端 long-poll 拉到 → 后端真调 → UI snapshot 更新
4. **直 HTTP 路径 (其他 plugin / 外部 AI)**:
   - curl POST `/api/wb/character-forge/portrait` body=json → 拿 charId → 再 curl POST `/api/wb/character-forge/sprite-sheet`
5. **Ledger**:
   - tail `~/.forgeax/ledger/current.jsonl` 应看到 `character-forge.portrait.generated` + `character-forge.sprite.generated` 两条事件

测试脚本: `packages/marketplace/plugins/wb-character-forge/playground/e2e.spec.ts` (与现有 `packages/server/test/p9-surface-playwright.spec.ts` 同风格)。

## 给后续 wb-* 作者的建议(模板复用)

1. **照抄** `src/clients/*` 适配器风格——所有外部 API 都包成"接 OpenAI-compat fetch + 一份独立 retry/限速"。
2. **照抄** `src/server.ts` 的 router factory 风格——`createXxxRouter({ projectRoot, bus, env })`,绝不读 process.env 兜底,让宿主注入。
3. **照抄** `src/lib/storage.ts` 的 friendlyPath + safe-path 接法,所有响应 c.json 凡含路径字段都包 `friendlyPath()` (见 memory `project_friendly_path_rule.md`)。
4. **照抄** panel.tsx 内 `useSurface(...)` 的 schema + actions 写法。
5. 资产 schema 永远走 `<root>/.forgeax/games/<slug>/<plugin-domain>/<asset-id>/manifest.json` 三段式。

## 不在 M1

- Spine 部件拆件 (M3)
- 多角色批量队列
- BattleHUD 真接入 + 横向对比抽屉
- 视频 (Seedance) — 视频走单独的 wb-cinematic plugin
- 权限引擎真校验 (Phase 6+ 后等 bus)
