// precise-lowpoly pipeline smoke — injected fetch/download (zero network, zero
// credits). Asserts the 3-stage chain fires the right Meshy submits in order
// with the right params (standard generate → remesh 1500 triangle → PBR
// retexture), that the task ids chain stage-to-stage, that the result is tagged
// with the ORIGINAL mode/prompt and carries the full PBR set, and that PBR-off
// skips the retexture stage.
//
// (Real-Meshy acceptance of the task-id chaining is validated in the post-T2 e2e
// batch — PLAN §9.)

import { expect, test } from 'bun:test';
import { MeshyProvider } from './providers/meshy';
import { producePreciseLowpoly } from './pipeline';
import { clampTargetPolycount } from '../shared/catalog';
import type { MeshyEnv } from './env';

const env: MeshyEnv = {
  apiKey: 'msy_test_key',
  baseUrl: 'https://api.meshy.ai',
  defaultPolycount: 6000,
  pollIntervalMs: 0,
  pollTimeoutMs: 5000,
  rateLimitPerMin: 1000,
};

const FULL_TEXTURE_SET: Record<string, string> = {
  base_color: 'https://cdn.meshy.ai/tex-base.png',
  metallic: 'https://cdn.meshy.ai/tex-metal.png',
  roughness: 'https://cdn.meshy.ai/tex-rough.png',
  normal: 'https://cdn.meshy.ai/tex-normal.png',
};

interface Hit {
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
}

// Distinct task ids per stage so a test can assert the chaining (generate task →
// remesh input; remesh task → retexture input).
function makeProvider() {
  const hits: Hit[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const success = {
    status: 'SUCCEEDED',
    model_urls: { glb: 'https://cdn.meshy.ai/m.glb' },
    thumbnail_url: 'https://cdn.meshy.ai/m.png',
    texture_urls: [FULL_TEXTURE_SET],
    task_error: null,
  };

  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname;
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    hits.push({ method, path, body });
    if (method === 'POST') {
      if (path.includes('/remesh')) return json({ result: 'remesh-task' });
      if (path.includes('/retexture')) return json({ result: 'retex-task' });
      const isV1 = path.includes('/v1/');
      return json(isV1 ? { id: 'gen-task' } : { result: 'gen-task' });
    }
    return json(success); // GET poll
  };

  const downloadImpl = async (url: string): Promise<Uint8Array> => new TextEncoder().encode(url);
  const provider = new MeshyProvider({ env, slug: 'smoke', fetchImpl, downloadImpl, sleep: async () => {} });
  return { provider, hits };
}

const submits = (hits: Hit[]) => hits.filter((h) => h.method === 'POST');

test('image precise-lowpoly: standard generate → remesh(1500, triangle) → PBR retexture, chained', async () => {
  const { provider, hits } = makeProvider();
  const res = await producePreciseLowpoly(provider, {
    mode: 'image',
    imageUrl: 'https://x/y.png',
    enablePbr: true,
    targetPolycount: 1500,
    aiModel: 'meshy-6',
  });

  const posts = submits(hits);
  expect(posts.map((h) => h.path)).toEqual([
    '/openapi/v1/image-to-3d',
    '/openapi/v1/remesh',
    '/openapi/v1/retexture',
  ]);

  // [1] standard geometry, no PBR yet.
  expect(posts[0].body).toMatchObject({ image_url: 'https://x/y.png', model_type: 'standard', ai_model: 'meshy-6', enable_pbr: false });
  // [2] remesh the generate task to the low-poly triangle budget.
  expect(posts[1].body).toEqual({
    target_formats: ['glb'],
    input_task_id: 'gen-task',
    topology: 'triangle',
    target_polycount: clampTargetPolycount(1500),
  });
  // [3] retexture the remesh task for PBR, style = the reference image.
  expect(posts[2].body).toMatchObject({
    input_task_id: 'remesh-task',
    image_style_url: 'https://x/y.png',
    enable_pbr: true,
    ai_model: 'meshy-6',
  });

  // Result keeps the ORIGINAL mode + carries the full PBR set from the final stage.
  expect(res.mode).toBe('image');
  expect(res.files.filter((f) => f.role === 'texture').map((f) => f.textureKind).sort()).toEqual([
    'base_color',
    'metallic',
    'normal',
    'roughness',
  ]);
});

test('text precise-lowpoly: preview(standard) → remesh → retexture(text style)', async () => {
  const { provider, hits } = makeProvider();
  const res = await producePreciseLowpoly(provider, {
    mode: 'text',
    prompt: 'a wooden barrel',
    enablePbr: true,
    targetPolycount: 1500,
  });

  const posts = submits(hits);
  expect(posts.map((h) => h.path)).toEqual([
    '/openapi/v2/text-to-3d',
    '/openapi/v1/remesh',
    '/openapi/v1/retexture',
  ]);
  // Text stage [1] is the preview (geometry only); no target_polycount/remesh here.
  expect(posts[0].body).toEqual({ mode: 'preview', prompt: 'a wooden barrel', model_type: 'standard' });
  expect(posts[2].body).toMatchObject({ input_task_id: 'remesh-task', text_style_prompt: 'a wooden barrel', enable_pbr: true });
  expect(res.mode).toBe('text');
  expect(res.prompt).toBe('a wooden barrel');
});

test('precise-lowpoly with PBR off: stops after remesh (no retexture stage)', async () => {
  const { provider, hits } = makeProvider();
  const res = await producePreciseLowpoly(provider, {
    mode: 'image',
    imageUrl: 'https://x/y.png',
    enablePbr: false,
    targetPolycount: 1000,
  });

  const posts = submits(hits);
  expect(posts.map((h) => h.path)).toEqual(['/openapi/v1/image-to-3d', '/openapi/v1/remesh']);
  expect(posts[1].body).toMatchObject({ target_polycount: clampTargetPolycount(1000), topology: 'triangle' });
  expect(res.mode).toBe('image');
});
