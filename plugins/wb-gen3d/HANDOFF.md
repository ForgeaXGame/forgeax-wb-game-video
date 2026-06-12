# Handoff - Gen3D Generation Workbench

Last updated: 2026-06-12 Asia/Hong_Kong (Rodin **image-to-3D** now real-verified end-to-end through `RodinProvider` + temp COS: real character image → public presigned URL → 9.44 MB GLB + webp preview, `providerMode='real'`. COS public reachability PASS. Rodin **views**-to-3D still unverified; real Hunyuan public-COS fetch still pending. GLB/OBJ dedup confirmed already-landed in code (ADR-0002). Earlier M9-M12 history below. SSOT: `docs/PLAN-2026-06-11-rodin-cos-pergame.md`)

## 下一步工作 = M13：角色绑骨 / 动作 / low_poly 减面（2026-06-12）

> **当前 next work 是 M13**（不是下面的 M9-M12 —— 那批已落地并并入 main）。执行 / 评审 SSOT：
> [`docs/PLAN-2026-06-12-rig-motion-lowpoly.md`](./docs/PLAN-2026-06-12-rig-motion-lowpoly.md)；
> 关键决策：[`docs/adr/0003-rig-motion-lowpoly-pipeline.md`](./docs/adr/0003-rig-motion-lowpoly-pipeline.md)。
> 产线：高模 GLB →① low_poly 减面 →② auto_rigging 绑骨（出带骨 FBX）→③ motion_retarget v1 动作。
> 方案要点：全程混元、验证先行（**Gate 0** 先验混元内网能否抓我们公网 COS 的模型 URL）、
> 资产模型走「同基名附加 FBX」（rig/motion 产物 append 到源资产，不另起资产）。
> **执行前需操作员拍板**：① motion v1 的 8 个动作名（int 9–16）映射来源；② low_poly 后高模是否保留。

## 历史基线：2026-06-11 Plan (M9-M12)（已完成、已并入 main）

> The next executing agent should follow
> **`docs/PLAN-2026-06-11-rodin-cos-pergame.md`** — the SSOT for the new work.
> It adds M9-M12 on top of the M0-M8 history below and, per operator direction
> (2026-06-11), **reverses the global asset library to a per-game v2 file
> contract**. ADR-0002 records this reversal of ADR-0001's global storage model.
> All key decisions were already confirmed with the user during the 2026-06-11
> grill — do not re-litigate them; just execute.

## 2026-06-11 M9-M12 Landed (mock-first / quota-safe)

M9-M12 are now **implemented** (typecheck + build pass). All real provider
paths stay gated behind operator keys + `GEN3D_ENABLE_REAL_PROVIDERS=1`; nothing
below makes a network call by default.

- **M9 — per-game storage**: `server/per-game-store.ts` writes
  `${gameRoot}/assets/3d/{characters|meshes}/<name>.glb` + `<name>.glb.meta.json`
  (v2 contract sidecar; gen3d fields under `custom`, sidefiles in
  `dependencies[]`, `custom.cacheKey` stored for delete reverse-lookup). Manifest
  identity is now `assetPath` (UUID `assetId` + content-addressed blobs dropped);
  `cache.jsonl`/`audit.jsonl` moved per-game; cacheKey includes `assetSlot`,
  excludes `assetName`; cache hit reuses the existing path, non-cache name
  collisions auto-suffix (`name-2.glb`). `gen3d:delete-asset`
  (confirm-destructive) removes the GLB + sidecar + preview and tombstones the
  cacheKey. Frontend reads `?slug=` from the iframe URL and threads it through all
  tool calls; no active game ⇒ Generate disabled + empty state. Pose/upload
  intermediates land in scratch (`.gen3d/tmp/`), not the library.
- **M9 server route (plugin-external, operator-approved)**: `/api/game-assets/:slug/*`
  in `packages/server/src/main.ts` — read-only, safe-slug + `..`-rejection +
  `assets/3d/` prefix assertion, serving only display files under
  `.forgeax/games/<slug>/assets/3d/**`. Old `/api/gen3d-blobs` left as-is.
  **(2026-06-11: this route was missing from `main.ts` — earlier edit was lost;
  it has now actually been (re-)landed and verified serving real GLB + webp,
  with traversal/`..` rejected.)**
- **M10 — local upload + COS**: `cos-nodejs-sdk-v5` + `server/cos-uploader.ts`;
  `gen3d:upload-image` (base64 → ≤8MB backend validation → COS presigned URL,
  reuses the JSON tools route, no extra server route). `SetupSidebar` source-image
  inputs use `ImageInputField` (local picker → upload → URL backfill + manual
  fallback); prompt textarea enlarged + char count; "角色编辑器" hint added.
  `COS_*` live in plugin `.env` only.
- **M11 — Rodin provider (mock-first)**: `server/providers/rodin.ts` (multipart
  `POST /api/v2/rodin` → poll `/api/v2/status` → `/api/v2/download`),
  `getRodinEnv()`, provider enum across types/ui-meta/catalog/tool-handlers/
  schemas, UI selector entry. `tier=Regular`, `quality_override`,
  `geometry_file_format=glb`; injectable fetch/download for quota-safe smoke.
- **M12 — UI upgrade**: pose standardization moved above input; polycount is now
  low/medium/high discrete buttons mapped per provider (Meshy 8k/30k/100k,
  Hunyuan 10k/40k/120k, Rodin ~8k/18k/50k); `ModelViewer` gained a grid-floor
  toggle, a skeleton toggle (enabled only when a SkinnedMesh exists), and a
  faces/vertices/bbox HUD; `Workspace` result card trimmed; `AssetLibrary` is now
  a dense preview-thumbnail grid leading with the prompt's first line + per-card
  delete confirmation.

Pending live verification (operator, with keys): Hunyuan fetching a **public**
COS URL from its internal network (explicit risk item — fallbacks in
CAPABILITY_MATRIX); real Rodin **image / views** runs (text is verified, see
below). M10 logic was exercised by out-of-tree bun smoke scripts (injected
fetch/download, no network); those scratch scripts are not committed.

### 2026-06-12 — Rodin **image-to-3D** real verified + COS public reachability

Operator-provided temp COS creds (lightai bucket) + `RODIN_API_KEY` (64-char,
Hyper3D). Ran quota-safe probes first, then one real image-to-3D:

- **COS upload → public reachability PASS** (the URL-fetching-provider
  prerequisite): `CosUploader.upload()` puts under `wb-gen3d/inputs/<sha256>.<ext>`;
  the presigned URL is **publicly GET-able with no auth header** (200, bytes
  match) — confirms Hunyuan/Meshy could fetch a public COS URL. `COS_SIGN_EXPIRES_SEC`
  is the env name (operator's `COS_PRESIGN_EXPIRES` was renamed on write); the
  hardcoded `wb-gen3d/inputs` prefix already satisfies the requested `wb-gen3d/`
  path, so `COS_PREFIX` is not used.
- **Rodin auth reachable**: empty-multipart probe → `201 INVALID_REQUEST`
  (params, not auth) → key valid, no job started.
- **Rodin text submit envelope confirmed**: returns `uuid` + `jobs.subscription_key`
  (provider's envelope parse is correct; matches the earlier text verification).
- **Rodin image-to-3D real PASS** (2026-06-12, ~98s, burns quota): a real
  character illustration → COS → `RodinProvider` image mode submit/poll(6 sub-jobs)
  /download returned a **9.44 MB GLB (`glTF` 2.0 magic verified)** + **5.4 KB
  `preview.webp`**, `providerMode='real'`, real `sourceJobId`. The model matches
  the source character. Synthetic flat-color test images get rejected with
  `IMAGE_CONTENT_VIOLATION` (content moderation), so image-to-3D needs a real
  photo/illustration — not a code issue. **Rodin views-to-3D still unverified.**
- GLB/OBJ dedup is **already settled in code** (not pending): `per-game-store.ts`
  `planFiles()` keeps the GLB `source_mesh` as identity and drops OBJ/MTL
  `source_mesh` sidefiles (ADR-0002, "GLB only"). The "GLB/OBJ dedup decision
  pending" note below is stale.

### 2026-06-11 (evening) — Rodin real API verified + webp + server route fix

Ran a real Rodin `text-to-3d` through the live Studio server with
`GEN3D_ENABLE_REAL_PROVIDERS=1` + `RODIN_API_KEY` (Business sub). Findings/fixes:

- **Rodin real path works end-to-end**: submit `/api/v2/rodin` → poll
  `/api/v2/status` (6 sub-jobs all `Done`) → download `/api/v2/download` returned
  `base_basic_pbr.glb` + `preview.webp`; persisted per-game with
  `providerMode='real'` and served back via `/api/game-assets/:slug/*`.
- **`/api/game-assets/:slug/*` was actually missing** from `main.ts` (the earlier
  "landed" edit had been lost), so every generated asset URL 404'd. Re-added with
  safe-slug + `..` rejection + `assets/3d/` prefix assertion; verified GLB/webp
  serve 200 and traversal returns 4xx.
- **webp preview was being dropped**: Rodin's preview is `preview.webp`, but
  `classifyFile()` returned `null` for `.webp` and `FileFormat` lacked it, and
  `per-game-store.ts` hardcoded preview ext to `.png`. Fixed: `FileFormat` now
  includes `'webp'`; `classifyFile()` maps `.webp` → `preview_image`; preview
  files are now stored with their real format ext (`<name>.<fmt>`), so webp
  thumbnails persist and render.
- Smoke-test asset + temp files cleaned up after verification.

## 2026-06-11 Second grill-review revisions (READ FIRST)

A second `grill-with-docs` pass on 2026-06-11 (evening) cross-checked the plan
against the real code and the v2 workspace contract, then revised 10 key
decisions with the user. The plan's top "review 修订摘要" block is the SSOT;
summary:

1. cacheKey includes `assetSlot`, excludes `assetName`; a hit reuses the old
   path and ignores the freshly-typed name (UI shows "cache hit").
2. Multi-file asset = main GLB is identity + same-basename sidefiles; sidefiles
   go in sidecar `dependencies[]`; OBJ dropped by default (GLB only).
3. **Align v2 workspace-contract disk format** (`<name>.glb.meta.json` + the
   contract sidecar schema). Runtime mechanism (path-slot / `writeAsset()` /
   `_index.json` / ownership conflict) is recorded as ADR-0002 known debt, NOT
   built this round. Target path stays `assets/3d/{characters|meshes}/` (the
   "move to a private `assets/gen3d/`" idea was considered and rejected — keep
   "generation = immediately game-usable"; ownership conflict stays as debt).
4. base64 upload uses the existing JSON route (verified no bodyLimit); backend
   hard-validates ≤8MB. **Hunyuan is an internal-network API → fetching a public
   COS URL is an explicit verification item + fallback** (byte inline / internal
   COS / Hunyuan URL-only).
5. Polycount control = **low/medium/high discrete buttons** (continuous slider
   dropped — it was fake for Rodin's `quality_override`).
6. `delete-asset` writes a cache tombstone (sidecar `custom` stores the cacheKey
   for reverse lookup) so deleted assets don't resurrect / re-burn quota.
7. cache.jsonl / audit.jsonl **move per-game** (was a plan omission; a global
   cache would mis-hit across games with game-relative paths).
8. The new server route reuses `defaultProjectRoot` / `safeSegment` +
   `..`-rejection + prefix assertion — no new wheel.
9. Old global library: **clean break, no migration** — drop the `assetId` field;
   old `.forgeax/assets/gen3d/` is discarded test data (delete manually).
10. pose-standardization / upload intermediate images are Transfer scratch
    artifacts (`.forgeax/games/<slug>/.gen3d/tmp/`), NOT assets — not in the
    library, no delete UI.

## 2026-06-11 Closeout Log

This closeout was written after the `grill-with-docs` session hit context limit.
It is documentation-only: no runtime code, schemas, env files, generated assets,
or secrets were changed in this handoff pass.

Updated SSOT set for the next executor:

- `docs/PLAN-2026-06-11-rodin-cos-pergame.md` — execution plan for M9-M12.
- `docs/adr/0002-per-game-file-asset-storage.md` — accepted decision replacing
  ADR-0001's global asset library with per-game file storage.
- `CONTEXT.md` — canonical terms: `assetPath`, `assetSlot`, Asset Name, transfer
  URL, per-game runtime asset library.
- `docs/MIGRATION_PLAN.md` — historical M0-M8 retained, with an M9-M12 addendum.
- `docs/CAPABILITY_MATRIX.md` — Rodin is mock-first/planned; real calls stay
  gated until key + output shape are verified.

Scope guard for implementation: M9 is mostly plugin-local, but the read-only
`/api/game-assets/:slug/*` preview route touches `packages/server/src/main.ts`.
Confirm authorization before that one plugin-external edit, and keep it limited
to `.forgeax/games/<slug>/assets/3d/**`.

New work, in order:

1. **M9 — per-game storage refactor (do FIRST; everything depends on it).**
   New `server/per-game-store.ts` (`AssetStorage` file+sidecar impl) writing
   `${gameRoot}/assets/3d/{characters|meshes}/<name>.glb` + `<name>.glb.meta.json`
   (sidecar aligned to v2 workspace contract: schema + `dependencies[]`); new
   manifest identity field is `assetPath` (drop UUID `assetId` +
   content-addressed blobs); `assetSlot` is
   `characters` or `meshes`; cacheKey includes `assetSlot`, excludes `assetName`;
   ordinary generation reuses cache hits and never
   overwrites same-name assets (suffix on non-cache collisions); cache.jsonl /
   audit.jsonl also move per-game; slug from iframe URL query
   `?slug=<gameSlug>` first, with host bridge/ctx only as compatibility;
   `gen3d:delete-asset` (confirm-destructive, writes cache tombstone); new server
   route `/api/game-assets/:slug/*` (plugin-external — confirm authorization
   first; read-only and limited to `.forgeax/games/<slug>/assets/3d/**`).
2. **M10 — local image upload via plugin COS adapter** (`gen3d:upload-image`,
   base64 → 24h presigned URL, backend hard-validates ≤8MB); SetupSidebar
   file-picker inputs; bigger prompt box; "角色编辑器" hint. Note Hunyuan
   internal-network COS-fetch risk + fallback.
3. **M11 — Rodin provider** (`server/providers/rodin.ts`, multipart Bearer;
   text/image/views; `quality_override`); UI selector; mock-first until key.
4. **M12 — UI upgrade** (pose-standardization moved to top; **low/medium/high
   discrete polycount buttons** + per-provider values; result grid/skeleton/
   face-vertex info; dense asset grid showing prompt + delete-with-confirm).

The "Asset Storage", "Relationship To Per-Game Assets", and M8-handoff items
below are **historical context** — M9 supersedes the global library. Treat the
plan + ADR-0002 as the target, not the ADR-0001 storage description.

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
- `docs/PLAN-2026-06-11-rodin-cos-pergame.md`
- `docs/adr/0001-production-tool-architecture.md`
- `docs/adr/0002-per-game-file-asset-storage.md`
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

> **2026-06-12 — INTEGRATED TO MAIN.** The whole wb-gen3d line (M3–M12) plus the
> server routes are now merged into each repo's `main`: marketplace@`43b0715`,
> server@`807bebd`, studio superproject@`1092ad4`. The studio pointer is no longer
> dirty/dangling. Continued work happens on the feature branch (kept in sync with
> main) and lands on main following the team's direct-push convention.

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
- Downstream modules should consume stable asset paths/manifests, not temporary
  provider URLs.
- Rigging and animation integrations must treat FBX URLs as request-time access
  URLs only. The stored source of truth is the asset manifest plus blob storage,
  not a provider URL, browser URL, or local dev URL.
- Unverified modes stay out of UI and AI-facing schemas.
- Quality scoring uses five dimensions: geometry, topology, texture, pbr, and
  prompt_fidelity.

## Asset Storage And Rigged FBX Contract

> SUPERSEDED BY M9 (see plan + ADR-0002): the global content-addressed
> library described here is being replaced by a per-game v2 file contract
> (`${gameRoot}/assets/3d/{characters|meshes}/<name>.glb` + `.meta.json`, asset
> id = path). The rigged-FBX role/readiness semantics below still hold; the
> storage location and asset-id model change. Kept here as historical baseline.

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

Handoff from gen3d → game `assets/3d/characters/` (copy + `.meta.json`) was the
old M8-remaining item; **M9 supersedes it** — the per-game file model writes
generation output straight into `${gameRoot}/assets/3d/{characters|meshes}/`, so
there is no separate "global → game" copy step.

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

> **New direction (2026-06-11): next work = M9-M12 in
> `docs/PLAN-2026-06-11-rodin-cos-pergame.md` (start with M9).** The status below
> is the M0-M8 baseline the plan builds on; read it for context, then execute the
> plan.

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

> SSOT for the M9-M12 items: `docs/PLAN-2026-06-11-rodin-cos-pergame.md`.

| Item | Status | Blocker / note |
| --- | --- | --- |
| **M9 per-game storage refactor** (`per-game-store` + slug bridge + `gen3d:delete-asset` + server route) | **DONE** (mock-first) | supersedes ADR-0001 global library; ADR-0002 written; `/api/game-assets/:slug/*` server route landed (operator-approved) |
| **M10 local upload + COS** (`gen3d:upload-image`, SetupSidebar pickers, bigger prompt box) | **DONE** | dep `cos-nodejs-sdk-v5` added; `COS_*` in plugin `.env` only; real COS upload pending key |
| **M11 Rodin provider** (multipart, text/image/views, `quality_override`) | **DONE** (mock-first) | awaiting `RODIN_API_KEY` + one verified output shape for real calls |
| **M12 UI upgrade** (pose-top, low/med/high polycount buttons+presets, result grid/skeleton/info, dense asset grid + delete) | **DONE** | UI-only, on M9-M11 |
| **docs** (MIGRATION_PLAN M9-M12, ADR-0002, CONTEXT, CAPABILITY_MATRIX) | **DONE** | updated to reflect landed implementation |
| ~~M8 handoff UI~~ (gen3d → game assets) | **superseded by M9** | per-game file model writes straight into `assets/3d/` |
| **M8 quality scoring UI** | reserved | `InspectorReserved` placeholder exists; needs runtime scorer |
| `motion_retarget` v1 (Hunyuan REST) | deferred | needs rigged humanoid FBX from `wb-3d-pipeline` |
| Quality-rubric scoring runtime | not started | static rubric dims from `provider-status` only; no real scorer |
| **GLB/OBJ dedup** | **DONE** (ADR-0002) | `per-game-store.ts` `planFiles()` keeps GLB `source_mesh` as identity, drops OBJ/MTL `source_mesh`; was "pending" but already landed in M9 |
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
until explicitly bumped for integration. (2026-06-12: bumped and merged to
studio main@`1092ad4` — no longer dirty.)

## Do Not Expose Yet

- Hunyuan geometry and world workflow modes.
- Hunyuan REST `motion_retarget_v2`.
- Hunyuan REST `auto_rigging` as a default/user-facing mode.
- Rodin *real* output until `RODIN_API_KEY` + one verified output shape exist.
  (M11 may land the UI selector + provider mock-first; keep real calls gated
  behind `GEN3D_ENABLE_REAL_PROVIDERS` + key like Hunyuan/Meshy.)
- Any provider mode that has not produced a verified output shape.
