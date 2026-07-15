# FluxRT Real-Time Video Service — API

_Real-time video style editing over HTTP and WebSocket._

Send a video frame plus a few optional parameters; get back the edited frame(s). You handle capture, playback, UI, and reconnection — the service handles inference.

- **Real-time streaming:** WebSocket `/ws` (recommended)
- **Single-frame / batch:** HTTP `POST /predict`
- **Status / discovery:** `GET /health`

Base URL in examples: `https://xxx.com/` (use the URL we give you). Always use `https`/`wss`.

---

## 1. Authentication

Every request to `/predict` and `/ws` needs an **API key we issue to you**. Keep it secret; prefer sending it from your backend rather than shipping it in client code.

**How to send your key** (first match wins):

| Transport | Method |
|-----------|--------|
| HTTP | `X-API-Key: <key>` header |
| HTTP | `Authorization: Bearer <key>` header |
| WebSocket | `?key=<key>` query parameter (browsers can't set WS headers) |
| WebSocket | `X-API-Key: <key>` header (non-browser clients) |

**If the key is missing or invalid:**

| Transport | Response |
|-----------|----------|
| HTTP | `401` `{ "error": "invalid or missing API key", "code": "UNAUTHORIZED" }` |
| WebSocket | text `{ "type": "unauthorized", "code": "UNAUTHORIZED" }` then the socket closes |

`GET /health` and the browser demo page are open (no key) so you can check status.

---

## 2. Request parameters

These are all the knobs you control, per request (HTTP body fields or WebSocket uplink meta). All are optional except the frame itself.

| Parameter | Type | Default | Range | Purpose |
|-----------|------|---------|-------|---------|
| **frame** | image | — | JPEG or PNG, any aspect ratio | The input frame. The stream is a sequence of frames, not a video file upload. |
| **`prompt`** | string | server default | any text; empty = keep current | Style / scene description. Prompt changes preserve stream cache by default. |
| **`reset_cache`** | bool | `false` | `true` / `false` | Explicitly clear stream cache before this frame. Send with a new prompt for large style changes. |
| **`seed`** | int | `-1` | `≥ 0` fixed, `-1` random | Reproducible vs varied output. |
| **`steps`** | int | `0` (server default) | `1`–`8`; `0` = keep default | Quality vs speed. Recommended real-time range: `1`–`4`; high-quality / low-FPS range: `5`–`8`. |
| **`interp`** | int | `0` | `0` off, `1` → 2×, `2` → 4× | Frame interpolation for smoother playback. Adds output frames, not core latency. WebSocket only in practice. |

**Tip:** in a live session, only send `prompt` / `steps` when they change. Use prompt-only updates for description tweaks. For a large style change, send `reset_cache: true` on the same frame as the new prompt.

Probe `GET /health` for `max_steps` instead of hard-coding the upper bound. Requests above `max_steps` are rejected.

### Read-only info (from `GET /health`)

Probe these at startup instead of hard-coding: `status`, `resolution` (output size), `max_steps`, `capabilities`, `session_active`, `auth_required`.

Output resolution is fixed by the service and is not a per-request parameter.

---

## 3. Limits & behavior

| Limit | Behavior |
|-------|----------|
| **API key required** | `/predict` and `/ws` reject requests without a valid key (`401` / `unauthorized`) |
| **One live session at a time** | A second `/ws` connection gets `{ "type": "busy" }` and is closed; `/predict` returns `409` while a session is active |
| **Latest-frame priority** | If you send frames faster than they can be processed, older ones are dropped with `{ "type": "drop", "seq": N }` and only the newest is edited |
| **Reconnect / backoff** | Reconnect on disconnect; back off and retry on `busy` |
| **Upload size** | Downscale before sending (e.g. 640×360 JPEG q≈0.7) to save bandwidth |

---

## 4. HTTP API

### `GET /health`

Poll until `"status": "ready"` before sending edits.

```json
{
  "status": "ready",
  "resolution": { "height": 320, "width": 576 },
  "max_steps": 8,
  "session_active": false,
  "auth_required": true,
  "capabilities": {
    "name": "fluxrt",
    "stateful": false,
    "supports_interp": true
  }
}
```

### `POST /predict`

Single-frame edit. Best for scripts, thumbnails, or low frame rates.

**Request:**

```json
{
  "base64_image": "<base64 JPEG/PNG; data:image/jpeg;base64,... OK>",
  "prompt": "anime style, vibrant colors",
  "seed": 42,
  "steps": 2,
  "interp": 0,
  "reset_cache": false
}
```

**Response (`interp=0`, single frame):**

```json
{
  "base64_image": "<edited frame base64>",
  "n": 1,
  "seed": 42,
  "steps": 2,
  "prompt": "anime style, vibrant colors",
  "cache_reset": false,
  "infer_ms": 238.1,
  "total_ms": 253.7,
  "source_size": [640, 360],
  "target_size": [576, 320]
}
```

When `interp > 0`, the response contains `"images": [ ... ]` with `n` frames instead of a single `base64_image`.

**Status codes:**

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Invalid parameters, e.g. `steps > max_steps` |
| 401 | Missing or invalid API key |
| 409 | A live WebSocket session is active |
| 503 | Model not ready (see `/health`) |

---

## 5. WebSocket API (`/ws`) — recommended for real-time

Connect with your key:

```text
wss://xxx.com/ws?key=<your-api-key>
```

1. Wait for `/health` → `ready` and `session_active: false`
2. Open the WebSocket with `?key=`
3. Stream binary uplink frames
4. Handle text control messages (`unauthorized`, `drop`, `busy`, `error`) and binary output

### Uplink (client → server)

```text
[4 bytes: meta_len (uint32 LE)][meta JSON UTF-8][JPEG bytes]
```

Meta JSON fields: `prompt`, `reset_cache`, `seed`, `steps`, `interp` (as in §2), plus:

| Field | Type | Description |
|-------|------|-------------|
| `seq` | int | Your sequence number (echoed back; used for drop tracking) |
| `ts` | float | Your timestamp in ms (e.g. `performance.now()`) for end-to-end latency |

```python
import json, struct, time

def pack_uplink(jpeg: bytes, seq: int, **params) -> bytes:
    meta = {"seq": seq, "ts": time.time() * 1000, **params}
    mb = json.dumps(meta).encode()
    return struct.pack("<I", len(mb)) + mb + jpeg
```

### Downlink (server → client)

**Binary output frame(s):**

```text
[4 bytes: header_len (uint32 LE)][header JSON UTF-8][JPEG bytes ...]
```

Header example:

```json
{
  "type": "out",
  "server_ms": 241.5,
  "seq": 42,
  "ts": 1717600000123.4,
  "steps": 2,
  "cache_reset": false,
  "n": 4,
  "sizes": [45123, 44890, 45001, 44950]
}
```

Split the trailing bytes into `n` JPEGs using `sizes`, in order. With `interp > 0` you get multiple frames — play them through a small display buffer (e.g. 30 fps).

**Text control messages:**

| `type` | Meaning | Action |
|--------|---------|--------|
| `unauthorized` | Bad/missing key | Fix the key (socket closed) |
| `drop` | A newer frame superseded this one | Just update metrics; no output for this `seq` |
| `busy` | Another session holds the service | Retry later |
| `error` | Processing failure | Log and optionally retry |

### Client loop (outline)

```text
1. Capture a frame (camera / screen / video)
2. Downscale + JPEG encode (q≈0.7)
3. send pack_uplink(jpeg, seq++, prompt=..., steps=..., interp=...)
4. On binary message → split by sizes → append JPEGs to a playback queue
5. On {type:"drop"} → adjust metrics only
6. Play the queue at a steady display FPS, independent of model FPS
```

Don't send faster than ~10 fps unless you accept drops.

---

## 6. Examples

### curl — single frame

```bash
B64=$(base64 -w0 frame.jpg)
curl -sS -X POST "https://xxx.com/predict" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $FLUXRT_API_KEY" \
  -d "{\"base64_image\":\"data:image/jpeg;base64,${B64}\",\"prompt\":\"cinematic film still\",\"steps\":2}" \
  | jq '{n, steps, total_ms}'
```

### Python — health + authorized predict

```python
import os, requests

base = "https://xxx.com"
key = os.environ["FLUXRT_API_KEY"]

h = requests.get(f"{base}/health", timeout=5).json()
assert h["status"] == "ready", h

r = requests.post(
    f"{base}/predict",
    headers={"X-API-Key": key},
    json={"base64_image": b64_frame, "prompt": "cinematic film still", "steps": 2},
    timeout=30,
)
r.raise_for_status()  # 401 bad key · 409 busy · 503 not ready
print(r.json()["total_ms"])
```

### JavaScript — authorized WebSocket

```js
const key = "<your-api-key>";
const ws = new WebSocket(`wss://xxx.com/ws?key=${encodeURIComponent(key)}`);
ws.binaryType = "arraybuffer";
ws.onmessage = (m) => {
  if (typeof m.data === "string") {
    const msg = JSON.parse(m.data);
    if (msg.type === "unauthorized") console.error("bad API key");
    return;
  }
  // binary: [4B header_len][header JSON][JPEG...]
};
```

---

## 7. Performance expectations

Informative only, not guarantees:

| Metric | Typical |
|--------|---------|
| Per-frame edit latency | ~140 ms (calm) – ~300 ms (high motion) |
| Model output rate | ~4–5 fps |
| Perceived rate with `interp=2` (4×) | ~16–20 fps with a client-side display buffer |
| `steps=1` vs `2` | ~2× throughput, lower quality |
Drops under heavy motion or high send rates are normal — always keep a display buffer.

---

## 8. Quick reference

| Goal | How |
|------|-----|
| Authenticate | `X-API-Key` header (HTTP) / `?key=` (WS) |
| Check status | `GET /health` (wait for `status: ready`) |
| Single edit | `POST /predict` |
| Live stream | `WS /ws` binary protocol |
| Change description / scene details | `prompt` |
| Change style substantially | `prompt` + `reset_cache: true` on the same frame |
| Faster / lower quality | `steps: 1` |
| Higher quality / lower FPS | `steps: 5`–`8` after probing `/health.max_steps` |
| Smoother playback | `interp: 2` + client display buffer |

You control: **the frame, `prompt`, `reset_cache`, `seed`, `steps`, `interp`.**
Fixed by the service: output resolution and model configuration.
