## Pillar & Design Dispatch Flow (Kubeela)

This section is the **kubeela-side adaptation** of the minimal
`make-game-design` skill. The agent acting as the orchestrator (you, the
default `main` agent in a fresh kubeela instance) captures user intent,
derives `<slug>`, and dispatches `pillar` then `design` to peer agents.
Peer agents own all file writes; you only pass runtime data and validate
the handoff contracts.

| Phase | Owner       | Output                                           |
|-------|-------------|--------------------------------------------------|
| 0     | you (main)  | Intent Notes only — no files                     |
| 1     | `pillar`    | `<doc_dir>/<slug>_pillar.md`                     |
| 2     | `design`    | one `<doc_dir>/<slug>_<module>_design.md` per §5 module |

Peer-internal depth contracts live in `peers/phase-1-pillar.md` and
`peers/phase-2-design.md`. Do NOT restate those contracts in your dispatch
task — peers already have them in their system prompt.

### Phase 0 Intent — one opening question shot

Before any `dispatch_peer` call for a new game, issue exactly **one**
`ask_user_question` call. Its `questions` array normally has 4-6 questions
(hard cap 10). All questions land in that one call; there is no second
round and no separate Confirm / Adjust step.

Phase 0 anchors on two dimensions only:

1. **Core fun direction** — which moment / feeling the player comes back
   for (`<slug>_pillar.md` §1).
2. **Pillar candidates / priority** — 2-4 agent-inferred experience
   pillars for the user to pick, rank, or refine (`<slug>_pillar.md` §2).

Optional Phase 0 questions (only if signal is weak from the brief):

- **Vibe / mood reference** — what existing game(s) make the user feel
  the right way? Don't ask if the brief already names one.
- **Target session length** — minutes per run; influences §3 core loop
  scaling.
- **Art tone shorthand** — pixel / lowpoly / hand-drawn / clean-flat /
  realistic; influences §4 art style.

Once Phase 0 closes, you have your Intent Notes (5–10 bullets) and can
proceed to Phase 1 dispatch without asking again.

### `<slug>` derivation

`<slug>` = lowercased, hyphenated, 2–4 word identifier derived from the
brief's core concept. Examples:

- "我想做一个 2D 卡牌肉鸽" → `card-roguelike` or `deck-rogue`
- "Top-down pixel rpg about cats" → `cat-rpg` (don't include "pixel" or
  "top-down" — those are §4 art style, not the slug)

`<doc_dir>` for Kubeela: `kubeela/games/<slug>/design/`. Create the dir
on first peer dispatch.

### Phase 1 dispatch task body

When you call `dispatch_peer pillar`, the task body should contain:

- Intent Notes (5–10 bullets from Phase 0)
- The user's original brief verbatim (so the peer can sanity-check)
- `<slug>` and `<doc_dir>` (both fully resolved paths)

The peer will write `<doc_dir>/<slug>_pillar.md`. After the peer returns,
**you read it** and verify §5 lists the modules. If §5 is missing or
empty, ask the peer to redo it (don't fix yourself).

### Phase 2 dispatch fan-out

For each module in pillar §5, dispatch one `design` peer call. Each
dispatch task body should contain:

- The pillar.md path (so the peer can read it)
- The specific module name from §5
- `<slug>` and `<doc_dir>`

Peers write `<doc_dir>/<slug>_<module>_design.md`. You don't fan-in or
re-summarize; the design docs stand on their own.

### When NOT to enter this flow

- User asked "fix this bug" or "add a feature to an existing game" — do
  the change directly, don't run the GDD flow.
- User shared an existing GDD doc and asked to implement — read the doc,
  implement; don't re-do Phase 0.
- User said "just try something" or "make me something cool" — pick a
  reasonable concept, derive `<slug>`, skip Phase 0 question, draft
  pillar yourself (this is a vibe loop, not a full GDD).
