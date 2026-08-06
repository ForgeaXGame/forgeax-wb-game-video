# PR #91 Host Migration Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the wb-game-video consumer use the Workbench handshake identity and Host media extension protocol while preserving the existing video-generation behavior and fixing the two reviewed generation-contract regressions.

**Architecture:** Keep the existing `KinoVideoClient` consumer-facing interface, but make its default implementation an adapter over `getWorkbenchHost().extension.fetch/url`. The Workbench bootstrap writes the only runtime game ID into `graphScenarioStore`; all editor views consume that store value. Generation parsing and style-axis normalization remain server-side focused changes with regression tests.

**Tech Stack:** React 19, Zustand, TypeScript, Bun, Vitest, Workbench Host extension client, Node HTTP router.

## Global Constraints

- Do not modify the Workbench Host, Arrival/Kino, or asset-canvas repositories.
- Do not restore `/api/v1/kino`, `__video-upload-proxy`, Vite proxy, or standalone-provider fallback paths.
- Do not change wb-game-video prompts, generation tool semantics, or existing business flows.
- Do not send `game_id` in browser media query strings or request bodies; Host handshake context supplies it.
- Preserve `@forgeax/workbench-host@0.2.0` npmjs tarball lockfile entry.
- Use test-first red/green cycles for every production behavior change.

---

### Task 1: Make handshake game identity the sole editor identity

**Files:**
- Modify: `src/editor/persist/graphScenarioStore.ts`
- Modify: `src/GraphApp.tsx`
- Modify: `src/editor/shell/GraphStudio.tsx`
- Modify: `src/editor/shell/GraphConfigView.tsx`
- Modify: `src/editor/shell/GraphPlaySurface.tsx`
- Modify: `src/editor/shell/GraphAssetView.tsx`
- Modify: `src/editor/shell/GraphVideoView.tsx`
- Test: `src/editor/bootstrap/__tests__/GameBootstrap.test.tsx`
- Test: `src/__tests__/GraphApp.bootstrap.test.tsx`
- Test: existing shell tests that render the five editor views

**Interfaces:**
- Consumes: `GameBootstrap` callback `onBoot(gameId)`, `ensureBoot(game, demo)`, and `useGraphScenario((state) => state.game)`.
- Produces: mounted editor views whose media/asset hooks receive the handshake game ID, including IDs such as `猫` and `a`.

- [ ] **Step 1: Add a failing store/GraphApp regression test.** Extend `src/__tests__/GraphApp.bootstrap.test.tsx` so the mocked `GameBootstrap` invokes `onBoot('猫')`; assert the store game becomes `'猫'` and no URL slug/default is consulted. Add a direct render test for a child view with store game `'a'` and URL slug unset, asserting its data hook receives `'a'`.

- [ ] **Step 2: Run the focused tests and verify the expected failure.**

```bash
bunx vitest run src/__tests__/GraphApp.bootstrap.test.tsx src/editor/bootstrap/__tests__/GameBootstrap.test.tsx
```

Expected: the new assertions fail because child views still call `getGameSlug() ?? 'game-nodia-fighting'` and some components boot a second identity.

- [ ] **Step 3: Remove URL/default identity reads from production views.** In `GraphStudio`, `GraphConfigView`, and `GraphPlaySurface`, remove `getGameSlug` imports, local fallback game values, and effect-time `ensureBoot` calls; read `state.game` from `useGraphScenario`. In `GraphAssetView` and `GraphVideoView`, pass `state.game` to their asset hooks. Keep `GraphApp` as the single `GameBootstrap`/`ensureBoot` owner.

```tsx
const game = useGraphScenario((state) => state.game);
const assets = useVideoAssets(game, ...);
```

- [ ] **Step 4: Make the store default non-authoritative.** Change the initial `game` value to an empty string and guard media/asset hook requests when it is empty. Existing tests that render views directly must seed a game ID before asserting requests.

- [ ] **Step 5: Run the focused suite and verify green.**

```bash
bunx vitest run src/__tests__/GraphApp.bootstrap.test.tsx src/editor/bootstrap/__tests__/GameBootstrap.test.tsx src/editor/shell/__tests__/GraphStudio-node-panel.test.tsx src/editor/shell/__tests__/bgm-play-surfaces.test.tsx src/editor/shell/__tests__/missing-video-surfaces.test.tsx
```

- [ ] **Step 6: Commit the identity change.**

```bash
git add src/GraphApp.tsx src/editor/persist/graphScenarioStore.ts src/editor/shell src/editor/bootstrap/__tests__/GameBootstrap.test.tsx src/__tests__/GraphApp.bootstrap.test.tsx
git commit -m "fix: use handshake game identity across editor views"
```

### Task 2: Adapt Kino media operations to Workbench Host

**Files:**
- Modify: `src/editor/assets/kino-api.ts`
- Test: `src/editor/assets/__tests__/kino-api.test.ts`
- Test: `src/editor/shell/__tests__/media.test.ts`

**Interfaces:**
- Consumes: `KinoVideoClient` methods used by `useVideoAssets`, `useAssetLibrary`, and `media.ts`.
- Produces: Host-bound requests to `media/resources`, `media/resources/:id`, and `media/resources/batch`; response DTOs retain the existing consumer shape.

- [ ] **Step 1: Replace old-route expectations with failing Host protocol tests.** In `kino-api.test.ts`, mock `getWorkbenchHost()` and assert list/create/update/batch/get/delete use `extension.fetch` with no `game_id`; assert `extension.url('media/resources/id/content')` is used for playback. Add a delete test where the response is `204` with an empty body.

- [ ] **Step 2: Run the media client tests and verify the expected failure.**

```bash
bunx vitest run src/editor/assets/__tests__/kino-api.test.ts
```

Expected: current implementation calls `/api/v1/kino`, appends `game_id`, and attempts to parse a 204 delete response.

- [ ] **Step 3: Implement the Host adapter without changing the public client shape.** Import `getWorkbenchHost`, use `extension.fetch` for JSON operations and `extension.url` for content URLs, strip `game_id` from outgoing params/bodies, map Host resource envelopes into current `KinoVideo` values, and synthesize the current `game_id` field from the method's game argument where the cache expects it.

- [ ] **Step 4: Handle Host errors and response envelopes.** Keep non-2xx conversion to `KinoClientError`; parse `{code: 0, data}` for normal success, accept `204` for delete, and raise `upstream_unavailable` for malformed success envelopes.

- [ ] **Step 5: Run the client and shell media tests.**

```bash
bunx vitest run src/editor/assets/__tests__/kino-api.test.ts src/editor/shell/__tests__/media.test.ts
```

- [ ] **Step 6: Commit the media adapter.**

```bash
git add src/editor/assets/kino-api.ts src/editor/assets/__tests__/kino-api.test.ts src/editor/shell/__tests__/media.test.ts
git commit -m "fix: route browser media through workbench host"
```

### Task 3: Replace legacy upload transport with Host chunk uploads

**Files:**
- Modify: `src/editor/assets/video-upload.ts`
- Modify: `src/editor/assets/image-assets.ts` if its transport contract requires the new instruction fields
- Test: `src/editor/assets/__tests__/video-upload.test.ts`
- Test: image/provider upload tests that use `createDefaultXhrUploadTransport`

**Interfaces:**
- Consumes: Host `DirectUploadInstruction` with `url`, `headers`, `chunk_size`, and `chunk_count`.
- Produces: sequential `PUT` requests to the Host upload URL with `chunk_index` and `chunk_count`, then `workbench-upload:<id>` resource creation.

- [ ] **Step 1: Add failing chunk protocol tests.** Assert a 1.2 MiB blob with a 512 KiB instruction sends three ordered PUTs, each carries `chunk_index`/`chunk_count`, progress reaches 100%, and no request targets `/api/v1/kino` or `__video-upload-proxy`. Add a 204 upload response case and a failed-chunk case that stops subsequent requests.

- [ ] **Step 2: Run upload tests and verify the expected failure.**

```bash
bunx vitest run src/editor/assets/__tests__/video-upload.test.ts
```

Expected: current code sends one XHR to the old transport URL and has no chunk query fields.

- [ ] **Step 3: Implement sequential Host upload.** Normalize the instruction URL through `getWorkbenchHost().extension.url` when it is relative, slice the file using `chunk_size`, issue one `PUT` per index with merged headers and query fields, require a successful HTTP response, and invoke progress after each completed chunk.

- [ ] **Step 4: Remove old transport resolution.** Delete `resolveUploadTransportUrl`, the `/__video-upload-proxy` constant, and all `/api/v1/kino/uploads` fallback branches. Preserve the existing caller-facing upload result and cancellation/error behavior.

- [ ] **Step 5: Run all upload-related tests.**

```bash
bunx vitest run src/editor/assets/__tests__/video-upload.test.ts src/editor/assets/__tests__/image-assets.test.ts
```

- [ ] **Step 6: Commit the upload transport change.**

```bash
git add src/editor/assets/video-upload.ts src/editor/assets/image-assets.ts src/editor/assets/__tests__/video-upload.test.ts src/editor/assets/__tests__/image-assets.test.ts
git commit -m "fix: upload media through host chunk protocol"
```

### Task 4: Preserve dialogue and voiceover in shot parsing

**Files:**
- Modify: `server/generation/orchestrate.ts`
- Test: `server/generation/orchestrate-assets.test.ts` or a focused new test beside `orchestrate.ts`

**Interfaces:**
- Consumes: shot arrays and `{shots: [...]}` payloads accepted by `parseShotScript`.
- Produces: `SeedancePromptEntry[]` with trimmed `dialogueLine` and `voiceover` only when present as non-empty strings.

- [ ] **Step 1: Add failing parser tests.** Cover direct arrays and `{shots}` objects containing both optional fields, and assert blank optional values are omitted while `seedancePrompt` remains required.

- [ ] **Step 2: Run the focused parser test and verify it fails.**

```bash
bunx vitest run server/generation/orchestrate-assets.test.ts
```

- [ ] **Step 3: Implement optional-field normalization.** Add a small helper that trims a string and returns `undefined` for blank values; include the resulting properties in each parsed entry without changing shot number, duration, or prompt behavior.

- [ ] **Step 4: Run the parser and video-binding tests.**

```bash
bunx vitest run server/generation/orchestrate-assets.test.ts server/engine/fmv/video-binding.test.ts
```

- [ ] **Step 5: Commit the parser fix.**

```bash
git add server/generation/orchestrate.ts server/generation/orchestrate-assets.test.ts server/engine/fmv/video-binding.test.ts
git commit -m "fix: preserve dialogue and voiceover shot fields"
```

### Task 5: Keep partial style-axis overrides sparse

**Files:**
- Modify: `server/host/wb-service.ts`
- Test: `server/host/wb-service.test.ts`

**Interfaces:**
- Consumes: `styleAxes` request objects with any subset of `artMedia`, `director`, and `filmLook`.
- Produces: an override object containing only supplied non-empty strings so registry defaults survive shallow merges.

- [ ] **Step 1: Add a failing service test.** Submit a style-axis override containing only `director`; assert the resulting effective axes retain the registry `artMedia` and `filmLook` values and replace only `director`.

- [ ] **Step 2: Run the focused service test and verify it fails.**

```bash
bunx vitest run server/host/wb-service.test.ts
```

- [ ] **Step 3: Implement sparse normalization.** Build the result object incrementally, adding each axis only when `stringValue` returns a non-empty value; return `undefined` when no axis is supplied.

- [ ] **Step 4: Run the service suite.**

```bash
bunx vitest run server/host/wb-service.test.ts
```

- [ ] **Step 5: Commit the style-axis fix.**

```bash
git add server/host/wb-service.ts server/host/wb-service.test.ts
git commit -m "fix: preserve defaults for partial style axes"
```

### Task 6: Add release anti-regression checks

**Files:**
- Modify: `scripts/check-release.mjs`
- Modify: `server/release-contract.test.ts`
- Modify: `server/check-release.test.ts` if the existing release test helper is the canonical scanner
- Test: the modified release contract tests

**Interfaces:**
- Consumes: built source/package text and `bun.lock`.
- Produces: a release check that rejects legacy media route/proxy strings and accepts only the npmjs `@forgeax/workbench-host@0.2.0` tarball entry.

- [ ] **Step 1: Add failing checks.** Add `/api/v1/kino`, `__video-upload-proxy`, and a non-npmjs workbench-host lockfile fixture to the forbidden/invalid cases.

- [ ] **Step 2: Run the release tests and verify the expected failure.**

```bash
bunx vitest run server/release-contract.test.ts server/check-release.test.ts
```

- [ ] **Step 3: Implement the scanners.** Extend the existing forbidden-route scan and lockfile assertion without changing unrelated provider checks.

- [ ] **Step 4: Run release validation.**

```bash
bun run check:release
bunx vitest run server/release-contract.test.ts server/check-release.test.ts
```

- [ ] **Step 5: Commit the release checks.**

```bash
git add scripts/check-release.mjs server/release-contract.test.ts server/check-release.test.ts
git commit -m "test: guard host media migration release contract"
```

### Task 7: Full verification and migration boundary review

**Files:**
- Modify: only tests or source files required by verified failures; no unrelated refactors.

- [ ] **Step 1: Run typecheck, build, lint, and release checks.**

```bash
bun run typecheck
bun run build
bun run lint
bun run check:release
```

- [ ] **Step 2: Scan production code for removed legacy routes.**

```bash
rg -n "/api/v1/kino|__video-upload-proxy|game_id" src server scripts --glob '!**/*.test.*'
```

Expected: no old media route/proxy hits; any remaining `game_id` matches must be unrelated server/provider contracts and be reviewed individually.

- [ ] **Step 3: Run the full test suite.**

```bash
bun test
```

Record the exact pass/fail counts and distinguish failures introduced by this branch from pre-existing main failures.

- [ ] **Step 4: Review the final diff against the design spec.** Confirm only Workbench Host migration, generation-contract preservation, style-axis normalization, and release guards changed.

- [ ] **Step 5: Commit any final test-only adjustments.**

```bash
git add -A
git commit -m "test: verify PR 91 host migration fixes"
```
