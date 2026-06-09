# Handoff - Gen3D Benchmark Workbench

Last updated: 2026-06-09 Asia/Hong_Kong

## Current State

M0-M2 have been started for `wb-gen3d` inside the marketplace
submodule. Current implementation remains quota-safe and uses static/mock data
only.

Product direction was updated on 2026-06-09: `wb-gen3d` should become the
production 3D generation entrypoint for game assets. Benchmark/provider
comparison remains a supporting view for quality and cost decisions.

Created files:

- `.gitignore`
- `forgeax-plugin.json`
- `index.html`
- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `docs/MIGRATION_PLAN.md`
- `docs/CAPABILITY_MATRIX.md`
- `HANDOFF.md`
- `schemas/provider-status.args.json`
- `schemas/provider-status.returns.json`
- `schemas/list-results.args.json`
- `schemas/list-results.returns.json`
- `schemas/generate-meshy-text-mock.args.json`
- `schemas/generate-meshy-text-mock.returns.json`
- `server/tool-handlers.ts`
- `shared/catalog.ts`
- `src/main.tsx`
- `src/App.tsx`
- `src/styles.css`

No provider adapters, env templates, cache files, generated assets, or API calls
have been added. `dist/` is ignored and should be generated locally with
`npm run build` when needed.

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

Future development should use this storage contract as the baseline:

- Long-term generated output lives in a `Gen3DAssetManifest` plus blob files.
  Metadata/index files belong under `.forgeax/games/<slug>/gen3d/`; local dev
  blobs belong under `.forgeax/assets/gen3d-blobs/` and must stay gitignored.
- `files[]` should describe durable file roles, for example `source_mesh`,
  `rigged_model`, `preview_image`, `texture`, `animation_clip`, or
  `animated_model`. Each file should carry `fileId`, `format`, `storageKey`,
  `bytes`, `sha256`, and same-origin `localUrl` when it can be streamed by
  Studio.
- Hunyuan `motion_retarget` input is not "any FBX". It must resolve from
  `assetId + role=rigged_model + format=fbx` and the file metadata must mark a
  verified skeleton, for example `hasSkeleton: true`,
  `skeletonProfile: "humanoid"`, and `animationInputReady: true`.
- Converting GLB or OBJ to FBX does not make it animation-ready. If the model is
  not already rigged, the pipeline must run/verify a rigging step before exposing
  motion-retarget actions.
- External animation or rigging providers may require a URL they can fetch. Use
  an `AssetStorage` share/upload step to create a short-lived public or provider
  upload URL for the durable `rigged_model` blob. That URL is a request-time
  transport detail and should not become the canonical asset reference.
- Provider outputs from rigging or animation must be downloaded back into the
  same storage contract and represented as new manifest files or derived
  `files[]` entries before being advertised to downstream workbenches or agents.

## Implemented Tools

- `gen3d:provider-status`: returns the static provider capability matrix and
  quality rubric dimensions.
- `gen3d:list-results`: returns M1 placeholder results, optionally filtered by
  provider or prompt category.
- `gen3d:generate-meshy-text-mock`: returns a deterministic no-quota Meshy
  text-to-3D mock result. Inputs are prompt, prompt category, PBR toggle, and
  target polycount.

## Verification So Far

From this plugin directory:

```bash
npm run typecheck
npm run build
```

Both passed on 2026-06-09. The build output was removed afterward because
plugin-local `.gitignore` excludes `dist/`, matching the existing marketplace
pattern.

## Next Step

Continue with the asset contract/storage milestone before real provider calls.
The next real integration should be Hunyuan workflow first and still be
cache-first; do not add real Hunyuan, Meshy, or Rodin calls until rate limiting,
env allow-listing, audit logs, cache behavior, and durable asset persistence are
explicit.

Suggested first M1 verification:

```bash
cd /Users/laurenceelu/dev/ForgeaXGame/forgeax-studio/packages/marketplace
git status --short --branch
git diff --name-only origin/main...HEAD
```

Expected changed paths should stay under:

`plugins/wb-gen3d/`

## Do Not Expose Yet

- Hunyuan geometry and world workflow modes.
- Hunyuan REST `motion_retarget_v2`.
- Hunyuan REST `auto_rigging` as a default/user-facing mode.
- Rodin until key/API details and one verified output shape exist.
- Any provider mode that has not produced a verified output shape.
