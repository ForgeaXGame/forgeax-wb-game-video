// MeshyProvider smoke — injected fetch + download → zero network, zero credits.
// Asserts the exact submit payloads (lowpoly is the default; standard attaches
// ai_model/should_remesh/target_polycount), the submit→poll→download flow, and
// the stable error mapping (failed task, HTTP 402 → insufficient credits).
//
// Wire shape: LiteLLM gateway /v1/3d/generations (submit) + /v1/3d/tasks/{id} (poll),
// data[] array response (not Meshy's model_urls dict).

import { expect, test } from 'bun:test';
import { MeshyProvider } from './meshy';
import { clampTargetPolycount } from '../../shared/catalog';
import type { MeshyEnv } from '../env';

const env: MeshyEnv = {
  apiKey: 'litellm_test_key',
  baseUrl: 'https://llm-proxy.forgeax.com',
  defaultPolycount: 6000,
  pollIntervalMs: 0,
  pollTimeoutMs: 5000,
  rateLimitPerMin: 1000,
};

const GATEWAY_SUBMIT = '/v1/3d/generations';
const GATEWAY_POLL = '/v1/3d/tasks';
const TASK = 'three_d_task_dGVzdC10YXNr';

interface Hit {
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
}

// A scripted LiteLLM gateway backend keyed by (method, pathname). Submit returns
// a gateway-style response with `id`; the poll GET returns a succeeded result
// with data[] array containing mesh + preview entries.
const FULL_TEXTURE_SET: Record<string, string> = {
  base_color: 'https://cdn.meshy.ai/tex-base.png',
  metallic: 'https://cdn.meshy.ai/tex-metal.png',
  roughness: 'https://cdn.meshy.ai/tex-rough.png',
  normal: 'https://cdn.meshy.ai/tex-normal.png',
  emission: 'https://cdn.meshy.ai/tex-emit.png',
};

function makeProvider(
  opts: { status?: number; pollStatus?: string; textureSet?: Record<string, string> } = {},
) {
  const hits: Hit[] = [];
  const downloads: string[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const textureUrls = opts.textureSet ?? FULL_TEXTURE_SET;
  const dataArray: Record<string, unknown>[] = [
    { url: 'https://cdn.meshy.ai/m.glb', type: 'mesh', format: 'glb' },
    { url: 'https://cdn.meshy.ai/m.png', type: 'preview', format: 'png' },
  ];
  for (const [kind, url] of Object.entries(textureUrls)) {
    dataArray.push({ url, type: 'texture', format: 'png', texture_kind: kind });
  }

  const success = {
    id: TASK,
    object: '3d.generation',
    status: opts.pollStatus ?? 'succeeded',
    model: 'meshy-3d-text',
    progress: 100,
    data: dataArray,
    error: opts.pollStatus === 'failed' ? { message: 'boom' } : null,
  };

  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname;
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    hits.push({ method, path, body });
    if (opts.status && opts.status >= 400) return json({ error: { message: 'http boom' } }, opts.status);
    if (method === 'POST') {
      return json({ id: TASK, object: '3d.generation', status: 'processing' });
    }
    if (path === `${GATEWAY_POLL}/${TASK}`) {
      return json(success); // GET poll
    }
    return json(success);
  };

  const downloadImpl = async (url: string): Promise<Uint8Array> => {
    downloads.push(url);
    return new TextEncoder().encode(url);
  };

  const provider = new MeshyProvider({ env, slug: 'smoke', fetchImpl, downloadImpl, sleep: async () => {} });
  return { provider, hits, downloads };
}

test('text + lowpoly: preview then auto-refine when enablePbr default', async () => {
  const { provider, hits } = makeProvider();
  const res = await provider.generate({ mode: 'text', prompt: 'a barrel', modelType: 'lowpoly', targetPolycount: 8000 });

  const submits = hits.filter((h) => h.method === 'POST');
  expect(submits).toHaveLength(2);
  expect(submits[0].body).toMatchObject({ model: 'meshy-3d-text', mode: 'preview', prompt: 'a barrel', model_type: 'lowpoly' });
  expect(submits[1].body).toMatchObject({ model: 'meshy-3d-text', mode: 'refine', preview_task_id: TASK, enable_pbr: true });

  const polls = hits.filter((h) => h.method === 'GET');
  expect(polls.length).toBeGreaterThanOrEqual(2);

  expect(res.provider).toBe('meshy');
  expect(res.mode).toBe('text');
  expect(res.providerMode).toBe('real');
  expect(res.sourceJobId).toBe(TASK);
  const roles = res.files.map((f) => `${f.role}:${f.format}`);
  expect(roles).toContain('source_mesh:glb');
  expect(roles).toContain('preview_image:png');
});

test('text + enablePbr false: preview only, no refine submit', async () => {
  const { provider, hits } = makeProvider();
  await provider.generate({ mode: 'text', prompt: 'a barrel', modelType: 'lowpoly', enablePbr: false });
  const submits = hits.filter((h) => h.method === 'POST');
  expect(submits).toHaveLength(1);
  expect(submits[0].body).toMatchObject({ mode: 'preview' });
});

test('text + standard: attaches ai_model + should_remesh + clamped target_polycount', async () => {
  const { provider, hits } = makeProvider();
  await provider.generate({ mode: 'text', prompt: 'a sword', modelType: 'standard', aiModel: 'meshy-6', targetPolycount: 8000 });
  const submit = hits.filter((h) => h.method === 'POST')[0]!;
  expect(submit.body).toMatchObject({
    model: 'meshy-3d-text',
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
  expect(submit.body).toMatchObject({ model: 'meshy-3d-text', model_type: 'lowpoly', symmetry_mode: 'on', topology: 'quad', should_remesh: true });
});

test('image: posts with model=meshy-3d-image + image_url + should_texture', async () => {
  const { provider, hits } = makeProvider();
  const res = await provider.generate({ mode: 'image', imageUrl: 'https://x/y.png', modelType: 'lowpoly', enablePbr: true });
  const submit = hits.find((h) => h.method === 'POST')!;
  expect(submit.path).toBe(GATEWAY_SUBMIT);
  expect(submit.body).toMatchObject({ model: 'meshy-3d-image', image_url: 'https://x/y.png', model_type: 'lowpoly', enable_pbr: true, should_texture: true });
  expect(res.sourceJobId).toBe(TASK);
});

test('captures the full PBR texture set (base_color + metallic + roughness + normal + emission)', async () => {
  const { provider, downloads } = makeProvider();
  const res = await provider.generate({ mode: 'image', imageUrl: 'https://x/y.png', enablePbr: true });
  const textures = res.files.filter((f) => f.role === 'texture');
  expect(textures.map((f) => f.textureKind).sort()).toEqual([
    'base_color',
    'emission',
    'metallic',
    'normal',
    'roughness',
  ]);
  // Each map's bytes are the download of its own URL, not a shared base_color.
  expect(downloads).toContain('https://cdn.meshy.ai/tex-metal.png');
  expect(downloads).toContain('https://cdn.meshy.ai/tex-normal.png');
  expect(downloads).toContain('https://cdn.meshy.ai/tex-emit.png');
});

test('captures only the PBR maps Meshy actually returns (skips absent)', async () => {
  const { provider } = makeProvider({
    textureSet: { base_color: 'https://cdn.meshy.ai/only-bc.png', metallic: 'https://cdn.meshy.ai/only-me.png' },
  });
  const res = await provider.generate({ mode: 'image', imageUrl: 'https://x/y.png', enablePbr: true });
  const textures = res.files.filter((f) => f.role === 'texture');
  expect(textures.map((f) => f.textureKind).sort()).toEqual(['base_color', 'metallic']);
});

test('views: posts with model=meshy-3d-multi-image + capped image_urls', async () => {
  const { provider, hits } = makeProvider();
  await provider.generate({ mode: 'views', imageUrls: ['a', 'b', 'c', 'd', 'e'], modelType: 'lowpoly' });
  const submit = hits.find((h) => h.method === 'POST')!;
  expect(submit.path).toBe(GATEWAY_SUBMIT);
  expect(submit.body).toMatchObject({ model: 'meshy-3d-multi-image', image_urls: ['a', 'b', 'c', 'd'], model_type: 'lowpoly' });
});

test('remesh: target_formats glb + input_task_id + topology + model=meshy-3d-remesh', async () => {
  const { provider, hits } = makeProvider();
  const res = await provider.remesh({ inputTaskId: 'prev-1', targetPolycount: 4000, topology: 'quad' });
  const submit = hits.find((h) => h.method === 'POST')!;
  expect(submit.path).toBe(GATEWAY_SUBMIT);
  expect(submit.body).toMatchObject({
    model: 'meshy-3d-remesh',
    target_formats: ['glb'],
    input_task_id: 'prev-1',
    topology: 'quad',
    target_polycount: clampTargetPolycount(4000),
  });
  expect(res.mode).toBe('remesh');
});

test('retexture: text style + enable_pbr via input_task_id + model=meshy-3d-retexture', async () => {
  const { provider, hits } = makeProvider();
  const res = await provider.retexture({ inputTaskId: 'prev-2', textStylePrompt: 'rusty iron', enablePbr: true });
  const submit = hits.find((h) => h.method === 'POST')!;
  expect(submit.path).toBe(GATEWAY_SUBMIT);
  expect(submit.body).toMatchObject({
    model: 'meshy-3d-retexture',
    target_formats: ['glb'],
    input_task_id: 'prev-2',
    text_style_prompt: 'rusty iron',
    enable_pbr: true,
  });
  expect(res.mode).toBe('retexture');
});

test('getBalance returns null (gateway has no balance endpoint)', async () => {
  const { provider } = makeProvider();
  expect(await provider.getBalance()).toBeNull();
});

test('poll failed → provider_failed', async () => {
  const { provider } = makeProvider({ pollStatus: 'failed' });
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
