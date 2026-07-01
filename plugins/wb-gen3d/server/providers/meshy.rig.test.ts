// Meshy rig/animate provider smoke — LiteLLM gateway edition.
// Injected fetch + download → zero network, zero credits. Fixtures mirror the
// gateway response format: data[] with {url, type, format} entries.

import { test, expect } from 'bun:test';
import { MeshyProvider, type MeshyAnimateResult, type MeshyRigResult } from './meshy';
import type { MeshyEnv } from '../env';
import { MESHY_ACTION_BASE } from '../../shared/meshy-actions';

const env: MeshyEnv = {
  apiKey: 'litellm_test_key',
  baseUrl: 'https://llm-proxy.forgeax.com',
  defaultPolycount: 30000,
  pollIntervalMs: 0,
  pollTimeoutMs: 5000,
  rateLimitPerMin: 100,
};

const GATEWAY_SUBMIT = '/v1/3d/generations';
const GATEWAY_POLL = '/v1/3d/tasks';

const RIG_TASK_ID = 'three_d_rig_task';
const ANIM_TASK_ID = 'three_d_anim_task';

// Gateway response shapes for rig/animate.
const RIG_RESP = {
  id: RIG_TASK_ID,
  object: '3d.generation',
  status: 'succeeded',
  progress: 100,
  data: [
    { url: 'https://cdn.meshy.ai/rig.glb', type: 'mesh', format: 'glb' },
    { url: 'https://cdn.meshy.ai/rig.fbx', type: 'mesh', format: 'fbx' },
  ],
  error: null,
};

const ANIM_RESP = {
  id: ANIM_TASK_ID,
  object: '3d.generation',
  status: 'succeeded',
  progress: 100,
  data: [
    { url: 'https://cdn.meshy.ai/anim.glb', type: 'mesh', format: 'glb' },
    { url: 'https://cdn.meshy.ai/anim.fbx', type: 'mesh', format: 'fbx' },
  ],
  error: null,
};

interface Hit {
  method: string;
  path: string;
  body: unknown;
}

function makeProvider() {
  const hits: Hit[] = [];
  const downloads: string[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    hits.push({ method, path, body });

    if (method === 'POST' && path === '/v1/3d/generations') {
      const model = (body as Record<string, unknown>)?.model;
      const taskId = model === 'meshy-3d-animation' ? ANIM_TASK_ID : RIG_TASK_ID;
      return json({ id: taskId, object: '3d.generation', status: 'processing' });
    }
    if (method === 'GET' && path.includes(RIG_TASK_ID)) return json(RIG_RESP);
    if (method === 'GET' && path.includes(ANIM_TASK_ID)) return json(ANIM_RESP);
    return json({ error: { message: `unexpected ${method} ${path}` } }, 500);
  };

  const downloadImpl = async (url: string): Promise<Uint8Array> => {
    downloads.push(url);
    return new TextEncoder().encode(url);
  };

  const provider = new MeshyProvider({ env, slug: 'smoke', fetchImpl, downloadImpl, sleep: async () => {} });
  return { provider, hits, downloads };
}

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

test('rig(): submit→poll→download via gateway with correct payload + result keys', async () => {
  const { provider, hits, downloads } = makeProvider();
  const rig: MeshyRigResult = await provider.rig({ modelUrl: 'https://cos.example/model.glb' });

  const submits = hits.filter((h) => h.method === 'POST' && h.path === '/v1/3d/generations');
  expect(submits.length).toBe(1);
  expect(submits[0].body).toEqual({ model: 'meshy-3d-auto-rigging', model_url: 'https://cos.example/model.glb' });

  const polls = hits.filter((h) => h.method === 'GET');
  expect(polls.length).toBeGreaterThanOrEqual(1);
  expect(polls[0].path).toBe(`${GATEWAY_POLL}/${RIG_TASK_ID}`);

  expect(rig.sourceJobId).toBe(RIG_TASK_ID);
  // Gateway does NOT return rig_type / expires_at / basic_animations.
  expect(rig.rigType).toBeNull();
  expect(rig.expiresAt).toBeNull();
  expect(rig.basicAnimations).toEqual([]);
  expect(decode(rig.glb)).toBe('https://cdn.meshy.ai/rig.glb');
  expect(rig.fbx && decode(rig.fbx)).toBe('https://cdn.meshy.ai/rig.fbx');
});

test('rig(): inputTaskId fast path sends input_task_id, not model_url', async () => {
  const { provider, hits } = makeProvider();
  await provider.rig({ inputTaskId: 'mesh-task-9' });
  const submit = hits.find((h) => h.method === 'POST' && h.path === '/v1/3d/generations');
  expect(submit?.body).toEqual({ model: 'meshy-3d-auto-rigging', input_task_id: 'mesh-task-9' });
});

test('rig(): rejects empty input before any network call', async () => {
  const { provider, hits } = makeProvider();
  await expect(provider.rig({})).rejects.toMatchObject({ code: 'invalid_rig_input' });
  expect(hits.length).toBe(0);
});

test('animate(): drives rig_task_id + action_id and extracts the animation glb', async () => {
  const { provider, hits } = makeProvider();
  const anim: MeshyAnimateResult = await provider.animate({ rigTaskId: RIG_TASK_ID, actionId: 28 });
  const submit = hits.find((h) => h.method === 'POST' && h.path === '/v1/3d/generations');
  expect(submit?.body).toEqual({ model: 'meshy-3d-animation', rig_task_id: RIG_TASK_ID, action_id: 28 });
  expect(anim.sourceJobId).toBe(ANIM_TASK_ID);
  const animPolls = hits.filter((h) => h.method === 'GET');
  expect(animPolls.length).toBeGreaterThanOrEqual(1);
  expect(animPolls[0].path).toBe(`${GATEWAY_POLL}/${ANIM_TASK_ID}`);
  expect(decode(anim.glb)).toBe('https://cdn.meshy.ai/anim.glb');
  expect(anim.fbx && decode(anim.fbx)).toBe('https://cdn.meshy.ai/anim.fbx');
});

test('full rig→animate chain runs with exactly two submits', async () => {
  const { provider, hits } = makeProvider();
  const rig = await provider.rig({ modelUrl: 'https://cos.example/model.glb' });
  await provider.animate({ rigTaskId: rig.sourceJobId, actionId: 28 });
  const submits = hits.filter((h) => h.method === 'POST');
  expect(submits.map((s) => s.path)).toEqual(['/v1/3d/generations', '/v1/3d/generations']);
});

test('listActions(): returns the vendored static catalog without a network call', async () => {
  const { provider, hits } = makeProvider();
  const pub = await provider.listActions();
  expect(pub.length).toBeGreaterThan(600);
  expect(pub.every((a) => typeof a.id === 'number')).toBe(true);
  const bigWave = pub.find((a) => a.id === 28);
  expect(bigWave).toMatchObject({ id: 28, name: 'Big_Wave_Hello', category: 'DailyActions' });
  expect(bigWave?.previewGifUrl?.startsWith(MESHY_ACTION_BASE)).toBe(true);
  expect(hits.length).toBe(0);
});

test('getBalance() returns null (gateway has no balance endpoint)', async () => {
  const { provider } = makeProvider();
  expect(await provider.getBalance()).toBeNull();
});

test('402 maps to provider_insufficient_credits', async () => {
  const { provider } = makeProvider();
  // Override fetch to return 402 for the next POST
  const orig = provider['fetchImpl'];
  provider['fetchImpl'] = async (url: string, init: RequestInit) =>
    new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 402, headers: { 'Content-Type': 'application/json' } });
  await expect(provider.rig({ modelUrl: 'https://cos.example/m.glb' })).rejects.toMatchObject({
    code: 'provider_insufficient_credits',
    status: 402,
  });
  provider['fetchImpl'] = orig;
});

test('429 maps to provider_rate_limited', async () => {
  const { provider } = makeProvider();
  const orig = provider['fetchImpl'];
  provider['fetchImpl'] = async (url: string, init: RequestInit) =>
    new Response(JSON.stringify({ error: { message: 'rate' } }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  await expect(provider.animate({ rigTaskId: ANIM_TASK_ID, actionId: 28 })).rejects.toMatchObject({
    code: 'provider_rate_limited',
  });
  provider['fetchImpl'] = orig;
});
