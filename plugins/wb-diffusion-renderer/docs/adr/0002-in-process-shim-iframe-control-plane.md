# ADR 0002 — In-process host capture/display + inline DockShell panel

- Status: Accepted
- Date: 2026-07-06
- Deciders: (user) + design session

## Context

ForgeaX workbench plugins are normally same-origin **iframes** served at
`/plugins/<id>/`, sandboxed from the parent window. But ADR 0001 forces capture to
run in the **parent** window (that owns `<canvas id="app">`), and the diffusion-rendererd-frame
display sink must also live in that parent window so frames do not cross an iframe
boundary at video rate. A sandboxed iframe can reach neither the canvas nor that
in-window sink.

## Decision

Split the plugin into two halves:

1. **In-process host capture/display implementation** — runs in the parent Studio
   window and lives in the marketplace plugin package. Studio imports the inline
   DockShell panel, and that panel starts/stops the host stream on demand. Owns:
   `captureStream`, the encode Worker, the relay WS, the display buffer, and the
   inline Diffusion Renderer plugin-panel sink.
2. **Compatibility iframe** — the standard marketplace entry remains as a landing
   page, but the production controls live in the inline DockShell plugin panel and
   no longer use a separate iframe control path.

The production path uses direct same-window React/module calls between `DiffusionRendererPanel`
and the host stream implementation. Because the iframe is now only a compatibility
landing page, Diffusion Renderer no longer carries a custom `postMessage` control protocol.

## Consequences

- Frames never cross the iframe boundary → no per-frame `postMessage` of binary data.
- The host stream implementation lives in the marketplace plugin package but is wired
  into the product shell by one explicit Studio import/register point.
- The compatibility iframe stays discoverable for marketplace packaging, but cannot
  start a second Diffusion Renderer control path.

## Alternatives considered

- **Pure iframe plugin** with parent capturing and streaming frames into the iframe
  via `postMessage`: doubles frame traffic across a boundary at 10 fps and puts the
  display sink behind the wrong lifecycle. Rejected.
- **Fully in-process with no marketplace entry**: loses the standard workbench plugin
  packaging/discovery surface. Rejected; keep the manifest/entry as a compatibility
  landing page while Studio injects the production inline panel.
