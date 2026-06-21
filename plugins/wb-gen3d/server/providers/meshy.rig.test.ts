// Meshy rig/animate provider smoke (ADR-0006 / PLAN §9). Injected fetch +
// download → zero network, zero credits. The fixtures mirror the real result
// keys observed in PLAN §7 (committed here so the smoke never depends on /tmp).

import { test, expect } from 'bun:test';
import { MeshyProvider, type MeshyAnimateResult, type MeshyRigResult } from './meshy';
import type { MeshyEnv } from '../env';

const env: MeshyEnv = {
  apiKey: 'msy_test_key',
  baseUrl: 'https://api.meshy.ai',
  defaultPolycount: 30000,
  pollIntervalMs: 0,
  pollTimeoutMs: 5000,
  rateLimitPerMin: 100,
};

// Real result keys (PLAN §2.3 / §7). expires_at ≈ created_at + 3 days.
const RIG_TASK_ID = '019ee8f9-1c43-72ef-b148-c43b0e9258a4';
const ANIM_TASK_ID = '019ee8f9-c01d-71f4-928c-aee0a8026c09';
const RIG_POLL = {
  id: RIG_TASK_ID,
  type: 'rig',
  status: 'SUCCEEDED',
  progress: 100,
  created_at: 1782025106841,
  expires_at: 1782284329948,
  task_error: null,
  result: {
    rigged_character_glb_url: 'https://cdn.meshy.ai/rig.glb',
    rigged_character_fbx_url: 'https://cdn.meshy.ai/rig.fbx',
    rig_type: 'style_02',
    basic_animations: {
      walking_glb_url: 'https://cdn.meshy.ai/walk.glb',
      walking_fbx_url: 'https://cdn.meshy.ai/walk.fbx',
      walking_armature_glb_url: 'https://cdn.meshy.ai/walk.armature.glb',
      running_glb_url: 'https://cdn.meshy.ai/run.glb',
      running_fbx_url: 'https://cdn.meshy.ai/run.fbx',
      running_armature_glb_url: 'https://cdn.meshy.ai/run.armature.glb',
    },
  },
  consumed_credits: 5,
};
const ANIM_POLL = {
  id: ANIM_TASK_ID,
  type: 'animate',
  status: 'SUCCEEDED',
  expires_at: 1782284329948,
  task_error: null,
  result: {
    animation_glb_url: 'https://cdn.meshy.ai/anim.glb',
    animation_fbx_url: 'https://cdn.meshy.ai/anim.fbx',
  },
};

interface Hit {
  method: string;
  path: string;
  body: unknown;
}

// A scripted Meshy backend. Records every request and returns the fixtures by
// (method, pathname). `status` lets a test force an HTTP error.
function makeProvider(opts: { status?: number } = {}) {
  const hits: Hit[] = [];
  const downloads: string[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    hits.push({ method, path, body });
    if (opts.status && opts.status >= 400) return json({ error: { message: 'boom' } }, opts.status);

    if (method === 'POST' && path === '/openapi/v1/rigging') return json({ result: RIG_TASK_ID });
    if (method === 'GET' && path === `/openapi/v1/rigging/${RIG_TASK_ID}`) return json(RIG_POLL);
    if (method === 'POST' && path === '/openapi/v1/animations') return json({ result: ANIM_TASK_ID });
    if (method === 'GET' && path === `/openapi/v1/animations/${ANIM_TASK_ID}`) return json(ANIM_POLL);
    if (method === 'GET' && path === `/openapi/v1/animations/${RIG_TASK_ID}/actions`) {
      return json({ data: [{ id: 28, name: 'Big Wave Hello', category: 'gesture', rig_type: 'style_02', is_free: true }] });
    }
    if (method === 'GET' && path === '/web/public/animations/resources') {
      return json([
        { id: 28, name: 'Big Wave Hello', category: 'gesture', rigType: 'style_02', isFree: true },
        { id: 101, name: 'Walk', category: 'locomotion', rigType: 'style_02', isFree: true },
      ]);
    }
    if (method === 'GET' && path === '/openapi/v1/balance') return json({ balance: 686 });
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

test('rig(): submit→poll→download with the right path/payload + result keys (PLAN §7)', async () => {
  const { provider, hits, downloads } = makeProvider();
  const rig: MeshyRigResult = await provider.rig({ modelUrl: 'https://cos.example/model.glb' });

  const submits = hits.filter((h) => h.method === 'POST' && h.path === '/openapi/v1/rigging');
  expect(submits.length).toBe(1);
  expect(submits[0].body).toEqual({ model_url: 'https://cos.example/model.glb' });

  expect(rig.sourceJobId).toBe(RIG_TASK_ID);
  expect(rig.rigType).toBe('style_02');
  expect(rig.expiresAt).toBe(1782284329948);
  expect(decode(rig.glb)).toBe('https://cdn.meshy.ai/rig.glb');
  expect(rig.fbx && decode(rig.fbx)).toBe('https://cdn.meshy.ai/rig.fbx');

  // Free walk + run, each glb + fbx (armature is intentionally not downloaded).
  expect(rig.basicAnimations.map((b) => b.category)).toEqual(['walking', 'running']);
  expect(decode(rig.basicAnimations[0].glb)).toBe('https://cdn.meshy.ai/walk.glb');
  expect(downloads).not.toContain('https://cdn.meshy.ai/walk.armature.glb');
});

test('rig(): inputTaskId fast path sends input_task_id, not model_url', async () => {
  const { provider, hits } = makeProvider();
  await provider.rig({ inputTaskId: 'mesh-task-9' });
  const submit = hits.find((h) => h.method === 'POST' && h.path === '/openapi/v1/rigging');
  expect(submit?.body).toEqual({ input_task_id: 'mesh-task-9' });
});

test('rig(): rejects empty input before any network call', async () => {
  const { provider, hits } = makeProvider();
  await expect(provider.rig({})).rejects.toMatchObject({ code: 'invalid_rig_input' });
  expect(hits.length).toBe(0);
});

test('animate(): drives rig_task_id + action_id and extracts the animation glb', async () => {
  const { provider, hits } = makeProvider();
  const anim: MeshyAnimateResult = await provider.animate({ rigTaskId: RIG_TASK_ID, actionId: 28 });
  const submit = hits.find((h) => h.method === 'POST' && h.path === '/openapi/v1/animations');
  expect(submit?.body).toEqual({ rig_task_id: RIG_TASK_ID, action_id: 28 });
  expect(anim.sourceJobId).toBe(ANIM_TASK_ID);
  expect(decode(anim.glb)).toBe('https://cdn.meshy.ai/anim.glb');
  expect(anim.fbx && decode(anim.fbx)).toBe('https://cdn.meshy.ai/anim.fbx');
});

test('full rig→animate chain runs with exactly two submits (one rig + one anim)', async () => {
  const { provider, hits } = makeProvider();
  const rig = await provider.rig({ modelUrl: 'https://cos.example/model.glb' });
  await provider.animate({ rigTaskId: rig.sourceJobId, actionId: 28 });
  const submits = hits.filter((h) => h.method === 'POST');
  expect(submits.map((s) => s.path)).toEqual(['/openapi/v1/rigging', '/openapi/v1/animations']);
});

test('listActions(): per-rig + public catalog both parse tolerant shapes', async () => {
  const { provider, hits } = makeProvider();
  const perRig = await provider.listActions(RIG_TASK_ID);
  expect(perRig).toEqual([
    { id: 28, name: 'Big Wave Hello', category: 'gesture', rigType: 'style_02', isFree: true, previewGifUrl: null },
  ]);
  const pub = await provider.listActions();
  expect(pub.map((a) => a.id)).toEqual([28, 101]);
  expect(hits.some((h) => h.path === '/web/public/animations/resources')).toBe(true);
});

test('getBalance() reads the numeric balance', async () => {
  const { provider } = makeProvider();
  expect(await provider.getBalance()).toBe(686);
});

test('402 maps to provider_insufficient_credits (PLAN §6 error semantics)', async () => {
  const { provider } = makeProvider({ status: 402 });
  await expect(provider.rig({ modelUrl: 'https://cos.example/m.glb' })).rejects.toMatchObject({
    code: 'provider_insufficient_credits',
    status: 402,
  });
});

test('429 maps to provider_rate_limited', async () => {
  const { provider } = makeProvider({ status: 429 });
  await expect(provider.animate({ rigTaskId: RIG_TASK_ID, actionId: 28 })).rejects.toMatchObject({
    code: 'provider_rate_limited',
  });
});
