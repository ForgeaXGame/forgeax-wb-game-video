# ADR 0003 — Server WS relay with server-side key injection

- Status: Accepted (relay *shape* amended by ADR 0004)
- Date: 2026-07-06
- Deciders: (user) + design session

> **Amendment (ADR 0004):** the relay is no longer a dumb byte-pipe. It is a thin
> **backend-adapter multiplexer** — still server-side key injection, still zero-copy
> JPEG passthrough, but it terminates a ForgeaX-internal protocol (FRFP) and delegates
> to a per-backend adapter. The key-source and secret-hiding decisions below stand.

## Context

FluxRT auth is `?key=` on the WS (browsers can't set WS headers) or `X-API-Key` on
HTTP. For setup simplicity, the default service key is the same value users already
put in `ANTHROPIC_API_KEY`; `FLUXRT_API_KEY` may override it when a separate render
secret is desired. ForgeaX keeps the chosen key server-side. Opening
`wss://…/ws?key=<key>` directly from the plugin would leak the raw secret to client
code / the network tab.

The ForgeaX server already implements a **WebSocket reverse-proxy**: `WsClientData.proxy`
+ the `wsHandler` branch in `packages/server/src/main.ts` transparently pipe bytes to an
upstream `new WebSocket(proxy.url)` (used today for wb-scene `/ws/*`).

## Decision

Relay through the ForgeaX server; the raw key never reaches the browser.

- **Key source**: `process.env.FLUXRT_API_KEY || process.env.ANTHROPIC_API_KEY`
  (`FLUXRT_API_KEY` is an optional override; otherwise users fill the shared key once).
- **WS**: add one branch in `Bun.serve.fetch` — on `/ws/diffusion-renderer` (under `/ws/*` so the
  dev vite proxy forwards the upgrade; `/api` isn't ws-proxied in dev), set
  `proxy.url = ${FLUXRT_WS_BASE}/ws?key=${KEY}` (from `process.env`) and
  `srv.upgrade(req, { data })`. The existing proxy passthrough handles binary framing.
- **HTTP**: a Hono router `/api/wb/diffusion-renderer/{health,predict}` (mounted via `ctx.routers`,
  like `createCharacterRouter`) injects `X-API-Key: ${KEY}`. `/health` is the
  readiness gate; `/predict` is the Phase-1 single-frame path.
- Config: `FLUXRT_BASE_URL=https://sd-jxdong-1771768252-sd.lightai.woa.com/` in `.env`;
  derive `FLUXRT_WS_BASE` (wss). Verified reachable: `/health` → `status: ready`,
  `auth_required: true`, fixed output `576×320`, `supports_{prompt_switch,interp,lora_switch}`.

## Note — shared key by product choice

This product intentionally allows FluxRT to validate the same key used for the LLM
path, reducing setup friction for users. The raw value still never reaches browser
code; it is injected only by the server relay.

## Consequences

- Secret stays server-side; the browser only ever talks same-origin.
- One extra network hop (browser→ForgeaX→FluxRT) adds some latency/bandwidth — acceptable
  for a local/desktop server on the same machine.
- Enforcing FluxRT's single-session rule and surfacing `busy`/`unauthorized` can be done
  at the relay or passed through to the client.

## Alternatives considered

- **Browser-direct with a raw-key endpoint**: lowest latency, but exposes the real
  service key in the browser + is vulnerable to iframe XSS exfiltration. Rejected.
- **HTTP `/predict` only (no WS)**: simplest/secure but caps at ~4–5 fps with no
  interpolation. Kept as a fallback tier, not the primary path.
