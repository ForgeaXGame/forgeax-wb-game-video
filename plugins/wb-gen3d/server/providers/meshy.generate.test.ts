// Meshy generate() smoke — end-to-end proof that a textured result's
// preview_image is the real render (preview.png), not a black texture map.
// Injected fetch + download → zero network, zero credits.

import { test, expect } from 'bun:test';
import { MeshyProvider } from './meshy';
import type { MeshyEnv } from '../env';

const env: MeshyEnv = {
  apiKey: 'litellm_test_key',
  baseUrl: 'https://llm-proxy.forgeax.com',
  defaultPolycount: 30000,
  pollIntervalMs: 0,
  pollTimeoutMs: 5000,
  rateLimitPerMin: 100,
};

const TASK = 'three_d_task_test';
const OUT = 'https://assets.meshy.ai/acct/tasks/019f2163/output';

// Real gateway shape: every non-mesh PNG is tagged type:'preview'.
const TASK_RESP = {
  id: TASK,
  object: '3d.generation',
  status: 'succeeded',
  progress: 100,
  error: null,
  data: [
    { url: `${OUT}/model.glb`, type: 'mesh', format: 'glb' },
    { url: `${OUT}/preview.png`, type: 'preview', format: 'png' },
    { url: `${OUT}/texture_0.png`, type: 'preview', format: 'png' },
    { url: `${OUT}/texture_0_emission.png`, type: 'preview', format: 'png' },
  ],
};

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

function makeProvider() {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname;
    if (method === 'POST' && path === '/v1/3d/generations') {
      return json({ id: TASK, object: '3d.generation', status: 'processing' });
    }
    if (method === 'GET' && path.includes(TASK)) return json(TASK_RESP);
    return json({ error: { message: `unexpected ${method} ${path}` } }, 500);
  };

  // Return the url as bytes so we can assert which url each file was built from.
  const downloadImpl = async (url: string): Promise<Uint8Array> => new TextEncoder().encode(url);

  return new MeshyProvider({ env, slug: 'smoke', fetchImpl, downloadImpl, sleep: async () => {} });
}

test('image generate(): preview_image is preview.png, never the emission map', async () => {
  const result = await makeProvider().generate({ mode: 'image', imageUrl: 'https://cos.example/in.png' });

  const preview = result.files.find((f) => f.role === 'preview_image');
  expect(preview).toBeDefined();
  expect(decode(preview!.data)).toBe(`${OUT}/preview.png`);
  expect(decode(preview!.data)).not.toContain('emission');

  const mesh = result.files.find((f) => f.role === 'source_mesh' && f.format === 'glb');
  expect(mesh && decode(mesh.data)).toBe(`${OUT}/model.glb`);

  // base_color texture sidefile is now recovered (was starved by the bug).
  const texture = result.files.find((f) => f.role === 'texture');
  expect(texture && decode(texture.data)).toBe(`${OUT}/texture_0.png`);
});
