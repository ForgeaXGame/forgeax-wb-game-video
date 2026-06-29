// Balance pre-check guardrail for paid Meshy rig/motion (ADR-0006 / ADR-0008 D-E).
// Two layers: (1) pure helper, both branches, zero deps; (2) one wired integration
// test driving the REAL Meshy path with a stubbed global fetch (zero network) —
// an insufficient balance MUST reject with provider_insufficient_credits BEFORE
// any /rigging or /animations call is dispatched (no spend, no state change).

import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PerGameAssetStore } from './per-game-store';
import { assertMeshyBalance, MESHY_ANIM_COST, MESHY_RIG_COST, tools } from './tool-handlers';

// ── (1) Pure helper ─────────────────────────────────────────────────────────
test('assertMeshyBalance resolves when balance ≥ needed (incl. exact equality)', async () => {
  await expect(assertMeshyBalance({ getBalance: async () => 10 }, 5, 'auto-rig')).resolves.toBeUndefined();
  await expect(assertMeshyBalance({ getBalance: async () => 5 }, 5, 'auto-rig')).resolves.toBeUndefined();
});

test('assertMeshyBalance rejects provider_insufficient_credits with a quote when balance < needed', async () => {
  await expect(assertMeshyBalance({ getBalance: async () => 2 }, 5, 'auto-rig')).rejects.toMatchObject({
    code: 'provider_insufficient_credits',
    needed: 5,
    balance: 2,
  });
});

// ── (2) Wired integration: real Meshy path, stubbed fetch, zero network ──────
const SLUG = 'balance-guard';
let root: string;
let realFetch: typeof fetch;
let balance = 0;
let nonBalanceCalls: string[] = [];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'wbgen3d-bal-'));
  process.env.FORGEAX_PROJECT_ROOT = root;
  // Force the REAL Meshy path: getMeshyEnv needs the gate + a key. loadPluginEnvOnce
  // never overrides values already in process.env, so these win over any local .env.
  process.env.GEN3D_ENABLE_REAL_PROVIDERS = '1';
  process.env.MESHY_API_KEY = 'msy_test_balance_guard';
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith('/openapi/v1/balance')) {
      return new Response(JSON.stringify({ balance }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    // Any other endpoint = a paid call we should never have reached.
    nonBalanceCalls.push(u);
    throw new Error(`unexpected paid fetch in balance-guard test: ${u}`);
  }) as typeof fetch;
});

afterEach(() => {
  nonBalanceCalls = [];
});

afterAll(() => {
  globalThis.fetch = realFetch;
  process.env.GEN3D_ENABLE_REAL_PROVIDERS = '0';
  delete process.env.MESHY_API_KEY;
  if (root) rmSync(root, { recursive: true, force: true });
});

async function seedCharacter(name: string): Promise<string> {
  // Deterministic mock generator — no remote calls even under the real gate.
  const res = await tools['gen3d:generate-meshy-text-mock']({
    slug: SLUG,
    assetSlot: 'characters',
    assetName: name,
    prompt: `a ${name}`,
  });
  return res.manifest.assetPath;
}

test('auto-rig: insufficient balance rejects before any /rigging call (no spend)', async () => {
  const assetPath = await seedCharacter('hero');
  balance = MESHY_RIG_COST - 1; // 4 < 5
  await expect(tools['gen3d:auto-rig']({ slug: SLUG, assetPath })).rejects.toMatchObject({
    code: 'provider_insufficient_credits',
    needed: MESHY_RIG_COST,
  });
  expect(nonBalanceCalls).toEqual([]); // short-circuited before the paid endpoint
  const asset = await new PerGameAssetStore().getAsset(SLUG, assetPath);
  expect(asset?.readiness.rigged).toBe(false); // state unchanged
});

test('apply-motion: insufficient balance rejects before any /animations call', async () => {
  const store = new PerGameAssetStore();
  const assetPath = await seedCharacter('mage');
  // Seed a NON-stale Meshy rig chain so apply-motion takes the Meshy paid path and
  // needs only the animation cost (no re-rig on top).
  await store.appendDerivedFiles({
    slug: SLUG,
    assetPath,
    files: [{ data: new TextEncoder().encode('rig'), format: 'fbx', role: 'rigged_model' }],
    skeleton: { hasSkeleton: true, skeletonProfile: 'humanoid', animationInputReady: true },
    rigChain: {
      rigProvider: 'meshy',
      rigTaskId: 'rig-real-123',
      rigType: 'style',
      rigExpiresAt: Date.now() + 86_400_000,
    },
  });
  balance = MESHY_ANIM_COST - 1; // 2 < 3
  await expect(tools['gen3d:apply-motion']({ slug: SLUG, assetPath, actionId: 28 })).rejects.toMatchObject({
    code: 'provider_insufficient_credits',
    needed: MESHY_ANIM_COST,
  });
  expect(nonBalanceCalls).toEqual([]); // short-circuited before the paid endpoint
});
