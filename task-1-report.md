# Task 1 — host-module release contract

Base commit: `4b2a545c4cb2ef9d5c6d85d2d419dbe655a0ada8`.

## Delivered

- Moved the package and extension manifest release version to `0.2.0`.
- Added exact peer and development requirements for
  `@forgeax/workbench-host@0.1.0`, while preserving
  `@forgeax/extension-platform@0.0.2` exactly.
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

## Dependency-resolution note

`@forgeax/workbench-host@0.1.0` is not yet published. `bun install` therefore
cannot resolve it from the registry (404). Development currently resolves the
package through the supplied local `node_modules/@forgeax/workbench-host`
symlink. The package and lockfile retain only the exact `0.1.0` workspace
declarations: no registry integrity, `file:` reference, or local absolute path
has been recorded. Re-run `bun install` after the package is published.
