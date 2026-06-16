# Gen3D Generation Workbench Migration Plan

Status: M8 landed; M9-M12 implemented (mock-first / quota-safe) 2026-06-11;
M3–M12 merged to main 2026-06-12. **Next work = M13** (rig / motion / low_poly —
**docs grill 收尾、可执行**；代码未开工): `docs/PLAN-2026-06-12-rig-motion-lowpoly.md`,
ADR-0003 (Accepted). Workbench UI refactor landed (2026-06-11, `af986ce`). M5
`pose_standardization` live-verified. M9 supersedes ADR-0001's global asset library
with a per-game file contract; see `docs/PLAN-2026-06-11-rodin-cos-pergame.md` and
`docs/adr/0002-per-game-file-asset-storage.md`. Hunyuan public-COS model fetch
(Gate 0) still pending live verification; Rodin image-to-3D live-verified 2026-06-12.

This plugin migrates conclusions and useful workflows from
`/Users/laurenceelu/dev/hunyuan3d-lab/` into ForgeaX as the production 3D
generation entrypoint for game assets. Benchmarking and provider comparison
remain supporting views for quality, cost, and provider choice. The source lab
remains read-only for this migration; do not copy credentials, cache files,
generated outputs, or the Flask/Python app structure.

## Chosen Shape

- Plugin id: `wb-gen3d`
- Marketplace package id: `@forgeax-plugin/wb-gen3d`
- Product role: 3D generation entrypoint for game assets, with benchmark/comparison as supporting evidence
- Initial implementation boundary: `packages/marketplace/plugins/wb-gen3d/`
- Provider order: Hunyuan first, Meshy second, Rodin third after key/API details arrive

The workbench should generate durable ForgeaX 3D asset manifests, preserve
operational conclusions, and feed downstream rigging/animation/game-generation
modules. It should not become a direct transplant of `hunyuan3d-lab`.

## Success Criteria

- All provider calls are cache-first or mock-only until an explicit quotaed
  provider milestone is reached.
- No API key or secret is stored in plugin source, docs, schemas, or examples.
- Unverified provider modes are absent from user-facing UI and tool schemas.
- Hunyuan workflow entries and Hunyuan REST sub-capabilities stay separate in
  schemas, code, and documentation.
- Provider URLs are downloaded immediately into durable storage before being
  advertised as game assets.
- Other modules consume stable asset paths/manifests, not temporary provider URLs.
- FBX URLs passed to rigging or animation providers are temporary transport URLs;
  they are never the canonical stored asset reference.
- The storage layer is adapter-based: local dev blobs first, object storage
  later without changing the asset manifest contract.
- Benchmark scoring uses the five-dimension rubric: `geometry`, `topology`,
  `texture`, `pbr`, and `prompt_fidelity`.
- All edits stay inside this plugin directory unless a later milestone receives
  explicit approval for broader integration work.

## Milestones

### M0 - Planning Scaffold

Status: complete.

Goal: create plugin-local planning artifacts only.

Deliverables:

- `docs/MIGRATION_PLAN.md`
- `docs/CAPABILITY_MATRIX.md`
- `HANDOFF.md`

Verification:

- Marketplace submodule active branch (2026-06-15):
  `laurenceelu/feat-20260615-gen3d-polish` (historical: `feat-20260609-*`, merged to main).
- Diff is scoped to `plugins/wb-gen3d/`.
- No provider code, manifest, env template, generated assets, cache files, or
  API calls are introduced.

### M1 - Plugin Shell

Status: complete.

Goal: make the workbench discoverable without real provider execution.

Deliverables:

- `forgeax-plugin.json` with `kind: "workbench"`.
- Minimal frontend shell for provider capability status, result queue, and
  rubric display.
- Placeholder tool schemas for provider status and result listing.
- Backend tool handlers returning static local data.

Verification:

- Manifest parses as JSON.
- Workbench entry follows existing plugin conventions.
- No quota-consuming path exists.

### M2 - First Vertical Slice

Status: complete for deterministic mock flow.

Goal: support a mock/cache-first flow for one safe path.

Implemented first path: `gen3d:generate-meshy-text-mock`, a deterministic Meshy
text-to-3D mock result generator. It does not read cache files, write artifacts,
or call Meshy. Same prompt/category/PBR/polycount inputs produce the same mock
id.

Verification:

- Tool returns a typed result object that the card can render.
- Same input is deterministic in mock mode.
- No remote call occurs by default.

### M3 - Asset Contract And Storage Adapter

Status: complete (mock-backed, no-quota); storage model superseded for future
work by M9 / ADR-0002.

Goal: define the stable output contract before real provider calls.

Deliverables:

- `Gen3DAssetManifest` type/schema with `assetId`, `kind`, `provider`,
  `providerMode`, `mode`, `sourceJobId`, `sourceInputAssetIds`, `files[]`,
  `readiness` flags, `quality` placeholders, and timestamps.
  (`shared/manifest.ts`, `schemas/gen3d-asset-manifest.json`.)
- `files[]` roles for `source_mesh`, `rigged_model`, `preview_image`,
  `texture`, `animation_clip`, and `animated_model`. Rigged FBX files carry
  `hasSkeleton`, `skeletonProfile`, and `animationInputReady`.
- `AssetStorage` adapter interface (`server/asset-storage.ts`) with a local dev
  implementation `LocalBlobStore` (`server/local-blob-store.ts`).
- Global asset library (not bound to a game, per ADR-0001 / CONTEXT.md):
  `.forgeax/assets/gen3d/<assetId>/manifest.json` plus content-addressed blobs
  under `.forgeax/assets/gen3d/blobs/<sha256-prefix>/<sha256>.<ext>`.
- `AssetStorage.shareUrl` for short-lived external provider access to a durable
  blob, especially `role=rigged_model` FBX inputs for animation.

Verification (all passing as of 2026-06-10):

- A mock generation produces a durable manifest and local blob/index references.
- Manifest can be consumed without knowing the original provider URL
  (`gen3d:list-assets` reads persisted manifests back).
- Manifest consumers can choose a file by role/format (`selectFile`) instead of
  parsing file names or URLs.
- A rigged FBX handoff can produce a temporary external URL (`shareUrl`) without
  making that URL the stored source of truth.
- Large blob paths stay under `.forgeax/` and outside source-controlled plugin
  code.

### M4 - Hunyuan Workflow Provider

Status: complete (real client built; quota-safe by default).

Goal: add Hunyuan main workflows after schema boundaries are clear.

Expose only verified main modes:

- `text` via `hunyuan-3d-v3.1-text2gen-wf` (`gen3d:text-to-3d`)
- `image` via `hunyuan-3d-v3.1-image2gen-wf` (`gen3d:image-to-3d`)
- `views` via `hunyuan-3d-v3.1-views2gen-wf` (`gen3d:views-to-3d`)

Decoupled modules landed per ADR-0001:

- `server/providers/hunyuan-workflow.ts` — real submit/poll client. Bearer auth
  (`Authorization: Bearer <key>`, no signing), two endpoints differentiated by
  `model` (`/openapi/v1/workflow/invoke/async` + `/openapi/v1/workflow/detail`),
  case-tolerant status, `extract_urls` from `data[].*_url`. `fetchImpl`/
  `downloadImpl` are injectable for quota-safe tests.
- `server/rate-guard.ts` — sliding 60s submit guard (default 3/min).
- `server/audit.ts` — append-only `audit.jsonl`, timing/outcome only, no secrets.
- `server/cache.ts` — `cacheKey -> assetId` only (never provider URLs); on hit the
  manifest is read from the store, never a dead URL.
- `server/generate.ts#generateCacheFirst` — cache lookup → provider → blobs →
  manifest → remember (write-after-success).
- `server/env.ts` — reads `HUNYUAN_API_KEY` / `HUNYUAN_BASE_URL` from process env or
  plugin-local `.env`; master switch `GEN3D_ENABLE_REAL_PROVIDERS=1` gates real
  calls. Default OFF ⇒ all generation falls back to deterministic mock.

Verification (all passing as of 2026-06-10, no real call made):

- Workflow model ids use `*-wf` entries; hidden geometry/world modes stay hidden.
- No-key path: `provider-status` reports `quotaSafe=true`; `gen3d:text-to-3d`
  falls back to mock and persists a durable manifest (no network).
- Cache-first: repeat input returns the same `assetId` with `cacheHit=true`;
  a different input yields a new asset.
- Injected-fetch simulation: exactly one submit, correct `*-wf` model id, poll
  echoes the task id, `glb_url`+`preview_image_url` are extracted and downloaded
  into bytes, manifest `providerMode='real'`.
- Storage layout: cache/audit sidecar files coexist with per-asset dirs under
  `.forgeax/assets/gen3d/`; `listManifests` only descends asset directories.
- typecheck + build pass.

Pending live verification: a real submit/poll once the operator supplies
`HUNYUAN_API_KEY` and sets `GEN3D_ENABLE_REAL_PROVIDERS=1` in the plugin `.env`.

Live verification (2026-06-10, internal network): one real `gen3d:text-to-3d`
completed in ~292s with `providerMode=real`, `usedMock=false`. Real
`sourceJobId` returned; four output files downloaded into content-addressed
blobs and persisted into a manifest — `source_mesh/glb` (~41.9 MB),
`source_mesh/obj` (~600 KB), `preview_image/png`, `texture/png` (~17.5 MB).
`readiness.hasSourceMesh=true`. M4 is fully verified end-to-end.

### M5 - Hunyuan REST Subtools

Status: partial — `pose_standardization` complete and live-verified
(2026-06-10). `low_poly` / `auto_rigging` / `motion_retarget` v1 picked up as
**M13** (planned 2026-06-12, not yet implemented).

Goal: add verified Hunyuan REST sub-capabilities as separate tools.

Unlike M4 workflow modes (async submit/poll), REST sub-capabilities are
synchronous: a single POST under `/openapi/v1/3d/` returns the result, no
task_id/poll loop. Implemented in `server/providers/hunyuan-rest.ts` (Bearer
auth, injectable `fetchImpl`/`downloadImpl`, `RateGuard`-gated, audit on
outcome only).

Done:

- `pose_standardization` via `POST /openapi/v1/3d/images/pose_standardization`
  (model `hunyuan-3d-images-pose-standardization`), tool
  `gen3d:pose-standardization`. This is upstream preprocessing (image →
  A/T-pose image), NOT 3D generation: the output image is downloaded into a
  durable `preview_image` blob and the tool returns `storageKey`/`sha256`/
  `localUrl`/`sourceUrl`. It does not write a `Gen3DAssetManifest`. Quota-safe
  by default (mock image blob when `GEN3D_ENABLE_REAL_PROVIDERS≠1`).

Planned as M13 (2026-06-12, SSOT `docs/PLAN-2026-06-12-rig-motion-lowpoly.md`):

- `low_poly` (M13-1): async submit/poll; new derived low-poly GLB asset; high-poly
  source retained by default.
- `auto_rigging` (M13-2): sync; append `rigged_model` FBX to mesh asset; Gate 1
  verifies output before default exposure.
- `motion_retarget` v1 (M13-3): sync; int motion types 9–16 (action names decided
  2026-06-12); append `animated_model` FBX per motion. Input resolves from
  `assetPath + role=rigged_model + format=fbx` with verified skeleton metadata.

Keep blocked:

- `motion_retarget_v2`: blocked until valid `motion_type` literals are proven.

Verification:

- REST paths use underscores, for example `/openapi/v1/3d/motion_retarget_v2`.
- Injected-fetch smoke (no network): exactly one synchronous POST, correct REST
  path + model + Bearer auth, `data[].url` extracted and downloaded into bytes,
  an error response throws `provider_failed`.
- typecheck + build pass.
- Live verification (2026-06-10, internal network, operator-approved): one real
  `gen3d:pose-standardization` on the doc human image completed in ~20s with
  `usedMock=false`, a real `sourceJobId`, and a 501 KB standardized PNG
  persisted as a content-addressed blob. Audit recorded `rest_succeeded` with no
  secrets.

M13 requirements for `motion_retarget` v1 (planned 2026-06-12, ADR-0003):

- v1 motion retarget input clearly requires a rigged humanoid FBX.
- Motion retarget must resolve its input from `assetPath + role=rigged_model +
  format=fbx`; plain mesh FBX files and GLB-to-FBX conversions are not enough
  unless skeleton metadata is verified.
- Action names for int 9–16 decided 2026-06-12 (跨步/摔倒/跳跃/踢腿/挥击/步行/跑步/跳舞).
- Any FBX URL sent to Hunyuan REST must come from `AssetStorage` temporary
  share/upload, then the returned animation output must be downloaded back into
  the durable asset contract (append `animated_model` FBX).
- Unknown modes cannot silently consume quota from UI or AI-exposed schemas.

### M6 - Meshy Provider

Goal: add Meshy as the second provider after Hunyuan generation/storage safety
is proven.

Expose first:

- `text` preview
- `image`
- `views`
- `refine` as Meshy-only second stage

Verification:

- Meshy `SUCCEEDED` status is normalized for cache hits.
- `refine` stays provider-specific.
- Meshy outputs use the same asset manifest/storage contract as Hunyuan.

### M7 - Rodin Provider

Goal: add Rodin as the third provider. Carried forward as M11 in
`docs/PLAN-2026-06-11-rodin-cos-pergame.md`: mock-first UI/provider plumbing may
land before the real key, while real calls stay gated until key + output shape are
verified.

Verification:

- Key/env format is documented and not hardcoded.
- Cost model and output formats are represented in provider capability metadata.
- Rodin stays hidden until one end-to-end output shape is verified.

### M8 - Generation And Benchmark UX

Status: in progress — UI refactor landed (2026-06-11); core generation loop +
three.js preview landed (2026-06-10). Handoff to game assets + quality scoring
deferred.

Goal: make generation the primary workflow and comparison the evidence layer.

Done (core loop + preview):

- `src/lib/toolClient.ts` — thin `POST /api/tools/call` client (`caller.kind:
  'user'`) over the Studio tools router.
- `src/App.tsx` rewritten from the M3 frontend-only mock preview into a
  production UI that drives the real backend tools: mode tabs (`text`/`image`/
  `views`) → input form → `gen3d:text/image/views-to-3d`; a provider-status
  banner from `gen3d:provider-status` (quota-safe vs real); a result card
  showing the persisted `Gen3DAssetManifest` (asset id, files by role,
  readiness, source job, real/mock + cache-hit badges); and an asset library
  panel backed by `gen3d:list-assets`.
- `vite.config.ts` — dev `/api` proxy to the Studio server (`http://localhost:18900`,
  override via `FORGEAX_SERVER_ORIGIN`) so standalone dev reaches tools; when
  embedded in Studio the dist is served same-origin and the proxy is unused.
- **Blob serving** (2026-06-10): server `/api/gen3d-blobs/*` static route
  (`packages/server/src/main.ts`, commit `bf78703`) maps the prefix to
  `.forgeax/assets/gen3d/` on disk. `LocalBlobStore` receives
  `localUrlBase='/api/gen3d-blobs'`; frontend `blobUrl()` helper also derives
  URLs from `storageKey` for pre-existing assets.
- **three.js model preview** (2026-06-10): `src/components/ModelViewer.tsx`
  (GLTFLoader + OrbitControls, auto-frame, autoRotate, full dispose on unmount).
  `ResultCard` and selected-asset view both render GLB models in-canvas +
  `preview_image` as `<img>`. Asset library cards are clickable to inspect any
  previously generated asset.
- **Embedded same-origin serving** (2026-06-10): the workbench now loads inside
  Studio from `/plugins/wb-gen3d/` (manifest `entry.standalone.embeddedAlso:true`),
  served by a second `serveStatic` block in `packages/server/src/main.ts`, exactly
  like every other workbench frontend. This replaces the cross-origin standalone
  dev port (:15175): when that dev server was not running, the in-page iframe sat
  on the loading placeholder forever. `npm run dev` on :15175 still works for
  standalone development outside Studio.
- **Workbench UI refactor** (2026-06-11, commit `af986ce`): vendored
  `src/styles/tokens.css`; split `App.tsx` into `SetupSidebar`/`StepCard`/
  `Workspace`/`AssetLibrary`; token-aligned pane header + staged accordion;
  asset library in center right column (no right iframe in manifest); L/R view
  inputs; reserved quality/handoff inspector. UI-only — tool contracts unchanged.
  typecheck + build pass.

Verification:

- typecheck + build pass (2026-06-10).
- End-to-end: GLB (37 MB) and PNG served at HTTP 200 via the blob route; three.js
  renders the model in standalone dev (:15175) through the vite proxy.
- Embedded in Studio (2026-06-10): the iframe resolves to `/plugins/wb-gen3d/`
  (same-origin, `readyState=complete`), both left/center panes render the real UI;
  `/plugins/wb-gen3d/` + its hashed JS both return HTTP 200 from the host server.

Server dependency: this milestone touches `packages/server/src/main.ts` with two
`serveStatic` blocks — `/api/gen3d-blobs/*` (generated GLB/PNG blobs, same-origin)
and `/plugins/wb-gen3d/*` (the built workbench dist, same-origin). These are the
only M8 changes outside `plugins/wb-gen3d/`.

Remaining M8 items:

- ~~Handoff action: gen3d global library → `.forgeax/games/<slug>/assets/3d/characters/`~~
  — superseded by M9 per-game storage; generation writes directly to `assets/3d/`.
- Downstream rigging/animation handoff metadata (wire `InspectorReserved`).
- Quality scoring UI for the five-dimension rubric (wire `InspectorReserved`).
- ~~Workbench editor-pattern UI refactor~~ — done 2026-06-11.
- ~~views L/R inputs~~ — done 2026-06-11.

Verification:

- Scores include rater and timestamp.
- Comparison report readiness can distinguish pilot observations from supported
  recommendations.
- Missing PBR can be represented without corrupting the total score.

### M9-M12 - 2026-06-11 Addendum

Status: implemented (mock-first / quota-safe). SSOT:
`docs/PLAN-2026-06-11-rodin-cos-pergame.md`. typecheck + build pass. Real
provider calls (Hunyuan public-COS reachability, Rodin) remain gated behind
operator-supplied keys + `GEN3D_ENABLE_REAL_PROVIDERS=1` and are pending live
verification.

Addendum scope (all landed unless noted):

- **M9 per-game storage refactor** — DONE: replaced the global `assetId` library
  with `assetPath` under `.forgeax/games/<slug>/assets/3d/{characters|meshes}/`,
  plus sidecar `<name>.glb.meta.json` (v2 contract shape, gen3d fields under
  `custom`, sidefiles in `dependencies[]`), per-game `cache.jsonl`/`audit.jsonl`,
  cache-hit path reuse, non-cache collision suffixing, dir-scan list, and a
  confirmed `gen3d:delete-asset` that tombstones the cacheKey. Server route
  `/api/game-assets/:slug/*` (read-only, `assets/3d/**` only) added to
  `packages/server/src/main.ts` (operator-approved, the only plugin-external
  change). Pose/upload intermediates land in the scratch area, not the library.
- **M10 local upload + COS** — DONE: `cos-nodejs-sdk-v5` + `server/cos-uploader.ts`
  + `getCosEnv()`; tool `gen3d:upload-image` (base64 → ≤8MB backend validation →
  COS presigned URL, no extra server route). `SetupSidebar` image/views/pose
  source inputs use `ImageInputField` (local picker → upload → URL backfill, with
  manual-URL fallback); prompt textarea enlarged with char count. Secrets stay in
  plugin-local `.env`; `.env.example` lists names only.
- **M11 Rodin provider** — DONE (mock-first): `server/providers/rodin.ts`
  (multipart submit `/api/v2/rodin` → poll `/api/v2/status` → `/api/v2/download`),
  `getRodinEnv()`, provider enum extended across types/ui-meta/catalog/
  tool-handlers/schemas, UI selector entry. `tier=Regular`, `quality_override`,
  `geometry_file_format=glb`; injectable fetch/download for quota-safe smoke.
  Real calls pending `RODIN_API_KEY` + one verified output shape.
- **M12 UI upgrade** — DONE: pose standardization moved above input; target
  polycount is now low/medium/high discrete buttons mapped per provider
  (Meshy 8k/30k/100k, Hunyuan 10k/40k/120k, Rodin ~8k/18k/50k); `ModelViewer`
  gained a grid-floor toggle, a skeleton toggle (enabled only when a SkinnedMesh
  is present), and a faces/vertices/bbox info HUD; `Workspace` result card
  trimmed; `AssetLibrary` is now a dense preview-thumbnail grid leading with the
  prompt's first line, with per-card delete confirmation.

Documentation closeout done 2026-06-11:

- Added ADR-0002 for the per-game file storage reversal.
- Updated `CONTEXT.md`, this migration plan, capability matrix, and handoff log.

## M13 — Rig / Motion / Low-Poly Pipeline (Accepted 2026-06-12, not implemented)

SSOT: `docs/PLAN-2026-06-12-rig-motion-lowpoly.md`; decisions: ADR-0003 (Accepted).

**Core pipeline (2026-06-12 grill revision)** — textured high-poly GLB → rig → motion;
`low_poly` is an **optional geometry/LOD side-branch**, NOT a pre-rig step (pure
geometry, strips textures / re-UVs quads).

1. **M13-0 Gate 0/1**: verify Hunyuan **internal network egress** can fetch public COS
   model URLs (public GET ≠ Hunyuan fetch); confirm `auto_rigging` / `motion_retarget`
   output shapes + **texture survival** + T-pose.
2. **M13-2 `gen3d:auto-rig`** (core): `auto_rigging` sync on textured source GLB →
   append `rigged_model` **GLB (canonical) + FBX (motion transit)**.
3. **M13-3 `gen3d:apply-motion`** (core): `motion_retarget` v1 sync → append
   `animated_model` **GLB + FBX** per motion (int 9–16); `motionType` structured metadata;
   no auto-batch-all-8 (one call per motion, idempotent skip).
4. **M13-1 `gen3d:retopo-lowpoly`** (optional side-branch): `low_poly` async → new
   derived low-poly GLB asset; high-poly source retained by default.
5. **M13-4 UI**: sidebar rig → motion flow (+ optional retopo); GLB preview +
   AnimationMixer playback; asset readiness badges; `characters` slot only.

Storage changes (plugin-only): `appendDerivedFiles` / `readAssetFile` on
`AssetStorage`; `SidecarDependency` skeleton + `motionType` fields; per-asset async
lock for append/delete; fix `sidecarToManifest` to round-trip rig/anim roles.

Docs grill complete (commits `3f27bac`, `a5b1be8` + grill closeout); code not started.

## Non-Goals

- No direct copy of `hunyuan3d-lab/webapp`.
- No direct copy of cache files or generated models.
- No local credentials, `.env`, COS keys, or audit logs in plugin source.
- No global Studio UI or server changes during M0-M2 without explicit approval.
- No long-term storage of large generated files only in the app server process
  or in git-tracked directories.
