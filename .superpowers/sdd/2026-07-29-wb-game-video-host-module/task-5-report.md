# Task 5 report — Workbench extension client migration

## Delivered

- Kept one lazy, module-scoped `createExtensionClient()` wrapper and migrated
  bootstrap, package persistence, tools, registry requests, generation
  requests, Kino requests, and media URLs to the handshake-bound client.
- Refreshed the reviewed `@forgeax/workbench-host` vendor package and lockfile
  for synchronous handshake-bound `extension.url()` support.
- Added persistent browser-media metadata and deletion tombstones in bounded
  game files, so list/get/update/delete/content work when the host recreates a
  router for every request.
- Added trusted registry media reads. Generated provider references are read
  through the game-scoped host media capability rather than sanitized public
  asset output.
- Removed the `process.cwd()` bundled-media fallback. Tests inject a temporary
  resolver while the production resolver uses only module/published paths.
- Implemented the exact browser/Kino routes for upload preparation,
  `resources`, `resources/batch`, get/update/delete, and content playback.
  DELETE 204 responses are no longer parsed as JSON.
- Added a persistent, bounded chunk-upload protocol:
  - generated 32-hex session ids and bounded game-relative paths;
  - 512 KiB chunks, at most 200 chunks, with image/font 20 MiB and
    video/audio 100 MiB limits;
  - exact content type, chunk index/count/size, ordering, idempotent duplicate,
    conflicting duplicate, completeness, and total-size checks;
  - session and chunks survive router recreation through `context.files`;
  - finalization assembles only validated chunks, calls `context.media.put`,
    persists the resource record, writes a finalized tombstone, and logically
    clears chunk files.
- Updated both the provider XHR transport and the default asset-library browser
  client so files larger than 1 MiB are sent only through sub-1-MiB extension
  requests.
- Extended one-retry playback refresh support to handshake-bound
  `media/assets/:id` and `media/resources/:id/content` URLs.
- Split browser media persistence/upload behavior into
  `server/host/browser-media.ts`; `router.ts` remains transport dispatch.

## TDD evidence

Observed RED before implementation:

- router range tests returned 404 after removal of the cwd fallback;
- upload preparation routes returned 404 and cross-router finalization was
  unavailable;
- a 1 MiB+7 byte browser upload was sent as one oversized XHR body;
- relative host upload instructions were not bound to `extension.url()`;
- DELETE 204 raised a non-JSON protocol error;
- full-suite playback retry tests showed the new handshake media routes were
  absent from the refresh allowlist.

Added regression coverage for:

- temporary injected bundled-media range fixtures;
- persistent metadata/tombstones and trusted generated media playback;
- 1 MiB+ browser and router uploads, including cross-router prepare/chunk/
  finalize;
- generated upload paths, per-kind limits, unsafe names, wrong game ids,
  unsupported MIME, order/count/size/completeness, duplicate/conflict, and
  invented session rejection;
- Kino batch/create/update/delete/content contracts and type filtering;
- 204 no-content handling and handshake-bound upload/playback URLs;
- all three browser upload chunks staying below the host 1 MiB limit;
- retry refresh for both generated registry and Kino resource routes.

## Verification

Passed:

```text
bun run test
# 126 test files passed
# 938 tests passed, 19 skipped, 0 failed

bun run lint
# frontend TypeScript, server TypeScript, and module boundaries pass

bun run build
# frontend, backend ESM+DTS, standalone, and release validation pass

git diff --check
# clean
```

The three existing media retry/replacement tests in
`src/editor/assets/__tests__/video-upload.test.ts` are included in the full
passing suite. Generated `dist` output was restored/removed after release
verification, leaving no build artifacts in the Task 5 commit.

## Remaining concerns

None known within Task 5 scope. Upload finalization intentionally allocates at
most the validated per-kind maximum (100 MiB) before crossing the host media
capability; request bodies remain capped at 512 KiB.
