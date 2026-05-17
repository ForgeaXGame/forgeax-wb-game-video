# kubeela-marketplace

Markdown-fragment marketplace consumed by `kubeela-cli` at agent boot.
Holds everything you'd want to inject into agents besides code: **named-agent
personas, system-prompt fragments, skills, long-term memory templates**.

The core idea: **「人格层兼职能层」** — each peer agent is one file that fuses
personality (warmth, voice, identity) with function (input → output → boundary
contract). When the Workbench UI shows the left-side panel, each card is a
peer that owns a portion of the project's files.

```
┌─ Workbench (left panel) ─┐
│ 🅰 Kubee · 主线制作人      │ ← writes: kubeela/games/<slug>/src/**
│   • main.ts              │
│   • level.ts             │
│   • player.ts            │
│                          │
│ 🅸 Iori · 核心玩法师      │ ← writes: <doc_dir>/<slug>_pillar.md
│   • <slug>_pillar.md     │
│                          │
│ 🆂 Suzu · 体验设计师      │ ← writes: <doc_dir>/<slug>_<module>_design.md
│   • combat_design.md     │
│   • meta_progression_…   │
└──────────────────────────┘
```

## The team

| Card | id | Role | Status | Outputs |
|---|---|---|---|---|
| 主线制作人 | `kubee` | orchestrator | ✅ active | `kubeela/games/<slug>/src/**` |
| 核心玩法师 | `iori` | pillar peer | ✅ active | `<doc_dir>/<slug>_pillar.md` |
| 体验设计师 | `suzu` | design peer | ✅ active | `<doc_dir>/<slug>_<module>_design.md` × N |
| 剧情师 | `kotone` | narrative peer | 🟡 placeholder | `<doc_dir>/<slug>_narrative.md`, `dialog/*.md` |
| 美术师 | `iro` | art peer | 🟡 placeholder | `<doc_dir>/assets/<category>/<id>.<ext>` |
| 工程师 | `tsumugi` | coding peer | 🟡 placeholder | `<active_game>.dir/**` |

Each peer has a Japanese-soft name (Kubee / Iori / Suzu / Kotone / Iro /
Tsumugi) chosen to feel like a small studio's roster — not a stack of
faceless role literals. The full roster lives in `manifest.json#agents` and
the canonical user-facing description is `src/system-prompt/80-workbench-agents.md`.

> Forgeax 范式参考：`forgeax-studio/packages/marketplace/src/system-prompt/workbench/`
> 用 `pillar` / `design` / `production` / `coding` 作为 role literal，无人名。
> Kubeela 选择 **named-agent**，让 UI 卡片有性格、产物归属可视化更清晰。

## Structure

```
kubeela-marketplace/
├── manifest.json                ← metadata + agents roster + compat matrix
├── README.md                    ← this file
└── src/
    ├── system-prompt/
    │   ├── 00-persona.zh.md             ← Kubee 主人设（中）
    │   ├── 00-persona.en.md             ← Kubee 主人设（英）
    │   ├── 01-platform-constraints.md   ← Kubeela 运行时硬约束（HMR / 零 build）
    │   ├── 30-pillar-design-flow.md     ← Kubee 派 iori / suzu 的流程
    │   ├── 50-question-tool.md          ← ask_user_question 用法（仅 Phase 0）
    │   ├── 60-workflow.md               ← active / future 流水线总览
    │   ├── 80-workbench-agents.md       ← roster 表 + 派单约定
    │   ├── peers/                       ← 每个 peer 一份 self-contained 文件
    │   │   ├── iori-pillar.md           ← Iori 人设 + pillar 契约
    │   │   ├── suzu-design.md           ← Suzu 人设 + design 契约
    │   │   ├── kotone-narrative.md      ← Kotone 人设 + (占位)契约
    │   │   ├── iro-art.md               ← Iro 人设 + (占位)契约
    │   │   └── tsumugi-coding.md        ← Tsumugi 人设 + (占位)契约
    │   └── shared/
    │       └── 01-language-policy.md    ← reply / doc / code 语言策略 + Kubee 身份保护
    ├── skills/
    │   └── make-game-design/SKILL.md    ← `/make-game-design` 入口
    └── memory/
        └── README.md                    ← long-term memory 模板用法（占位）
```

## How agents see this content

Two distinct prompts, two distinct concat rules:

### Orchestrator (Kubee) prompt

Concat of numbered files in `src/system-prompt/*.md` + shared/:

```
00-persona.<lang>.md         ← Kubee's character
01-platform-constraints.md   ← Kubeela HMR / filesystem boundaries
30-pillar-design-flow.md     ← Phase 0 + iori / suzu dispatch
50-question-tool.md          ← ask_user_question scoping
60-workflow.md               ← active / future pipeline
80-workbench-agents.md       ← team roster
shared/01-language-policy.md ← language + identity
```

### Peer prompt (per peer)

Single self-contained file + shared/:

```
peers/<agent-id>-<role>.md   ← that peer's persona + function contract
shared/01-language-policy.md ← appended (same as orchestrator)
```

### CLI loader (Phase 2 — separate PR)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ marketplace_loader (cli capability, Phase 2)                            │
│                                                                          │
│   at instance start:                                                     │
│     1. read manifest.json#agents                                         │
│     2. resolve KUBEELA_LANG → pick Kubee persona variant                  │
│     3. for each agent in agents[]:                                       │
│          - if role == 'orchestrator':                                    │
│              concat orchestratorSystemPromptOrder → SOUL.md              │
│          - else (peer):                                                  │
│              concat peerFile + shared/* → SOUL.md                        │
│          - write to team/agents/<id>/SOUL.md                             │
│          - register <id> in team/manifest.json with `produces` glob      │
│     4. load skills/* into agent's capability table                       │
│     5. inject memory/*.md as initial-context fragments                   │
└─────────────────────────────────────────────────────────────────────────┘
```

Not yet wired — agents currently inherit their SOUL from `cli/templates/act/`.
Phase 2 (cli capability `marketplace_loader/`) will make this dynamic.

## Add a new agent

1. Drop your peer file under `src/system-prompt/peers/<agent-id>-<role>.md`.
   Each file starts with a "我是 <Name>" persona intro (3-6 lines), then the
   function contract (`## 输入` / `## 输出` / hard constraints).
2. Add an entry to `manifest.json#agents` with `id`, `role`, `cardName`,
   `color`, `avatar`, `peerFile`, `produces` (glob list), `status`.
3. Commit + push. Bump parent `kubeela-studio` submodule pointer.

## Add a new skill

1. `mkdir src/skills/<skill-id>/`
2. `src/skills/<skill-id>/SKILL.md` — front-matter must include `name`,
   `description`, `disable-model-invocation`.
3. Add to `manifest.json#skills`.

## Versioning

`manifest.json#version` follows semver. Bump on:

- breaking change to agent / skill schema → major
- new agent or skill → minor
- content tweaks → patch

`kubeela-cli` pins the compatible marketplace version range via
`manifest.json#compatibleWith.kubeela-cli`.

---

## 2026-05-16 · 插件 placeholder 矩阵（v1 全插件化主线）

跟 `kubeela-dev-diary/2026-05-15/00-GOALS.md` v1 全插件化方向对齐，本周 daemon 落了 17 个 placeholder plugin 在 `plugins/`：

### Workbench (11) — 对应 GOALS §五 11 类

| ID | 中文 | icon | id (workbench.id) | position | panelSize |
|---|---|---|---|---|---|
| `@kubeela-plugin/wb-character` | 角色叙事 | 👤 | character | 110 | lg |
| `@kubeela-plugin/wb-look` | 色彩 / Look | 🎨 | look | 120 | md |
| `@kubeela-plugin/wb-ui` | UI 工坊 | 🪟 | ui | 130 | md |
| `@kubeela-plugin/wb-skill` | 技能 VFX | ⚡ | skill | 140 | lg |
| `@kubeela-plugin/wb-items` | 道具 图标 | 🎒 | items | 150 | md |
| `@kubeela-plugin/wb-anim` | 动画 | 🎬 | anim | 160 | lg |
| `@kubeela-plugin/wb-bgm` | 音乐 BGM | 🎵 | bgm | 170 | md |
| `@kubeela-plugin/wb-scene` | 场景 世界 | 🗺️ | scene | 180 | lg |
| `@kubeela-plugin/wb-balance` | 平衡 数值 | 📐 | balance | 190 | md |
| `@kubeela-plugin/wb-code` | 代码 Code | 💻 | code | 200 | lg |
| (admin) | 面板管理 | ⚙ | admin | 999 | md |

### CLI Provider (4)

| ID | 桥接到 |
|---|---|
| `@kubeela-plugin/cli-claude-code` | `ClaudeCodeProvider` |
| `@kubeela-plugin/cli-codex` | `CodexProvider` |
| `@kubeela-plugin/cli-cursor-agent` | `CursorAgentProvider` |
| `@kubeela-plugin/cli-kubeela` | `KubeelaCliProvider`（default boot） |

### Agent (1) · Skill (1) · Tool (1) · Model-binding (1)

- `@kubeela-plugin/agent-cc-coder` — Claude Code 工程师 placeholder（persona/zh.md + memory/AGENTS.md）
- `@kubeela-plugin/skill-make-game-design` — SKILL.md placeholder
- `@kubeela-plugin/tool-balance-resim` — JSON Schema placeholder
- `@kubeela-plugin/model-anthropic-text` — text model-binding placeholder

### Placeholder 文件约定

每个 wb-* / cli-* 目录:

```
plugins/<id>/
├── kubeela-plugin.json    # 完整 manifest（GOALS modules/02-plugin-manifest.md spec）
├── src/
│   ├── server.ts          # 占位：throw "[Phase 6+ shim] 未实现"（cli-* 用）
│   └── panel.tsx          # 占位：throw "[Phase 6+ shim] React render 未实现"（wb-* 用）
```

panel.tsx 的 throw 是有意为之 ——
manifest schema 强制 `entry.frontend` 文件存在但 v1 不真渲染。**P8 阶段** (见 `kubeela-dev-diary/2026-05-16/UI-FRAMEWORK-PROPOSAL.md` §四 P8) `<WorkbenchIframeHost>` 落地后，panel.tsx 才从 throw 升级成真 React 组件。

### 路线图

- **P8.5** wb-character 从 throw stub → 真 React（读 `games/<slug>/characters/*.json` + form + SVG preview）= 整个 v1 plugin 架构端到端首次验证
- **P8.6** Bus tool `character.create` 让 claude-code 也能调（玩家点表单 = AI 调 tool）
- **P8.8** 剩 10 个 wb-* 同模式落地

### 相关文档

- `kubeela-dev-diary/2026-05-15/00-GOALS.md` §五 11 类 workbench / §七 三合一
- `kubeela-dev-diary/2026-05-15/modules/02-plugin-manifest.md`（manifest schema）
- `kubeela-dev-diary/2026-05-15/modules/04-permissions-sandbox.md`（perms scope）
- `kubeela-dev-diary/2026-05-16/STRATEGY-PLAN-v3.md`（OSS / Desktop / Cloud · plugin 是 OSS 主要扩展点）
- `kubeela-dev-diary/2026-05-16/DUAL-MODALITY-UI.md`（plugin 自动 AI-ready · `provides.surfaces[]` 字段预定）

---

## 2026-05-17 update · `wb-character-forge` 落地 + 模板化

`wb-character-forge/` 是**第一个 end-to-end 落地**的 wb-* 插件 —— 角色生图 + 游乐场 + panel.tsx surface 化。后续 wb-* 全部参考它的接线模式:`manifest.json` + `entry.frontend` + `panel.tsx` + 多模态 fallback chain。

primary/fallback chain(`DESIGN.md` 详细记录):

```
Seedream (ARK_IMAGE_KEY)  →  Gemini nano-banana (GEMINI_API_KEY)  →  Azure GPT-Image (AZURE_GPT_IMAGE_*)
立绘 主路径                  sprite 主路径 / 立绘 备                  sprite 备 / 立绘 备
```

**厂商坑**(已踩):
- Seedream `size` 必须**小写** `2k/3k/4k` 或 `WIDTHxHEIGHT`;最小总像素 3,686,400(≈1920²),小于则 400
- Gemini key 走 query `?key=` 不走 header,必须设 `responseModalities:["IMAGE"]`
- Azure header 是 `api-key`(不是 Bearer),size 只接受 1024×1024 / 1024×1536 / 1536×1024

**插件 metadata** 0.0.1 → 0.1.0 bump,其他 10 个 wb-* / 4 个 cli-* / agent-cc-coder 已 placeholder ref-files。

**警惕**:`bun run build` / `tsc` 会落 `.js` 到 `src/`,vite 优先服 `.js` 屏蔽 `.tsx`(2026-05-17 wb-character-forge 复发,interface 已加 `noEmit`,marketplace 插件需自查 `tsconfig.json` 是否 `noEmit:true`)。

完整数据:[`../../kubeela-dev-diary/2026-05-18/SUMMARY.html`](../../kubeela-dev-diary/2026-05-18/SUMMARY.html)
