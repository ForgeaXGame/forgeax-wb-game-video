# kubeela-marketplace

Markdown-fragment marketplace consumed by `kubeela-cli` at agent boot.
Drop-in container for everything you'd want to inject into the agent
besides code: persona, system-prompt fragments, named skills,
long-term memory templates.

Mirrors patterns from:
- [agentic_os/persona](../3rd/agentic_os/persona/) — multiple personas
  (ARIN / KUMO / TSUNDERE / ...) selectable at boot
- [forgeax-studio/packages/marketplace](https://git.tencent.com/aw/marketplace)
  — `system-prompt/` numbered-prefix loading + `skills/` named entries

## Structure

```
kubeela-marketplace/
├── manifest.json                ← metadata + compat matrix
├── README.md
└── src/
    ├── system-prompt/           ← loaded into agent's SOUL.md at boot
    │   ├── 00-persona.zh.md     ← Arin (Chinese)
    │   ├── 00-persona.en.md     ← Arin (English)
    │   ├── 01-platform-constraints.md  ← Kubeela platform contract
    │   ├── 30-pillar-design-flow.md    ← make-game-design dispatch flow
    │   ├── peers/
    │   │   ├── phase-1-pillar.md       ← pillar peer's internal contract
    │   │   └── phase-2-design.md       ← design peer's internal contract
    │   └── shared/
    │       └── 01-language-policy.md   ← reply/document/code language rules
    ├── skills/                  ← named skills agent can invoke
    │   └── make-game-design/
    │       └── SKILL.md
    └── memory/                  ← shared long-term context
        └── README.md            ← (placeholder; populate per project)
```

## Load order

`system-prompt/` files concatenate in filename-prefix order:

```
00-persona.<lang>.md   (locale-suffixed; pick by KUBEELA_LANG env, default zh)
01-platform-constraints.md
30-pillar-design-flow.md
shared/01-language-policy.md
peers/*                ← dispatched peers each get their phase doc as additional context
```

The final concatenation becomes the agent's `SOUL.md` content at boot.
This will be wired through `kubeela-cli/capabilities/marketplace_loader/`
in Phase 2 (separate PR; see issue tracker).

## How agents see this content

```
┌────────────────────────────────────────────────────────────┐
│ marketplace_loader (cli capability, Phase 2)               │
│  at instance start:                                         │
│    1. read manifest.json                                    │
│    2. resolve KUBEELA_LANG → pick persona variant           │
│    3. concat system-prompt/*.md in load-order               │
│    4. write to team/agents/<id>/SOUL.md                     │
│    5. load skills/* into agent's capability table           │
│    6. inject memory/*.md as initial-context fragments       │
└────────────────────────────────────────────────────────────┘
```

The agent itself sees:
- Its `SOUL.md` as the system prompt (top of every LLM call)
- Skills as named `/<slug>` commands in `ask_user_question` flow
- Memory as additional bullets in the per-turn pre-context

## Add a new persona

1. Drop your persona file under `src/system-prompt/00-persona.<lang>.md`
   (or under a new prefix if it's a "special-mode" persona — e.g.
   `00-persona.kumo.zh.md` for an alt character).
2. Update `manifest.json#personas` with the id + locale file paths.
3. Commit + push. Agents auto-pick up on next instance restart.

## Add a new skill

1. `mkdir src/skills/<skill-id>/`
2. `src/skills/<skill-id>/SKILL.md` — front-matter must include `name`,
   `description`, `disable-model-invocation`.
3. Update `manifest.json#skills`.
4. Document the trigger in the skill's SKILL.md (e.g. `/<skill-id>`).

## Versioning

`manifest.json#version` follows semver. Bump on:
- breaking change to persona / skill schema → major
- new skill or persona → minor
- content tweaks → patch

`kubeela-cli` pins the compatible marketplace version range via
`manifest.json#compatibleWith.kubeela-cli`.
