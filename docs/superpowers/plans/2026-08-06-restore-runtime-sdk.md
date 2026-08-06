# Restore runtime SDK Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Restore deleted `src/runtime/sdk` and wire standalone build + minimal package exports (Approach A).

**Architecture:** Checkout files from `084662a^` unchanged; reattach `build:standalone` to the release pipeline; export `./standalone` (and a packable SDK client entry); update outbound-apis status. No URL-mapping work.

**Tech Stack:** Bun, Vite, Vitest, existing wb-game-video host package layout.

**Spec:** `docs/superpowers/specs/2026-08-06-restore-runtime-sdk-design.md`

## Global Constraints

- Restore sources byte-for-byte from `084662a^` (appendix C list only).
- Do not replace SDK with `PlayerBootstrap`.
- Do not implement appendix D mapping.
- Keep `./host` and Workbench Host path intact.
- Gate on `bun test` (sdk + release) and `bun run build:standalone` / `check:release`.

---

### Task 1: Restore SDK sources

**Files:** all paths under `src/runtime/sdk/` listed in appendix C.

- [x] `git checkout 084662a^ --` the 11 appendix-C paths
- [x] Confirm tree matches appendix C list
- [x] Run SDK unit tests via `src/runtime/sdk/vitest.config.ts` — 5 passed

### Task 2: Wire build scripts + exports

**Files:** `package.json`, `server/release-contract.test.ts`.

- [x] Add `build:standalone` and `start:standalone` scripts
- [x] Change `build` to include `build:standalone` before `check:release`
- [x] Add export `./standalone` → `./dist/standalone/wb-game-video.html` (client source export deferred — schema deps)
- [x] `bun run build:standalone` produces `dist/standalone/wb-game-video.html`
- [x] `bun test server/check-release.test.ts` — 36 pass (full `check:release` blocked by pre-existing workbench-host type mismatch on frontend/backend build in this checkout)

### Task 3: Docs

- [x] Appendix C: mark restored; link spec
- [x] Appendix D.4: note source restore done; mapping still deferred
- [x] README/AGENTS: mention `build:standalone` / `start:standalone`

### Task 4: Verify

- [x] SDK vitest (5) + check-release.test.ts (36)
- [x] `bun run build:standalone`
- [ ] Full `bun run build` / `check:release` — blocked by pre-existing `@forgeax/workbench-host` export mismatch (`rewriteUrl` / `MediaUpload` etc.), unrelated to SDK restore
