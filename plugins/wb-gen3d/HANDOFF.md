# Handoff - Gen3D Generation Workbench

Last updated: 2026-06-11 Asia/Hong_Kong (Workbench UI refactor landed, commit `af986ce`; next = M8 handoff/quality scoring)

## Current State

M0-M4 complete for `wb-gen3d` inside the marketplace submodule, plus M5
`pose_standardization` (the first Hunyuan REST subtool), implemented and
live-verified. The Hunyuan workflow provider (`text`/`image`/`views` via
`*-wf`) is built with a real submit/poll client, but **real calls are OFF by
default**: the master switch `GEN3D_ENABLE_REAL_PROVIDERS=1` plus a
`HUNYUAN_API_KEY` must both be set, else every generation tool falls back to the
deterministic mock (quota-safe). The ADR-0001 decoupled modules (providers /
cache / rate-guard / audit / env) are landed.

M5 `motion_retarget` v1 is deferred: its input must be a rigged humanoid FBX
(`role=rigged_model`, verified skeleton), which no current generation path
produces — only `wb-3d-pipeline` rigging can. Pick it up once a rigged-FBX asset
exists.

Product direction (2026-06-09): `wb-gen3d` is the production 3D generation
entrypoint for game assets, not a benchmark tool. Provider comparison is
background knowledge in docs only, not runtime code or UI (see
`docs/adr/0001-production-tool-architecture.md`).

Created files:

- `.gitignore`
- `.env.example` (var names only; real `.env` is gitignored)
- `forgeax-plugin.json`
- `index.html`
- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `CONTEXT.md`
- `docs/MIGRATION_PLAN.md`
- `docs/CAPABILITY_MATRIX.md`
- `docs/adr/0001-production-tool-architecture.md`
- `HANDOFF.md`
- `schemas/provider-status.args.json`
- `schemas/provider-status.returns.json`
- `schemas/list-assets.args.json`
- `schemas/list-assets.returns.json`
- `schemas/generate-meshy-text-mock.args.json`
- `schemas/generate-meshy-text-mock.returns.json`
- `schemas/text-to-3d.args.json` / `schemas/text-to-3d.returns.json`
- `schemas/image-to-3d.args.json` / `schemas/image-to-3d.returns.json`
- `schemas/views-to-3d.args.json` / `schemas/views-to-3d.returns.json`
- `schemas/pose-standardization.args.json` / `schemas/pose-standardization.returns.json`
- `schemas/gen3d-asset-manifest.json`
- `shared/manifest.ts` (Gen3DAssetManifest contract)
- `shared/catalog.ts` (capability matrix + ProviderResult + mock generator)
- `server/env.ts` (env + feature-gate resolution)
- `server/asset-storage.ts` (AssetStorage adapter interface)
- `server/local-blob-store.ts` (LocalBlobStore dev impl)
- `server/cache.ts` (cacheKey -> assetId dedup)
- `server/rate-guard.ts` (sliding-window submit guard)
- `server/audit.ts` (append-only audit trail, no secrets)
- `server/providers/hunyuan-workflow.ts` (real submit/poll client, injectable transport)
- `server/providers/hunyuan-rest.ts` (synchronous REST subtool client, injectable transport)
- `server/generate.ts` (ProviderResult -> manifest orchestration + cache-first)
- `server/tool-handlers.ts`
- `src/main.tsx`
- `src/App.tsx` (M8: shell + shared tool state; routes left/center panes)
- `src/lib/toolClient.ts` (M8: `POST /api/tools/call` client)
- `src/lib/blobUrl.ts` (M8: storageKey → same-origin URL resolver)
- `src/components/ModelViewer.tsx` (M8: three.js GLB renderer with OrbitControls)
- `src/components/SetupSidebar.tsx` / `StepCard.tsx` (M8 UI refactor: staged left pane)
- `src/components/Workspace.tsx` / `AssetLibrary.tsx` (M8 UI refactor: center + right column)
- `src/types.ts` / `src/ui-meta.ts` (shared types + semantic icon map)
- `src/styles/tokens.css` (vendored design tokens) + `src/styles.css`

No secrets, env values, cache files, or generated assets are committed. `dist/`
and `.env` are ignored. Durable assets, `cache.jsonl`, and `audit.jsonl` land
under `.forgeax/assets/gen3d/` (outside source control).

## Branch Context

Expected working directory:

`/Users/laurenceelu/dev/ForgeaXGame/forgeax-studio/packages/marketplace`

Expected branch:

`laurenceelu/feat-20260609-hunyuan3d-meshy-pipeline-card`

The top-level Studio repo should remain on the matching feature branch. The
top-level repo only needs to record the submodule pointer when integration or a
commit step explicitly requires it.

## Source Reference

Reference project:

`/Users/laurenceelu/dev/hunyuan3d-lab/`

Full source architecture and migration handoff:

`/Users/laurenceelu/dev/hunyuan3d-lab/docs/FORGEAX_STUDIO_MIGRATION_HANDOFF.md`

Target-side pointer:

`docs/SOURCE_HANDOFF.md`

Use it as read-only source evidence. Do not copy secrets, `.env`, `cache/`,
`outputs/`, COS credentials, or generated model artifacts.

Most important source conclusions already carried into this plugin:

- The main product value is generation-first: upstream character image assets in,
  durable 3D asset manifests out, with provider comparison as supporting evidence.
- Cache-first behavior is mandatory before quotaed provider calls.
- Provider order is Hunyuan first, Meshy second, Rodin third after key/API
  details arrive.
- Hunyuan workflow and Hunyuan REST sub-capabilities are separate integration
  paths.
- Provider result URLs should be downloaded immediately and persisted through an
  asset-storage adapter.
- Downstream modules should consume stable asset ids/manifests, not temporary
  provider URLs.
- Rigging and animation integrations must treat FBX URLs as request-time access
  URLs only. The stored source of truth is the asset manifest plus blob storage,
  not a provider URL, browser URL, or local dev URL.
- Unverified modes stay out of UI and AI-facing schemas.
- Quality scoring uses five dimensions: geometry, topology, texture, pbr, and
  prompt_fidelity.

## Asset Storage And Rigged FBX Contract

The M3 storage contract is the baseline for future development:

- Long-term generated output lives in a `Gen3DAssetManifest` plus blob files in a
  global, game-agnostic library (ADR-0001 / CONTEXT.md):
  `.forgeax/assets/gen3d/<assetId>/manifest.json` plus content-addressed blobs at
  `.forgeax/assets/gen3d/blobs/<sha256-prefix>/<sha256>.<ext>`. Everything under
  `.forgeax/` stays out of source control. Games reference assets by `assetId`;
  generation does not require choosing a game first.
- `files[]` describe durable file roles: `source_mesh`, `rigged_model`,
  `preview_image`, `texture`, `animation_clip`, `animated_model`. Each file
  carries `fileId`, `format`, `storageKey`, `bytes`, `sha256`, `localUrl`, plus
  rigging readiness (`hasSkeleton`, `skeletonProfile`, `animationInputReady`).
- Hunyuan `motion_retarget` input is not "any FBX". It must resolve from
  `assetId + role=rigged_model + format=fbx` with verified skeleton metadata
  (`hasSkeleton: true`, `skeletonProfile: "humanoid"`, `animationInputReady:
  true`). Generation never sets these; only a verified rigging step in
  `wb-3d-pipeline` may.
- Converting GLB or OBJ to FBX does not make it animation-ready.
- External rigging/animation providers that need a fetchable URL get one via
  `AssetStorage.shareUrl` — a request-time transport URL, never the canonical
  asset reference.
- Provider outputs from rigging/animation must be downloaded back into the same
  storage contract before downstream consumption.

### Relationship To Per-Game Assets (`.forgeax/games/<slug>/assets/`)

ForgeaX also has an official **per-game runtime asset library** (project property,
not plugin property). Example: `packages/games/shoot-opt/assets/` symlinked at
runtime to `.forgeax/games/shoot-opt/assets/` (pack.json + GUID materials).
v2 target layout adds `assets/2d/` and `assets/3d/characters/` path slots — see
`docs/v2-vision/node-runtime-architecture/03-WORKSPACE-LAYOUT.md`.

**wb-gen3d global library and per-game assets are layered, not competing:**

| Layer | Path | Role |
| --- | --- | --- |
| Global staging | `.forgeax/assets/gen3d/` | AI generation output, cross-game reuse |
| Game runtime | `.forgeax/games/<slug>/assets/` | Engine-consumable assets (shoot-opt pack, future handoff targets) |

Handoff from gen3d → game `assets/3d/characters/` (copy + `.meta.json`) is M8
remaining; not implemented yet.

## Implemented Tools

- `gen3d:provider-status`: returns the static provider capability matrix and
  quality rubric dimensions (planning data only, not a runtime scorer). Now also
  reports `quotaSafe` and `realProvidersEnabled` based on whether a real provider
  is configured.
- `gen3d:list-assets`: lists persisted `Gen3DAssetManifest` records from the
  global library, optionally filtered by provider.
- `gen3d:generate-meshy-text-mock`: deterministic no-quota Meshy text-to-3D mock
  that persists a durable manifest (source_mesh GLB + preview_image PNG blobs)
  via the storage adapter and returns the manifest. `assetId` is random per call;
  `cacheKey` is deterministic for the same input.
- `gen3d:text-to-3d` / `gen3d:image-to-3d` / `gen3d:views-to-3d`: mode generation
  with a `provider` param (Hunyuan workflow `*-wf` OR Meshy), cache-first. When the
  chosen provider's env is configured they call the real submit/poll endpoints,
  download output URLs into blobs, and persist a `Gen3DAssetManifest`. When not
  configured they fall back to the deterministic mock (`usedMock: true`). Returns
  `{ ok, cacheKey, cacheHit, usedMock, manifest }`.
- `gen3d:refine-mesh`: Meshy-only second stage — add texture to a prior Meshy
  text `preview` task (`previewTaskId` = the manifest `sourceJobId`). Persists a
  new durable manifest (`mode='refine'`, cache-first). Mock fallback when Meshy is
  not configured.
- `gen3d:pose-standardization`: Hunyuan REST subtool (synchronous `POST
  /openapi/v1/3d/images/pose_standardization`). Upstream preprocessing only:
  standardizes a simple cartoon full-body image to an A/T-pose image. The output
  image is downloaded into a durable `preview_image` blob and the tool returns
  `{ ok, usedMock, sourceJobId, storageKey, bytes, sha256, localUrl, sourceUrl }`.
  It does NOT produce a `Gen3DAssetManifest` — the `storageKey` is meant to feed a
  later `gen3d:image-to-3d` call. Quota-safe by default (mock image blob when no
  real provider is configured).

## Real Provider Activation (quota-safe by default)

Real Hunyuan calls require BOTH, set in a plugin-local `.env` (gitignored; copy
`.env.example`):

- `GEN3D_ENABLE_REAL_PROVIDERS=1`
- `HUNYUAN_API_KEY=<uuid>` and `HUNYUAN_BASE_URL=http://hunyuanapi.woa.com`

Auth is plain `Authorization: Bearer <key>` (no request signing). Submit + poll
share two endpoints (`/openapi/v1/workflow/invoke/async`,
`/openapi/v1/workflow/detail`) differentiated by the `model` field. The
`RateGuard` caps submits (default 3/min). With the switch unset/0 or no key,
generation stays mock-only and never touches the network.

## Verification So Far

From this plugin directory:

```bash
npm run typecheck
npm run build
```

Both passed on 2026-06-10. An out-of-tree bun smoke (no real network) confirmed:
the no-key path falls back to mock and persists a durable manifest; cache-first
returns the same `assetId` on a repeat input (`cacheHit=true`) and a new asset for
a different input; and an injected-`fetch` simulation of the Hunyuan client drives
submit → poll → `extract_urls` → download → manifest with exactly one submit, the
correct `*-wf` model id, and `providerMode='real'`.

Live verification (2026-06-10, internal network, operator-approved): one real
`gen3d:text-to-3d` completed in ~292s with `providerMode=real`, `usedMock=false`,
a real `sourceJobId`, and four downloaded blobs persisted into a manifest
(`source_mesh/glb` ~41.9 MB, `source_mesh/obj` ~600 KB, `preview_image/png`,
`texture/png` ~17.5 MB). Network host `http://hunyuanapi.woa.com` is reachable
from the internal network (bare probe returns 401 without auth).

M5 `pose_standardization` verification (2026-06-10): an injected-fetch smoke (no
network) confirmed exactly one synchronous POST with the correct REST path,
model, and Bearer auth, `data[].url` extraction + download into bytes, and that
an error response throws `provider_failed`; typecheck + build pass. Live
(operator-approved): one real `gen3d:pose-standardization` on the doc human image
completed in ~20s with `usedMock=false`, a real `sourceJobId`, and a 501 KB
standardized PNG persisted as a content-addressed blob; audit recorded
`rest_succeeded` with no secrets.

## Next Step

M4 (Hunyuan workflow provider), M5 `pose_standardization`, and M6 (Meshy
provider — `text`/`image`/`views` + `refine-mesh`) are done and live-verified.
**M8 core generation-loop UI is landed** (`src/App.tsx`
rewritten from the M3 mock preview to drive the real `gen3d:text/image/views-to-3d`
tools over `POST /api/tools/call`, with provider-status banner, manifest result
card, and `gen3d:list-assets` library; `src/lib/toolClient.ts` is the HTTP
client; `vite.config.ts` gained a dev `/api` proxy). **Blob serving + three.js
model preview are also landed** (2026-06-10):

- Server gained `/api/gen3d-blobs/*` static route (`packages/server/src/main.ts`,
  commit `bf78703` on branch `laurenceelu/feat-20260609-gen3d-blob-route`) mapping
  the URL prefix to `.forgeax/assets/gen3d/` on disk (immutable cache, CORS).
- `LocalBlobStore` now receives `localUrlBase='/api/gen3d-blobs'` so new assets
  carry a same-origin `localUrl`; the frontend `blobUrl()` helper also derives URLs
  from `storageKey` for assets generated before this change.
- `ModelViewer` component (three.js + GLTFLoader + OrbitControls) renders GLB
  models in the result card; `PreviewThumb` renders `preview_image` PNGs.
- Asset library cards are clickable to inspect any previously generated asset.
- Embedded same-origin serving: the manifest now sets
  `entry.standalone.embeddedAlso:true` and the server gained a second
  `serveStatic` block `/plugins/wb-gen3d/*` (`packages/server/src/main.ts`) that
  serves the built `dist/`. The Studio iframe therefore loads from
  `/plugins/wb-gen3d/` (same-origin) like every other workbench, instead of the
  cross-origin standalone dev port :15175 — which, when not running, left the
  in-page panel stuck on the loading placeholder. `npm run dev` (:15175) is still
  the standalone-dev path outside Studio.

typecheck + build pass. End-to-end verified: GLB (37MB) and PNG served at 200 via
the blob route, three.js loads and renders the model in standalone dev (:15175);
embedded in Studio, both panes load from same-origin `/plugins/wb-gen3d/`
(`readyState=complete`) and render the real UI — no more stuck "加载中".

**UI refactor landed (2026-06-11, commit `af986ce`):** Workbench tool-editor
pattern — vendored tokens, staged left sidebar (`SetupSidebar`/`StepCard`),
center workspace + asset library right column (embedded center pane; no separate
right iframe in `forgeax-plugin.json`). Old teal theme removed. Tool contracts
unchanged. typecheck + build pass; visual validation across standalone/left/center
panes done.

Remaining M8 UI items:

1. ~~`pose-standardization` upstream step~~ — DONE (`PosePreprocess` in `SetupSidebar`).
2. ~~views L/R inputs~~ — DONE (「添加左/右视图」in views mode).
3. Downstream rigging/animation handoff action + metadata (reserved: `InspectorReserved`).
4. Quality-rubric scoring UI (reserved: `InspectorReserved`, disabled placeholder).
5. gen3d → game `assets/3d/characters/` handoff (copy/import + sidecar meta).

Remaining backend work: **`motion_retarget` v1** (`POST
/openapi/v1/3d/motion_retarget`, model `hunyuan-3d-motion-retarget`, integer
motion types 9-16), which is **deferred** until a rigged humanoid FBX asset path
exists (`role=rigged_model` + verified skeleton, produced by `wb-3d-pipeline`,
not by generation). Keep `auto_rigging` experimental and `motion_retarget_v2`
blocked.

Note (not yet acted on): real `text` output returns both a GLB and an OBJ
`source_mesh`. The current `URL_KEY_TO_FILE` keeps one file per `role:format`, so
both are stored. Decide later whether to prefer GLB and drop OBJ.

## Pending Work (do NOT lose — push incrementally)

| Item | Status | Blocker / note |
| --- | --- | --- |
| **M8 handoff UI** (gen3d → game assets) | NEXT | copy/import to `${gameRoot}/assets/3d/characters/` + `.meta.json`; wire `InspectorReserved` handoff action |
| **M8 quality scoring UI** | reserved | `InspectorReserved` placeholder exists; needs runtime scorer |
| `motion_retarget` v1 (Hunyuan REST) | deferred | needs rigged humanoid FBX from `wb-3d-pipeline` |
| Rodin provider | not started | awaiting key/API + one verified output shape |
| Quality-rubric scoring runtime | not started | static rubric dims from `provider-status` only; no real scorer |
| GLB/OBJ dedup | decision pending | real `text` returns both GLB+OBJ `source_mesh`; decide prefer-GLB-drop-OBJ |
| ~~UI refactor~~ (Workbench editor pattern) | **done** `af986ce` 2026-06-11 | tokens + staged sidebar + center/right column |
| ~~views L/R inputs in UI~~ | **done** 2026-06-11 | 「添加左/右视图」in `SetupSidebar` |
| `auto_rigging` / `motion_retarget_v2` | blocked | keep out of UI/AI schemas until verified output shape exists |

## Completed: UI Refactor (2026-06-10 plan → 2026-06-11 landed)

**Status: landed** in marketplace commit `af986ce` (2026-06-11). UI-only; all
`gen3d:*` tool contracts and server code unchanged.

Original problem: bespoke teal theme divorced from the repo design system.
Refactored into the ForgeaX Workbench tool-editor pattern (wb-character as
reference only).

Governing SSOT (for future UI tweaks):

- `.cursor/skills/forgeax-editor-ui-pattern/{EDITOR_UI_PATTERN,WORKBENCH_LEFT_SIDEBAR,EXAMPLES}.md`
- `packages/interface/src/styles/{tokens.css,motion.css,forgeax-preview/DESIGN-SYSTEM.md}`
- `.cursor/rules/ui-token-alignment.mdc`
- Theming precedent (plugins vendor a tokens copy; iframe does NOT inherit host
  tokens): `wb-ui/src/ui/tokens.css`, `wb-narrative/viz/src/styles/forgeax-tokens.css`

Slot map:

| Pattern slot | wb-gen3d content |
| --- | --- |
| pane-header | "3D 角色生成" + lime pill (provider mode real/quota-safe · asset count) |
| `EditorLeftPanel` (staged) | Step1 Provider · Step2 mode+input · Step2.5 pose (conditional) · Step3 params · `ToolActionRow`=Generate |
| `EditorCenterWorkspace` | `ModelViewer` (GLB) hero + manifest facts + refine CTA (Meshy text); empty/loading/error |
| `EditorRightPanel` | asset library (`.motion-row`) + selected inspector; RESERVED: quality-score card, downstream-handoff action |
| `EditorBottomPanel` (optional) | generation progress/status (Hunyuan takes minutes) |
| `EditorToastLayer` | error/success |

Staged left sidebar (step card = number → title → live summary → collapsible
body; only the current step open):

1. Provider — 混元 / Meshy (segmented).
2. 输入方式 — 文生 / 图生 / 多视图 (segmented); body = prompt / imageUrl /
   views (front required + back + ADD left + right).
3. 姿态标准化 (optional, image/views) — existing `PosePreprocess`, "用作输入".
4. 生成参数 — `targetPolycount`, PBR, Meshy-text→refine note.
- `ToolActionRow`: Generate, right-aligned, `--primary` + `--color-text-on-bright-primary`.

Reserved slots (placeholders now, wire when backend lands — per confirmed
`uiscope = slots`):

- Quality-score card (right inspector): the 5 rubric dims from `provider-status`,
  rendered `disabled / 待评分运行时`.
- Downstream rigging/animation handoff (result-card action): disabled, tooltip
  "需先经 wb-3d-pipeline 绑骨".

Icon map (single, `lucide-react`, reuse the same glyph for the same action across
step/CTA/empty/toast): text `Type`, image `Image`, views `Images`, pose
`PersonStanding`, generate `WandSparkles`, refine `Brush`, library `Library`,
refresh `RefreshCw`, quality `Gauge`, handoff `Share2`, real/quota
`ShieldAlert`/`ShieldCheck`. Drop the current "same glyph (`Boxes`) for generate
+ library + brand".

Tokens/motion: replace the bespoke palette with `--color-*` / `--primary` /
`--color-status-*` / `--motion-*` + `.motion-row`/`.motion-panel-in`; use the
locked pane-header (lime `#d4ff48` pill) + 6px lime scrollbar constants from
`WORKBENCH_LEFT_SIDEBAR.md`. Bright primary buttons keep
`--color-text-on-bright-primary` through hover/active/focus.

States (every major slot needs a non-blank fallback): empty library, empty
selection, loading (task/progress), error (reason + retry + copyable details),
blocked (refine = Meshy-text only; handoff = needs rig).

Files (all inside the plugin): new `src/styles/tokens.css` (vendored); rewrite
`src/styles.css` + `src/App.tsx` (split into PaneHeader / SetupSidebar / StepCard
/ Workspace / AssetLibrary / InspectorReserved); `ModelViewer.tsx` class/container
only — no three.js logic change. Do NOT touch `server/**`, `schemas/**`,
`shared/**`, `toolClient.ts`, `blobUrl.ts`, or `forgeax-plugin.json` (ask first if
`panelSize`/`panes` need a tweak).

Phases (all complete 2026-06-11): ① tokens + pane-header → ② staged left panel
(incl. L/R views) → ③ center workspace + states → ④ asset library + reserved
inspector in center right column → ⑤ typecheck/build/visual + §10 checklist.

**Note:** asset library lives in the center pane right column because
`forgeax-plugin.json` only declares `left` + `center` panes (no separate right
iframe). Standalone dev: `npm run dev` on `:15175`.

Submodule pointer in forgeax-studio parent repo may still show `M packages/marketplace`
until explicitly bumped for integration.

## Do Not Expose Yet

- Hunyuan geometry and world workflow modes.
- Hunyuan REST `motion_retarget_v2`.
- Hunyuan REST `auto_rigging` as a default/user-facing mode.
- Rodin until key/API details and one verified output shape exist.
- Any provider mode that has not produced a verified output shape.
