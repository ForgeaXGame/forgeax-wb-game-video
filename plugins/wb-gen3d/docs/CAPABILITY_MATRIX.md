# Gen3D Provider Capability Matrix

Status: source-derived planning matrix. Updated 2026-06-11: Rodin provider is
**live-verified** (M11) — `server/providers/rodin.ts` multipart submit
`/api/v2/rodin` → poll `/api/v2/status` → `/api/v2/download`, provider enum + UI
selector wired, and one real text-to-3D run confirmed end-to-end through the
Studio server (GLB + webp preview persisted per-game, `providerMode='real'`).
Real calls stay gated behind `GEN3D_ENABLE_REAL_PROVIDERS=1` + `RODIN_API_KEY`.
Do not expose rows marked hidden or blocked in workbench UI or AI-facing schemas.

## Exposure Legend

| Exposure | Meaning |
|---|---|
| `planned` | Safe to plan schemas/UI around once implementation reaches the milestone. |
| `mock-first` | UI or tools may use local mock/cache data before real provider calls. |
| `experimental` | Keep behind explicit development affordances; not for default AI use. |
| `hidden` | Do not expose until verified end-to-end with correct output shape. |
| `blocked` | Do not expose; current source evidence shows unknown or unsafe behavior. |

## Matrix

| Provider | Capability | Source status | Exposure | Migration notes |
|---|---|---:|---|---|
| Meshy | `text` / text-to-3D preview | Implemented in lab | mock-first | Good M2 candidate. Preserve cache-first behavior before enabling real calls. |
| Meshy | `image` / image-to-3D | Implemented in lab | planned | Requires image input handling and artifact display. |
| Meshy | `views` / multi-image-to-3D | Implemented in lab | planned | Meshy accepts image URL arrays, not Hunyuan's named 8 slots. |
| Meshy | `refine` | Implemented in lab | planned | Meshy-only second stage; do not model it as a generic provider mode. |
| Hunyuan workflow | `text` | **Implemented + live-verified 2026-06-10** | mock-first | Tool `gen3d:text-to-3d`. Real call confirmed: ~292s, GLB+OBJ+preview+texture blobs persisted. Falls back to deterministic mock when `GEN3D_ENABLE_REAL_PROVIDERS≠1`. |
| Hunyuan workflow | `image` | Implemented (client built, not live-tested) | mock-first | Tool `gen3d:image-to-3d`. Same submit/poll path; mock fallback until live test. |
| Hunyuan workflow | `views` | Implemented (client built, not live-tested) | mock-first | Tool `gen3d:views-to-3d`. Named 8-slot view inputs; mock fallback until live test. |
| Hunyuan workflow | `text2geometry`, `image2geometry`, `views2geometry` | Endpoint reachable, field sanity incomplete | hidden | Keep constants internal only until output shape is verified. |
| Hunyuan workflow | world scene/panorama/reconstruction modes | Endpoint reachable, field sanity incomplete | hidden | Do not expose from workbench until mode mapping and outputs are proven. |
| Hunyuan REST | `pose_standardization` | **Implemented + live-verified 2026-06-10** | mock-first | Tool `gen3d:pose-standardization`. Synchronous REST `POST /openapi/v1/3d/images/pose_standardization`. Upstream preprocessing (image→A/T-pose image); persists a blob, no manifest. Real call confirmed ~20s, 501 KB PNG. Mock fallback when `GEN3D_ENABLE_REAL_PROVIDERS≠1`. |
| Hunyuan REST | `motion_retarget` v1 | Verified end-to-end in lab | planned | Built-in integer motion types 9-16; input requires rigged humanoid FBX. Deferred until a `role=rigged_model` asset path exists (`wb-3d-pipeline`). |
| Hunyuan REST | `auto_rigging` | Endpoint reachable, not fully verified | experimental | Schema can be drafted later, but default UI/AI exposure should wait. |
| Hunyuan REST | `motion_retarget_v2` | Blocked by unknown literal list | blocked | Endpoint may return 200 while falling back to default motion. Hide until proven. |
| Rodin | `text` | **Implemented + live-verified 2026-06-11** | mock-first | `server/providers/rodin.ts`: multipart `POST /api/v2/rodin` → poll `POST /api/v2/status` (subscription_key, all sub-jobs Done) → `POST /api/v2/download` (task_uuid). Real text-to-3D confirmed end-to-end via `gen3d:text-to-3d` (provider=rodin): GLB + **`preview.webp`** persisted per-game, `providerMode='real'`. Defaults `tier=Regular`, `material=PBR`, `geometry_file_format=glb`; polycount via `quality_override` low/medium/high (UI ~8k/18k/50k). Falls back to mock when `GEN3D_ENABLE_REAL_PROVIDERS≠1`. Requires Business subscription. |
| Rodin | `image` / `views` | Implemented (same client; not live-tested) | mock-first | Image/multi-view share the verified submit/poll/download path (`images` files, `condition_mode=concat` for views). Mock fallback until a live image run is run. |
| Future provider | Tripo3D / Luma / others | Not migrated | hidden | Add only after provider contracts are explicit. |

## Provider Boundary Rules

- Hunyuan workflow capabilities use `*-wf` model ids and async workflow submit +
  poll behavior.
- Hunyuan REST sub-capabilities use REST paths under `/openapi/v1/3d/` and
  underscore path names, not hyphenated names.
- Meshy `refine` is provider-specific and should not be generalized into
  Hunyuan schemas.
- Rodin is live as the third provider; `text` is verified end-to-end. Real calls
  must remain behind `GEN3D_ENABLE_REAL_PROVIDERS` + `RODIN_API_KEY`. `image`/
  `views` reuse the same verified client but still need one live run each.
- Unknown or unverified modes should be invisible by default. A warning label is
  not enough because some endpoints can consume quota or silently return default
  output.
- `motion_retarget` inputs must be durable manifest files with
  `role=rigged_model`, `format=fbx`, and verified humanoid skeleton metadata.
  The URL sent to an external provider is a short-lived share/upload URL created
  from that stored blob, not the canonical asset reference.
- **Hunyuan image inputs are fetched by the Hunyuan server-side, and Hunyuan is
  an internal-network OpenAPI** (`http://hunyuanapi.woa.com`). A **public** COS
  presigned URL (from M10 local upload) may be unreachable from that internal
  service. Treat "Hunyuan can fetch a public COS URL" as an explicit
  verification item: if it fails, fall back to image-byte inlining (if Hunyuan
  supports base64), an internal-reachable COS endpoint, or temporarily restrict
  Hunyuan to manually-pasted URLs. Meshy (`api.meshy.ai`) and Rodin
  (`hyper3d.com`) are public and unaffected.

## Product Pipeline Boundary

`wb-gen3d` is the 3D generation entrypoint. It should accept upstream character
image/reference assets, then output durable 3D asset manifests for rigging,
animation, and game-generation agents. Benchmark rows should attach to the same
asset manifests instead of being a separate artifact universe.

## Benchmark Data Requirements

Comparison conclusions should require enough samples to avoid overfitting to a
single lucky or unlucky run:

- Prompt categories: character, prop, and scene.
- At least three successful calls per category before making provider-level
  recommendations.
- Quality score dimensions: `geometry`, `topology`, `texture`, `pbr`, and
  `prompt_fidelity`.
- Each score must include rater, timestamp, and notes. PBR can be `null` when a
  task did not request PBR.
