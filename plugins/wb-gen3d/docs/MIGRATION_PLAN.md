# Gen3D Benchmark Workbench Migration Plan

Status: M2 no-quota vertical slice.

This plugin migrates conclusions and useful workflows from
`/Users/laurenceelu/dev/hunyuan3d-lab/` into ForgeaX as a workbench plugin for
3D generation provider benchmarking. The source lab remains read-only for this
migration; do not copy credentials, cache files, generated outputs, or the
Flask/Python app structure.

## Chosen Shape

- Plugin id: `wb-gen3d`
- Marketplace package id: `@forgeax-plugin/wb-gen3d`
- Product role: benchmark/comparison workbench for 3D generation pipelines
- Initial implementation boundary: `packages/marketplace/plugins/wb-gen3d/`

The workbench should compare provider behavior and preserve operational
conclusions. It should not become a direct transplant of `hunyuan3d-lab`.

## Success Criteria

- All provider calls are cache-first or mock-only until an explicit quotaed
  provider milestone is reached.
- No API key or secret is stored in plugin source, docs, schemas, or examples.
- Unverified provider modes are absent from user-facing UI and tool schemas.
- Hunyuan workflow entries and Hunyuan REST sub-capabilities stay separate in
  schemas, code, and documentation.
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

- Marketplace submodule is on
  `laurenceelu/feat-20260609-hunyuan3d-meshy-pipeline-card`.
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

### M3 - Hunyuan Workflow Provider

Goal: add Hunyuan main workflows after schema boundaries are clear.

Expose only verified main modes:

- `text` via `hunyuan-3d-v3.1-text2gen-wf`
- `image` via `hunyuan-3d-v3.1-image2gen-wf`
- `views` via `hunyuan-3d-v3.1-views2gen-wf`

Verification:

- Workflow model ids use `*-wf` entries.
- Hidden geometry/world modes remain hidden until separately verified.
- Submit/poll/audit/cache behavior does not leak keys.

### M4 - Hunyuan REST Subtools

Goal: add verified Hunyuan REST sub-capabilities as separate tools.

Expose first:

- `pose_standardization`
- `motion_retarget` v1 with built-in integer motion types 9-16

Keep blocked or experimental:

- `auto_rigging`: experimental until end-to-end output is verified.
- `motion_retarget_v2`: blocked until valid `motion_type` literals are proven.

Verification:

- REST paths use underscores, for example `/openapi/v1/3d/motion_retarget_v2`.
- v1 motion retarget input clearly requires a rigged humanoid FBX.
- Unknown modes cannot silently consume quota from UI or AI-exposed schemas.

### M5 - Benchmark UX

Goal: make provider comparison the primary workbench value.

Likely deliverables:

- Comparison set view grouped by prompt and provider.
- Result card metadata for provider, mode, prompt category, status, cost, and
  artifact links.
- Quality scoring UI for the five-dimension rubric.
- Notes for cost, failures, limits, and provider-specific caveats.

Verification:

- Scores include rater and timestamp.
- Comparison report readiness can distinguish pilot observations from supported
  recommendations.
- Missing PBR can be represented without corrupting the total score.

## Non-Goals

- No direct copy of `hunyuan3d-lab/webapp`.
- No direct copy of cache files or generated models.
- No local credentials, `.env`, COS keys, or audit logs in plugin source.
- No global Studio UI or server changes during M0-M2 without explicit approval.
