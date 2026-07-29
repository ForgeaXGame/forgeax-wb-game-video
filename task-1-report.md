# Task 1 — host-module release contract

Base commit: `4b2a545c4cb2ef9d5c6d85d2d419dbe655a0ada8`.

## Delivered

- Moved the package and extension manifest release version to `0.2.0`.
- Added exact peer and development requirements for
  `@forgeax/workbench-host@0.1.0`, while preserving
  `@forgeax/extension-platform@0.0.2` exactly. A reviewed host `0.1.0`
  tarball is vendored at `vendor/forgeax-workbench-host-0.1.0.tgz`; the
  relative `file:vendor/...` override makes local development reproducible
  until the package is published.
- Published the package root as `./dist/index.js` and the host subpath as
  `./dist/server/host.js`; the manifest backend now points to the latter.
- Configured tsup to emit ESM bundles, declarations, and source maps for both
  package exports. Vite remains responsible for the browser application build.
- Added release-contract coverage for metadata and compiled `host`/`tools`
  exports. `server/host.ts` is deliberately a temporary contract bridge: it
  re-exports the current tool map and exposes no Task 4 HTTP-host behavior.

## Verification

- RED: `bun test server/release-contract.test.ts server/check-release.test.ts`
  failed on the intended old version, missing dependency, and missing exports.
- GREEN: focused release tests passed: 35 tests, 0 failures.
- `bun run build` passed, including `node scripts/check-release.mjs`.
- Review follow-up: from a fresh detached checkout, `bun install --frozen-lockfile
  --offline` passed, then the exact focused release command passed 42 tests before
  a full build. The full build/release validator and `bun pm pack --dry-run
  --ignore-scripts` also passed; the dry-run package listed no `vendor/` files.

## Dependency-resolution note

`@forgeax/workbench-host@0.1.0` is not yet published. Development resolves it
through the committed, reviewed tarball rather than a machine-local symlink.
The peer and development specs remain exactly `0.1.0`; Bun's lockfile records
the tarball with a relative `vendor/...` resolution and integrity only. Neither
the package nor the lockfile contains an absolute path.

After `@forgeax/workbench-host@0.1.0` is published, remove its `overrides`
entry, delete `vendor/forgeax-workbench-host-0.1.0.tgz`, regenerate `bun.lock`,
and re-run the offline-install and pack checks below. The package `files`
allowlist intentionally excludes `vendor/`, so the development bootstrap is
never included in the published wb-game-video package.
