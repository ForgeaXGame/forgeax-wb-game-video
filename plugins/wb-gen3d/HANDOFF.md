# Handoff - Gen3D Benchmark Workbench

Last updated: 2026-06-09 Asia/Hong_Kong

## Current State

M0-M2 have been started for `wb-gen3d` inside the marketplace
submodule. Current implementation remains quota-safe and uses static/mock data
only.

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

Use it as read-only source evidence. Do not copy secrets, `.env`, `cache/`,
`outputs/`, COS credentials, or generated model artifacts.

Most important source conclusions already carried into this plugin:

- The main product value is provider comparison and operational conclusions.
- Cache-first behavior is mandatory before quotaed provider calls.
- Hunyuan workflow and Hunyuan REST sub-capabilities are separate integration
  paths.
- Unverified modes stay out of UI and AI-facing schemas.
- Quality scoring uses five dimensions: geometry, topology, texture, pbr, and
  prompt_fidelity.

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

Continue with M3 only after the M2 shell is visually verified and diff scope is
reviewed. The next real integration should still be cache-first; do not add
real Meshy or Hunyuan calls until rate limiting, env allow-listing, audit logs,
and cache behavior are explicit.

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
- Any provider mode that has not produced a verified output shape.
