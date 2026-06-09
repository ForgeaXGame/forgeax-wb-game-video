# Gen3D Provider Capability Matrix

Status: source-derived planning matrix. Do not expose rows marked hidden or
blocked in workbench UI or AI-facing schemas.

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
| Hunyuan workflow | `text` | Verified main mode | planned | Use `hunyuan-3d-v3.1-text2gen-wf`. Async submit + poll. |
| Hunyuan workflow | `image` | Verified main mode | planned | Use `hunyuan-3d-v3.1-image2gen-wf`. Async submit + poll. |
| Hunyuan workflow | `views` | Verified main mode | planned | Use `hunyuan-3d-v3.1-views2gen-wf`; Hunyuan uses named view slots. |
| Hunyuan workflow | `text2geometry`, `image2geometry`, `views2geometry` | Endpoint reachable, field sanity incomplete | hidden | Keep constants internal only until output shape is verified. |
| Hunyuan workflow | world scene/panorama/reconstruction modes | Endpoint reachable, field sanity incomplete | hidden | Do not expose from workbench until mode mapping and outputs are proven. |
| Hunyuan REST | `pose_standardization` | Verified end-to-end | planned | Image to A/T-pose standardization. Separate REST subtool, not a workflow model. |
| Hunyuan REST | `motion_retarget` v1 | Verified end-to-end | planned | Built-in integer motion types 9-16; input requires rigged humanoid FBX. |
| Hunyuan REST | `auto_rigging` | Endpoint reachable, not fully verified | experimental | Schema can be drafted later, but default UI/AI exposure should wait. |
| Hunyuan REST | `motion_retarget_v2` | Blocked by unknown literal list | blocked | Endpoint may return 200 while falling back to default motion. Hide until proven. |
| Future provider | Tripo3D / Rodin / Luma / others | Not migrated | hidden | Add only after comparison requirements and provider contracts are explicit. |

## Provider Boundary Rules

- Hunyuan workflow capabilities use `*-wf` model ids and async workflow submit +
  poll behavior.
- Hunyuan REST sub-capabilities use REST paths under `/openapi/v1/3d/` and
  underscore path names, not hyphenated names.
- Meshy `refine` is provider-specific and should not be generalized into
  Hunyuan schemas.
- Unknown or unverified modes should be invisible by default. A warning label is
  not enough because some endpoints can consume quota or silently return default
  output.

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

