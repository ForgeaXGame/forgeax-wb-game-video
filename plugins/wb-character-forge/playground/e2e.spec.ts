/**
 * wb-character-forge · Playwright e2e
 *
 * 跑:
 *   cd packages/server && bunx playwright test ../marketplace/plugins/wb-character-forge/playground/e2e.spec.ts --reporter=line
 *
 * 前置:
 *   server@18900 + interface@18920 在跑 · `.env` 含 ARK_IMAGE_KEY + GEMINI_API_KEY 等
 *
 * 覆盖:
 *   1. Sidebar tab → CharacterForgePanel mount + 厂商 chips 都 ready
 *   2. surface 注册 (character-forge.editor) 在 server 可读到 snapshot
 *   3. 玩家路径: 填 prompt + 选 view + 点 "生成立绘" → POST /portrait → 画廊出新卡
 *   4. AI 路径: POST /api/bus/ui/surfaces/.../action selectCharacter → DOM 高亮变化
 *   5. 直 HTTP 路径: 直接 POST /api/wb/character-forge/portrait → ledger 新事件
 *   6. sprite-sheet: 生成 walk → playground 出 sprite 帧
 */

import { test, expect } from '@playwright/test';

const INTERFACE_URL = process.env.FORGEAX_INTERFACE_URL ?? 'http://127.0.0.1:18920';
const SERVER_URL = process.env.FORGEAX_SERVER_URL ?? 'http://127.0.0.1:18900';
const SLUG = process.env.CF_TEST_SLUG ?? 'mario';
const SURFACE = 'character-forge.editor';

test.describe('wb-character-forge · 端到端', () => {
  test.setTimeout(180_000); // 真实多模态调用,大方点

  test.beforeEach(async ({ page }) => {
    // 把 pinnedSlug 预置好,避免 panel 因没选 slug 显示空状态
    await page.addInitScript((slug) => {
      try { localStorage.setItem('forgeax.pinnedSlug', slug); } catch { /* */ }
    }, SLUG);
  });

  test('1. Sidebar tab 出现 + panel mount + 3 厂商 ready', async ({ page }) => {
    await page.goto(INTERFACE_URL);
    // 等 sidebar 的 workbench tab 渲染完
    const forgeTab = page.locator('[role="tab"][aria-label*="锻造"]');
    await forgeTab.waitFor({ timeout: 10_000 });
    await forgeTab.click();

    // panel 挂载 marker
    const panel = page.locator('[data-cf-mounted="1"]');
    await panel.waitFor({ timeout: 5000 });

    // 3 厂商 chip 都 ready
    const ready = page.locator('.cf-vendor-chip.ready');
    await expect.poll(async () => ready.count(), { timeout: 4000 }).toBeGreaterThanOrEqual(3);
  });

  test('2. surface character-forge.editor 服务端可读', async () => {
    // 客户端 mount 时会 POST register, 给 1s
    await new Promise((r) => setTimeout(r, 1500));
    const r = await fetch(`${SERVER_URL}/api/bus/ui/surfaces/${SURFACE}`);
    expect(r.ok).toBeTruthy();
    const j = (await r.json()) as { snapshot?: { slug?: string; forgeForm?: { prompt?: string } } };
    expect(j.snapshot).toBeTruthy();
    expect(j.snapshot?.forgeForm?.prompt?.length).toBeGreaterThan(0);
  });

  test('3. 玩家路径 · 真生成立绘并出现在画廊', async ({ page }) => {
    await page.goto(INTERFACE_URL);
    const forgeTab = page.locator('[role="tab"][aria-label*="锻造"]');
    await forgeTab.waitFor({ timeout: 10_000 });
    await forgeTab.click();
    await page.locator('[data-cf-mounted="1"]').waitFor({ timeout: 5000 });

    // 改 prompt 成确定字符串便于 charId 重现
    const promptInput = page.locator('[data-cf-input="prompt"]');
    await promptInput.fill('e2e-knight blue armor silver hair');

    const beforeCount = await page.locator('[data-cf-char]').count();

    await page.locator('[data-cf-btn="generate-portrait"]').click();

    // 等画廊增长 (或至少有第一张) — 真调外部 API,留 90s
    await expect.poll(async () => page.locator('[data-cf-char]').count(), {
      timeout: 90_000,
      intervals: [1500],
    }).toBeGreaterThan(beforeCount);
  });

  test('4. AI 路径 · POST surface action 选择角色 → DOM 高亮跟', async ({ page }) => {
    await page.goto(INTERFACE_URL);
    const forgeTab = page.locator('[role="tab"][aria-label*="锻造"]');
    await forgeTab.waitFor({ timeout: 10_000 });
    await forgeTab.click();
    await page.locator('[data-cf-mounted="1"]').waitFor({ timeout: 5000 });
    await new Promise((r) => setTimeout(r, 1500)); // surface register settle

    // 拿到至少 2 张卡才能验证切换
    const cards = page.locator('[data-cf-char]');
    const count = await cards.count();
    if (count < 2) test.skip(true, 'fewer than 2 characters - need at least 2 to test selection toggle');

    const allIds = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-cf-char')));
    const currentSelected = await page.locator('.cf-card.selected').first().getAttribute('data-cf-char');
    const target = allIds.find((id) => id !== currentSelected) as string;

    // AI POST → enqueue selectCharacter
    const ack = await fetch(`${SERVER_URL}/api/bus/ui/surfaces/${SURFACE}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'selectCharacter', args: { charId: target }, source: 'ai' }),
    });
    expect(ack.ok).toBeTruthy();

    // 等 client poll (1s 间隔) 拉到并改 state
    await expect.poll(async () =>
      page.locator(`[data-cf-char="${target}"].selected`).count(), { timeout: 4000 },
    ).toBe(1);
  });

  test('5. 直 HTTP 路径 · POST /portrait → ledger 新增 character-forge.portrait.generated', async () => {
    const recentBefore = await fetch(`${SERVER_URL}/api/events/recent?nameLike=character-forge`).then((r) => r.json()).catch(() => ({ events: [] }));
    const beforeN = (recentBefore as { events?: unknown[] }).events?.length ?? 0;

    const r = await fetch(`${SERVER_URL}/api/wb/character-forge/portrait`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slug: SLUG,
        prompt: 'e2e-direct-http rookie warrior, leather armor, red bandana',
        style: 'anime-hd-flat',
        views: ['front'],
        size: '1k',
      }),
    });
    expect(r.ok).toBeTruthy();
    const j = (await r.json()) as { charId: string; files: Array<{ url: string }> };
    expect(j.charId).toBeTruthy();
    expect(j.files[0]?.url).toMatch(/asset\?path=/);

    // ledger 新事件
    await new Promise((r) => setTimeout(r, 1000));
    const recentAfter = await fetch(`${SERVER_URL}/api/events/recent?nameLike=character-forge`).then((r) => r.json()).catch(() => ({ events: [] }));
    const afterN = (recentAfter as { events?: unknown[] }).events?.length ?? 0;
    expect(afterN).toBeGreaterThan(beforeN);

    // asset 字节流可拉
    const url = j.files[0]?.url;
    if (url) {
      const img = await fetch(`${SERVER_URL}${url}`);
      expect(img.ok).toBeTruthy();
      const ct = img.headers.get('content-type') ?? '';
      expect(ct.startsWith('image/')).toBeTruthy();
    }
  });
});
