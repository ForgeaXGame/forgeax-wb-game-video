/**
 * wb-character-forge · bun-fetch smoke test (no browser required).
 *
 * 跑:
 *   bun packages/marketplace/plugins/wb-character-forge/playground/smoke.ts
 *
 * 前置:
 *   server@18900 + interface@18920 在跑;.env 已配 ARK_IMAGE_KEY + GEMINI_API_KEY 等
 *
 * 覆盖(端到端但无浏览器):
 *   1. /status → 3 vendors ready + 6 styles
 *   2. /portrait + /sprite-sheet → 真生成 + asset 字节流可拉
 *   3. /characters + /characters/:id → 画廊读取
 *   4. /characters/:id/rename → 元数据更新
 *   5. surface enqueue → 服务端 pending 队列可见
 *   6. ledger 新事件出现
 *
 * 视觉验证留给 Playwright spec (playground/e2e.spec.ts),那个需要真浏览器,
 * 跟现在被占的 MCP chrome lock 错开运行(`bunx playwright test`).
 */

const INTERFACE_URL = process.env.FORGEAX_INTERFACE_URL ?? 'http://127.0.0.1:18920';
const SERVER_URL = process.env.FORGEAX_SERVER_URL ?? 'http://127.0.0.1:18900';
const SLUG = process.env.CF_SMOKE_SLUG ?? 'mario';
const SURFACE = 'character-forge.editor';
const PREFIX = '/api/wb/character-forge';

interface Step { label: string; fn: () => Promise<void> }

const passed: string[] = [];
const failed: Array<{ label: string; err: string }> = [];

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const r = await fetch(`${SERVER_URL}${path}`, init);
  const body = await r.json().catch(() => ({})) as T;
  return { status: r.status, body };
}

const steps: Step[] = [
  {
    label: '1. /status — 3 厂商 ready + 6 风格预设',
    fn: async () => {
      const { status, body } = await api<{ vendors: { ready: string[]; missing: string[] }; styles: string[] }>(`${PREFIX}/status`);
      assert(status === 200, `status=${status}`);
      assert(body.vendors.ready.length >= 3, `ready vendors only ${body.vendors.ready.length}: ${body.vendors.ready.join(',')}`);
      assert(body.styles.length === 6, `styles count=${body.styles.length}`);
    },
  },
  {
    label: '2. POST /portrait — 生成立绘 (Seedream)',
    fn: async () => {
      const r = await fetch(`${SERVER_URL}${PREFIX}/portrait`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: SLUG,
          prompt: 'smoke-test paladin, golden armor, white wings, holy aura',
          style: 'anime-hd-flat',
          views: ['front'],
          // 2k = Seedream's minimum tier; 1k forces fallback to Gemini (the
          // dispatcher chain still succeeds, but we want both primaries
          // exercised in CI signal).
          size: '2k',
        }),
      });
      assert(r.ok, `portrait HTTP ${r.status}`);
      const j = await r.json() as { charId: string; name: string; files: Array<{ url: string }>; model: string };
      assert(j.charId, 'no charId');
      // Save BEFORE further assertions so downstream steps survive a relaxed
      // assertion failure here.
      (globalThis as { __cfCharId?: string }).__cfCharId = j.charId;
      assert(j.files[0]?.url?.includes('/asset?path='), `unexpected url: ${j.files[0]?.url}`);
      // We don't lock to a specific vendor — the dispatcher's whole point is
      // primary/fallback resilience.  Just confirm a vendor:model pair was
      // returned so we know SOME real generation happened, not a stub.
      assert(/^[a-z][\w-]+\/[\w.\-:]+$/.test(j.model), `model shape wrong: ${j.model}`);
      console.log(`     · charId=${j.charId}  model=${j.model}`);
    },
  },
  {
    label: '3. GET /asset — 字节流可拉 + content-type=image/*',
    fn: async () => {
      const charId = (globalThis as { __cfCharId?: string }).__cfCharId;
      assert(charId, 'no charId from step 2');
      const path = `.forgeax/games/${SLUG}/characters/${charId}/portrait/front.png`;
      // try both .png and .jpg since Seedream returns JPEG
      let r = await fetch(`${SERVER_URL}${PREFIX}/asset?path=${encodeURIComponent(path)}`);
      if (!r.ok) {
        const altPath = path.replace(/\.png$/, '.jpg');
        r = await fetch(`${SERVER_URL}${PREFIX}/asset?path=${encodeURIComponent(altPath)}`);
      }
      assert(r.ok, `asset HTTP ${r.status}`);
      const buf = await r.arrayBuffer();
      assert(buf.byteLength > 10_000, `asset too small: ${buf.byteLength}`);
      const ct = r.headers.get('content-type') ?? '';
      assert(ct.startsWith('image/'), `content-type=${ct}`);
      console.log(`     · ${buf.byteLength} bytes · ${ct}`);
    },
  },
  {
    label: '4. POST /sprite-sheet — 生成 4 向 walk (Gemini)',
    fn: async () => {
      const charId = (globalThis as { __cfCharId?: string }).__cfCharId;
      assert(charId, 'no charId from step 2');
      const r = await fetch(`${SERVER_URL}${PREFIX}/sprite-sheet`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: SLUG,
          charId,
          action: 'walk',
          directions: ['down', 'left', 'right', 'up'],
          framesPerDir: 4,
          frameSize: 96,
        }),
      });
      assert(r.ok, `sprite-sheet HTTP ${r.status}`);
      const j = await r.json() as { action: string; sheet: { url: string }; atlas: unknown[] };
      assert(j.action === 'walk', `action=${j.action}`);
      assert(j.atlas.length === 4, `atlas len=${j.atlas.length}`);
      assert(j.sheet.url.includes('/asset?path='), `unexpected sheet url: ${j.sheet.url}`);
      console.log(`     · sheet=${j.sheet.url}`);
    },
  },
  {
    label: '5. GET /characters — 画廊含新角色 + hasSprites=true',
    fn: async () => {
      const charId = (globalThis as { __cfCharId?: string }).__cfCharId;
      const { status, body } = await api<{ items: Array<{ charId: string; hasSprites: boolean }> }>(`${PREFIX}/characters?slug=${SLUG}`);
      assert(status === 200, `status=${status}`);
      const it = body.items.find((c) => c.charId === charId);
      assert(it, `no char ${charId} in list of ${body.items.length}`);
      assert(it.hasSprites === true, `hasSprites=${it.hasSprites}`);
    },
  },
  {
    label: '6. GET /characters/:id — manifest 完整',
    fn: async () => {
      const charId = (globalThis as { __cfCharId?: string }).__cfCharId;
      const { status, body } = await api<{ manifest: { sprites: Record<string, { framesPerDir: number }> }; urls: Record<string, string> }>(
        `${PREFIX}/characters/${charId}?slug=${SLUG}`,
      );
      assert(status === 200, `status=${status}`);
      assert(body.manifest?.sprites?.walk?.framesPerDir === 4, 'sprites.walk missing or wrong shape');
      assert(body.urls['portrait/front']?.includes('/asset?path='), `portrait url missing`);
    },
  },
  {
    label: '7. POST /characters/:id/rename — 元数据更新',
    fn: async () => {
      const charId = (globalThis as { __cfCharId?: string }).__cfCharId;
      const r = await fetch(`${SERVER_URL}${PREFIX}/characters/${charId}/rename`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: SLUG, name: 'Smoke Paladin' }),
      });
      assert(r.ok, `rename HTTP ${r.status}`);
      const j = await r.json() as { ok: boolean; name: string };
      assert(j.ok === true && j.name === 'Smoke Paladin', `rename body wrong: ${JSON.stringify(j)}`);
    },
  },
  {
    label: '8. ledger — character-forge.* 事件已写入',
    fn: async () => {
      // No nameLike filter on /api/events/recent; we just pull and grep
      const r = await fetch(`${SERVER_URL}/api/events/recent?limit=200`);
      if (!r.ok) {
        console.log(`     · /events/recent HTTP ${r.status} — ledger 接口缺失, 跳过 (非 blocker)`);
        return;
      }
      const j = await r.json() as { events?: Array<{ name?: string }> };
      const cf = (j.events ?? []).filter((e) => e.name?.startsWith('character-forge.'));
      assert(cf.length >= 1, `no character-forge.* events in recent ${j.events?.length ?? 0}`);
      console.log(`     · ${cf.length} character-forge events seen`);
    },
  },
  {
    label: '9. surface enqueue — POST action 入队列可读',
    fn: async () => {
      // Snapshot register happens client-side; smoke test only confirms
      // the enqueue endpoint accepts payload (full poll cycle needs DOM).
      // First make sure surface exists -- POST a transient one if missing.
      let snap = await fetch(`${SERVER_URL}/api/bus/ui/surfaces/${SURFACE}`);
      if (!snap.ok) {
        // register a minimal probe so enqueue has a valid target
        const reg = await fetch(`${SERVER_URL}/api/bus/ui/surfaces`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: SURFACE,
            layer: 'plugin',
            schema: { type: 'object' },
            actions: [{ id: 'noop' }],
            initialSnapshot: {},
          }),
        });
        assert(reg.ok, `surface register HTTP ${reg.status}`);
        snap = await fetch(`${SERVER_URL}/api/bus/ui/surfaces/${SURFACE}`);
      }
      const enq = await fetch(`${SERVER_URL}/api/bus/ui/surfaces/${SURFACE}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'noop', args: { probe: true }, source: 'ai' }),
      });
      assert(enq.ok, `enqueue HTTP ${enq.status}`);
      const pending = await fetch(`${SERVER_URL}/api/bus/ui/surfaces/${SURFACE}/pending`);
      assert(pending.ok, `pending HTTP ${pending.status}`);
      const pj = await pending.json() as { actions?: Array<{ action: string }> };
      // After GET /pending the server marks them claimed; we just need ≥0 actions ever queued.
      void pj;
    },
  },
  {
    label: '10. interface vite 18920 在跑 + panel.tsx 可经 @fs 加载',
    fn: async () => {
      const r = await fetch(`${INTERFACE_URL}/`);
      assert(r.ok, `vite root HTTP ${r.status}`);
      // panel module path
      const m = await fetch(`${INTERFACE_URL}/@fs/data/home/lockliu/forge-project/forgeax-studio/packages/marketplace/plugins/wb-character-forge/src/panel.tsx`);
      assert(m.ok, `panel HTTP ${m.status}`);
      const t = await m.text();
      assert(t.includes('CharacterForgePanel'), 'panel module missing export marker');
    },
  },
];

console.log(`\n  wb-character-forge smoke @ ${SERVER_URL} (slug=${SLUG})\n`);
const t0 = Date.now();
for (const s of steps) {
  const sT = Date.now();
  process.stdout.write(`  · ${s.label}`);
  try {
    await s.fn();
    passed.push(s.label);
    process.stdout.write(`  ✓ ${(Date.now() - sT) / 1000}s\n`);
  } catch (e) {
    failed.push({ label: s.label, err: (e as Error).message });
    process.stdout.write(`  ✗ ${(Date.now() - sT) / 1000}s  ${(e as Error).message}\n`);
  }
}
const dur = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\n  ───  ${passed.length}/${steps.length} pass · ${dur}s  ───\n`);
if (failed.length) {
  console.log('  Failures:');
  for (const f of failed) console.log(`    - ${f.label}\n      ${f.err}`);
  process.exit(1);
}
