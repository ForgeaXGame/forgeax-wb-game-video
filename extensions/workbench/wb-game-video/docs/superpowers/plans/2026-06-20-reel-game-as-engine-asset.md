# Reel-Game as Engine Asset (Route B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an interactive film-game (影游) a first-class, GUID-addressable engine asset (`kind: 'reel-game'`) that lives self-contained inside `.forgeax/games/<slug>/`, so it rides the same declarer → (importer) → loader + pack-index + packaging/distribution pipeline as 3D games and can be shipped as a standalone site anyone can play.

**Architecture:** A reel game is declared as an `internal-text-package` sidecar `reel-game.pack.json` (`kind: 'reel-game'`, payload = the Scenario JSON with every media ref rewritten to a bundle-relative URL). The engine gets a `ReelGameAsset` type + `reelGameLoader` so `assets.loadByGuid<ReelGameAsset>(guid)` works in-engine. Media binaries move to per-game disk (`.forgeax/games/<slug>/reel/assets/`) so a server-side exporter can build the sidecar + a co-located `reel-media/` folder without the browser. A standalone Vite build bundles the wb-reel player (no WebGPU) + a lightweight pack-index reader to play the shipped asset.

**Tech Stack:** TypeScript, Vite, Zod/ajv (pack schema), Zustand (wb-reel stores), Vitest, Hono (studio server), `@forgeax/engine-types` / `@forgeax/engine-runtime` / `@forgeax/engine-pack` / `@forgeax/engine-vite-plugin-pack`.

---

## Scope note (multi-subsystem)

This plan spans three subsystems. Each phase produces working, independently testable software and can be shipped on its own:

- **P0** — per-game media on disk (wb-reel server plugin). *Prereq: makes a game dir self-contained + lets a server read media.*
- **P1** — engine `reel-game` asset kind + loader (`@forgeax/engine-types`, `@forgeax/engine-runtime`). *Standalone: `loadByGuid<ReelGameAsset>` works in tests.*
- **P2** — server-side exporter: Scenario + per-game assets → `reel-game.pack.json` + `reel-media/`.
- **P3** — standalone reel player bundle (no WebGPU) + `serve.sh`.
- **P4** — wire `POST /api/workbench/games/:slug/package` to detect reel games → run the reel bundler.
- **P5** *(optional / follow-up)* — studio + dev player consume the reel-game asset via the shared reader; `.reelpkg` import parity.

Recommended execution order is P0 → P1 → P2 → P3 → P4. P1 has no dependency on P0 and can be done in parallel.

---

## Key design decisions (read before starting)

1. **Declarer = `internal-text-package` (`.pack.json`), no importer needed.** The reel game payload is self-contained JSON; `vite-plugin-pack`'s `build-catalog` transparently folds `.pack.json` `assets[]` into the pack-index (`packages/engine/packages/vite-plugin-pack/src/build-catalog.ts:494-511`). An `Importer` is only required for external binary sources; we do not have one for the document itself.

2. **Media are NOT routed through the engine texture/audio loaders.** Reel media must render as `<img>`/`<video>` and must work on browsers without WebGPU. So media stay as plain files (`reel-media/<hash>.<ext>`) referenced by **bundle-relative URL** inside the reel-game payload's Scenario. The engine's `pack-index.json` only needs to address the reel-game *document*; media are co-located, content-hashed files.

3. **Two consumers of the same on-disk format.** `reelGameLoader` (P1) lets the engine runtime `loadByGuid` the reel-game asset (studio, inspector, future 3D embedding). The standalone player (P3) uses a tiny **WebGPU-free** pack-index reader (`fetch pack-index.json` → find guid → `fetch .pack.json` → parse) sharing the same extraction pure-function. This avoids spinning up a GPU device just to read JSON.

4. **`forge.json.defaultScene` is untouched** (it is hard-asserted to `kind === 'scene'`, `packages/engine/packages/engine-project/src/loader.ts:272-278`). The reel game's entry GUID is recorded in a new optional `forge.json` field `reelGameGuid` (schema is `.strict()`, so the field must be added to the zod schema or it is rejected).

5. **Pack schema needs no change for the new kind.** `pack.schema.json` `assets[].kind` is an open `minLength:1` string and `payload` is a free object (`packages/engine/packages/pack/schema/pack.schema.json:42-54`). Only the runtime `Asset` union + a loader are mandatory.

---

## File structure (created / modified)

**P0 — per-game media**
- Modify: `packages/marketplace/extensions/wb-reel/vite.config.ts` (the `reelAssetsPlugin`: resolve `.reel-assets` per-slug)
- Test: `packages/marketplace/extensions/wb-reel/src/media/__tests__/perGameAssetsDir.test.ts`

**P1 — engine reel-game asset**
- Modify: `packages/engine/packages/types/src/index.ts` (`Asset` union + `AssetBrand` + new `ReelGameAsset`)
- Create: `packages/engine/packages/runtime/src/reel-game-loader.ts`
- Modify: `packages/engine/packages/runtime/src/wire-default-loaders.ts` (register `reelGameLoader`)
- Modify: `packages/engine/packages/runtime/src/asset-registry.ts` (`assetBrand()` switch add `'reel-game'`)
- Modify: `packages/engine/packages/runtime/src/index.ts` (re-export `reelGameLoader` if barrel exists)
- Test: `packages/engine/packages/runtime/src/__tests__/reel-game-loader.test.ts`

**P2 — server-side exporter**
- Create: `packages/marketplace/extensions/wb-reel/src/scenario/pkg/buildReelGameAsset.ts` (pure: Scenario + media-resolver → `{ packJson, mediaFiles }`)
- Create: `packages/marketplace/extensions/wb-reel/src/scenario/pkg/reelGamePayload.ts` (shared payload shape + extraction pure fn, used by loader + standalone reader)
- Create: `packages/build/reel-src/export/build-reel-asset.ts` (Node entry: read per-game disk → write `assets/reel-game.pack.json` + `reel-media/`)
- Test: `packages/marketplace/extensions/wb-reel/src/scenario/pkg/__tests__/buildReelGameAsset.test.ts`

**P3 — standalone bundle**
- Create: `packages/build/reel-src/export/build-reel-standalone.ts` (mirror `build-standalone.ts`)
- Create: `packages/marketplace/extensions/wb-reel/src/player/loadReelGameFromPackIndex.ts` (WebGPU-free reader)
- Modify: `packages/marketplace/extensions/wb-reel/src/App.tsx` (player-only boot can source scenario from a pack-index when `?src=pack`)
- Test: `packages/marketplace/extensions/wb-reel/src/player/__tests__/loadReelGameFromPackIndex.test.ts`

**P4 — package endpoint dispatch**
- Modify: `packages/server/src/api/workbench.ts` (`POST /games/:slug/package`: detect reel → call reel bundler)
- Modify: `packages/engine/packages/engine-project/src/schema.ts` (add optional `reelGameGuid`)
- Test: `packages/server/src/api/__tests__/workbench-package-reel.test.ts`

---

## Phase P0 — Per-game media on disk

**Why:** Today media land in the wb-reel package-global `.reel-assets/` (`vite.config.ts:1151`), so copying a `games/<slug>/` dir is incomplete and a server-side exporter cannot find a game's media. Make the assets dir per-slug, mirroring `reelScenariosPlugin.resolveStorage(slug)` (`vite.config.ts:1337-1347`).

### Task P0.1: Per-slug assets directory resolution

**Files:**
- Modify: `packages/marketplace/extensions/wb-reel/vite.config.ts` (`reelAssetsPlugin`, dir at line ~1151; route `/__reel__/assets` ~503; ID/path ~592-607)
- Test: `packages/marketplace/extensions/wb-reel/src/media/__tests__/perGameAssetsDir.test.ts`

- [ ] **Step 1: Read the current plugin to extract a pure path resolver.** Read `vite.config.ts` around the `reelAssetsPlugin` definition and `reelScenariosPlugin.resolveStorage`/`gameSlugOf`/`findProjectRootWithForgeax` (`vite.config.ts:1311-1352`). Confirm `gameSlugOf(url)` reads `?game=`.

- [ ] **Step 2: Write the failing test for the resolver.**

```ts
// perGameAssetsDir.test.ts
import { describe, it, expect } from 'vitest'
import { resolveAssetsDir } from '../../../vite.config' // export the pure fn

describe('resolveAssetsDir', () => {
  it('returns per-game dir when slug present and project root found', () => {
    expect(resolveAssetsDir('/proj', 'demo'))
      .toBe('/proj/.forgeax/games/demo/reel/assets')
  })
  it('falls back to package-global dir when no slug', () => {
    expect(resolveAssetsDir('/proj', null))
      .toBe('/proj/.reel-assets')
  })
})
```

- [ ] **Step 3: Run it; expect FAIL** (`resolveAssetsDir` not exported).

Run: `cd packages/marketplace/extensions/wb-reel && pnpm vitest run src/media/__tests__/perGameAssetsDir.test.ts`
Expected: FAIL — `resolveAssetsDir is not a function`.

- [ ] **Step 4: Implement and export the pure resolver in `vite.config.ts`.**

```ts
// near reelScenariosPlugin.resolveStorage; export so it is unit-testable
export function resolveAssetsDir(projectRoot: string, slug: string | null): string {
  if (slug) return resolve(projectRoot, '.forgeax/games', slug, 'reel/assets')
  return resolve(projectRoot, '.reel-assets')
}
```

- [ ] **Step 5: Wire `reelAssetsPlugin` to use it per-request.** Replace the single module-level `assetsDir = resolve(config.root, '.reel-assets')` with a per-request `const dir = resolveAssetsDir(projectRoot, gameSlugOf(req.url))` inside each `/__reel__/assets` handler (GET/POST/PUT/DELETE + manifest). Compute `projectRoot` the same way `reelScenariosPlugin` does (`findProjectRootWithForgeax()` with fallback to `config.root`). Ensure `mkdirSync(join(dir,'blobs'), {recursive:true})` before writes.

- [ ] **Step 6: Make the frontend send the slug on every asset call.** In `packages/marketplace/extensions/wb-reel/src/media/assetStore.ts`, append `gameQuery()` (from `../shell/gameScope`) to `ENDPOINT` reads/writes and to `urlOf(id)` (`assetStore.ts:23,406`). Example: `urlOf = (id) => `/__reel__/assets/${id}${gameQuery()}``.

- [ ] **Step 7: Run the resolver test; expect PASS.**

Run: `pnpm vitest run src/media/__tests__/perGameAssetsDir.test.ts`
Expected: PASS.

- [ ] **Step 8: Manual smoke (dev).** Start the stack, open a game `?slug=demo`, generate one image, and confirm a file appears under `.forgeax/games/demo/reel/assets/blobs/` and the `<img>` still renders.

- [ ] **Step 9: Commit.**

```bash
git add packages/marketplace/extensions/wb-reel/vite.config.ts \
  packages/marketplace/extensions/wb-reel/src/media/assetStore.ts \
  packages/marketplace/extensions/wb-reel/src/media/__tests__/perGameAssetsDir.test.ts
git commit -m "feat(wb-reel): store generated media per-game under games/<slug>/reel/assets"
```

> **Migration note (do NOT skip):** existing media already in the global `.reel-assets/` won't move. Add a one-time copy in the exporter (P2.4) that, when a referenced asset is missing from the per-game dir, falls back to reading the global dir. This keeps already-made games (e.g. `123`) exportable.

---

## Phase P1 — Engine `reel-game` asset kind + loader

### Task P1.1: Add `ReelGameAsset` to the type union

**Files:**
- Modify: `packages/engine/packages/types/src/index.ts:1074-1112` (`Asset` union + `AssetBrand`)

- [ ] **Step 1: Add the `ReelGameAsset` interface** near the other asset PODs (e.g. just above `export type Asset =` at line 1074):

```ts
/**
 * Interactive film-game document asset (wb-reel). A pure-data asset: the
 * engine never instantiates it into ECS. `scenario` is an opaque JSON tree
 * (the wb-reel Scenario) whose media refs are bundle-relative URLs. App-layer
 * code (the reel player) consumes `scenario`; the engine only addresses +
 * ships it.
 */
export interface ReelGameAsset {
  readonly kind: 'reel-game';
  readonly schemaVersion: number;
  readonly scenario: Record<string, unknown>;
}
```

- [ ] **Step 2: Extend the `Asset` union** (line 1087, after `RenderPipelineAsset`):

```ts
  | RenderPipelineAsset
  | ReelGameAsset;
```

- [ ] **Step 3: Extend `AssetBrand`** (line 1112):

```ts
  | 'RenderPipelineAsset'
  | 'ReelGameAsset';
```

- [ ] **Step 4: Typecheck the types package.**

Run: `cd packages/engine && pnpm -F @forgeax/engine-types build`
Expected: PASS (no type errors).

- [ ] **Step 5: Commit.**

```bash
git add packages/engine/packages/types/src/index.ts
git commit -m "feat(engine-types): add ReelGameAsset to Asset union + AssetBrand"
```

### Task P1.2: Implement `reelGameLoader`

**Files:**
- Create: `packages/engine/packages/runtime/src/reel-game-loader.ts`
- Test: `packages/engine/packages/runtime/src/__tests__/reel-game-loader.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// reel-game-loader.test.ts
import { describe, it, expect } from 'vitest'
import { reelGameLoader } from '../reel-game-loader'

const noopCtx = {
  fetchBinary: async () => ({ ok: false as const, error: 'unused' }),
  resolveRef: async () => ({ ok: false as const, error: 'unused' }),
  device: null,
}

describe('reelGameLoader', () => {
  it('has kind reel-game', () => {
    expect(reelGameLoader.kind).toBe('reel-game')
  })
  it('parses a valid payload into a ReelGameAsset POD', () => {
    const out = reelGameLoader.load(
      { schemaVersion: 1, scenario: { id: 's1', title: 'demo' } },
      undefined,
      noopCtx,
    )
    expect(out).toEqual({
      kind: 'reel-game',
      schemaVersion: 1,
      scenario: { id: 's1', title: 'demo' },
    })
  })
  it('returns undefined when scenario is missing', () => {
    expect(reelGameLoader.load({ schemaVersion: 1 }, undefined, noopCtx)).toBeUndefined()
  })
  it('returns undefined when payload is not an object', () => {
    expect(reelGameLoader.load(null as never, undefined, noopCtx)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it; expect FAIL** (module not found).

Run: `cd packages/engine && pnpm -F @forgeax/engine-runtime vitest run src/__tests__/reel-game-loader.test.ts`
Expected: FAIL — cannot find `../reel-game-loader`.

- [ ] **Step 3: Implement the loader.**

```ts
// packages/engine/packages/runtime/src/reel-game-loader.ts
import type { Loader, ReelGameAsset } from '@forgeax/engine-types';

/**
 * Synchronous pack-payload loader for `kind: 'reel-game'` (mirrors the inline
 * pack loaders in asset-registry.ts). Pure of registry bookkeeping; returns the
 * POD or `undefined` on a malformed payload (charter P3 explicit failure).
 */
export const reelGameLoader: Loader = {
  kind: 'reel-game',
  load(payload) {
    if (typeof payload !== 'object' || payload === null) return undefined;
    const scenario = (payload as Record<string, unknown>).scenario;
    if (typeof scenario !== 'object' || scenario === null) return undefined;
    const sv = (payload as Record<string, unknown>).schemaVersion;
    const asset: ReelGameAsset = {
      kind: 'reel-game',
      schemaVersion: typeof sv === 'number' ? sv : 1,
      scenario: scenario as Record<string, unknown>,
    };
    return asset;
  },
};
```

- [ ] **Step 4: Run the test; expect PASS.**

Run: `pnpm -F @forgeax/engine-runtime vitest run src/__tests__/reel-game-loader.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit.**

```bash
git add packages/engine/packages/runtime/src/reel-game-loader.ts \
  packages/engine/packages/runtime/src/__tests__/reel-game-loader.test.ts
git commit -m "feat(engine-runtime): add reelGameLoader for kind reel-game"
```

### Task P1.3: Register the loader + brand

**Files:**
- Modify: `packages/engine/packages/runtime/src/wire-default-loaders.ts:47-52`
- Modify: `packages/engine/packages/runtime/src/asset-registry.ts` (`assetBrand()` switch, ~309-337)
- Modify: `packages/engine/packages/runtime/src/index.ts` (barrel re-export, if present)
- Test: `packages/engine/packages/runtime/src/__tests__/reel-game-loader.test.ts` (extend)

- [ ] **Step 1: Extend the test to assert the default registry wires it.**

```ts
import { createDefaultLoaderRegistry } from '../wire-default-loaders'
// ...
it('is registered in the default loader registry', () => {
  const loaders = createDefaultLoaderRegistry()
  expect(loaders.get('reel-game')?.kind).toBe('reel-game')
})
```

- [ ] **Step 2: Run; expect FAIL** (`get('reel-game')` is undefined).

Run: `pnpm -F @forgeax/engine-runtime vitest run src/__tests__/reel-game-loader.test.ts`
Expected: FAIL on the new case.

- [ ] **Step 3: Register in `wireDefaultLoaders`.**

```ts
// wire-default-loaders.ts
import { reelGameLoader } from './reel-game-loader';
// ...inside wireDefaultLoaders, after registry.register(audioLoaderPlaceholder):
  registry.register(reelGameLoader);
```

Also update the module-comment "Default set (10 kinds)" → "11 kinds (… + reel-game pure-data)".

- [ ] **Step 4: Add the brand case in `assetBrand()`.** Read `asset-registry.ts` around the `assetBrand()` switch (subagent: ~309-337). Add:

```ts
    case 'reel-game':
      return 'ReelGameAsset';
```

- [ ] **Step 5: Re-export from the runtime barrel** if `reelGameLoader` should be host-importable. In `packages/engine/packages/runtime/src/index.ts` add: `export { reelGameLoader } from './reel-game-loader';`

- [ ] **Step 6: Run the loader test; expect PASS.**

Run: `pnpm -F @forgeax/engine-runtime vitest run src/__tests__/reel-game-loader.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Run the runtime package's exhaustive-switch type tests** (the subagent flagged `asset-union-no-name.test-d.ts` / `types.unit.test.ts`). Fix any exhaustiveness failures by adding the `'reel-game'` / `'ReelGameAsset'` arm.

Run: `pnpm -F @forgeax/engine-runtime build && pnpm -F @forgeax/engine-types vitest run`
Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add packages/engine/packages/runtime/src/wire-default-loaders.ts \
  packages/engine/packages/runtime/src/asset-registry.ts \
  packages/engine/packages/runtime/src/index.ts \
  packages/engine/packages/runtime/src/__tests__/reel-game-loader.test.ts
git commit -m "feat(engine-runtime): wire reelGameLoader into default registry + assetBrand"
```

### Task P1.4: End-to-end `loadByGuid` integration test

**Files:**
- Test: `packages/engine/packages/runtime/src/__tests__/reel-game-loadbyguid.test.ts`

- [ ] **Step 1: Write the integration test** (follow the pattern in existing `loadbyguid-payload.unit.test.ts` — construct an `AssetRegistry` with `createDefaultLoaderRegistry()`, stub `configurePackIndex` + the pack-index/pack-file fetch with a `reel-game` entry, then assert `loadByGuid` returns the POD).

```ts
// Mirror loadbyguid-payload.unit.test.ts setup; the asset entry:
//   { guid, kind: 'reel-game', payload: { schemaVersion:1, scenario:{id:'s1'} }, refs: [] }
// Expectation: const res = await registry.loadByGuid<ReelGameAsset>(guid)
//   res.ok === true && res.value.scenario.id === 's1'
```

- [ ] **Step 2: Run; expect FAIL → implement nothing new → it should PASS** because parseAssetPayload already dispatches via LoaderRegistry (`asset-registry.ts:3689-3690`). If it fails with `asset-parse-failed`, debug the pack-index fetch stub, not the loader.

Run: `pnpm -F @forgeax/engine-runtime vitest run src/__tests__/reel-game-loadbyguid.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add packages/engine/packages/runtime/src/__tests__/reel-game-loadbyguid.test.ts
git commit -m "test(engine-runtime): loadByGuid<ReelGameAsset> end-to-end"
```

---

## Phase P2 — Server-side exporter (Scenario → reel-game asset + media)

**Why:** Turn a per-game disk state (`reel/scenarios.json` + `reel/assets/`) into the shippable form: `assets/reel-game.pack.json` (`internal-text-package`, `kind: 'reel-game'`) + `assets/reel-media/<hash>.<ext>`, with the scenario's media refs rewritten to `./reel-media/<hash>.<ext>`. This is the "importer/distill" step (no engine `Importer` needed — it emits a `.pack.json` directly).

### Task P2.1: Shared payload shape + extraction pure function

**Files:**
- Create: `packages/marketplace/extensions/wb-reel/src/scenario/pkg/reelGamePayload.ts`
- Test: `packages/marketplace/extensions/wb-reel/src/scenario/pkg/__tests__/reelGamePayload.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect } from 'vitest'
import { REEL_GAME_SCHEMA_VERSION, makeReelGamePayload, extractScenario } from '../reelGamePayload'

describe('reelGamePayload', () => {
  it('wraps a scenario with the schema version', () => {
    const p = makeReelGamePayload({ id: 's1', title: 'demo' })
    expect(p).toEqual({ schemaVersion: REEL_GAME_SCHEMA_VERSION, scenario: { id: 's1', title: 'demo' } })
  })
  it('extracts scenario back from a payload', () => {
    expect(extractScenario({ schemaVersion: 1, scenario: { id: 's1' } })).toEqual({ id: 's1' })
  })
  it('returns null when payload malformed', () => {
    expect(extractScenario({ schemaVersion: 1 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run; expect FAIL.**

Run: `cd packages/marketplace/extensions/wb-reel && pnpm vitest run src/scenario/pkg/__tests__/reelGamePayload.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement.**

```ts
// reelGamePayload.ts
export const REEL_GAME_SCHEMA_VERSION = 1

export interface ReelGamePayload {
  schemaVersion: number
  scenario: Record<string, unknown>
}

export function makeReelGamePayload(scenario: Record<string, unknown>): ReelGamePayload {
  return { schemaVersion: REEL_GAME_SCHEMA_VERSION, scenario }
}

export function extractScenario(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null
  const s = (payload as Record<string, unknown>).scenario
  if (typeof s !== 'object' || s === null) return null
  return s as Record<string, unknown>
}
```

- [ ] **Step 4: Run; expect PASS.** **Step 5: Commit** (`feat(wb-reel): shared reel-game payload shape`).

### Task P2.2: Pure asset builder (Scenario + media resolver → pack.json + media files)

**Files:**
- Create: `packages/marketplace/extensions/wb-reel/src/scenario/pkg/buildReelGameAsset.ts`
- Test: `packages/marketplace/extensions/wb-reel/src/scenario/pkg/__tests__/buildReelGameAsset.test.ts`

This **reuses `collectScenarioRefs`** (already enumerates every media cell with `get/set`, `collectScenarioRefs.ts:65-228`). The builder is injected a `resolveBlob(ref) => { bytes, ext } | 'external' | 'missing'` so it stays pure of disk/network (mirrors how `exportScenarioPackage` injects `resolveRef`).

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect } from 'vitest'
import { buildReelGameAsset } from '../buildReelGameAsset'

const scenario = {
  id: 's1', title: 'demo',
  scenes: { '1.1': { id: '1.1', media: { kind: 'VIDEO', ref: 'm-aaa' }, durationMs: 6000, dialogue: [] } },
} as never

describe('buildReelGameAsset', () => {
  it('rewrites media refs to ./reel-media/<hash>.<ext> and emits the pack + files', async () => {
    const res = await buildReelGameAsset(scenario, {
      guid: '0190a0b1-0000-7000-8000-000000000001',
      resolveBlob: async () => ({ kind: 'blob', bytes: new Uint8Array([1, 2, 3]), ext: 'mp4' }),
    })
    const entry = res.packJson.assets[0]
    expect(entry.kind).toBe('reel-game')
    expect(entry.guid).toBe('0190a0b1-0000-7000-8000-000000000001')
    const rewritten = (entry.payload.scenario as any).scenes['1.1'].media.ref as string
    expect(rewritten).toMatch(/^\.\/reel-media\/[0-9a-f]{16}\.mp4$/)
    expect(res.mediaFiles).toHaveLength(1)
    expect(res.mediaFiles[0].path).toBe(rewritten.replace('./', ''))
    expect(res.mediaFiles[0].bytes).toEqual(new Uint8Array([1, 2, 3]))
  })
  it('leaves the ref unchanged and records it when media is missing', async () => {
    const res = await buildReelGameAsset(scenario, {
      guid: '0190a0b1-0000-7000-8000-000000000002',
      resolveBlob: async () => ({ kind: 'missing', reason: 'gone' }),
    })
    expect((res.packJson.assets[0].payload.scenario as any).scenes['1.1'].media.ref).toBe('m-aaa')
    expect(res.missing).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run; expect FAIL.**

Run: `pnpm vitest run src/scenario/pkg/__tests__/buildReelGameAsset.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement.** Reuse `collectScenarioRefs`; hash via SHA-256 (reuse the `contentFingerprint`/`fnv1a64Hex` logic from `exportScenarioPackage.ts:421-486` — extract it to a shared `pkg/contentHash.ts` first if you want DRY, otherwise inline a Node `crypto.createHash('sha256')` for the server build).

```ts
// buildReelGameAsset.ts
import type { Scenario } from '../types'
import { collectScenarioRefs } from './collectScenarioRefs'
import { makeReelGamePayload } from './reelGamePayload'
import { createHash } from 'node:crypto'

export type ResolvedBlob =
  | { kind: 'blob'; bytes: Uint8Array; ext: string }
  | { kind: 'external'; url: string }
  | { kind: 'missing'; reason: string }

export interface BuildReelGameOptions {
  guid: string
  /** Injected: turn a scenario ref (m-xxx / url / dataurl) into bytes. */
  resolveBlob: (ref: string) => Promise<ResolvedBlob>
}

export interface ReelGamePackFile {
  schemaVersion: '1.0.0'
  kind: 'internal-text-package'
  assets: Array<{
    guid: string
    kind: 'reel-game'
    name: string
    payload: { schemaVersion: number; scenario: Record<string, unknown> }
    refs: string[]
  }>
}

export interface BuildReelGameResult {
  packJson: ReelGamePackFile
  mediaFiles: Array<{ path: string; bytes: Uint8Array }>
  external: Array<{ ref: string; url: string }>
  missing: Array<{ ref: string; reason: string }>
}

function sha16(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16)
}

export async function buildReelGameAsset(
  scenario: Scenario,
  opts: BuildReelGameOptions,
): Promise<BuildReelGameResult> {
  const clone = structuredClone(scenario) as Scenario
  const cells = collectScenarioRefs(clone)
  const filesByHash = new Map<string, { path: string; bytes: Uint8Array }>()
  const external: BuildReelGameResult['external'] = []
  const missing: BuildReelGameResult['missing'] = []

  for (const cell of cells) {
    const ref = cell.get()
    const r = await opts.resolveBlob(ref)
    if (r.kind === 'blob') {
      const hash = sha16(r.bytes)
      const path = `reel-media/${hash}.${r.ext}`
      if (!filesByHash.has(hash)) filesByHash.set(hash, { path, bytes: r.bytes })
      cell.set(`./${path}`)
    } else if (r.kind === 'external') {
      external.push({ ref, url: r.url }) // keep original ref untouched
    } else {
      missing.push({ ref, reason: r.reason }) // keep original ref untouched
    }
  }

  const packJson: ReelGamePackFile = {
    schemaVersion: '1.0.0',
    kind: 'internal-text-package',
    assets: [{
      guid: opts.guid,
      kind: 'reel-game',
      name: clone.title || clone.id,
      payload: makeReelGamePayload(clone as unknown as Record<string, unknown>),
      refs: [],
    }],
  }
  return { packJson, mediaFiles: [...filesByHash.values()], external, missing }
}
```

- [ ] **Step 4: Run; expect PASS.** **Step 5: Commit** (`feat(wb-reel): pure builder Scenario -> reel-game.pack.json + media`).

### Task P2.3: Node entry — read per-game disk, write the asset

**Files:**
- Create: `packages/build/reel-src/export/build-reel-asset.ts`

- [ ] **Step 1: Implement the Node entry** that wires real disk I/O into `buildReelGameAsset`:
  1. Args: `<slug> [projectRoot]`. Resolve `gameDir = <projectRoot>/.forgeax/games/<slug>`.
  2. Read `reel/scenarios.json`; pick the active scenario (`db.items.find(i => i.id === db.activeId)`).
  3. Build a `resolveBlob` that maps a scenario ref → bytes by reading the per-game asset manifest `reel/assets/manifest.json` (`AssetRecord[]`): match `record.meta.mediaId === ref` (or `record.id === ref`), then read `reel/assets/blobs/<record.filename>`. **Fallback** to the global `.reel-assets/` (P0 migration note). `http(s)://` refs → `{kind:'external'}`. Unresolved → `{kind:'missing'}`. `ext` from the record's filename/MIME.
  4. Mint `guid = AssetGuid.random()` (or deterministic `deriveBuiltin('reel-game:'+slug)` for stable re-exports) via `@forgeax/engine-pack/guid`.
  5. Write `gameDir/assets/reel-game.pack.json` (JSON of `result.packJson`) and each `result.mediaFiles[i]` to `gameDir/assets/<path>`.
  6. Patch `gameDir/forge.json` with `reelGameGuid: guid` (P4 schema field).
  7. Print a summary (packed / external / missing counts).

- [ ] **Step 2: Manual run against game `123`.**

Run: `cd packages/build && bun reel-src/export/build-reel-asset.ts 123 /Users/alexios/Downloads/ForgeaX-github/forgeax-studio`
Expected: writes `.forgeax/games/123/assets/reel-game.pack.json` + `.forgeax/games/123/assets/reel-media/*`, prints `packed: N`.

- [ ] **Step 3: Verify the asset scans clean** (declarer is valid for the engine pipeline):

Run: `cd packages/engine && pnpm -F @forgeax/engine-pack build && forgeax-engine-console-asset verify --roots /Users/alexios/Downloads/ForgeaX-github/forgeax-studio/.forgeax/games/123/assets`
Expected: exit 0 (no `pack-malformed-pack`).

- [ ] **Step 4: Commit** (`feat(build): build-reel-asset node entry writes reel-game asset into game dir`).

---

## Phase P3 — Standalone reel player bundle (no WebGPU)

**Why:** Ship a self-contained static site that plays the reel-game asset with no studio server and no WebGPU dependency.

### Task P3.1: WebGPU-free pack-index reader

**Files:**
- Create: `packages/marketplace/extensions/wb-reel/src/player/loadReelGameFromPackIndex.ts`
- Test: `packages/marketplace/extensions/wb-reel/src/player/__tests__/loadReelGameFromPackIndex.test.ts`

- [ ] **Step 1: Write the failing test** (inject `fetchJson`):

```ts
import { describe, it, expect } from 'vitest'
import { loadReelGameFromPackIndex } from '../loadReelGameFromPackIndex'

it('finds the reel-game entry and returns its scenario', async () => {
  const fetchJson = async (url: string) => {
    if (url === './pack-index.json') return [{ guid: 'g1', kind: 'reel-game', relativeUrl: './reel-game.pack.json' }]
    if (url === './reel-game.pack.json') return { assets: [{ guid: 'g1', kind: 'reel-game', payload: { schemaVersion: 1, scenario: { id: 's1' } } }] }
    throw new Error('unexpected ' + url)
  }
  const scenario = await loadReelGameFromPackIndex('./pack-index.json', { fetchJson })
  expect(scenario).toEqual({ id: 's1' })
})
```

- [ ] **Step 2: Run; expect FAIL.** **Step 3: Implement.**

```ts
// loadReelGameFromPackIndex.ts
import { extractScenario } from '../scenario/pkg/reelGamePayload'

export interface LoadDeps { fetchJson: (url: string) => Promise<unknown> }

const defaultDeps: LoadDeps = {
  fetchJson: async (url) => (await fetch(url, { cache: 'no-store' })).json(),
}

export async function loadReelGameFromPackIndex(
  packIndexUrl: string,
  deps: LoadDeps = defaultDeps,
): Promise<Record<string, unknown>> {
  const index = (await deps.fetchJson(packIndexUrl)) as Array<{ guid: string; kind: string; relativeUrl: string }>
  const entry = index.find((e) => e.kind === 'reel-game')
  if (!entry) throw new Error('no reel-game asset in pack-index')
  const base = packIndexUrl.slice(0, packIndexUrl.lastIndexOf('/') + 1)
  const packUrl = entry.relativeUrl.startsWith('.') ? base + entry.relativeUrl.replace(/^\.\//, '') : entry.relativeUrl
  const pack = (await deps.fetchJson(packUrl)) as { assets: Array<{ guid: string; payload: unknown }> }
  const asset = pack.assets.find((a) => a.guid === entry.guid) ?? pack.assets[0]
  const scenario = extractScenario(asset?.payload)
  if (!scenario) throw new Error('reel-game payload malformed')
  return scenario
}
```

- [ ] **Step 4: Run; expect PASS.** **Step 5: Commit** (`feat(wb-reel): WebGPU-free reel-game pack-index reader`).

### Task P3.2: Player-only boot can source the scenario from a pack-index

**Files:**
- Modify: `packages/marketplace/extensions/wb-reel/src/App.tsx` (player-only branch, ~493-498 / 603-611)

- [ ] **Step 1: Read `App.tsx` player-only boot** (`bootScenarioPersist({ preferredScenarioId })`, `App.tsx:493-498`) and how `Player` reads the active scenario from the store.

- [ ] **Step 2: Add a `?src=pack` branch.** When `new URLSearchParams(location.search).get('src') === 'pack'`, instead of `bootScenarioPersist`, call `loadReelGameFromPackIndex('./pack-index.json')` and feed the result into the scenario store via `useScenarioStore.getState().loadScenario(scenario)` before rendering `<Player/>`. Media refs are already `./reel-media/...` relative URLs, so `refResolver` must pass through bundle-relative URLs untouched (verify `refResolver.ts` URL branch handles `./reel-media/...`; if not, add it).

- [ ] **Step 3: Manual: build the wb-reel app and hand-test** by serving a dir containing `index.html` + `pack-index.json` + `reel-game.pack.json` + `reel-media/` and opening `?surface=player&src=pack`. Confirm the reel plays.

- [ ] **Step 4: Commit** (`feat(wb-reel): player can boot from a local reel-game pack-index`).

### Task P3.3: Standalone bundler

**Files:**
- Create: `packages/build/reel-src/export/build-reel-standalone.ts`

- [ ] **Step 1: Mirror `build-standalone.ts`** but for the wb-reel React app:
  1. Args `<slug> <outDir> [projectRoot]`.
  2. Run P2.3 (`build-reel-asset`) first (or import + call it) so `assets/reel-game.pack.json` + `reel-media/` exist.
  3. Vite `build()` the wb-reel **player-only** entry (a generated `index.html` that loads the wb-reel app with `?surface=player&src=pack` semantics; reuse `App.tsx`). `base: './'`, `outDir`.
  4. Copy `assets/reel-game.pack.json` → `<outDir>/reel-game.pack.json` and `assets/reel-media/` → `<outDir>/reel-media/`.
  5. Write `<outDir>/pack-index.json` = `[{ guid, kind:'reel-game', relativeUrl:'./reel-game.pack.json' }]` (rebased like `build-standalone.ts:186-191`).
  6. Write `serve.sh` (copy verbatim from `build-standalone.ts:194-212`) + a reel-specific `README.md`. **No WebGPU caveat needed** — note that explicitly (reel runs on any modern browser).

- [ ] **Step 2: Manual run + serve.**

Run: `cd packages/build && bun reel-src/export/build-reel-standalone.ts 123 /tmp/reel-123 /Users/alexios/Downloads/ForgeaX-github/forgeax-studio && (cd /tmp/reel-123 && ./serve.sh)`
Expected: open `http://localhost:8123` → the `123` reel plays end-to-end with media, no studio server running.

- [ ] **Step 3: Commit** (`feat(build): standalone reel player bundle + serve.sh`).

---

## Phase P4 — Wire the package endpoint to dispatch by game type

**Files:**
- Modify: `packages/engine/packages/engine-project/src/schema.ts:42-63` (add optional `reelGameGuid`)
- Modify: `packages/server/src/api/workbench.ts:537-586` (`POST /games/:slug/package`)
- Test: `packages/server/src/api/__tests__/workbench-package-reel.test.ts`

### Task P4.1: Allow `reelGameGuid` in forge.json

- [ ] **Step 1: Add the field to the zod schema** (it is `.strict()`, so unknown fields are rejected — `loader.ts:82-90`):

```ts
// schema.ts, inside GameProjectSchema object
  reelGameGuid: GuidString.optional(),
```

- [ ] **Step 2: Run the engine-project tests.**

Run: `cd packages/engine && pnpm -F @forgeax/engine-project vitest run`
Expected: PASS (existing structural/loader tests still green; add one asserting `reelGameGuid` round-trips).

- [ ] **Step 3: Commit** (`feat(engine-project): optional reelGameGuid field in forge.json`).

### Task P4.2: Detect reel games and route packaging

- [ ] **Step 1: Write the failing test.** A game dir with `reel/scenarios.json` (non-empty `activeId`) → packaging invokes the **reel** bundler, not the ECS `build-standalone`. A game dir without `reel/` → ECS path unchanged. Stub the two bundlers and assert which is called.

- [ ] **Step 2: Run; expect FAIL.**

- [ ] **Step 3: Implement detection in `POST /games/:slug/package`.** Read `gameDir/reel/scenarios.json`; if it exists and has a non-empty `activeId`, spawn `build-reel-standalone.ts <slug> <outDir>`; else keep the existing `build-standalone.ts` path. Return `{ outDir }` either way.

- [ ] **Step 4: Run; expect PASS.** **Step 5: Commit** (`feat(server): package endpoint dispatches reel games to the reel bundler`).

---

## Phase P5 — Follow-ups (optional, separate plan if large)

- Studio dev player + `PreviewMode` can optionally read the reel-game asset via `loadReelGameFromPackIndex` for parity with shipped builds.
- `.reelpkg` **import** end (currently missing) so the legacy single-scenario zip can be ingested back, reusing `extractScenario`.
- Deterministic GUIDs (`deriveBuiltin('reel-game:'+slug)`) + re-export idempotency so repeated packaging keeps stable asset identity.
- Per-game media **garbage collection** (drop blobs no longer referenced by any scenario) before export to shrink bundles.

---

## Self-Review

**1. Spec coverage** (against the chosen Route B = "reel game as standard engine asset: declarer + importer + loader, stored under games/<slug>, shippable to others"):
- Declarer → P2 (`reel-game.pack.json`, `internal-text-package`). ✅
- Importer → intentionally **skipped** for the document (self-contained JSON); the "distill" equivalent is the P2 builder. Decision #1 documents why. ✅
- Loader → P1 (`reelGameLoader` + registry + brand). ✅
- Stored under `games/<slug>` & self-contained → P0 (per-game media) + P2 (asset written into `games/<slug>/assets/`). ✅
- "Others can see it" → P3 (standalone bundle) + P4 (one-click package endpoint). ✅
- forge.json entry → P4.1 (`reelGameGuid`); `defaultScene` left intact (Decision #4). ✅

**2. Placeholder scan:** No "TBD/implement later"; every code step has real code. P2.3/P3.x have an investigation step ("read X") followed by concrete steps because they wire into files whose exact internals (reelAssetsPlugin handlers, App.tsx player boot) must be confirmed at edit time — code skeletons are provided, not deferred.

**3. Type consistency:** `ReelGameAsset { kind:'reel-game'; schemaVersion:number; scenario:Record<string,unknown> }` is identical across P1 (type), P1.2 (loader output), P2.1 (`makeReelGamePayload`/`extractScenario`), P3.1 (reader). Pack file shape `{ schemaVersion:'1.0.0', kind:'internal-text-package', assets:[{guid,kind:'reel-game',name,payload,refs}] }` is identical in P2.2 and P3.1's test. Media path convention `./reel-media/<16hex>.<ext>` is consistent P2.2 ↔ P3.3. `reelGameGuid` field name consistent P2.3 ↔ P4.1.

**Gaps found & folded in:** added the P0 migration fallback (global `.reel-assets` read) so already-made games stay exportable; flagged the `refResolver` bundle-relative-URL pass-through verification inside P3.2.
