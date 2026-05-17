/**
 * 真 chat e2e — 验证主 agent 调子 agent 时, used-agents endpoint 跟 UI 反应是否对.
 *
 * 步骤:
 *   1. 打开 18920 + 等 SessionSwitcher 加载完
 *   2. 点 "+ 新建 session" → server POST /api/threads → 拿到新 thread.id
 *   3. composer 发: "@suzu 帮我做一个 3D 战斗的核心循环"
 *   4. 等 SSE 流完成
 *   5. 抓 /api/threads/<id>/used-agents 看结果
 *   6. 抓 /api/runs?threadId=<id> 看 RunMeta.subagentIds
 *   7. 抓 jsonl 看实际事件类型 (TOOL_CALL_START with name=Agent/Task 等)
 *   8. 打印观察报告,不 assert (诊断式)
 */

import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const INTERFACE_URL = 'http://127.0.0.1:18920';
const SERVER_URL = 'http://127.0.0.1:18900';
const PROMPT = '@suzu 帮玩法设计师设计一个 3D 战斗的核心循环 · 我要看到你真的 spawn 子 agent';

const report = [];
const log = (s) => { console.log(s); report.push(s); };

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() !== 'debug') log(`  [console:${m.type()}] ${m.text().slice(0, 200)}`); });

  log('## 1. 打开 18920');
  await page.goto(INTERFACE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  log('\n## 2. + 新建 session (POST /api/threads)');
  const before = await fetch(`${SERVER_URL}/api/threads`).then((r) => r.json()).catch(() => ({ threads: [] }));
  const beforeIds = new Set(before.threads.map((t) => t.id));
  // Click session switcher btn + 新建按钮
  const sessBtn = page.locator('.tb-session-switcher .tb-game-btn');
  await sessBtn.waitFor({ timeout: 5000 });
  await sessBtn.click();
  await page.waitForTimeout(300);
  const newBtn = page.locator('.tb-game-dropdown button.tb-game-pick').first(); // "+ 新建 session"
  await newBtn.click();
  await page.waitForTimeout(1500);
  const after = await fetch(`${SERVER_URL}/api/threads`).then((r) => r.json());
  const fresh = (after.threads ?? []).filter((t) => !beforeIds.has(t.id));
  if (fresh.length === 0) { log('  !! 没创建出新 thread'); }
  const threadId = fresh[0]?.id;
  log(`  threadId=${threadId}`);

  log('\n## 3. 发消息: ' + PROMPT.slice(0, 60));
  const composer = page.locator('textarea').first();
  await composer.waitFor({ timeout: 5000 });
  await composer.fill(PROMPT);
  await composer.press('Enter');

  log('\n## 4. 等 SSE 完成 (max 90s)');
  // 用 polling 看 active thread 的 run 完成
  let done = false;
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000);
    const runs = await fetch(`${SERVER_URL}/api/runs?threadId=${encodeURIComponent(threadId ?? '')}`).then((r) => r.json()).catch(() => ({ runs: [] }));
    if ((runs.runs ?? []).length > 0) {
      const last = runs.runs[runs.runs.length - 1];
      if (last.status === 'done' || last.status === 'error') { done = true; log(`  run ${last.id.slice(0,8)} status=${last.status} after ${i+1}s`); break; }
    }
  }
  if (!done) log('  !! 90s 内没完成');

  log('\n## 5. /api/threads/:id/used-agents');
  const used = await fetch(`${SERVER_URL}/api/threads/${threadId}/used-agents`).then((r) => r.json());
  log(`  agents=${JSON.stringify(used.agents)}`);

  log('\n## 6. /api/runs?threadId 的 subagentIds');
  const allRuns = await fetch(`${SERVER_URL}/api/runs?threadId=${threadId}`).then((r) => r.json());
  for (const r of allRuns.runs ?? []) {
    log(`  run ${r.id.slice(0,8)}: providerId=${r.providerId} agentId=${r.agentId} subagentIds=${JSON.stringify(r.subagentIds ?? [])}`);
  }

  log('\n## 7. 抓最近 run 的 events 看实际事件 (前 40 条)');
  const lastRun = (allRuns.runs ?? []).slice(-1)[0];
  if (lastRun) {
    const ev = await fetch(`${SERVER_URL}/api/runs/${lastRun.id}/events?stream=poll`).then((r) => r.json());
    const types = (ev.events ?? []).map((e) => e.event?.type).filter(Boolean);
    log(`  total events: ${types.length}`);
    log(`  unique types: ${Array.from(new Set(types)).join(', ')}`);
    // 收集所有 tool_call_start 的 toolCallName
    const toolNames = new Set();
    for (const e of (ev.events ?? [])) {
      if (e.event?.type === 'TOOL_CALL_START') {
        toolNames.add(e.event.toolCallName ?? 'unknown');
      }
    }
    log(`  tools called: ${Array.from(toolNames).join(', ')}`);
    // 是否有 Agent/Task/subagent 这种
    const subagentHits = Array.from(toolNames).filter((n) => /agent|task|spawn/i.test(n));
    log(`  potential subagent tools: ${JSON.stringify(subagentHits)}`);
  }

  log('\n## 8. UI 截图 → debug.png');
  await page.screenshot({ path: '/tmp/chat-subagent-e2e.png', fullPage: false });

  await browser.close();
}

await run();
await writeFile('/tmp/chat-subagent-e2e-report.md', report.join('\n'));
console.log('\n--- saved /tmp/chat-subagent-e2e-report.md ---');
