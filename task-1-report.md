# Task 1 — host-module release contract

Base wb-game-video commit: `4ed77e4f409b324b2e8ba408510be40eccc49dd4`.

## Delivered

- The package and extension manifest release version are `0.2.0`.
- Peer and development requirements remain exact:
  `@forgeax/workbench-host@0.1.0` and
  `@forgeax/extension-platform@0.0.2`.
- The package root exports `./dist/index.js`; the host subpath and manifest
  backend both resolve to `./dist/server/host.js`.
- The host module exposes the game package seed, all 11 tools, and the shared
  extension router through one `WorkbenchExtensionContext`.
- All 11 manifest-declared tool argument schemas derive game identity from
  that context and expose no caller-selected `gameSlug`.
- The reviewed host tarball includes durable media idempotency and deletion,
  bounded cross-process file locks, optional version/component handshake
  endpoints, atomic per-file game-package patching, and the matching browser
  client capabilities.
- Package load failures now reach the bootstrap error UI instead of being
  interpreted as an empty blueprint, and imported/generated media records a
  durable manifest intent before the host media write.

## Focused verification

- RED: `bun test server/release-contract.test.ts` failed because the public
  `get-graph` args schema still exposed `gameSlug`.
- GREEN:
  `bun test server/release-contract.test.ts server/check-release.test.ts`
  passed 44 tests with 0 failures after all 11 manifest-declared args schemas
  were updated.
- The release contract calculates the vendored tarball SHA-512 at test time,
  requires the matching `bun.lock` integrity, builds the backend, imports the
  compiled host module in Bun and Node ESM, and confirms that `vendor/` is not
  in the package `files` allowlist.

## Final verification

- `bun run test`: 125 test files passed; 991 tests passed and 19 were skipped.
- `bun run lint`: browser/server TypeScript checks and module-boundary checks
  passed.
- `bun run build`: frontend build, host bundle/declarations, and release
  validator passed.
- `bun pm pack --dry-run --ignore-scripts`: 143 files; the vendored host
  tarball was excluded.

## Vendor provenance

`@forgeax/workbench-host@0.1.0` is not yet published. Development resolves it
through the reviewed tarball at
`vendor/forgeax-workbench-host-0.1.0.tgz`; no machine-local symlink or absolute
path is part of the release contract.

- reviewed host commit:
  `c1f98fc4a0bcb304de783f673fe08298640d0878`;
- tarball SHA-256:
  `372d1bed3af2a912d4d7815488470eac96d944253b9c9ba8b443c6a7b3d04bc8`;
- tarball SHA-512 (hex):
  `aa9b51e0104ad52e88a6cd6c1b6055fa50e994aaac6bb3bc26bff6321d9ac45d335a2ee88c2b5b93b37095c622c12f0ed038b5991265f393bdc1b049ce231aef`;
- Bun lock integrity:
  `sha512-qptR4BBK1S6Ips1sG2BV+lDplKqsa7O8Jr/2Mh2axF0zWi7ojCtbk7NwlcYiwS8O0Di1mRJl85O9wbBJziMa7w==`.

## Publication sequence

This change does not publish, tag, push, or merge either package.

1. Publish reviewed commit
   `c1f98fc4a0bcb304de783f673fe08298640d0878` as
   `@forgeax/workbench-host@0.1.0` first.
2. Verify the registry artifact exposes the reviewed types and capabilities.
3. Only then remove the wb-game-video `overrides` entry and vendored tarball,
   regenerate `bun.lock`, and rerun frozen install, tests, build, and package
   dry-run checks.
4. Publish `@forgeax/wb-game-video@0.2.0` last.

The package `files` allowlist intentionally excludes `vendor/`, so this local
bootstrap artifact is never included in the published wb-game-video package.
