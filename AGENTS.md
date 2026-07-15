# AGENTS.md — forgeax-marketplace

> Read this before changing extensions, discovery, gitlinks, or Marketplace
> inventory scripts. User-facing overview: [`README.md`](./README.md).

## Classification SSOT

- **`forgeax-extension.json#kind` is the only type authority.**
- Do **not** infer kind from directory prefixes (`agent-`, `wb-`, `cli-`, …).
- Do **not** invent a seventh top-level sibling under `extensions/` that is not one
  of the six `ManifestKind` buckets.
- Leaf slug / manifest `id` / public `/extensions/{id}/` URL stay independent of
  the physical kind path.

## Bucket and path rules

Canonical install path (L0 / L1 / L2 writes):

```text
<extensionsRoot>/<kind>/<slug>/forgeax-extension.json
```

Legacy flat path (reads + edits of existing installs only):

```text
<extensionsRoot>/<slug>/forgeax-extension.json
```

| Do | Don't |
|:--|:--|
| Put new extensions under the bucket matching `manifest.kind` | Write new extensions as flat `extensions/<slug>/` |
| Keep `_template` / `admin` under `extensions/workbench/` | Assume every `wb-*` leaf is `kind: "workbench"` (`wb-team-forge` is `tool`) |
| Keep non-plugin trees in `shared/` or `vendor/` | Drop `node-editor` (or other vendor sources) back under `extensions/` |
| Preserve symlink front doors under `extensions/workbench/` for vendor apps | Recursively scan into vendor apps / fixtures for extra manifests |

## Shared helpers (required)

Prefer shared classifiers / discovery helpers over ad-hoc path math:

| Concern | Use |
|:--|:--|
| Kind set + relative-path classify / browser-safe descriptor | `@forgeax/types/plugin-layout` |
| Root-script exact-depth discovery (build / prepare / website) | `scripts/lib/marketplace-plugins.ts` (studio parent) |
| Runtime scan / merge / origin metadata | CLI `packages/cli/src/plugins/scanner.ts` (+ merger / registry) |
| Mirror path routing | `scripts/mirror/route-plugin-path.ts` |

Rules for new code:

- No new `extensions/<id>` path reconstruction from extension IDs.
- No prefix → kind mapping tables.
- No unrestricted recursive `**/forgeax-extension.json` walks under a layer root.
- File I/O uses registered `manifestPath` / `resolvedManifestPath` (or helper
  equivalents), not guessed flat roots.

## Layers

- **Writes** (import, fork, record-as-skill, authoring scaffolds): always
  canonical `<kind>/<slug>/` on L0, L1, and L2.
- **Reads**: accept legacy flat candidates on all three layers.
- Precedence remains **L2 > L1 > L0**. Same-layer canonical beats legacy.

## Gitlinks and symlinks

When adding or moving a extension git submodule:

1. Update `packages/marketplace/.gitmodules` `path=` to
   `extensions/<kind>/<slug>` (or `vendor/<name>` for non-plugin sources).
2. Move the gitlink with git (preserve history / SHA); do not copy-delete.
3. For vendor multi-app trees: keep the gitlink under `vendor/`, then recreate
   **directory symlinks** under `extensions/workbench/<slug>` that point at
   `../../vendor/.../apps/<slug>` and still expose `forgeax-extension.json` at the
   front door.
4. Run inventory + submodule status before bumping the parent studio pin.

Never leave a non-kind sibling directly under `extensions/` (no loose
`extensions/node-editor`, no random shared packages).

## Mandatory gates

Before claiming a Marketplace layout / discovery change is done:

```bash
# inventory + 2026-07-14 (id, kind) baseline lock
(cd packages/contracts/types && bun ./test/validate-manifests.ts)

# discovery / merge
(cd packages/cli && bun test test/plugins-scanner-merger.test.ts)

# builds that discover plugins
bun scripts/build-plugins.ts --force

# boundaries + repo gate
bun test scripts/check-boundaries.spec.ts
bun fx check

# after gitlink / symlink edits
git -C packages/marketplace submodule status --recursive
# confirm workbench front-door symlinks still resolve
```

Also run any package tests you touched (platform-io / interface / server /
studio / mirror / website specs). Do not silence migration baseline failures.

## Nested AGENTS inheritance

Plugin-local `AGENTS.md` / `SKILL.md` files inherit these rules. When you edit
a nested AGENTS, keep filesystem examples on the canonical kind path
(`extensions/<kind>/<slug>/…`). Nested docs may specialize domain rules; they must
not reintroduce flat `extensions/<id>/` as the authoring default.
