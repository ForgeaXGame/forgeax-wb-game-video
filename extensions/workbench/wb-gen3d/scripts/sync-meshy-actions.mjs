#!/usr/bin/env node
// Regenerate shared/meshy-actions.ts from the official web animation-library.
// Meshy exposes NO HTTP endpoint to list actions (verified 2026-06-21), so this
// scrapes the server-rendered HTML table on docs.meshy.ai and commits the rows
// to the repo as the source of truth for gen3d:list-motions.
//
//   node scripts/sync-meshy-actions.mjs
//
// Requires network. Safe to re-run; diff the file after. Not wired into CI —
// the committed table is authoritative; re-run only when Meshy adds actions.

import fs from 'node:fs';
import path from 'node:path';

const URL = 'https://docs.meshy.ai/en/api/animation-library';
const BASE = 'https://cdn.meshy.ai/webapp-assets/feature-demo/animation/preview/biped/';
const OUT = path.resolve(import.meta.dirname, '..', 'shared', 'meshy-actions.ts');

const res = await fetch(URL, { headers: { 'User-Agent': 'forgeax-studio/meshy-actions-sync' } });
if (!res.ok) throw new Error(`fetch ${URL} → ${res.status}`);
const html = await res.text();

const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].slice(1).map((m) => m[1]);
const out = [];
for (const row of rows) {
  const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  if (tds.length < 5) continue;
  const id = Number(tds[0].trim());
  const name = tds[1].trim();
  const category = tds[2].trim();
  const subCategory = tds[3].trim();
  const imgM = tds[4].match(/<img[^>]*src="([^"]+)"/);
  let previewGifRel = null;
  if (imgM && imgM[1].startsWith(BASE)) previewGifRel = imgM[1].slice(BASE.length);
  if (!Number.isFinite(id) || !name) continue;
  out.push([id, name, category, subCategory, previewGifRel]);
}

if (out.length < 100) throw new Error(`parsed only ${out.length} rows — page shape changed?`);

const lines = out.map((r) => `  [${r[0]}, ${JSON.stringify(r[1])}, ${JSON.stringify(r[2])}, ${JSON.stringify(r[3])}${r[4] ? `, ${JSON.stringify(r[4])}` : ''}],`);
const src = `// Auto-generated from ${URL} by scripts/sync-meshy-actions.mjs.
// Meshy exposes NO HTTP endpoint to list actions (verified 2026-06-21 against the
// official API reference: only POST/GET/DELETE /openapi/v1/animations exist), so
// this static table is the source of truth for gen3d:list-motions.
// Each row = [id, name, category, subCategory, previewGifRel?]; previewGifRel is
// the filename under ${BASE}; null → no preview. Do NOT edit by hand — re-run
// the script.

export const MESHY_ACTION_BASE = ${JSON.stringify(BASE)};

export const MESHY_ACTIONS: readonly (readonly [number, string, string, string, string | null])[] = [
${lines.join('\n')}
];
`;

fs.writeFileSync(OUT, src);
console.log(`wrote ${out.length} actions → ${path.relative(process.cwd(), OUT)}`);