# ADR-0002 — Per-game file asset storage

- **Status**: Accepted
- **Date**: 2026-06-11
- **Deciders**: laurenceelu
- **Supersedes**: ADR-0001 storage identity/path decision only. ADR-0001's production-tool direction and module decoupling still stand.

## Context

ADR-0001 chose a global, content-addressed gen3d asset library:

```text
.forgeax/assets/gen3d/<assetId>/manifest.json
.forgeax/assets/gen3d/blobs/<sha256-prefix>/<sha256>.<ext>
```

That was reasonable while `wb-gen3d` was still a provider migration and benchmark
card. The product direction is now clearer: `wb-gen3d` is the production 3D asset
generation entrypoint for a specific ForgeaX game. Generated assets should be
usable by the game runtime and by downstream agents without a later global-library
import step.

The old design also overloaded `assetId`: it was a random UUID in gen3d, while the
game runtime wants stable project-relative file paths under `.forgeax/games/<slug>/assets/`.

## Decision

Future `wb-gen3d` assets are stored in the active game's runtime asset library:

```text
.forgeax/games/<slug>/assets/3d/
  characters/<name>.glb
  characters/<name>.meta.json
  meshes/<name>.glb
  meshes/<name>.meta.json
```

Canonical identity is `assetPath`, a game-relative path such as
`assets/3d/characters/hero.glb`. New manifests must not use a random UUID
`assetId` as the primary identity.

Asset placement is controlled by `assetSlot`:

| `assetSlot` | Directory | UI label |
| --- | --- | --- |
| `characters` | `assets/3d/characters/` | 角色 |
| `meshes` | `assets/3d/meshes/` | 道具 / 物件 |

Generation requires an active game slug. The frontend reads it first from the
iframe URL query (`?slug=<gameSlug>`), with host bridge/context as compatibility
only. Without a game slug, generation is disabled and the UI shows an empty state.

Cache entries map request hash to `assetPath`, not provider response and not
temporary URLs. A cache hit reuses the existing path. A different request that
collides with an existing file name must not overwrite it; it gets a suffix such
as `name-2.glb`. "Generate another variant from the same input" is a future
explicit variant/bypass-cache action, not normal generation behavior.

Provider URLs and short-lived transfer URLs remain transport details only. Any
provider output that becomes a game asset must be downloaded into the per-game
file contract before downstream tools consume it.

## Alternatives considered

- **Keep ADR-0001 global library and add an import step later**: rejected because
  it leaves the generated asset outside the game runtime until another handoff
  action runs. The now-confirmed product flow wants generation output to be game
  usable immediately.
- **Use `assetId` but store it as a path string**: rejected because the name
  would preserve the old mental model and make future code ambiguous. The field
  is `assetPath`.
- **Keep a shared cross-game asset library for reuse**: rejected as the primary
  model. Cross-game reuse should be explicit copy/import, not accidental shared
  identity.
- **Expose the whole game directory through a static route**: rejected. Preview
  serving must be read-only and limited to `.forgeax/games/<slug>/assets/3d/**`.

## Consequences

Positive:

- Generated 3D assets are immediately in the game runtime asset tree.
- Downstream agents can refer to stable game-relative paths.
- Delete is simple: remove the asset file, sidecar, and preview siblings after a
  destructive confirmation.
- The old M8 gen3d-to-game handoff step disappears; M9 writes to the target
  location directly.

Negative:

- Cross-game reuse is no longer free; it needs explicit copy/import UX later.
- M9 must refactor `shared/manifest.ts`, cache, generation orchestration, list,
  delete, schemas, and frontend calls from `assetId` to `assetPath`.
- One plugin-external server route is needed for same-origin preview:
  `/api/game-assets/:slug/*`.

## Implementation notes

- M9 should introduce `server/per-game-store.ts` and keep path logic inside the
  storage adapter.
- The server preview route must validate slug/path traversal and only serve
  files under `.forgeax/games/<slug>/assets/3d/**`.
- Existing ADR-0001 assets may be read through compatibility if needed, but new
  manifests should use `assetPath` as the required identity field.
- Verification starts with mock generation: create asset, read sidecar, cache hit
  reuses path, non-cache name collision suffixes, list scans the directory, and
  confirmed delete removes the file + sidecar.
