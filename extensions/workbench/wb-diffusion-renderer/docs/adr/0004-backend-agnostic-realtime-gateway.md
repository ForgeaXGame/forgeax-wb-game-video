# ADR 0004 — Single-file server relay, backend-agnostic wire shape

- Status: Accepted, revised 2026-07-07
- Date: 2026-07-06
- Deciders: (user) + design session

## Context

FluxRT is the first realtime enhancement backend. We should not couple the browser
host stream implementation to FluxRT's wire protocol or secret handling, but the server
does not need a separate backend registry while there is only one backend.

Latency check: the ForgeaX server runs on localhost; the backend (FluxRT) is remote.
The WAN hop + inference dominate e2e latency, so a server adapter that only rewrites a
small JSON framing header (JPEG bytes passed through zero-copy) adds negligible cost —
removing the main objection to a normalizing relay.

## Decision

Keep one **server-side diffusion renderer module**:

- **FRFP (ForgeaX Realtime Frame Protocol)** — the single host-stream↔server contract,
  independent of FluxRT details. The host stream implementation speaks only FRFP.
- **`game/wb-diffusion-renderer.ts`** owns the current server-side implementation:
  `/api/wb/diffusion-renderer/{health,predict,backends}` plus FluxRT upstream WS URL
  resolution for `/ws/diffusion-renderer`.
- **No separate registry yet**: adding a second backend should first extend this module;
  only extract a registry/adapter interface when the second backend makes that depth real.
- **Capability-driven UI**: the inline DockShell panel fetches `capabilities()` (via
  `/api/wb/diffusion-renderer/backends` + `/health`) and renders knobs dynamically — hide `interp`
  if unsupported, show output resolution. (The `lora` preset dropdown was removed
  2026-07-08 when FluxRT dropped the `lora` parameter; `prompt` is now the only
  style knob.)
- Async-batch backends (e.g. Seedance `task_id` polling) remain a different offline
  feature, gated OUT of this plugin's realtime path.

## Consequences

- Adding a backend means extending `game/wb-diffusion-renderer.ts`; zero host-stream/plugin changes.
- The relay is a thin server-side key-injecting proxy, not a raw browser-to-backend pipe.
- Secrets + per-backend protocol stay server-side; the client stays dumb and portable.
- Less server structure now: one product-shell module instead of a new subfolder with
  registry/types/adapter files.

## Alternatives considered

- **Dumb byte-pipe + client-side per-backend adapters**: least server code now, but
  couples the host stream/plugin to each backend's wire format and leaks protocol churn into the
  client. Rejected.
- **Extract registry/types/adapter files immediately**: cleaner for many backends, but
  shallow while FluxRT is the only backend. Rejected for now; extract when a second
  backend lands.
