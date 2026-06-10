# Handoff - Gen3D Generation Workbench

Last updated: 2026-06-10 Asia/Hong_Kong

## Current State

M0-M3 complete for `wb-gen3d` inside the marketplace submodule. Implementation
remains quota-safe: the only generation path is a deterministic Meshy text mock
that produces a durable `Gen3DAssetManifest` through the storage adapter. No real
provider calls exist.

Product direction (2026-06-09): `wb-gen3d` is the production 3D generation
entrypoint for game assets, not a benchmark tool. Provider comparison is
background knowledge in docs only, not runtime code or UI (see
`docs/adr/0001-production-tool-architecture.md`).

Created files:

- `.gitignore`
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
- `schemas/gen3d-asset-manifest.json`
- `shared/manifest.ts` (Gen3DAssetManifest contract)
- `shared/catalog.ts` (capability matrix + ProviderResult + mock generator)
- `server/asset-storage.ts` (AssetStorage adapter interface)
- `server/local-blob-store.ts` (LocalBlobStore dev impl)
- `server/generate.ts` (ProviderResult -> manifest orchestration)
- `server/tool-handlers.ts`
- `src/main.tsx`
- `src/App.tsx`
- `src/styles.css`

No provider adapters, env templates, cache files, generated assets, or API calls
have been added. `dist/` is ignored and should be generated locally with
`npm run build` when needed. Durable assets land under `.forgeax/assets/gen3d/`
(outside source control).

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
  quality rubric dimensions (planning data only, not a runtime scorer).
- `gen3d:list-assets`: lists persisted `Gen3DAssetManifest` records from the
  global library, optionally filtered by provider.
- `gen3d:generate-meshy-text-mock`: deterministic no-quota Meshy text-to-3D mock
  that persists a durable manifest (source_mesh GLB + preview_image PNG blobs)
  via the storage adapter and returns the manifest. Inputs are prompt, prompt
  category, PBR toggle, and target polycount. `assetId` is random per call;
  `cacheKey` is deterministic for the same input.

## Verification So Far

From this plugin directory:

```bash
npm run typecheck
npm run build
```

Both passed on 2026-06-10. An out-of-tree bun smoke also confirmed the M3
persistence path: a mock generation writes `manifest.json` + content-addressed
blobs under a temp `FORGEAX_PROJECT_ROOT`, `gen3d:list-assets` reads them back
without any provider URL, and identical inputs produce a new random `assetId`
with a stable `cacheKey`.

## Next Step

M3 (asset contract + storage adapter) is done. Next is **M4 — Hunyuan workflow
provider** (`text`/`image`/`views` via `*-wf` model ids), still cache-first. Do
not add real Hunyuan, Meshy, or Rodin calls until rate limiting, env
allow-listing, audit logs, and a cache layer are explicit. The remaining
internal-architecture modules from ADR-0001 (`cache.ts`, `rate-guard.ts`,
`audit.ts`, real `providers/`) are not yet implemented and should land alongside
the first real provider call.

Scope check before any commit:

```bash
git -C /Users/laurenceelu/dev/ForgeaXGame/forgeax-studio/packages/marketplace status --short --branch
```

Expected changed paths should stay under `plugins/wb-gen3d/`.

## Do Not Expose Yet

- Hunyuan geometry and world workflow modes.
- Hunyuan REST `motion_retarget_v2`.
- Hunyuan REST `auto_rigging` as a default/user-facing mode.
- Rodin until key/API details and one verified output shape exist.
- Any provider mode that has not produced a verified output shape.
