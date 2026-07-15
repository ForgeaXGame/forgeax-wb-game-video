#!/usr/bin/env node
/** T0 (ADR-0008 D-C): zero-quota probe that Forge's host tools are reachable
 *  the same way forgeax-tools MCP does — GET /api/tools?agent=forge then
 *  POST /api/tools/call for gen3d:list-assets + character:list.
 *
 *  Usage (server must be up on :18900):
 *    node scripts/t0-host-tools-probe.mjs [slug]
 *
 *  Exit 0 = pass · 1 = fail (prints which gate broke). */

const BASE = (process.env.FORGEAX_SERVER_URL || 'http://127.0.0.1:18900').replace(/\/$/, '');
const AGENT = 'forge';
const SLUG = process.argv[2] || 'shoot-opt';
const REQUIRED = [
  'gen3d:list-assets',
  'character:list',
  'character:generate-turnaround',
  'gen3d:views-to-3d',
];

async function httpJson(path, init) {
  const res = await fetch(BASE + path, init);
  const j = await res.json().catch(() => null);
  if (!res.ok || j?.error) throw new Error(j?.message || j?.error || `HTTP ${res.status}`);
  return j;
}

function fail(msg) {
  console.error(`[t0-probe] FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  console.log(`[t0-probe] server=${BASE} agent=${AGENT} slug=${SLUG}`);

  let catalog;
  try {
    catalog = await httpJson(`/api/tools?agent=${encodeURIComponent(AGENT)}`);
  } catch (e) {
    fail(`registry fetch: ${e.message}`);
  }

  const tools = Array.isArray(catalog?.tools) ? catalog.tools : [];
  for (const id of REQUIRED) {
    const d = tools.find((t) => t.id === id);
    if (!d) fail(`missing from forge whitelist: ${id}`);
    if (!d.exposedToAI || !d.hasHandler) fail(`${id} not exposedToAI+handler`);
    console.log(`[t0-probe] catalog OK: ${id}`);
  }

  const listAssets = await httpJson('/api/tools/call', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      toolId: 'gen3d:list-assets',
      args: { slug: SLUG },
      caller: { kind: 'ai' },
    }),
  });
  if (!listAssets?.ok || listAssets.result?.ok !== true) {
    fail(`gen3d:list-assets call: ${JSON.stringify(listAssets).slice(0, 200)}`);
  }
  console.log(`[t0-probe] call OK: gen3d:list-assets (${(listAssets.result.assets || []).length} assets)`);

  const listChars = await httpJson('/api/tools/call', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      toolId: 'character:list',
      args: { slug: SLUG },
      caller: { kind: 'ai' },
    }),
  });
  if (!listChars?.ok || !listChars.result?.slug) {
    fail(`character:list call: ${JSON.stringify(listChars).slice(0, 200)}`);
  }
  console.log(`[t0-probe] call OK: character:list (${(listChars.result.items || []).length} characters)`);

  console.log('[t0-probe] PASS — Forge host-tool bridge ready for 2D→3D CLI recipe');
}

main().catch((e) => fail(e.message));
