# DESIGN — wb-diffusion-renderer (real-time viewport diffusion renderer)

Status: **built.** Plugin id `@forgeax-extension/wb-diffusion-renderer`. See CONTEXT.md
(glossary) and docs/adr/0001–0004 for the locked decisions.

## One-line

Capture the live engine viewport → stream JPEGs through the ForgeaX server to
FluxRT → show the AI-diffusion-rendererd frames in the same Diffusion Renderer plugin DockShell panel
that starts/stops the stream.

## Data flow

```
                 parent Studio window (inline DockShell plugin panel)
  ┌──────────────────────────────────────────────────────────────────────┐
  │  canvas#app ──captureStream(fps)──▶ VideoFrame                         │
  │                                       │ (transfer, zero-copy)          │
  │                                       ▼                                │
  │                          [Encode Worker]  drawImage→576×320            │
  │                          OffscreenCanvas.convertToBlob(jpeg,0.7)       │
  │                                       │ ArrayBuffer (transfer)         │
  │                                       ▼                                │
  │  wb-diffusion-renderer plugin panel ◀── display buffer(30fps) ◀── downlink split  │
  │   (DockShell inline)                  ▲              │ uplink[meta|jpeg]│
  └───────────────────────────────────────┼──────────────┼───────────────┘
        ▲ direct React calls/status         │              ▼
        │                                   │   same-origin WS /ws/diffusion-renderer
  ┌─────┴───────────────────┐             │              ║ (relay)
  │ inline plugin panel UI  │             │              ▼
  │ prompt/steps/interp     │        downlink[header|jpeg...]   FluxRT wss/ws
  │ start/stop/preview      │                          ?key=shared service key
  └─────────────────────────┘                          (injected server-side)
```

## Components

1. **Inline plugin panel** — the `@forgeax-extension/wb-diffusion-renderer` DockShell plugin panel.
   UI: prompt, steps, interp, Start/Stop, live metrics, and the preview image. It is
   injected by Studio as an inline workbench panel so the frame sink stays in the
   parent window and frames never cross an iframe boundary.

2. **In-process host stream implementation** — parent window code that lives in this
   marketplace plugin package and is imported by Studio's inline panel registration. Owns:
   - locate `canvas#app`; `captureStream(TARGET_FPS)`;
   - the encode Worker (below);
   - the relay WS client (`/ws/diffusion-renderer`) + uplink packing + downlink split;
   - the display buffer (steady 30 fps) and the inline plugin-panel image sink;
   - in-flight cap + latest-frame drop.

3. **Server diffusion renderer relay** — WS route `/ws/diffusion-renderer` resolves the
   current FluxRT upstream in `game/wb-diffusion-renderer.ts`, injects the key server-side,
   and lets JPEG frames pass through the shared WS proxy. A multi-backend registry can be
   introduced later if a second enhancement backend appears.

4. **Server HTTP proxy** — Hono router `/api/wb/diffusion-renderer/{health,predict,backends}` via
   `ctx.routers`. Implemented in `game/wb-diffusion-renderer.ts`, injecting the key server-side. `/health` =
   readiness gate; `/backends` feeds the capability-driven UI; `/predict` is retained as
   a server capability, but the current panel uses the realtime WS path.

5. **Config** — `.env`: `FLUXRT_BASE_URL=https://sd-jxdong-1771768252-sd.lightai.woa.com/`
   (verified `status: ready`), derive `FLUXRT_WS_BASE` (wss). Key =
   `FLUXRT_API_KEY || ANTHROPIC_API_KEY` so users can reuse the LLM key by default.
   Output resolution is fixed by the service at **576×320** → capture
   downscale should match that aspect (~16:9) and the plugin panel must letterbox the
   output. Add `FLUXRT_*` to `requestedEnv` / (optionally) `SAFE_ENV_KEYS` if it should
   be editable from the Settings drawer.

## The Worker + OffscreenCanvas encode path (the perf-critical core)

Main thread (`src/host/stream.ts`) — read frames, drop to newest, transfer to the worker:

```ts
const TARGET_FPS = 10, MAX_INFLIGHT = 2, OUT_W = 576, OUT_H = 320;
const track = canvas.captureStream(TARGET_FPS).getVideoTracks()[0];
const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
const worker = new Worker(new URL('./encode-worker.ts', import.meta.url), { type: 'module' });
worker.postMessage({ type: 'init', w: OUT_W, h: OUT_H, quality: 0.7 });

let inflight = 0, seq = 0;
(async function pump() {
  while (running) {
    const { value: frame, done } = await reader.read();
    if (done) break;
    if (inflight >= MAX_INFLIGHT) { frame.close(); continue; } // drop to newest
    inflight++;
    worker.postMessage({ type: 'frame', frame, seq: seq++, ts: performance.now() }, [frame]);
  }
})();

worker.onmessage = (e) => {                 // { seq, ts, jpeg: ArrayBuffer }
  inflight--;
  sendUplink(e.data.jpeg, e.data.seq, e.data.ts); // pack [meta|jpeg] + ws.send
};
```

Worker (`src/host/encode-worker.ts`) — off-thread downscale + JPEG:

```ts
let osc: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D, q = 0.7;
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') { osc = new OffscreenCanvas(m.w, m.h); ctx = osc.getContext('2d', { desynchronized: true })!; q = m.quality; return; }
  // m.type === 'frame'
  ctx.drawImage(m.frame, 0, 0, osc.width, osc.height); // downscale
  m.frame.close();                                     // release VideoFrame promptly
  const blob = await osc.convertToBlob({ type: 'image/jpeg', quality: q });
  const buf = await blob.arrayBuffer();
  self.postMessage({ seq: m.seq, ts: m.ts, jpeg: buf }, [buf]);
};
```

Why this reaches ~10 fps without stalling the engine:
- `VideoFrame` is **transferred** (zero-copy) to the worker.
- Downscale to 576×320 slashes encode cost vs full-res (the spike's ~100 ms was full-res
  **main-thread** `toBlob`).
- `convertToBlob` runs in the worker → the engine's rAF is never blocked.
- `MAX_INFLIGHT` + drop-to-newest keeps latency bounded (no growing queue).

## Uplink / downlink framing (from FluxRT API)

- Uplink: `[4B meta_len LE][meta JSON][JPEG]`, meta `{seq, ts, prompt?, seed?, steps?, interp?, reset_cache?}`. The stream sends the current effective render params with each captured frame because FluxRT reports `stateful:false`; `reset_cache` is a one-shot flag for large global prompt changes.
- Downlink: `[4B header_len LE][header JSON][JPEG...]`, split trailing bytes by `header.sizes[]` into `n` frames → push to display buffer.
- Control text msgs: `unauthorized` (fix key), `drop` (metrics only), `busy` (retry/backoff), `error` (log).

## Display / single plugin panel (decided)

Enhanced frames render into the same DockShell plugin panel that owns the Start/Stop
controls (`wb:@forgeax-extension/wb-diffusion-renderer`), not into a layer above `canvas#app` and not
into a separate `diffusion-renderer-output` panel. The original game viewport remains visible and
interactive while the plugin panel letterboxes the service's fixed 576×320 frames
(`object-fit: contain`). Phase 2 plays the display buffer at ~30 fps. The old iframe
single-frame compatibility path has been removed; the marketplace `index.html` is now
only a landing page that points users to the inline panel.

## Primary UX — single plugin panel (decided 2026-07-06)

The only production entry is the DockShell plugin panel selected from Layout → Plugin
Panels → Diffusion Renderer · Live Viewport. The viewport has no floating Diffusion Renderer launcher. The
plugin panel contains prompt / steps / smooth(RIFE) / Go Live-Stop / metrics and preview.
Files: `packages/marketplace/extensions/wb-diffusion-renderer/src/panel.tsx` and
`src/host/{stream,encode-worker,meta,output-store}.ts`.

## Control transport (decided)

The production control path is direct in-window React/module calls: `DiffusionRendererPanel`
calls `startStream`, `stopStream`, and `updateParams`, and receives status through the
stream callback. No frame or control message crosses an iframe boundary. The standard
marketplace iframe entry remains only as a compatibility landing page.

Phase 1 game integration (ADR 0005) publishes `window.forgeaxDiffusion` while the
inline panel is mounted. Game code may set a **prompt fragment** from runtime state;
the host stream composes it with the panel's base prompt (`base + gameFragment`) and
the panel exposes a reclaim control to clear the game override. Game-author usage lives
in `GAME-DEVELOPER.md`.

## v1 param surface (decided)

Primary panel UI: **prompt**, **steps** (1–4, default 2), **Smooth** (`off / 2x / 4x`,
default 4x), **Go Live / Stop**, metrics, and the preview image. The panel fixes
`seed=42` for the low-poly to photorealistic live path (constant seed → temporal
coherence). The prompt is the only per-frame style knob now that FluxRT dropped
the `lora` parameter (see the 2026-07-08 API update).

## Session / health / errors

- Phase 1 gates the button on `/api/wb/diffusion-renderer/health` → `status: ready`.
- FluxRT allows one live WS session; `/predict` returns `409` while a WS session is
  active. Phase 1 uses only `/predict`, so this is a non-issue until Phase 2, which adds
  `busy` backoff + reconnect and single-session handling at/through the relay.
- Surface `unauthorized` (bad key) and `error` to the inline panel status line.

## Build phases

- **Phase 1 — single-frame HTTP vertical slice. ✅ BUILT + VERIFIED, then retired
  from the client path (2026-07-07).**
  End-to-end against live FluxRT: capture (`captureStream` one frame) → server relay
  (`/api/wb/diffusion-renderer/predict`, key injected) → FluxRT inference → letterboxed output in the
  plugin panel. Verified in real WebGPU Chrome (old host shim booted, plugin served, round trip ok,
  output painted). Files: server `game/wb-diffusion-renderer.ts` + main.ts wiring;
  plugin `forgeax-extension.json` + `index.html`;
  a now-retired Studio boot hook. The server `/predict` capability remains; the client-side
  single-frame path was removed after the realtime panel became the only production entry.
  Original phrasing below.

- **Phase 1 (spec) — single-frame HTTP vertical slice.** Prove the *entire* architecture with
  minimal complexity: `/api/wb/diffusion-renderer/health` + `/api/wb/diffusion-renderer/predict` (server-side
  `X-API-Key` injection) + a minimal client path that captures ONE frame (`captureStream`
  → single `VideoFrame` → JPEG), POSTs it, and paints the returned frame. This proved
  capture + auth + relay + inference + display end-to-end before the realtime panel.
- **Phase 2 — real-time streaming. ✅ BUILT + VERIFIED (2026-07-06).** WS relay at
  **`/ws/diffusion-renderer?backend=<name>`** (under `/ws/*` so the dev vite proxy — which enables
  `ws` only on `/ws`, not `/api` — forwards the upgrade; key injected server-side via the
  backend's `wsUpstreamUrl()`). Client: encode Worker (`host/encode-worker.ts`) +
  `MediaStreamTrackProcessor` pump with drop-to-newest + FRFP uplink pack + downlink split
  + jitter buffer @30fps → plugin panel; Go Live/Stop in the same panel. Verified live: ~8 fps
  display · ~200 ms e2e · drop-to-newest working. Files:
  `marketplace/extensions/wb-diffusion-renderer/src/host/stream.ts` + `host/encode-worker.ts`;
  server `game/wb-diffusion-renderer.ts#getDiffusionRendererWsUpstreamUrl` + `main.ts` relay branch.

## Remaining implementation notes (not blocking)

- Exact `forgeax-extension.json` manifest fields (id, workbench position/panelSize, entry,
  `requestedEnv`) — fill at build time following `wb-observatory` (UI-only) + `wb-character`
  (backend) as templates.
- How the inline panel discovers the active viewport canvas across game switches
  (`ViewportComponent` remounts on slug change).
- `serveStatic('/extensions/wb-diffusion-renderer/*')` route in `packages/server/src/main.ts`.
```
