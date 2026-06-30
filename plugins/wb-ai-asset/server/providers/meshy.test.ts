// MeshyProvider smoke — injected fetch + download → zero network, zero credits.
// Asserts the exact submit payloads (lowpoly is the default; standard attaches
// ai_model/should_remesh/target_polycount), the submit→poll→download flow, and
// the stable error mapping (failed task, HTTP 402 → insufficient credits).

import { expect, test } from 'bun:test';
import { MeshyProvider } from './meshy';
import { clampTargetPolycount } from '../../shared/catalog';
import type { MeshyEnv } from '../env';

const env: MeshyEnv = {
  apiKey: 'msy_test_key',
  baseUrl: 'https://api.meshy.ai',
  defaultPolycount: 6000,
  pollIntervalMs: 0,
  pollTimeoutMs: 5000,
  rateLimitPerMin: 1000,
};

const TASK = 'task-123';

interface Hit {
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
}

// A scripted Meshy backend keyed by (method, pathname). Submit returns the task
// id (v2 text/refine + remesh/retexture use `result`; v1 image/multi use `id`);
// the poll GET returns a SUCCEEDED result with a glb + thumbnail.
function makeProvider(opts: { status?: number; pollStatus?: string } = {}) {
  const hits: Hit[] = [];
  const downloads: string[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const success = {
    status: opts.pollStatus ?? 'SUCCEEDED',
    model_urls: { glb: 'https://cdn.meshy.ai/m.glb' },
    thumbnail_url: 'https://cdn.meshy.ai/m.png',
    texture_urls: [{ base_color: 'https://cdn.meshy.ai/tex.png' }],
    task_error: opts.pollStatus === 'FAILED' ? { message: 'boom' } : null,
  };

  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname;
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    hits.push({ method, path, body });
    if (opts.status && opts.status >= 400) return json({ error: { message: 'http boom' } }, opts.status);
    if (path === '/openapi/v1/balance') return json({ balance: 686 });
    if (method === 'POST') {
      const isV1 = path.includes('/v1/');
      return json(isV1 ? { id: TASK } : { result: TASK });
    }
    return json(success); // GET poll
  };

  const downloadImpl = async (url: string): Promise<Uint8Array> => {
    downloads.push(url);
    return new TextEncoder().encode(url);
  };

  const provider = new MeshyProvider({ env, slug: 'smoke', fetchImpl, downloadImpl, sleep: async () => {} });
  return { provider, hits, downloads };
}

test('text + lowpoly: preview payload omits ai_model / remesh; returns mesh + preview', async () => {
  const { provider, hits } = makeProvider();
  const res = await provider.generate({ mode: 'text', prompt: 'a barrel', modelType: 'lowpoly', targetPolycount: 8000 });

  const submit = hits.find((h) => h.method === 'POST')!;
  expect(submit.path).toBe('/openapi/v2/text-to-3d');
  expect(submit.body).toEqual({ mode: 'preview', prompt: 'a barrel', model_type: 'lowpoly' });

  expect(res.provider).toBe('meshy');
  expect(res.mode).toBe('text');
  expect(res.providerMode).toBe('real');
  expect(res.sourceJobId).toBe(TASK);
  const roles = res.files.map((f) => `${f.role}:${f.format}`);
  expect(roles).toContain('source_mesh:glb');
  expect(roles).toContain('preview_image:png');
});

test('text + standard: attaches ai_model + should_remesh + clamped target_polycount', async () => {
  const { provider, hits } = makeProvider();
  await provider.generate({ mode: 'text', prompt: 'a sword', modelType: 'standard', aiModel: 'meshy-6', targetPolycount: 8000 });
  const submit = hits.find((h) => h.method === 'POST')!;
  expect(submit.body).toEqual({
    mode: 'preview',
    prompt: 'a sword',
    model_type: 'standard',
    ai_model: 'meshy-6',
    should_remesh: true,
    target_polycount: clampTargetPolycount(8000),
  });
});

test('text + params: provider forwards allowlisted params (symmetry); topology implies should_remesh', async () => {
  const { provider, hits } = makeProvider();
  await provider.generate({ mode: 'text', prompt: 'a gem', modelType: 'lowpoly', params: { symmetry_mode: 'on', topology: 'quad' } });
  const submit = hits.find((h) => h.method === 'POST')!;
  expect(submit.body).toMatchObject({ model_type: 'lowpoly', symmetry_mode: 'on', topology: 'quad', should_remesh: true });
});

test('image: posts v1 image-to-3d with image_url + enable_pbr; reads task id from `id`', async () => {
  const { provider, hits } = makeProvider();
  const res = await provider.generate({ mode: 'image', imageUrl: 'https://x/y.png', modelType: 'lowpoly', enablePbr: true });
  const submit = hits.find((h) => h.method === 'POST')!;
  expect(submit.path).toBe('/openapi/v1/image-to-3d');
  expect(submit.body).toMatchObject({ image_url: 'https://x/y.png', model_type: 'lowpoly', enable_pbr: true });
  expect(res.sourceJobId).toBe(TASK);
});

test('views: posts v1 multi-image-to-3d with capped image_urls', async () => {
  const { provider, hits } = makeProvider();
  await provider.generate({ mode: 'views', imageUrls: ['a', 'b', 'c', 'd', 'e'], modelType: 'lowpoly' });
  const submit = hits.find((h) => h.method === 'POST')!;
  expect(submit.path).toBe('/openapi/v1/multi-image-to-3d');
  expect(submit.body).toMatchObject({ image_urls: ['a', 'b', 'c', 'd'], model_type: 'lowpoly' });
});

test('remesh: target_formats glb + input_task_id + topology + clamped polycount', async () => {
  const { provider, hits } = makeProvider();
  const res = await provider.remesh({ inputTaskId: 'prev-1', targetPolycount: 4000, topology: 'quad' });
  const submit = hits.find((h) => h.method === 'POST')!;
  expect(submit.path).toBe('/openapi/v1/remesh');
  expect(submit.body).toEqual({
    target_formats: ['glb'],
    input_task_id: 'prev-1',
    topology: 'quad',
    target_polycount: clampTargetPolycount(4000),
  });
  expect(res.mode).toBe('remesh');
});

test('retexture: text style + enable_pbr via input_task_id', async () => {
  const { provider, hits } = makeProvider();
  const res = await provider.retexture({ inputTaskId: 'prev-2', textStylePrompt: 'rusty iron', enablePbr: true });
  const submit = hits.find((h) => h.method === 'POST')!;
  expect(submit.path).toBe('/openapi/v1/retexture');
  expect(submit.body).toEqual({
    target_formats: ['glb'],
    input_task_id: 'prev-2',
    text_style_prompt: 'rusty iron',
    enable_pbr: true,
  });
  expect(res.mode).toBe('retexture');
});

test('getBalance reads /openapi/v1/balance', async () => {
  const { provider } = makeProvider();
  expect(await provider.getBalance()).toBe(686);
});

test('poll FAILED → provider_failed', async () => {
  const { provider } = makeProvider({ pollStatus: 'FAILED' });
  await expect(provider.generate({ mode: 'text', prompt: 'x', modelType: 'lowpoly' })).rejects.toMatchObject({
    code: 'provider_failed',
  });
});

test('HTTP 402 on submit → provider_insufficient_credits', async () => {
  const { provider } = makeProvider({ status: 402 });
  await expect(provider.generate({ mode: 'text', prompt: 'x', modelType: 'lowpoly' })).rejects.toMatchObject({
    code: 'provider_insufficient_credits',
    status: 402,
  });
});

test('remesh without input rejects invalid_remesh_input (no network)', async () => {
  const { provider, hits } = makeProvider();
  await expect(provider.remesh({ targetPolycount: 4000 })).rejects.toMatchObject({ code: 'invalid_remesh_input' });
  expect(hits).toHaveLength(0);
});
