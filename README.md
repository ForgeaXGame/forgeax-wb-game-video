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
│ 🅰 Arin · 主线制作人      │ ← writes: kubeela/games/<slug>/src/**
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
| 主线制作人 | `arin` | orchestrator | ✅ active | `kubeela/games/<slug>/src/**` |
| 核心玩法师 | `iori` | pillar peer | ✅ active | `<doc_dir>/<slug>_pillar.md` |
| 体验设计师 | `suzu` | design peer | ✅ active | `<doc_dir>/<slug>_<module>_design.md` × N |
| 剧情师 | `kotone` | narrative peer | 🟡 placeholder | `<doc_dir>/<slug>_narrative.md`, `dialog/*.md` |
| 美术师 | `iro` | art peer | 🟡 placeholder | `<doc_dir>/assets/<category>/<id>.<ext>` |
| 工程师 | `tsumugi` | coding peer | 🟡 placeholder | `<active_game>.dir/**` |

Each peer has a Japanese-soft name (Arin / Iori / Suzu / Kotone / Iro /
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
    │   ├── 00-persona.zh.md             ← Arin 主人设（中）
    │   ├── 00-persona.en.md             ← Arin 主人设（英）
    │   ├── 01-platform-constraints.md   ← Kubeela 运行时硬约束（HMR / 零 build）
    │   ├── 30-pillar-design-flow.md     ← Arin 派 iori / suzu 的流程
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
    │       └── 01-language-policy.md    ← reply / doc / code 语言策略 + Arin 身份保护
    ├── skills/
    │   └── make-game-design/SKILL.md    ← `/make-game-design` 入口
    └── memory/
        └── README.md                    ← long-term memory 模板用法（占位）
```

## How agents see this content

Two distinct prompts, two distinct concat rules:

### Orchestrator (Arin) prompt

Concat of numbered files in `src/system-prompt/*.md` + shared/:

```
00-persona.<lang>.md         ← Arin's character
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
│     2. resolve KUBEELA_LANG → pick Arin persona variant                  │
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
