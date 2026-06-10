# Source Handoff - hunyuan3d-lab To wb-gen3d

Status: 2026-06-09 Asia/Hong_Kong

Full source handoff:

`/Users/laurenceelu/dev/hunyuan3d-lab/docs/FORGEAX_STUDIO_MIGRATION_HANDOFF.md`

This file is the target-side pointer for future `forgeax-studio` migration work. The source lab should be treated as read-only evidence unless a task explicitly asks to modify it.

## Target

- Target plugin: `@forgeax-plugin/wb-gen3d`
- Path: `/Users/laurenceelu/dev/ForgeaXGame/forgeax-studio/packages/marketplace/plugins/wb-gen3d/`
- Product role: production 3D generation entrypoint for game assets, with benchmark/comparison as a supporting view.
- Provider order: Hunyuan first, Meshy second, Rodin third after key/API details arrive.
- Current target shape: no-quota workbench shell with static/mock tools.

## Source Facts To Preserve

- Product value is provider comparison and operational conclusions, not the Flask lab UI.
- The migrated product value is generation-first: upstream character image assets in, durable 3D asset manifests out.
- Provider calls must be cache-first and rate-limited before any real remote call.
- Meshy, Hunyuan workflow, and Hunyuan REST are separate contracts.
- Start real provider work with Hunyuan workflow main modes before Meshy.
- Rodin remains hidden until its key and API contract are supplied.
- Hunyuan workflow modes use `*-wf` model ids and async submit/poll.
- Hunyuan REST sub-capabilities use underscore REST paths under `/openapi/v1/3d/`.
- Unverified modes must stay out of user-facing UI and AI-facing tool schemas.
- `motion_retarget_v2` is blocked until valid `motion_type` literals are proven.
- Quality scoring uses `geometry`, `topology`, `texture`, `pbr`, and `prompt_fidelity`.
- Provider result URLs should be downloaded immediately and persisted through an asset-storage adapter.
- Other modules should consume stable asset ids/manifests, not temporary provider URLs.
- FBX URLs needed by rigging or animation providers are request-time share/upload
  URLs only. Durable handoff still goes through asset ids, manifests, and blob
  storage.

## Asset Handoff Direction

```text
character image/reference assets
  -> wb-gen3d generation job
  -> durable mesh asset manifest
  -> rigging and animation workbenches
  -> game-ready 3D asset manifest
  -> agent uses stable asset id in game generation
```

Use per-game metadata first, with blob storage behind an adapter:

- Metadata/index: `.forgeax/games/<slug>/gen3d/`
- Local dev blobs: `.forgeax/assets/gen3d-blobs/` (gitignored)
- Production blobs: object storage such as Tencent COS/S3/R2/MinIO after approval

Rigging and animation handoff rules:

- The canonical handoff object is a `Gen3DAssetManifest`, not a raw URL.
- Manifest `files[]` must distinguish roles such as `source_mesh`,
  `rigged_model`, `preview_image`, `texture`, `animation_clip`, and
  `animated_model`.
- Hunyuan `motion_retarget` should accept only a durable file with
  `role=rigged_model`, `format=fbx`, `hasSkeleton=true`, and a humanoid skeleton
  profile. A plain mesh converted to `.fbx` is not sufficient.
- Studio-local URLs such as same-origin `/api/...` routes are for preview and
  download inside ForgeaX. They are not assumed to be reachable by external
  providers.
- When a provider needs an FBX URL, `AssetStorage` must create a temporary
  external share URL or upload the blob to the provider and return that transport
  URL. Store only the durable blob metadata and, at most, audit metadata for the
  share operation.
- Outputs from rigging or animation providers must be downloaded immediately
  into the same storage contract before other modules consume them.

## Next Migration Entry

Before implementing real provider calls, read the full source handoff and then update these target files in this order:

1. `docs/MIGRATION_PLAN.md`
2. `docs/CAPABILITY_MATRIX.md`
3. `forgeax-plugin.json`
4. `schemas/*.json`
5. `server/tool-handlers.ts`
6. `shared/catalog.ts`
7. `src/App.tsx`

Do not copy source `.env`, `cache/`, `outputs/`, COS credentials, generated models, or local audit logs.
