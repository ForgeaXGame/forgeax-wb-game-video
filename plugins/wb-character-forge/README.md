# @kubeela-plugin/wb-character-forge

> 角色资产工坊 + 游乐场试玩 · kubeela 首个端到端 workbench 插件
> · 作为后续 `wb-*` 插件作者的实物模板

## 是什么

一个插件,两条路径,两个模块:

- **生产** —— 角色立绘 / 三视图 / 4 向 walk sprite sheet / 换装变体
- **游乐场** —— 把生成的角色加载到 mini canvas 演示帧序列,后续接 BattleHUD

**人路径**: 浏览器开 `18920` → 锻造 tab → 填 prompt → 一键生成 + 试玩
**AI 路径**: `POST /api/wb/character-forge/portrait` 直 HTTP,或 `POST /api/bus/ui/surfaces/character-forge.editor/action`

两条路径共用同一个 `actions.run` 闭包(dual-modality contract, [`../../../../kubeela-dev-diary/2026-05-16/DUAL-MODALITY-UI.md`](../../../../kubeela-dev-diary/2026-05-16/DUAL-MODALITY-UI.md))。

## 起步

```bash
# 1. 装 key (.env 里)
GEMINI_API_KEY=...            # nano-banana 主 sprite,备 portrait
ARK_IMAGE_KEY=...             # Seedream 主 portrait
AZURE_GPT_IMAGE_KEY=...       # 备 sprite + 备 portrait
# (kubeela-studio/.env.example 已有占位;Settings UI 也可填,白名单见 packages/server/src/api/settings.ts:17)

# 2. 启 kubeela
bash scripts/run.sh

# 3. 浏览器开 18920 → sidebar 找 "⚒️ 角色锻造" tab
# 4. (可选)  跑 smoke / 浏览器 e2e 自检
bun packages/marketplace/plugins/wb-character-forge/playground/smoke.ts
bun /data/home/lockliu/kubee-project/kubeela-studio/packages/marketplace/plugins/wb-character-forge/playground/browser-e2e.mjs   # 需 /tmp 装 playwright
```

## tool 列表 (供其他 plugin / AI 调用)

| toolId | HTTP 路径 | 输入 schema | 用途 |
|---|---|---|---|
| `character-forge:generate-portrait`     | `POST /api/wb/character-forge/portrait` | `schemas/generate-portrait.args.json` | 立绘 + 三视图(任选) |
| `character-forge:generate-sprite-sheet` | `POST /api/wb/character-forge/sprite-sheet` | `schemas/generate-sprite-sheet.args.json` | 4 向 walk/idle/attack |
| `character-forge:list-characters`       | `GET  /api/wb/character-forge/characters` | `schemas/list-characters.args.json` | 画廊读取 |
| `character-forge:get-character`         | `GET  /api/wb/character-forge/characters/:id` | `schemas/get-character.args.json` | 单角色详情 + url |
| `character-forge:rename-character`      | `POST /api/wb/character-forge/characters/:id/rename` | `schemas/rename-character.args.json` | 改名 |
| ·                                       | `GET  /api/wb/character-forge/asset?path=...` | — | 二进制流(PNG/JPEG) |
| ·                                       | `GET  /api/wb/character-forge/status` | — | 厂商 ready 状态 |

## 资产物理路径

```
<projectRoot>/.kubeela/games/<slug>/characters/<charId>/
├── manifest.json
├── portrait/
│   ├── front.png|jpg
│   ├── side.png|jpg
│   └── back.png|jpg
└── sprites/
    └── walk/
        └── sheet.png|jpg
```

`<projectRoot>` 由 `KUBEELA_PROJECT_ROOT` 决定;`<slug>` 由当前 game 项目定义。文件 extension 实际由响应字节 sniff 决定(Seedream 默认 JPEG, Gemini 默认 PNG)。

## 多模态厂商主备链 (`src/clients/dispatcher.ts`)

| 角色 (role) | 主 | 备 1 | 备 2 | 决策依据 |
|---|---|---|---|---|
| `concept-art` (立绘) | Seedream | Gemini nano-banana | Azure gpt-image-2 | 国内节点最低延迟 + 2K/4K 中文友好 |
| `sprite-frame` (行动小人) | Gemini nano-banana | Azure gpt-image-2 | Seedream | 多回合 image-edit 保持角色一致 |

> 注: Seedream 只接受 `2k/3k/4k`(小写) 且最小总像素 3,686,400。1k 请求会自动 fallback 到 Gemini。

## 给后续 wb-* 作者抄作业

这份插件刻意按"独立工程"组织,主仓只需要 4 处接线(全是机械活):

1. `packages/server/src/api/wb-character-forge.ts` —— 5 行 host adapter import 你的 router
2. `packages/server/src/main.ts:_____` —— `app.route('/api/wb/<id>', createRouter(...))` 一行
3. `packages/interface/src/components/Sidebar/Sidebar.tsx` —— `LazyPluginPanels[<id>]` 一行
4. `packages/server/src/api/settings.ts:17` —— 把你的 env key 加进 `SAFE_ENV_KEYS`

Phase 6+ 落了 plugin runtime 后,这 4 处接线会被自动化 manifest loader 取代,你的 plugin 主体不需要改一行。所以**所有东西先按 manifest 规范写**,把 main.ts/Sidebar.tsx 那点临时 wire-up 视为脚手架。

具体可抄的位置:

| 想做什么 | 抄哪 |
|---|---|
| 后端 router 工厂 | `src/server.ts` `createCharacterForgeRouter(ctx)` |
| 多模态 client 适配 | `src/clients/{seedream,gemini-image,azure-gpt-image}.ts` |
| client 主备链 | `src/clients/dispatcher.ts` |
| 资产落盘 + safe-path | `src/lib/storage.ts` |
| 类型 + assertCharId/Slug | `src/lib/ids.ts` + `src/types.ts` |
| Prompt 模板分块 | `src/prompts/{portrait,sprite}.ts` |
| 前端 panel(自包含) | `src/panel.tsx`(连 `useMiniSurface` 都内置) |
| Playwright e2e 模式 | `playground/{smoke.ts,browser-e2e.mjs}` |

## 已知不足 / 后续

- M1 仅 walk · M2 加 idle/attack + 换装变体
- 当前 sprite 切片走 CSS background-position,M2 走 Canvas2D + sprite-cut 库
- M2 接 `3rd/workbench/character-editor/battle-ui-module/`(纯 DOM HUD, 已是模块包)做真实战斗演示
- M3 接 Spine parts pipeline 走 nano-banana style transfer
- Phase 6+ 后删 Sidebar.tsx + main.ts 4 处接线,改 bus loader 自动加载
