# Handoff - Gen3D Generation Workbench

Last updated: 2026-06-10 Asia/Hong_Kong (M5 pose_standardization)

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
- `src/App.tsx`
- `src/styles.css`

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
- `gen3d:text-to-3d` / `gen3d:image-to-3d` / `gen3d:views-to-3d`: Hunyuan
  workflow generation (cache-first). When real providers are configured they call
  the `*-wf` submit/poll endpoints, download output URLs into blobs, and persist a
  `Gen3DAssetManifest`. When not configured they fall back to the deterministic
  mock (`usedMock: true`). Returns `{ ok, cacheKey, cacheHit, usedMock, manifest }`.
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

M4 (Hunyuan workflow provider) and M5 `pose_standardization` are done and
live-verified. Remaining M5 work is **`motion_retarget` v1** (`POST
/openapi/v1/3d/motion_retarget`, model `hunyuan-3d-motion-retarget`, integer
motion types 9-16), which is **deferred** until a rigged humanoid FBX asset path
exists (`role=rigged_model` + verified skeleton, produced by `wb-3d-pipeline`,
not by generation). Keep `auto_rigging` experimental and `motion_retarget_v2`
blocked. A possible front-end follow-up: wire `App.tsx` from the M3 manifest
preview to a production UI that drives `gen3d:text/image/views-to-3d` and offers
`gen3d:pose-standardization` as an upstream preprocessing step.

Note (not yet acted on): real `text` output returns both a GLB and an OBJ
`source_mesh`. The current `URL_KEY_TO_FILE` keeps one file per `role:format`, so
both are stored. Decide later whether to prefer GLB and drop OBJ.

## Do Not Expose Yet

- Hunyuan geometry and world workflow modes.
- Hunyuan REST `motion_retarget_v2`.
- Hunyuan REST `auto_rigging` as a default/user-facing mode.
- Rodin until key/API details and one verified output shape exist.
- Any provider mode that has not produced a verified output shape.
