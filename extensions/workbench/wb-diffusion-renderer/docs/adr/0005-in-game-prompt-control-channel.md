# ADR 0005 — In-game prompt control channel (game-driven params)

- Status: **Accepted** (Phase 1 implemented)
- Date: 2026-07-08
- Deciders: (user) + design session
- Supersedes/extends: builds on ADR 0002 (in-process host), ADR 0004 (FRFP relay)

## Context

Today the diffusion renderer's style is driven **only** by the human, through the
inline DockShell panel's `prompt` field. FluxRT's 2026-07-08 API update removed the
`lora` parameter, so **`prompt` is now the sole style knob** (`seed` is pinned for
temporal coherence; `steps`/`interp` are quality/smoothness, not style).

We want the running game to **adjust the prompt continuously from game state** — e.g.
enter a cave → `"dark, damp cave, torchlight"`; catch fire → `"engulfed in flames,
embers"`; night + storm → `"night, heavy rain, wet reflections"`. This turns the
plugin from a human-only control panel into an **in-game integration interface**.

### What makes this cheap (grounding facts)

1. The renderer captures `<canvas id="app">` — the **in-process edit viewport**. When
   the user hits ▶ Play, the game's `bootstrap(world, ctx)` runs **in the same JS
   realm** as the Studio host window and as `src/host/stream.ts`. So game code can
   reach the plugin **without any iframe/postMessage hop** (see the runtime-channel
   investigation: edit ▶ Play is same-realm; only the `/preview/` iframe is isolated).
2. `src/host/stream.ts`'s pump already reads params **per captured frame** and sends
   the current effective render params with that frame. A game calling `setPrompt` at
   60 fps is therefore coalesced by the capture/uplink cadence down to the ≤10 fps
   stream — no debounce needed at the API layer.

## Decision

### 1. Compose model (panel = style base, game = state fragment)

The panel prompt is the **style base** (photorealism, materials, lighting — the stuff
that should hold constant). The game pushes a **state fragment** describing the current
scene. The effective prompt sent to FluxRT is:

```
effective = [base, gameFragment].filter(Boolean).join(', ')
```

Rationale: the whole point is game-state-driven style *on top of* a stable look. Full
override would force each game to re-specify the photoreal base every time; composition
keeps the human's style intent and layers dynamic state onto it. An empty game fragment
(or `clearGameOverrides()`) falls back to the base alone.

> Only `prompt` composes. `steps` / `interp` / `seed`, if a game sets them, are plain
> last-writer-wins overrides of the panel value (they are not text, nothing to concat).

### 2. Layered param store in `stream.ts`

Replace the single `getParams` closure with two explicit layers + a reconciler:

```ts
type BaseParams = { prompt: string; steps: number; interp: number; seed: number };
type GameOverrides = Partial<{ prompt: string; steps: number; interp: number; seed: number }>;

let base: BaseParams = { /* panel-owned */ };
let game: GameOverrides = {};

function effectiveParams(): StreamParams {
  const prompt = [base.prompt, game.prompt].map((s) => s?.trim()).filter(Boolean).join(', ');
  return {
    prompt: prompt || base.prompt,
    steps: game.steps ?? base.steps,
    interp: game.interp ?? base.interp,
    seed: game.seed ?? base.seed,
  };
}
```

The pump reads `effectiveParams()` where it currently reads `getParams()`. The panel
writes `base`; the control API writes `game`. Because FluxRT reports `stateful:false`,
the stream sends the current effective render params with each captured frame, while
`reset_cache` remains a one-shot marker only for global prompt applications.

### 3. Game-facing control API — namespaced window global

The plugin's host module publishes a versioned control object when the panel mounts and
removes it on unmount:

```ts
interface DiffusionRendererControl {
  readonly version: 1;
  /** Is a live stream currently running? */
  isLive(): boolean;
  /** Merge-patch the game override layer. Only provided keys change. */
  setParams(p: Partial<{ prompt: string; steps: number; interp: number; seed: number }>): void;
  /** Convenience: set only the game prompt fragment (the common case). */
  setPrompt(fragment: string): void;
  /** Drop all game overrides → hand control back to the panel base. */
  clearGameOverrides(): void;
  /** Live status + metrics, for an in-game HUD. Returns an unsubscribe fn. */
  subscribe(cb: (status: StreamStatus) => void): () => void;
}
```

Published as `window.forgeaxDiffusion` (namespaced; **not** the `__forgeax_editor`
debug global). Game usage:

```ts
// game code, inside a system / registerUpdate:
window.forgeaxDiffusion?.setPrompt(onFire ? 'engulfed in flames, embers' : '');
```

The `?.` makes it a no-op when the plugin panel isn't open — games never hard-depend on
it. Shipped with a **types-only** `d.ts` (e.g. `src/game-api.d.ts`, re-exported for game
authors) so games get typing/autocomplete **without a runtime import**, keeping the
engine submodule fully decoupled from this plugin (no engine edit needed).

### 4. Panel UX

- When `game.prompt` is non-empty, show a small **"game"** badge on the prompt field and
  a read-only preview of the composed effective prompt.
- A **"reclaim"** affordance calls `clearGameOverrides()` so the human can override the
  game at any time. Human edits to the base field always keep working (they edit `base`).

### 5. Transport is swappable (future-proofing, not built now)

The control object is a thin façade over the layered store. Today it's called directly
(same realm). If the renderer ever captures the `/preview/` iframe (isolated realm)
instead of the edit viewport, the **same API** gets a `postMessage` backend via a new
`VAG_DIFFUSION_SET_PARAMS` / `VAG_DIFFUSION_STATUS` schema — with **zero game-code
change**. Deferred until an iframe-capture path actually exists.

## Consequences

- The plugin becomes a bidirectional integration surface: human (panel base) + game
  (state fragment) both feed one reconciled param stream; precedence is explicit and
  visible, so they can't silently clobber each other.
- No engine/submodule change: decoupling via a window global + types-only `d.ts`.
- Backpressure is unchanged — game spam is coalesced by the existing per-frame diff.
- One new failure mode to guard: a game that sets a huge/garbage prompt fragment. The
  base still applies; add a soft length cap on the game fragment in `setParams`.

## Alternatives considered

- **Full override (game replaces prompt).** Simpler store, but every game must restate
  the photoreal base and the human loses their style intent the moment the game speaks.
  Rejected in favor of composition.
- **Extend engine `BootstrapContext` with a host-service registry
  (`ctx.host.get('diffusion-renderer')`).** Typed and discoverable, but couples the
  engine submodule to a host-service concept and requires editing a lower repo for a
  single plugin. Rejected for now; the window global + `d.ts` is decoupled and enough.
- **Route through `/api/bus` or `__FORGEAX_BUS__`.** Those are host-UI / manifest buses,
  not game-facing; using them would need a game→bus shim anyway. Rejected.

## Implementation record (Phase 1)

1. `src/host/stream.ts` replaced `getParams` with the `base`/`game` layered store +
   `effectiveParams()`; kept per-frame param emission; added `setGameOverrides` /
   `clearGameOverrides` / status + control snapshot subscription plumbing.
2. `src/host/control.ts` builds the `DiffusionRendererControl` façade and publishes/
   unpublishes `window.forgeaxDiffusion` on panel mount/unmount.
3. `src/game-api.d.ts` declares `window.forgeaxDiffusion` for game authors without a
   runtime plugin import.
4. `src/panel.tsx` feeds the panel field into `base`; adds the "game" badge, effective
   prompt hint, and reclaim UX.
5. Docs promoted this ADR to Accepted, added a `Game control channel` glossary row to
   `CONTEXT.md`, and added a pointer in `DESIGN.md`.
6. Verification: `packages/studio` `tsc --noEmit` passed.
