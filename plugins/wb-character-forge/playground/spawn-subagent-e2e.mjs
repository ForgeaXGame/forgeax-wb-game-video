/**
 * 真 e2e — claude-code 在新 system prompt + .mcp.json 下能不能真调 spawn_subagent.
 *
 * 步骤:
 *   1. 重启 server 让新 prompt 生效 (server bun --watch 应该自动 reload,但保险起见 wait)
 *   2. /api/threads POST 新 thread (claude-code provider)
 *   3. /api/chat POST "请用 spawn_subagent 工具派 suzu 帮我设计核心循环"
 *   4. drain SSE
 *   5. 查 run 的 tool_call events,看是否有 spawn_subagent
 *   6. 查 /api/threads/<id>/used-agents,看 suzu 是否点亮
 *
 * 不开浏览器,纯 HTTP — 因为只验证 prompt + tool wiring 是否打通,UI 那一层另算.
 */

const SERVER = 'http://127.0.0.1:18900';
const log = (s) => console.log(s);

async function main() {
  log('## 1. 创建新 thread');
  const t = await fetch(`${SERVER}/api/threads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      cliProviderId: 'claude-code',
      activeEmitterId: 'kubeela',
      title: 'spawn-subagent e2e',
    }),
  }).then((r) => r.json());
  const threadId = t.thread?.id;
  log(`  threadId=${threadId}`);

  log('\n## 2. 发消息触发 spawn_subagent');
  const prompt = '请**真的用 spawn_subagent 工具**派 suzu 帮我设计土豆兄弟 3D 的核心循环。'
    + ' 不要自己写任务书 markdown 冒充派单 —— 必须能在 tool_calls 里看到 spawn_subagent。';
  const t0 = Date.now();
  const res = await fetch(`${SERVER}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: prompt,
      agentId: 'kubeela',
      threadId,
      providerOverride: 'claude-code',
    }),
  });
  log(`  POST /api/chat status=${res.status}`);
  if (!res.body) { log('  no body'); return; }

  log('\n## 3. drain SSE');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let frames = 0;
  let runId = null;
  const toolNames = new Set();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const eventLine = block.split('\n').find((l) => l.startsWith('event:'));
      const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
      const eventType = eventLine?.slice('event:'.length).trim();
      const dataStr = dataLine?.slice('data:'.length).trim() ?? '';
      let payload = {};
      try { payload = JSON.parse(dataStr); } catch { /* */ }
      if (!runId && payload.runId) runId = payload.runId;
      if (eventType === 'tool-call' && payload.name) toolNames.add(payload.name);
      if (eventType === 'stored-event' && payload.storedEvent?.event?.type === 'TOOL_CALL_START') {
        toolNames.add(payload.storedEvent.event.toolCallName ?? 'unknown');
      }
      frames += 1;
    }
    if (Date.now() - t0 > 120_000) break;
  }
  log(`  ${frames} SSE frames in ${((Date.now()-t0)/1000).toFixed(1)}s · runId=${(runId??'').slice(0,8)}`);
  log(`  tools called: ${Array.from(toolNames).join(', ') || '(none)'}`);

  log('\n## 4. /api/threads/:id/used-agents');
  await new Promise((r) => setTimeout(r, 800));
  const ua = await fetch(`${SERVER}/api/threads/${threadId}/used-agents`).then((r) => r.json());
  log(`  agents=${JSON.stringify(ua.agents)}`);

  log('\n## 5. /api/runs?threadId — 看 subagentIds');
  const allRuns = await fetch(`${SERVER}/api/runs?threadId=${threadId}`).then((r) => r.json());
  for (const r of allRuns.runs ?? []) {
    log(`  run ${r.id.slice(0,8)}: provider=${r.providerId} agent=${r.agentId} subagentIds=${JSON.stringify(r.subagentIds ?? [])}`);
  }

  const usedSuzu = (ua.agents ?? []).some((a) => a.id === 'suzu');
  const calledSpawn = Array.from(toolNames).some((n) => /spawn_subagent/.test(n));
  log('\n## ── 评估 ──');
  log(`  Kubee 真调了 spawn_subagent : ${calledSpawn ? '✓' : '✗'}`);
  log(`  used-agents 含 suzu        : ${usedSuzu ? '✓' : '✗'}`);
  if (calledSpawn && usedSuzu) log('\n  🎉 全链通了');
  else log('\n  ⚠ 还有 gap');
}

await main();
