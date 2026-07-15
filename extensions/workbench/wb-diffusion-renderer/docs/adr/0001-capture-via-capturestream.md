# ADR 0001 — Capture viewport frames via `captureStream()`, not readback

- Status: Accepted
- Date: 2026-07-06
- Deciders: (user) + design session

## Context

The plugin must obtain live frames from the WebGPU engine viewport (`<canvas id="app">`)
at ~10 fps. The engine already exposes `renderer.readPixels()`, and the obvious
browser paths are `canvas.toDataURL()` / `drawImage(canvas)` / `createImageBitmap(canvas)`.
The repo warns that a presented WebGPU canvas "reads back BLACK" via `getImageData`
(`packages/editor/scripts/visualcheck.mjs`).

We ran a spike (headed Chrome + `--enable-unsafe-webgpu`, real Studio viewport,
hellforge loaded). Results:

| Path | Result |
|------|--------|
| `drawImage(canvas)` → `getImageData` | meanLuma 0 — **black** |
| `createImageBitmap(canvas)` → `getImageData` | **black** |
| engine `renderer.readPixels()` | meanLuma 0 — **black** |
| **`canvas.captureStream()` → VideoFrame → JPEG** | real frames, ~100% non-black |

`captureStream` even worked with `window.__forgeax_editor` absent → capture is
**engine-agnostic** (depends only on the `<canvas>` element).

## Decision

Capture via **`HTMLCanvasElement.captureStream(fps)`** and pull frames through
`MediaStreamTrackProcessor`. Do **not** use any CPU/GPU readback path, and do
**not** modify `packages/engine`.

## Consequences

- Zero engine changes; capture survives engine refactors.
- Capture must run where the canvas lives — the **parent Studio window** — because
  `captureStream` needs the actual element (see ADR 0002).
- Encoding cost is the new risk: full-res main-thread `toBlob` measured ~90–105 ms/frame
  in the spike. Mitigated by downscaling + a Worker (see DESIGN.md); not an engine concern.

## Alternatives considered

- **Engine surgery** (configure context with `COPY_SRC` + `copyTextureToBuffer`):
  reliable pixels but invasive, engine-version-fragile, and unnecessary given
  captureStream works. Kept as a documented fallback only.
- **`getDisplayMedia` tab capture**: robust but requires a user picker and grabs the
  whole tab, not just the viewport. Rejected for UX.
