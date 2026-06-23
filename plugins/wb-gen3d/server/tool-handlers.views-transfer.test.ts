// T1 (ADR-0008 D-B): a studio-local view URL (the relative turnaround url or a
// loopback host) is re-hosted on COS before a REAL provider runs, so the
// provider can fetch it; the mock path is left untouched. Two layers:
//   (1) a pure predicate + an injectable transfer helper (zero network), and
//   (2) the views-to-3d handler's gating — a studio-local url on the mock path
//       must NOT trigger any fetch (transfer is skipped entirely).

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isStudioLocalImageUrl, studioBaseUrl, tools, transferStudioLocalImage } from './tool-handlers';

// ── (1) Pure predicate ──────────────────────────────────────────────────────
test('isStudioLocalImageUrl: relative paths and loopback hosts are studio-local', () => {
  expect(isStudioLocalImageUrl('/api/wb/character/asset?path=front.png')).toBe(true);
  expect(isStudioLocalImageUrl('characters/hero/front.png')).toBe(true);
  expect(isStudioLocalImageUrl('http://127.0.0.1:18900/api/game-assets/g/3d/x.png')).toBe(true);
  expect(isStudioLocalImageUrl('http://localhost:18920/x.png')).toBe(true);
});

test('isStudioLocalImageUrl: public URLs are NOT studio-local (pass through)', () => {
  expect(isStudioLocalImageUrl('https://api.meshy.ai/x.png')).toBe(false);
  expect(isStudioLocalImageUrl('https://cos.ap-region.example.com/inputs/abc.png')).toBe(false);
  expect(isStudioLocalImageUrl('   ')).toBe(false);
});

test('studioBaseUrl honors FORGEAX_SERVER_PORT, defaulting to 18900', () => {
  const prev = process.env.FORGEAX_SERVER_PORT;
  delete process.env.FORGEAX_SERVER_PORT;
  expect(studioBaseUrl()).toBe('http://127.0.0.1:18900');
  process.env.FORGEAX_SERVER_PORT = '18810';
  expect(studioBaseUrl()).toBe('http://127.0.0.1:18810');
  if (prev === undefined) delete process.env.FORGEAX_SERVER_PORT;
  else process.env.FORGEAX_SERVER_PORT = prev;
});

// ── (1) Injectable transfer helper (zero network) ────────────────────────────
function pngResponse(bytes = new Uint8Array([1, 2, 3])): Response {
  return new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } });
}

test('transferStudioLocalImage: resolves a relative url against the base, uploads, returns the public url', async () => {
  let fetchedUrl = '';
  let uploadedMime = '';
  let uploadedBytes = -1;
  const publicUrl = await transferStudioLocalImage('/api/wb/character/asset?path=front.png', {
    baseUrl: 'http://127.0.0.1:18900',
    fetchImpl: (async (url: string | URL | Request) => {
      fetchedUrl = String(url);
      return pngResponse();
    }) as typeof fetch,
    upload: async (data, mime) => {
      uploadedMime = mime;
      uploadedBytes = data.byteLength;
      return 'https://cos.example.com/inputs/deadbeef.png';
    },
  });
  expect(fetchedUrl).toBe('http://127.0.0.1:18900/api/wb/character/asset?path=front.png');
  expect(uploadedMime).toBe('image/png');
  expect(uploadedBytes).toBe(3);
  expect(publicUrl).toBe('https://cos.example.com/inputs/deadbeef.png');
});

test('transferStudioLocalImage: an absolute loopback url is fetched as-is (no base prefix)', async () => {
  let fetchedUrl = '';
  await transferStudioLocalImage('http://localhost:18920/x.png', {
    baseUrl: 'http://127.0.0.1:18900',
    fetchImpl: (async (url: string | URL | Request) => {
      fetchedUrl = String(url);
      return pngResponse();
    }) as typeof fetch,
    upload: async () => 'https://cos.example.com/y.png',
  });
  expect(fetchedUrl).toBe('http://localhost:18920/x.png');
});

test('transferStudioLocalImage: a non-OK fetch rejects studio_local_fetch_failed and never uploads', async () => {
  let uploaded = false;
  await expect(
    transferStudioLocalImage('/api/wb/character/asset?path=missing.png', {
      baseUrl: 'http://127.0.0.1:18900',
      fetchImpl: (async () => new Response('nope', { status: 404 })) as typeof fetch,
      upload: async () => {
        uploaded = true;
        return 'unreached';
      },
    }),
  ).rejects.toMatchObject({ code: 'studio_local_fetch_failed' });
  expect(uploaded).toBe(false);
});

// ── (2) Handler gating: the mock path must NOT transfer (zero network) ───────
const SLUG = 'views-xfer';
let root: string;
let realFetch: typeof fetch;
let prevEnableReal: string | undefined;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'wbgen3d-views-'));
  process.env.FORGEAX_PROJECT_ROOT = root;
  // Force the mock path: all real providers are gated by this flag (env.ts), so
  // meshy/hunyuan/rodin resolve to null regardless of any local .env keys.
  prevEnableReal = process.env.GEN3D_ENABLE_REAL_PROVIDERS;
  process.env.GEN3D_ENABLE_REAL_PROVIDERS = '0';
  realFetch = globalThis.fetch;
  // Any fetch during a mock generation is a bug — the transfer must be skipped.
  globalThis.fetch = (async (url: string | URL | Request) => {
    throw new Error(`unexpected fetch on the mock path: ${String(url)}`);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  if (prevEnableReal === undefined) delete process.env.GEN3D_ENABLE_REAL_PROVIDERS;
  else process.env.GEN3D_ENABLE_REAL_PROVIDERS = prevEnableReal;
  if (root) rmSync(root, { recursive: true, force: true });
});

test('views-to-3d on the mock path keeps a studio-local url and never fetches', async () => {
  const res = await tools['gen3d:views-to-3d']({
    slug: SLUG,
    assetSlot: 'characters',
    assetName: 'hero',
    views: {
      front_image_url: `/api/wb/character/asset?path=.forgeax/games/${SLUG}/characters/hero/front.png`,
    },
  });
  expect(res.ok).toBe(true);
  expect(res.usedMock).toBe(true); // mock fallback ran, so no transfer/fetch was needed
});
