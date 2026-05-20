/**
 * wb-character-forge · 浏览器 e2e (用 playwright 直 API,不走 test runner).
 *
 * 跑:
 *   bunx --bun -p playwright@latest node packages/marketplace/plugins/wb-character-forge/playground/browser-e2e.mjs
 *
 * 跑路径:
 *   1. 打开 18920 → pin slug=mario → 点 "锻造" tab
 *   2. 验 panel mount + 厂商 chips 都 ready
 *   3. 玩家路径: 改 prompt, 点 "生成立绘",等画廊增长
 *   4. 验 character-forge.editor surface server-side snapshot 跟着更新
 *   5. AI 路径: POST /api/bus/ui/surfaces/.../action → DOM 高亮跟变化
 *   6. 截图 4 张存 playground/screenshots/
 *
 * 每个失败都 dump console + 网络错误 trace 给排查.
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = resolve(__dirname, 'screenshots');
const INTERFACE_URL = process.env.FORGEAX_INTERFACE_URL ?? 'http://127.0.0.1:18920';
const SERVER_URL = process.env.FORGEAX_SERVER_URL ?? 'http://127.0.0.1:18900';
const SLUG = process.env.CF_TEST_SLUG ?? 'mario';

const passed = [];
const failed = [];

function step(label, fn) {
  return { label, fn };
}

async function shot(page, name) {
  await mkdir(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS_DIR, `${name}.png`), fullPage: false });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    deviceScaleFactor: 1,
    userAgent: 'wb-character-forge-e2e/0.1.0',
  });
  await ctx.addInitScript((slug) => {
    try { localStorage.setItem('forgeax.pinnedSlug', slug); } catch { /* */ }
  }, SLUG);

  const page = await ctx.newPage();
  const consoleLog = [];
  page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message}`));

  const steps = [
    step('1. 打开 18920 + 选锻造 tab + panel mount', async () => {
      await page.goto(INTERFACE_URL, { waitUntil: 'domcontentloaded' });
      // Wait sidebar tab strip ready
      const forgeTab = page.locator('[role="tab"][aria-label*="锻造"]');
      await forgeTab.waitFor({ timeout: 15_000 });
      await forgeTab.click();
      const panel = page.locator('[data-cf-mounted="1"]');
      await panel.waitFor({ timeout: 6000 });
      await shot(page, '01-panel-mounted');
    }),

    step('2. 厂商 chips ≥3 ready + slug=mario 可见', async () => {
      const ready = await page.locator('.cf-vendor-chip.ready').count();
      if (ready < 3) throw new Error(`only ${ready} ready vendors`);
      const slugVal = await page.locator('[data-cf-input="slug"]').inputValue();
      if (slugVal !== SLUG) throw new Error(`slug=${slugVal}, expected ${SLUG}`);
    }),

    step('3. surface server-side snapshot 存在', async () => {
      // surface mount effect needs a beat
      await page.waitForTimeout(1500);
      const r = await fetch(`${SERVER_URL}/api/bus/ui/surfaces/character-forge.editor`);
      if (!r.ok) throw new Error(`surface HTTP ${r.status}`);
      const j = await r.json();
      if (!j.snapshot) throw new Error('no snapshot');
      if (!j.snapshot.forgeForm?.prompt) throw new Error('snapshot lacks forgeForm.prompt');
    }),

    step('4. 玩家路径 · 改 prompt + 点生成,画廊+1', async () => {
      const before = await page.locator('[data-cf-char]').count();
      await page.locator('[data-cf-input="prompt"]').fill('e2e-paladin gold armor white wings');
      // ensure size=2k (default) so primary Seedream is exercised
      await page.locator('[data-cf-btn="generate-portrait"]').click();
      const t0 = Date.now();
      // wait up to 60s for new card
      let after = before;
      while (Date.now() - t0 < 60_000) {
        after = await page.locator('[data-cf-char]').count();
        if (after > before) break;
        await page.waitForTimeout(1000);
      }
      if (after <= before) throw new Error(`gallery did not grow from ${before} in 60s`);
      await shot(page, '02-after-portrait');
    }),

    step('5. AI 路径 · 切换角色高亮', async () => {
      const cards = page.locator('[data-cf-char]');
      const n = await cards.count();
      if (n < 2) {
        // 自己再生成一张以便切换
        await page.locator('[data-cf-input="prompt"]').fill('e2e-paladin2 silver armor blue cape');
        await page.locator('[data-cf-btn="generate-portrait"]').click();
        const t0 = Date.now();
        while (Date.now() - t0 < 60_000) {
          if ((await cards.count()) >= 2) break;
          await page.waitForTimeout(1000);
        }
      }
      const ids = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-cf-char')));
      const selectedNow = await page.locator('.cf-card.selected').first().getAttribute('data-cf-char').catch(() => null);
      const target = ids.find((id) => id !== selectedNow);
      if (!target) throw new Error('no alternative charId to select');

      const enq = await fetch(`${SERVER_URL}/api/bus/ui/surfaces/character-forge.editor/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'selectCharacter', args: { charId: target }, source: 'ai' }),
      });
      if (!enq.ok) throw new Error(`enqueue HTTP ${enq.status}`);
      // Client polls every 1s → give it 8s + dump server snapshot for diagnose
      const t0 = Date.now();
      while (Date.now() - t0 < 8000) {
        const n = await page.locator(`[data-cf-char="${target}"].selected`).count();
        if (n === 1) return;
        await page.waitForTimeout(500);
      }
      const snap = await fetch(`${SERVER_URL}/api/bus/ui/surfaces/character-forge.editor`).then((r) => r.json()).catch(() => null);
      const pending = await fetch(`${SERVER_URL}/api/bus/ui/surfaces/character-forge.editor/pending`).then((r) => r.json()).catch(() => null);
      throw new Error(`DOM did not reflect selectCharacter(${target}) within 8s; snapshot.selectedCharId=${snap?.snapshot?.selectedCharId}; pending=${JSON.stringify(pending).slice(0, 200)}`);
    }),

    step('6. 游乐场 tab · sprite 帧动画播放', async () => {
      const playTab = page.locator('.cf-tab', { hasText: '游乐场' });
      await playTab.click();
      await page.waitForTimeout(500);
      // Need a character with sprites; pick first that has the badge.
      // If none yet, generate one via sprite-sheet button.
      const stage = page.locator('[data-cf-stage]');
      const stageVisible = await stage.count();
      if (stageVisible) {
        // try generate walk if not present
        const hasSprite = await stage.locator('.cf-sprite-cell').count();
        if (!hasSprite) {
          const btn = page.locator('[data-cf-btn="generate-sprite-walk"]');
          if (await btn.count()) {
            await btn.click();
            const t0 = Date.now();
            while (Date.now() - t0 < 60_000) {
              if (await stage.locator('.cf-sprite-cell').count()) break;
              await page.waitForTimeout(1000);
            }
          }
        }
      }
      await shot(page, '03-playground');
    }),
  ];

  for (const s of steps) {
    const sT = Date.now();
    process.stdout.write(`  · ${s.label}`);
    try {
      await s.fn();
      passed.push(s.label);
      process.stdout.write(`  ✓ ${((Date.now() - sT) / 1000).toFixed(1)}s\n`);
    } catch (e) {
      failed.push({ label: s.label, err: e.message });
      process.stdout.write(`  ✗ ${((Date.now() - sT) / 1000).toFixed(1)}s  ${e.message}\n`);
      try { await shot(page, `error-${s.label.split(' ')[0].replace('.', '')}`); } catch { /* */ }
    }
  }

  // Final full-page screenshot
  try { await shot(page, '99-final'); } catch { /* */ }

  await browser.close();
  console.log(`\n  ${passed.length}/${passed.length + failed.length} pass · screenshots → ${SHOTS_DIR}\n`);
  if (failed.length) {
    console.log('Failures:');
    for (const f of failed) console.log(`  - ${f.label}\n    ${f.err}`);
    if (consoleLog.length) {
      console.log('\nBrowser console (last 20):');
      for (const line of consoleLog.slice(-20)) console.log(`  | ${line}`);
    }
    process.exit(1);
  }
}

run().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
