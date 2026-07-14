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
  characters/<name>.glb.meta.json
  meshes/<name>.glb
  meshes/<name>.glb.meta.json
```

Canonical identity is `assetPath`, a game-relative path such as
`assets/3d/characters/hero.glb`. New manifests must not use a random UUID
`assetId` as the primary identity.

### Multi-file assets (一个主文件 + 同基名副文件)

一次生成会产出多个文件（主 mesh GLB、预览 PNG、贴图 PNG，可能还有 OBJ）。新模型
保留多文件能力，把"身份"定为**主 GLB 的 `assetPath`**，并**对齐 v2 工作区契约**
(`docs/v2-vision/node-runtime-architecture/03-WORKSPACE-LAYOUT.md`) 的磁盘格式：

- `assetPath` 指主文件 `<name>.glb`，它就是资产身份。
- **sidecar 文件名 = `<name>.glb.meta.json`**（保留完整文件名再加 `.meta.json`，
  契约第 32/35 行），不是 `<name>.meta.json`。
- **sidecar 字段对齐契约 schema**（契约第 119–143 行）：
  `schemaVersion:1`、`producer:{plugin:"wb-gen3d", pluginVersion, pipelineId?}`、
  `createdAt`、`contentHash`、`size`、`type`、`dependencies[]`、`custom{}`。
- **副文件（外部单独贴图等）进 `dependencies[]`**（带 `path/hash/kind`），不自创
  `files[]`。gen3d 私有字段（provider/providerMode/mode/sourceJobId/faceCount/
  readiness 等）塞进 `custom{}` 命名空间。
- 预览图用同基名 `<name>.<fmt>` 放 mesh 同级目录（契约未禁止，且预览与 mesh 强
  绑，比塞 `assets/2d/` 实用）。`fmt` 取实际格式：Hunyuan 是 `png`，Rodin 真实
  返回 `preview.webp`（`FileFormat` 已含 `webp`），所以是 `<name>.png` /
  `<name>.webp` 而非写死 `.png`。
- **OBJ 取舍**：角色优先存 GLB，真实 `text` 同时返回的 OBJ **默认丢弃只留 GLB**。
- 删除时删 `<name>.*` 全家桶 + `<name>.glb.meta.json`。

### 已知债务：未对齐 v2 运行时机制（非阻塞）

v2 工作区契约还规定了一套**运行时机制**，但其依赖的 kernel / path-resolver /
`writeAsset()` API **当前尚未建成**。本 ADR 决定：**对齐磁盘格式，暂不实现运行时
机制**，并把以下差距记为已知债务，待 kernel 化时补齐：

1. **路径槽位 (`requestedPathSlots` + `writeAsset()` 校验)**：契约要求插件经
   kernel 的 `writeAsset(path)` 写资产、manifest 声明 `requestedPathSlots`。当前
   wb-gen3d 直接 `writeFile` 到硬编码 `${gameRoot}/assets/3d/{characters|meshes}/`
   （= 契约里 `wb-lowpoly-obj.output.characters` / `wb-scene.output.meshes` 的同一
   目标路径）。kernel 上线后换成 `writeAsset()` + 补槽位声明即可，已落盘资产不变。
2. **所有权冲突**：契约把 `assets/3d/characters/` 写权限判给 `wb-lowpoly-obj`，
   `assets/3d/meshes/` 判给 `wb-scene`（契约第 99/282/279 行），且
   `00-INDEX.md:174` 明禁其它插件声明写 characters/。wb-gen3d 也产角色/网格 GLB，
   存在所有权冲突。解决方案（wb-gen3d 申请该槽位写权限 / 插件合并 / 分工）留待
   kernel 化时定。
3. **`_index.json`**：契约由 kernel 维护工作区资产索引。当前 wb-gen3d 自行扫目录
   读 sidecar 来 `list`；kernel 上线后改读 `_index.json`，扫目录作回退。

折中原则：**现在按契约的"磁盘格式"写，但不假装 kernel 已经存在**。生成物天然符合
未来 `<AssetBrowser/>` / `_index.json` 的扫描格式，kernel 上线时只补机制、不改已
落盘资产。

## Decision (asset placement)

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
- Existing ADR-0001 assets are **not migrated**: the global library is
  game-agnostic so old assets have no game to belong to. The `assetId` field is
  dropped (no compatibility read of the old library). Old
  `.forgeax/assets/gen3d/` is treated as discarded test data; delete it manually
  if desired. New manifests use `assetPath` as the required identity field.
- Verification starts with mock generation: create asset, read sidecar, cache hit
  reuses path, non-cache name collision suffixes, list scans the directory, and
  confirmed delete removes the file + sidecar.
