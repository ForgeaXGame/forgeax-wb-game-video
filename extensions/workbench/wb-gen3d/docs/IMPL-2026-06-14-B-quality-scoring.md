# Plan B — Five-Dimension Quality Scoring (P3, Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead `InspectorReserved` placeholder with a working **on-demand hybrid** quality scorer: a pure objective heuristic (geometry / topology / texture / pbr) computed client-side from the loaded GLB, a `QualityReport` persisted lazily into the asset sidecar via a new `gen3d:score-quality` tool, plus manual override + notes. AI vision (`prompt_fidelity`) is a **disabled mock stub** this round (grill B6 / spec P4).

**Architecture (grill B1–B6, ADR-0004):** Pure scoring math lives in `shared/quality/heuristics.ts` (no DOM/three → bun-testable). A client extractor (`src/lib/objectiveMetrics.ts`) walks the GLB scene into a plain `ObjectiveMetrics` and the UI scores it **client-side** for instant display **without writing disk** (lazy, B5). Persistence happens only on manual override / future AI scoring, through `gen3d:score-quality`, which **merges + writes only** (no server-side three.js). `sidecarToManifest` surfaces `custom.quality` → `manifest.quality` and `custom.faceCount` → `manifest.targetFaceCount`. `updateAssetQuality` serializes the sidecar read-modify-write under the existing `withAssetLock`.

**Tech Stack:** TypeScript 5.7, bun test (pure heuristics + store idempotency), React 19, three `^0.184.0` (`GLTFLoader` headless extract), Vite 6. Server: Bun + the existing `PerGameAssetStore`.

**Decoupling:** B is independent of Plan A (viewer) and Plan C (params). It loads the GLB itself (does not couple to `ModelViewer` internals), so it can ship as its own PR.

**Conventions:** All commands run from `packages/marketplace/extensions/wb-gen3d/`. `bun test` requires the test runner wired in Plan A Task P1.2 Step 2b (`"test": "bun test"` in `package.json` + `"exclude": ["**/*.test.ts"]` in `tsconfig.json`); **if Plan A has not run, do that wiring as the first step here** (Task B0). After `src/**` changes, `bun run build` + hard-refresh the embedded Workbench.

**Suggested branch:** `laurenceelu/feat-20260614-gen3d-quality-scoring`.

---

## File Structure

| File | New/Mod | Responsibility |
|---|---|---|
| `shared/quality/heuristics.ts` | **New** | pure objective scoring (geometry/topology/texture/pbr) + weighted total; `ObjectiveMetrics`/`ObjectiveScores` |
| `shared/quality/heuristics.test.ts` | **New** | bun unit tests (degenerate mesh, no-UV, budget fit, PBR maps, total renorm) |
| `shared/manifest.ts` | Mod | add `QualityDim`/`QualityReport`/`emptyQualityReport()`/`reportToScore()`; `Gen3DAssetManifest.targetFaceCount?`; `AssetSidecar.custom.quality?` |
| `server/asset-storage.ts` | Mod | add `updateAssetQuality()` to the `AssetStorage` interface |
| `server/per-game-store.ts` | Mod | implement `updateAssetQuality()`; surface `custom.quality`+`custom.faceCount` in `sidecarToManifest`; set `targetFaceCount` in `writeAsset` |
| `server/per-game-store.test.ts` | **New** | bun test: writeAsset → updateAssetQuality persists + surfaces + idempotent |
| `server/tool-handlers.ts` | Mod | add `gen3d:score-quality` handler (merge 3 sources → `updateAssetQuality`) |
| `schemas/score-quality.args.json` | **New** | tool args schema |
| `schemas/score-quality.returns.json` | **New** | tool returns schema |
| `forgeax-extension.json` | Mod | register `gen3d:score-quality` (`exposedToAI:false`) |
| `src/lib/objectiveMetrics.ts` | **New** | three traversal: `gltf.scene` → `ObjectiveMetrics` |
| `src/components/QualityInspector.tsx` | **New** | five-dim UI (display/manual/notes/AI-disabled), drives `gen3d:score-quality` |
| `src/components/AssetLibrary.tsx` | Mod | remove `InspectorReserved` (+ now-unused imports) |
| `src/App.tsx` | Mod | render `QualityInspector`; wire score callback |
| `src/types.ts` | Mod | add `ScoreQualityResult` |
| `src/styles.css` | Mod | quality bars / source badges / manual editor |
| `docs/adr/0004-...md`, `HANDOFF.md`, `CONTEXT.md` | Mod | already amended (lazy); mark P3 done |

---

## Task B0: Ensure the bun test runner is wired

**Files:** `package.json`, `tsconfig.json` (skip if Plan A already did this)

- [ ] **Step 1: Confirm or add the test script + tsc exclude**

`package.json` `scripts` must contain `"test": "bun test"`. `tsconfig.json` must contain `"exclude": ["**/*.test.ts"]`. If missing, add them.

- [ ] **Step 2: Verify**

Run:
```bash
bun run typecheck
```
Expected: 0 errors (no `*.test.ts` compiled by tsc).

---

## Task B1: Pure objective heuristics (`shared/quality/heuristics.ts`) — TDD

**Files:**
- Create: `shared/quality/heuristics.ts`
- Test: `shared/quality/heuristics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/quality/heuristics.test.ts
import { test, expect } from 'bun:test';
import {
  scoreObjective,
  weightedTotal,
  DEFAULT_WEIGHTS,
  type ObjectiveMetrics,
} from './heuristics';

const base: ObjectiveMetrics = {
  faces: 30000,
  vertices: 15000,
  degenerateFaceRatio: 0,
  meshCount: 1,
  missingNormals: false,
  bboxAspectExtreme: false,
  targetFaceCount: 30000,
  hasUV: true,
  maxTextureSize: 2048,
  hasBaseColorMap: true,
  hasMetalRoughMap: true,
  hasNormalMap: true,
  hasOcclusionMap: true,
  hasEmissiveMap: true,
  pbrApplicable: true,
};

test('clean on-budget PBR mesh scores high on all four objective dims', () => {
  const s = scoreObjective(base);
  expect(s.geometry).toBe(100);
  expect(s.topology).toBe(100);
  expect(s.texture).toBe(100);
  expect(s.pbr).toBe(100);
});

test('degenerate triangles + missing normals tank geometry', () => {
  const s = scoreObjective({ ...base, degenerateFaceRatio: 0.5, missingNormals: true });
  // 100 - 0.5*60 - 20 = 50
  expect(s.geometry).toBe(50);
});

test('topology is null without a target face count', () => {
  expect(scoreObjective({ ...base, targetFaceCount: null }).topology).toBeNull();
});

test('topology penalizes budget overshoot', () => {
  // faces double the target → fit = 1 - clamp(30000/30000) = 0 → 0
  expect(scoreObjective({ ...base, faces: 60000 }).topology).toBe(0);
  // 50% over → fit = 0.5 → 50
  expect(scoreObjective({ ...base, faces: 45000 }).topology).toBe(50);
});

test('texture is null without UV or without a texture', () => {
  expect(scoreObjective({ ...base, hasUV: false }).texture).toBeNull();
  expect(scoreObjective({ ...base, maxTextureSize: 0 }).texture).toBeNull();
});

test('texture tiers by max resolution', () => {
  expect(scoreObjective({ ...base, maxTextureSize: 1024 }).texture).toBe(80);
  expect(scoreObjective({ ...base, maxTextureSize: 256 }).texture).toBe(40);
});

test('pbr is null when not applicable, weighted by maps otherwise', () => {
  expect(scoreObjective({ ...base, pbrApplicable: false }).pbr).toBeNull();
  // only base color (35) + normal (20) = 55
  const s = scoreObjective({
    ...base,
    hasMetalRoughMap: false,
    hasOcclusionMap: false,
    hasEmissiveMap: false,
  });
  expect(s.pbr).toBe(55);
});

test('weightedTotal skips nulls and renormalizes', () => {
  // two dims at 100 and 50, others null → (100+50)/2 = 75
  const t = weightedTotal([
    { value: 100, weight: DEFAULT_WEIGHTS.geometry },
    { value: 50, weight: DEFAULT_WEIGHTS.topology },
    { value: null, weight: DEFAULT_WEIGHTS.texture },
    { value: null, weight: DEFAULT_WEIGHTS.pbr },
    { value: null, weight: DEFAULT_WEIGHTS.prompt_fidelity },
  ]);
  expect(t).toBe(75);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
bun test shared/quality/heuristics.test.ts
```
Expected: FAIL — `Cannot find module './heuristics'`.

- [ ] **Step 3: Write the implementation**

```ts
// shared/quality/heuristics.ts
// Pure objective quality heuristics (Phase A, no LLM, no DOM, no three import).
// Scale 0–100. The client extracts ObjectiveMetrics from a loaded GLB (see
// src/lib/objectiveMetrics.ts) and calls scoreObjective(); the score-quality tool
// only persists the result. Thresholds are centralized here (ADR-0004).

export interface ObjectiveMetrics {
  faces: number;
  vertices: number;
  // Fraction (0..1) of triangles with ~zero area (degenerate).
  degenerateFaceRatio: number;
  // Number of distinct Mesh nodes (proxy for disconnected islands).
  meshCount: number;
  missingNormals: boolean;
  // Longest bbox axis / shortest > threshold (sliver/extruded artifact).
  bboxAspectExtreme: boolean;
  // The generation-time target polycount, if known (manifest.targetFaceCount).
  targetFaceCount: number | null;
  hasUV: boolean;
  maxTextureSize: number; // px, 0 when no texture
  hasBaseColorMap: boolean;
  hasMetalRoughMap: boolean;
  hasNormalMap: boolean;
  hasOcclusionMap: boolean;
  hasEmissiveMap: boolean;
  // enablePbr && a standard/physical material is present.
  pbrApplicable: boolean;
}

export interface ObjectiveScores {
  geometry: number | null;
  topology: number | null;
  texture: number | null;
  pbr: number | null;
}

export const DEFAULT_WEIGHTS = {
  geometry: 0.2,
  topology: 0.2,
  texture: 0.2,
  pbr: 0.2,
  prompt_fidelity: 0.2,
} as const;

// ── thresholds ──
const DEGENERATE_PENALTY = 60; // full degenerate set → -60
const MISSING_NORMALS_PENALTY = 20;
const ASPECT_PENALTY = 15;
const ISLAND_SOFT_CAP = 8; // meshCount above this loses 2/extra, capped 15

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v);

// geometry — always computable.
export function scoreGeometry(m: ObjectiveMetrics): number {
  let s = 100;
  s -= clamp(m.degenerateFaceRatio, 0, 1) * DEGENERATE_PENALTY;
  if (m.missingNormals) s -= MISSING_NORMALS_PENALTY;
  if (m.bboxAspectExtreme) s -= ASPECT_PENALTY;
  if (m.meshCount > ISLAND_SOFT_CAP) s -= Math.min(15, (m.meshCount - ISLAND_SOFT_CAP) * 2);
  return clamp(round(s), 0, 100);
}

// topology — budget fit. Null without a target (GLB is triangulated; we cannot
// recover quad/tri intent, so we only score budget adherence — honest null when
// no budget is known, e.g. mock/old/lowpoly-derived assets). (grill B2)
export function scoreTopology(m: ObjectiveMetrics): number | null {
  if (m.targetFaceCount === null || m.targetFaceCount <= 0) return null;
  const fit = 1 - clamp(Math.abs(m.faces - m.targetFaceCount) / m.targetFaceCount, 0, 1);
  return clamp(round(100 * fit), 0, 100);
}

// texture — resolution tier, gated on UV + an actual texture.
export function scoreTexture(m: ObjectiveMetrics): number | null {
  if (!m.hasUV || m.maxTextureSize <= 0) return null;
  if (m.maxTextureSize >= 2048) return 100;
  if (m.maxTextureSize >= 1024) return 80;
  if (m.maxTextureSize >= 512) return 60;
  return 40;
}

// pbr — weighted map presence. Null when PBR is not applicable.
export function scorePbr(m: ObjectiveMetrics): number | null {
  if (!m.pbrApplicable) return null;
  let s = 0;
  if (m.hasBaseColorMap) s += 35;
  if (m.hasMetalRoughMap) s += 30;
  if (m.hasNormalMap) s += 20;
  if (m.hasOcclusionMap) s += 10;
  if (m.hasEmissiveMap) s += 5;
  return clamp(round(s), 0, 100);
}

export function scoreObjective(m: ObjectiveMetrics): ObjectiveScores {
  return {
    geometry: scoreGeometry(m),
    topology: scoreTopology(m),
    texture: scoreTexture(m),
    pbr: scorePbr(m),
  };
}

// Weighted average over non-null dims, renormalized by the kept weights.
export function weightedTotal(dims: { value: number | null; weight: number }[]): number | null {
  let sum = 0;
  let w = 0;
  for (const d of dims) {
    if (d.value !== null) {
      sum += d.value * d.weight;
      w += d.weight;
    }
  }
  return w > 0 ? round(sum / w) : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
bun test shared/quality/heuristics.test.ts
```
Expected: PASS (8 tests). Then `bun run typecheck` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add shared/quality/heuristics.ts shared/quality/heuristics.test.ts
git commit -m "feat(wb-gen3d): pure objective quality heuristics + tests (P3)"
```

---

## Task B2: Data model — `QualityReport` in `shared/manifest.ts`

**Files:**
- Modify: `shared/manifest.ts`

- [ ] **Step 1: Add the report types + helpers (after `QualityScore`, `shared/manifest.ts:80`)**

```ts
export type QualityDimSource = 'auto' | 'ai' | 'manual';

export interface QualityDim {
  value: number | null;
  source: QualityDimSource;
}

// Rich five-dimension report persisted to sidecar custom.quality. QualityScore
// (numeric, cross-plugin) is derived from this via reportToScore(). See ADR-0004.
export interface QualityReport {
  geometry: QualityDim;
  topology: QualityDim;
  texture: QualityDim;
  pbr: QualityDim;
  prompt_fidelity: QualityDim;
  total: number | null;
  method: 'auto' | 'auto+ai' | 'manual' | 'mixed';
  rater: string;
  notes: string;
  scoredAt: string;
}

export function emptyQualityReport(): QualityReport {
  const dim = (): QualityDim => ({ value: null, source: 'auto' });
  return {
    geometry: dim(),
    topology: dim(),
    texture: dim(),
    pbr: dim(),
    prompt_fidelity: dim(),
    total: null,
    method: 'auto',
    rater: '',
    notes: '',
    scoredAt: '',
  };
}

// Project the rich report onto the back-compat numeric QualityScore.
export function reportToScore(r: QualityReport): QualityScore {
  return {
    geometry: r.geometry.value,
    topology: r.topology.value,
    texture: r.texture.value,
    pbr: r.pbr.value,
    prompt_fidelity: r.prompt_fidelity.value,
    total: r.total,
  };
}
```

- [ ] **Step 2: Add `targetFaceCount` to `Gen3DAssetManifest` (after `quality: QualityScore;`, `:104`)**

```ts
  quality: QualityScore;
  // Generation-time target polycount, surfaced for the topology heuristic. Null
  // for mock/old assets that did not record a target. (grill B2)
  targetFaceCount?: number | null;
```

- [ ] **Step 3: Add `quality` to the sidecar custom namespace (in `AssetSidecar.custom`, after `cacheKey?`, `:158`)**

```ts
    cacheKey?: string;
    // Lazy-persisted quality report (ADR-0004). Absent until first score/override.
    quality?: QualityReport;
```

- [ ] **Step 4: Typecheck**

Run:
```bash
bun run typecheck
```
Expected: errors in `per-game-store.ts` (its `Gen3DAssetManifest` literals now miss nothing — `targetFaceCount` is optional so no error) — should be **0 errors**. (Optional field keeps existing literals valid.)

- [ ] **Step 5: Commit**

```bash
git add shared/manifest.ts
git commit -m "feat(wb-gen3d): QualityReport data model + reportToScore + targetFaceCount (P3)"
```

---

## Task B3: Storage — `updateAssetQuality` + sidecar surfacing — TDD

**Files:**
- Modify: `server/asset-storage.ts`, `server/per-game-store.ts`
- Test: `server/per-game-store.test.ts`

- [ ] **Step 1: Write the failing store test**

```ts
// server/per-game-store.test.ts
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { PerGameAssetStore } from './per-game-store';
import { emptyQualityReport } from '../shared/manifest';

let root: string;
const store = new PerGameAssetStore();
const SLUG = 'testgame';
// Minimal GLB header bytes (matches catalog mock); enough for the store path.
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03]);

beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'wbgen3d-'));
  process.env.FORGEAX_PROJECT_ROOT = root;
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeOne() {
  return store.writeAsset({
    slug: SLUG,
    assetSlot: 'meshes',
    assetName: 'box',
    files: [{ data: GLB, format: 'glb', role: 'source_mesh' }],
    meta: {
      provider: 'meshy',
      providerMode: 'mock',
      mode: 'text',
      sourceJobId: null,
      prompt: 'a box',
      sourceInputAssetPaths: [],
      faceCount: 12345,
    },
  });
}

test('writeAsset surfaces targetFaceCount; quality starts empty', async () => {
  const m = await writeOne();
  expect(m.targetFaceCount).toBe(12345);
  expect(m.quality.geometry).toBeNull();
});

test('updateAssetQuality persists report + surfaces numeric quality, idempotent', async () => {
  const m = await writeOne();
  const report = {
    ...emptyQualityReport(),
    geometry: { value: 88, source: 'auto' as const },
    topology: { value: 70, source: 'auto' as const },
    total: 79,
    method: 'auto' as const,
    scoredAt: new Date().toISOString(),
  };
  const updated1 = await store.updateAssetQuality(SLUG, m.assetPath, report);
  expect(updated1.quality.geometry).toBe(88);
  expect(updated1.quality.total).toBe(79);

  // Re-read from disk: persisted.
  const reread = await store.getAsset(SLUG, m.assetPath);
  expect(reread?.quality.geometry).toBe(88);

  // Idempotent: applying the same report again yields the same numbers.
  const updated2 = await store.updateAssetQuality(SLUG, m.assetPath, report);
  expect(updated2.quality).toEqual(updated1.quality);
});

test('updateAssetQuality on a missing asset throws asset_not_found', async () => {
  await expect(
    store.updateAssetQuality(SLUG, 'assets/3d/meshes/nope.glb', emptyQualityReport()),
  ).rejects.toThrow(/not found/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
bun test server/per-game-store.test.ts
```
Expected: FAIL — `store.updateAssetQuality is not a function` (and `targetFaceCount` undefined).

- [ ] **Step 3: Add `updateAssetQuality` to the `AssetStorage` interface**

In `server/asset-storage.ts`, import `QualityReport` and add the method (after `appendDerivedFiles(...)`, `:57`):
```ts
import type {
  AssetSlot,
  FileFormat,
  FileRole,
  Gen3DAssetManifest,
  MotionType,
  QualityReport,
  SkeletonProfile,
} from '../shared/manifest';
// ...
  // Persist the five-dimension quality report into the asset sidecar
  // (custom.quality) and return the refreshed manifest. Serialized per asset
  // under the same lock as appendDerivedFiles so concurrent writes never clobber
  // each other. Only custom.quality is touched; dependencies/readiness untouched.
  updateAssetQuality(
    slug: string,
    assetPath: string,
    report: QualityReport,
  ): Promise<Gen3DAssetManifest>;
```

- [ ] **Step 4: Implement in `per-game-store.ts`**

Extend the manifest import (`:22-35`) to include `QualityReport`, `emptyQualityReport`, `reportToScore`:
```ts
import {
  ASSET_SLOT_DIRS,
  computeReadiness,
  emptyQuality,
  reportToScore,
  type AssetSidecar,
  type AssetSlot,
  type FileFormat,
  type FileRole,
  type Gen3DAssetManifest,
  type ManifestFile,
  type MotionType,
  type QualityReport,
  type SidecarDependency,
  type SkeletonProfile,
} from '../shared/manifest';
```

Add the method inside the class (e.g. after `appendDerivedFiles`, before `readAssetFile`, `:394`):
```ts
  // ─── Lazy quality persistence (ADR-0004) ──────────────────────────────────
  async updateAssetQuality(
    slug: string,
    assetPath: string,
    report: QualityReport,
  ): Promise<Gen3DAssetManifest> {
    return withAssetLock(`${slug}:${assetPath}`, async () => {
      const { slot, fileName } = parseAssetPath(assetPath);
      if (!slot) {
        throw Object.assign(new Error(`unrecognized assetPath ${JSON.stringify(assetPath)}`), {
          code: 'invalid_asset_path',
        });
      }
      const dir = slotDir(slug, slot);
      const sidecarAbs = resolve(dir, `${fileName}.meta.json`);
      let sidecar: AssetSidecar;
      try {
        sidecar = JSON.parse(await readFile(sidecarAbs, 'utf8')) as AssetSidecar;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw Object.assign(new Error(`asset not found: ${assetPath}`), { code: 'asset_not_found' });
        }
        throw error;
      }
      const updated: AssetSidecar = {
        ...sidecar,
        custom: { ...sidecar.custom, quality: report },
      };
      await writeFile(sidecarAbs, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
      return sidecarToManifest(slug, slot, fileName, updated);
    });
  }
```

- [ ] **Step 5: Surface quality + targetFaceCount in `sidecarToManifest` (`:494-512`)**

Replace the return object's `quality` line and add `targetFaceCount`:
```ts
  return {
    manifestVersion: 1,
    assetPath: mainRel,
    assetSlot: slot,
    kind: 'mesh',
    provider: c.provider,
    providerMode: c.providerMode,
    mode: c.mode,
    sourceJobId: c.sourceJobId,
    sourceInputAssetPaths: c.sourceInputAssetPaths ?? [],
    prompt: c.prompt,
    files,
    readiness: computeReadiness(files),
    quality: c.quality ? reportToScore(c.quality) : emptyQuality(),
    targetFaceCount: c.faceCount ?? null,
    createdAt: sidecar.createdAt,
    updatedAt: sidecar.createdAt,
  };
```

- [ ] **Step 6: Surface `targetFaceCount` in `writeAsset` return (`:249-265`)**

Add the field to the returned manifest:
```ts
      quality: emptyQuality(),
      targetFaceCount: meta.faceCount ?? null,
      createdAt: now,
```

- [ ] **Step 7: Run the store test + typecheck**

Run:
```bash
bun test server/per-game-store.test.ts && bun run typecheck
```
Expected: PASS (3 tests); typecheck 0 errors.

- [ ] **Step 8: Commit**

```bash
git add server/asset-storage.ts server/per-game-store.ts server/per-game-store.test.ts
git commit -m "feat(wb-gen3d): updateAssetQuality + sidecar quality/faceCount surfacing + tests (P3)"
```

---

## Task B4: Tool `gen3d:score-quality` (merge + persist)

**Files:**
- Create: `schemas/score-quality.args.json`, `schemas/score-quality.returns.json`
- Modify: `server/tool-handlers.ts`, `forgeax-extension.json`

- [ ] **Step 1: Create the schemas**

`schemas/score-quality.args.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "gen3d:score-quality args",
  "type": "object",
  "properties": {
    "slug": { "type": "string", "description": "Active game slug. Injected by the host; required." },
    "assetPath": { "type": "string", "description": "Game-relative asset path (assets/3d/<slot>/<name>.glb)." },
    "objective": {
      "type": "object",
      "description": "Client-computed objective scores (0–100 or null) from the loaded GLB.",
      "properties": {
        "geometry": { "type": ["number", "null"] },
        "topology": { "type": ["number", "null"] },
        "texture": { "type": ["number", "null"] },
        "pbr": { "type": ["number", "null"] }
      },
      "additionalProperties": false
    },
    "aiPass": { "type": "boolean", "default": false, "description": "Trigger AI vision scoring. Mock stub this round (returns usedMock, no values)." },
    "manual": {
      "type": "object",
      "description": "Manual overrides (0–100 or null) + notes. Overridden dims are marked source=manual.",
      "properties": {
        "geometry": { "type": ["number", "null"] },
        "topology": { "type": ["number", "null"] },
        "texture": { "type": ["number", "null"] },
        "pbr": { "type": ["number", "null"] },
        "prompt_fidelity": { "type": ["number", "null"] },
        "notes": { "type": "string" }
      },
      "additionalProperties": false
    }
  },
  "required": ["assetPath"],
  "additionalProperties": false
}
```

`schemas/score-quality.returns.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "gen3d:score-quality returns",
  "type": "object",
  "properties": {
    "ok": { "const": true },
    "usedMock": { "type": "boolean" },
    "manifest": { "type": "object", "description": "Updated Gen3DAssetManifest (quality numbers surfaced)." }
  },
  "required": ["ok", "usedMock", "manifest"],
  "additionalProperties": false
}
```

- [ ] **Step 2: Add the handler to `server/tool-handlers.ts`**

Extend the manifest import (`:10-18`) with `emptyQualityReport`, `type QualityReport`, `type QualityDim`, `type QualityDimSource`:
```ts
import {
  emptyQualityReport,
  selectFile,
  selectFiles,
  type AssetSlot,
  type Gen3DAssetManifest,
  type GenerationMode,
  type MotionType,
  type ProviderId,
  type QualityDim,
  type QualityReport,
} from '../shared/manifest';
```
Import the weighting helper from the shared heuristics:
```ts
import { DEFAULT_WEIGHTS, weightedTotal } from '../shared/quality/heuristics';
```

Add the handler (before the `tools` registry, `:820`):
```ts
// ─── Quality scoring (ADR-0004, P3) ─────────────────────────────────────────
// Stateless merge of three sources (client objective + AI mock + manual) into a
// QualityReport, persisted via storage.updateAssetQuality. The server has no
// three.js, so objective dims are computed CLIENT-side and passed in; this tool
// never recomputes. AI vision is a mock stub this round (D4 / grill B6).

type DimKey = 'geometry' | 'topology' | 'texture' | 'pbr' | 'prompt_fidelity';

interface ScoreQualityArgs {
  slug?: string;
  assetPath: string;
  objective?: Partial<Record<'geometry' | 'topology' | 'texture' | 'pbr', number | null>>;
  aiPass?: boolean;
  manual?: Partial<Record<DimKey, number | null>> & { notes?: string };
}

interface ScoreQualityResult {
  ok: true;
  usedMock: boolean;
  manifest: Gen3DAssetManifest;
}

function clampScore(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return Math.min(100, Math.max(0, Math.round(v)));
}

async function scoreQuality(args: ScoreQualityArgs): Promise<ScoreQualityResult> {
  const slug = requireSlug(args.slug);
  const assetPath = args.assetPath?.trim();
  if (!assetPath) {
    throw Object.assign(new Error('assetPath is required'), { code: 'invalid_asset_path' });
  }
  const existing = await storage.getAsset(slug, assetPath);
  if (!existing) {
    throw Object.assign(new Error(`asset not found: ${assetPath}`), { code: 'asset_not_found' });
  }

  const report: QualityReport = emptyQualityReport();
  const setDim = (key: DimKey, value: number | null, source: QualityDim['source']) => {
    report[key] = { value: clampScore(value), source };
  };

  // 1) objective (client-computed)
  const obj = args.objective;
  let hasObjective = false;
  if (obj) {
    for (const key of ['geometry', 'topology', 'texture', 'pbr'] as const) {
      if (key in obj) {
        setDim(key, obj[key] ?? null, 'auto');
        hasObjective = true;
      }
    }
  }

  // 2) AI vision — mock stub this round (D4): flag usedMock, leave dims null.
  let usedMock = false;
  if (args.aiPass) usedMock = true;

  // 3) manual overrides (win over objective for the named dims)
  let hasManual = false;
  if (args.manual) {
    for (const key of ['geometry', 'topology', 'texture', 'pbr', 'prompt_fidelity'] as const) {
      if (key in args.manual) {
        setDim(key, args.manual[key] ?? null, 'manual');
        hasManual = true;
      }
    }
    if (typeof args.manual.notes === 'string') report.notes = args.manual.notes;
    if (hasManual) report.rater = 'local';
  }

  report.method = hasManual && hasObjective ? 'mixed' : hasManual ? 'manual' : 'auto';
  report.total = weightedTotal([
    { value: report.geometry.value, weight: DEFAULT_WEIGHTS.geometry },
    { value: report.topology.value, weight: DEFAULT_WEIGHTS.topology },
    { value: report.texture.value, weight: DEFAULT_WEIGHTS.texture },
    { value: report.pbr.value, weight: DEFAULT_WEIGHTS.pbr },
    { value: report.prompt_fidelity.value, weight: DEFAULT_WEIGHTS.prompt_fidelity },
  ]);
  report.scoredAt = new Date().toISOString();

  const manifest = await storage.updateAssetQuality(slug, assetPath, report);
  return { ok: true, usedMock, manifest };
}
```

Register in the `tools` object (`:821-836`):
```ts
  'gen3d:score-quality': async (args: ScoreQualityArgs) => scoreQuality(args),
```

- [ ] **Step 3: Register the tool in `forgeax-extension.json`**

Add after the `gen3d:retopo-lowpoly` entry (`:166`), inside `tools`:
```json
      ,{
        "id": "gen3d:score-quality",
        "args": "./schemas/score-quality.args.json",
        "returns": "./schemas/score-quality.returns.json",
        "exposedToAI": false,
        "description": {
          "zh": "质量评分（按需混合，ADR-0004）：合并客户端客观启发式 + 人工覆盖（AI 视觉评本期为 mock 桩）写入资产 sidecar 的 quality 报告，返回更新后的 manifest。lazy 持久化：浏览不写盘，仅评分/覆盖时落库。",
          "en": "Score quality (on-demand hybrid, ADR-0004): merge client objective heuristics + manual overrides (AI vision is a mock stub this round) into the asset sidecar quality report and return the updated manifest. Lazy persistence: browsing never writes; only scoring/override persists."
        }
      }
```

- [ ] **Step 4: Typecheck + build**

Run:
```bash
bun run typecheck && bun run build
```
Expected: 0 errors; build OK.

- [ ] **Step 5: Commit**

```bash
git add schemas/score-quality.args.json schemas/score-quality.returns.json server/tool-handlers.ts forgeax-extension.json
git commit -m "feat(wb-gen3d): gen3d:score-quality tool (merge objective/manual, persist) (P3)"
```

---

## Task B5: Client objective extractor (`src/lib/objectiveMetrics.ts`)

**Files:**
- Create: `src/lib/objectiveMetrics.ts`

- [ ] **Step 1: Create the extractor**

```ts
// src/lib/objectiveMetrics.ts
// Walk a loaded GLTF scene into a plain ObjectiveMetrics for shared heuristics.
// three-dependent (lives in src/, not unit-tested); the scoring it feeds is the
// tested pure unit (shared/quality/heuristics.ts).
import * as THREE from 'three';
import type { ObjectiveMetrics } from '@shared/quality/heuristics';

const DEGENERATE_EPS = 1e-10;

function maxImageSize(tex: THREE.Texture | null | undefined): number {
  const img = tex?.image as { width?: number; height?: number } | undefined;
  if (!img || !img.width || !img.height) return 0;
  return Math.max(img.width, img.height);
}

export function extractObjectiveMetrics(
  root: THREE.Object3D,
  targetFaceCount: number | null,
): ObjectiveMetrics {
  let faces = 0;
  let vertices = 0;
  let degenerate = 0;
  let meshCount = 0;
  let missingNormals = false;
  let hasUV = false;
  let maxTextureSize = 0;
  let hasBaseColorMap = false;
  let hasMetalRoughMap = false;
  let hasNormalMap = false;
  let hasOcclusionMap = false;
  let hasEmissiveMap = false;
  let pbrApplicable = false;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    meshCount += 1;
    const geom = mesh.geometry;
    const pos = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) return;
    vertices += pos.count;
    if (!geom.getAttribute('normal')) missingNormals = true;
    if (geom.getAttribute('uv')) hasUV = true;

    const index = geom.index;
    const triCount = index ? index.count / 3 : pos.count / 3;
    faces += triCount;
    // Degenerate (zero-area) triangle sampling — cap work on huge meshes.
    const step = triCount > 20000 ? Math.ceil(triCount / 20000) : 1;
    for (let t = 0; t < triCount; t += step) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, i1);
      c.fromBufferAttribute(pos, i2);
      const area = b.clone().sub(a).cross(c.clone().sub(a)).lengthSq();
      if (area < DEGENERATE_EPS) degenerate += 1;
    }

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (std && (std.isMeshStandardMaterial || (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial)) {
        pbrApplicable = true;
        if (std.map) { hasBaseColorMap = true; maxTextureSize = Math.max(maxTextureSize, maxImageSize(std.map)); }
        if (std.metalnessMap || std.roughnessMap) hasMetalRoughMap = true;
        if (std.normalMap) hasNormalMap = true;
        if (std.aoMap) hasOcclusionMap = true;
        if (std.emissiveMap) hasEmissiveMap = true;
      } else if ((m as THREE.MeshBasicMaterial)?.map) {
        maxTextureSize = Math.max(maxTextureSize, maxImageSize((m as THREE.MeshBasicMaterial).map));
      }
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const dims = [size.x, size.y, size.z].filter((d) => d > 1e-6);
  const aspect = dims.length === 3 ? Math.max(...dims) / Math.min(...dims) : 1;

  const sampled = Math.max(1, Math.ceil(faces / (faces > 20000 ? Math.ceil(faces / 20000) : 1)));
  return {
    faces: Math.round(faces),
    vertices,
    degenerateFaceRatio: sampled > 0 ? degenerate / sampled : 0,
    meshCount,
    missingNormals,
    bboxAspectExtreme: aspect > 25,
    targetFaceCount,
    hasUV,
    maxTextureSize,
    hasBaseColorMap,
    hasMetalRoughMap,
    hasNormalMap,
    hasOcclusionMap,
    hasEmissiveMap,
    pbrApplicable,
  };
}
```

Add a tsconfig path note: `@shared/*` already maps to `./shared/*`, so `@shared/quality/heuristics` resolves.

- [ ] **Step 2: Typecheck + build**

Run:
```bash
bun run typecheck && bun run build
```
Expected: 0 errors; build OK.

- [ ] **Step 3: Commit**

```bash
git add src/lib/objectiveMetrics.ts
git commit -m "feat(wb-gen3d): client GLB → ObjectiveMetrics extractor (P3)"
```

---

## Task B6: `QualityInspector` UI + wiring (replaces `InspectorReserved`)

**Files:**
- Create: `src/components/QualityInspector.tsx`
- Modify: `src/components/AssetLibrary.tsx`, `src/App.tsx`, `src/types.ts`, `src/styles.css`

- [ ] **Step 1: Add `ScoreQualityResult` to `src/types.ts`**

```ts
// gen3d:score-quality result. The merged/persisted report is surfaced as the
// numeric manifest.quality on the returned manifest.
export interface ScoreQualityResult {
  ok: true;
  usedMock: boolean;
  manifest: Gen3DAssetManifest;
}
```

- [ ] **Step 2: Create `src/components/QualityInspector.tsx`**

```tsx
// src/components/QualityInspector.tsx
// On-demand five-dimension quality scorer (ADR-0004, Phase A). On asset select it
// headlessly loads the source GLB, extracts ObjectiveMetrics, scores client-side,
// and DISPLAYS (no disk write — lazy, grill B5). Persistence happens only on
// "保存评分" (manual/objective) via gen3d:score-quality. AI scoring is disabled
// this round (grill B6). Mock assets (fake GLB bytes) fail to parse → shown as
// "无法解析（mock）".
import { useEffect, useRef, useState, type JSX } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { selectFile } from '@shared/manifest';
import type { Gen3DAssetManifest } from '@shared/manifest';
import {
  scoreObjective,
  weightedTotal,
  DEFAULT_WEIGHTS,
  type ObjectiveScores,
} from '@shared/quality/heuristics';
import { extractObjectiveMetrics } from '@/lib/objectiveMetrics';
import { blobUrl } from '@/lib/blobUrl';
import { callTool } from '@/lib/toolClient';
import type { ScoreQualityResult } from '@/types';
import { EDITOR_ICON_MAP } from '@/ui-meta';

const GaugeIcon = EDITOR_ICON_MAP.quality;
const DIMS = ['geometry', 'topology', 'texture', 'pbr', 'prompt_fidelity'] as const;
type Dim = (typeof DIMS)[number];
const DIM_LABEL: Record<Dim, string> = {
  geometry: '几何',
  topology: '拓扑',
  texture: '贴图',
  pbr: 'PBR',
  prompt_fidelity: '语义贴合',
};

export function QualityInspector({
  selected,
  onScored,
}: {
  selected: Gen3DAssetManifest | null;
  onScored: (m: Gen3DAssetManifest) => void;
}): JSX.Element {
  const [objective, setObjective] = useState<ObjectiveScores | null>(null);
  const [phase, setPhase] = useState<'idle' | 'computing' | 'ready' | 'unparsable'>('idle');
  const [manual, setManual] = useState<Partial<Record<Dim, number | null>>>({});
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const tokenRef = useRef(0);

  const meshFile = selected ? selectFile(selected.files, 'source_mesh', 'glb') : null;
  const url = blobUrl(meshFile);

  // Lazy compute on select (no persistence).
  useEffect(() => {
    setManual({});
    setNotes(selected?.quality ? '' : '');
    setEditing(false);
    if (!selected || !url) {
      setObjective(null);
      setPhase('idle');
      return;
    }
    const token = ++tokenRef.current;
    setPhase('computing');
    new GLTFLoader().load(
      url,
      (gltf) => {
        if (token !== tokenRef.current) return;
        const metrics = extractObjectiveMetrics(gltf.scene, selected.targetFaceCount ?? null);
        setObjective(scoreObjective(metrics));
        setPhase('ready');
      },
      undefined,
      () => {
        if (token !== tokenRef.current) return;
        setObjective(null);
        setPhase('unparsable');
      },
    );
  }, [selected, url]);

  const value = (dim: Dim): number | null => {
    if (dim in manual) return manual[dim] ?? null;
    if (dim === 'prompt_fidelity') return null; // AI-only, deferred (grill B4)
    return objective ? objective[dim as keyof ObjectiveScores] : null;
  };
  const source = (dim: Dim): 'auto' | 'manual' | 'none' =>
    dim in manual ? 'manual' : dim === 'prompt_fidelity' ? 'none' : objective && value(dim) !== null ? 'auto' : 'none';

  const total = weightedTotal(DIMS.map((d) => ({ value: value(d), weight: DEFAULT_WEIGHTS[d] })));

  async function save() {
    if (!selected) return;
    setSaving(true);
    const r = await callTool<ScoreQualityResult>('gen3d:score-quality', {
      assetPath: selected.assetPath,
      objective: objective
        ? { geometry: objective.geometry, topology: objective.topology, texture: objective.texture, pbr: objective.pbr }
        : undefined,
      manual: { ...manual, notes },
    });
    setSaving(false);
    if (r.ok) {
      onScored(r.result.manifest);
      setEditing(false);
    }
  }

  if (!selected) {
    return (
      <section className="reserved-card">
        <div className="reserved-head">
          <GaugeIcon size={15} />
          <span className="reserved-title">质量评分</span>
        </div>
        <p className="reserved-note">从资产库选择一个资产以计算五维质量评分。</p>
      </section>
    );
  }

  return (
    <section className="reserved-card">
      <div className="reserved-head">
        <GaugeIcon size={15} />
        <span className="reserved-title">质量评分</span>
        {total !== null && <span className="reserved-badge">总分 {total}</span>}
      </div>

      {phase === 'unparsable' ? (
        <p className="reserved-note">无法解析模型（mock 资产为占位字节，无法客观评分）。</p>
      ) : (
        <div className="quality-dims">
          {DIMS.map((dim) => {
            const v = value(dim);
            const src = source(dim);
            return (
              <div className="q-row" key={dim}>
                <span className="q-label">{DIM_LABEL[dim]}</span>
                <div className="q-bar">
                  <div className="q-bar-fill" style={{ width: `${v ?? 0}%` }} />
                </div>
                <span className="q-val">{v ?? '—'}</span>
                <span className={`q-src q-src--${src}`}>
                  {src === 'auto' ? '自动' : src === 'manual' ? '手动' : '—'}
                </span>
                {editing && (
                  <input
                    className="q-edit"
                    type="number"
                    min={0}
                    max={100}
                    value={v ?? ''}
                    onChange={(e) =>
                      setManual((m) => ({ ...m, [dim]: e.target.value === '' ? null : Number(e.target.value) }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected.targetFaceCount == null && phase === 'ready' && (
        <p className="reserved-note">无目标面数（mock/旧/低模派生）→ 拓扑维记为「—」。</p>
      )}
      <p className="reserved-note">语义贴合（prompt_fidelity）继承自源，待 AI 评分（P4）。</p>

      {editing && (
        <textarea
          className="fx-textarea"
          rows={2}
          placeholder="评分备注（可选）"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      )}

      <div className="q-actions">
        <button
          type="button"
          className="fx-btn fx-btn--sm"
          disabled={phase === 'computing'}
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? '取消手动' : '手动覆盖'}
        </button>
        <button
          type="button"
          className="fx-btn fx-btn--sm"
          disabled
          title="AI 视觉评分待 server 授权后开放（P4）"
        >
          AI 评分
        </button>
        <button
          type="button"
          className="fx-btn fx-btn--sm fx-btn--primary"
          disabled={saving || phase === 'computing' || phase === 'unparsable'}
          onClick={save}
        >
          {saving ? '保存中…' : '保存评分'}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Remove `InspectorReserved` from `AssetLibrary.tsx`**

Delete the `InspectorReserved` export (`:167-193`) and the now-unused `GaugeIcon` import (`:9`). Leave `AssetLibrary` itself unchanged.

- [ ] **Step 4: Wire `QualityInspector` in `App.tsx`**

Replace the import (`:9`) and usage (`:224`):
```tsx
import { AssetLibrary } from '@/components/AssetLibrary';
import { QualityInspector } from '@/components/QualityInspector';
```
Add a scored callback (after `deleteAsset`, `:61`):
```tsx
const handleScored = useCallback(
  (m: Gen3DAssetManifest) => {
    setSelected((cur) => (cur?.assetPath === m.assetPath ? m : cur));
    void refreshAssets();
  },
  [refreshAssets],
);
```
Replace `<InspectorReserved selected={selected} />` with:
```tsx
<QualityInspector selected={selected} onScored={handleScored} />
```

- [ ] **Step 5: Add styles to `src/styles.css`**

Append (reuse `.reserved-card`/tokens; new `.q-*` rows):
```css
.q-row { display: grid; grid-template-columns: 56px 1fr 30px 34px auto; gap: 8px; align-items: center; margin-bottom: 6px; }
.q-label { font-size: 11px; color: var(--color-text-secondary); }
.q-bar { height: 6px; border-radius: 3px; background: var(--color-background-floating); overflow: hidden; }
.q-bar-fill { height: 100%; background: var(--primary); transition: width var(--motion-duration-base) var(--motion-ease-out); }
.q-val { font-size: 11px; color: var(--color-text-primary); text-align: right; }
.q-src { font-size: 10px; padding: 1px 5px; border-radius: 999px; }
.q-src--auto { color: var(--primary); background: var(--primary-bg); }
.q-src--manual { color: var(--color-status-amber); }
.q-src--none { color: var(--color-text-tertiary, var(--color-text-secondary)); }
.q-edit { width: 52px; padding: 2px 4px; border: 1px solid var(--color-border-default); border-radius: var(--radius-md); background: var(--color-background-floating); color: var(--color-text-primary); }
.q-actions { display: flex; gap: 6px; margin-top: 8px; }
```

- [ ] **Step 6: Typecheck + build**

Run:
```bash
bun run typecheck && bun run build
```
Expected: 0 errors; build OK.

- [ ] **Step 7: Commit**

```bash
git add src/components/QualityInspector.tsx src/components/AssetLibrary.tsx src/App.tsx src/types.ts src/styles.css
git commit -m "feat(wb-gen3d): QualityInspector UI (objective/manual/notes, AI disabled) (P3)"
```

---

## Task B7: Full-chain verification + docs

**Files:** `docs/adr/0004-...md` (verify), `HANDOFF.md`, `CONTEXT.md`

- [ ] **Step 1: Mock-asset path (no real GLB)**

`bun run dev`, generate a mock asset, select it. Expected: inspector shows "无法解析（mock 资产…）"; 保存评分 disabled. (Mock bytes aren't a real GLB.)

- [ ] **Step 2: Real-GLB path (objective → persist → reread → manual idempotent)**

Use a real textured GLB asset (or temporarily drop a real `.glb` into a game's `assets/3d/meshes/` with a matching sidecar). Select it:
1. Objective dims display instantly (no network, no disk write — confirm no sidecar mtime change while only browsing).
2. Click 保存评分 → `gen3d:score-quality` persists; reselect/refresh → numbers persist (now from `manifest.quality`).
3. 手动覆盖 one dim + notes → 保存 → reread persists with that dim source=manual; re-saving same values is idempotent.
4. Confirm `topology` is `—` when `targetFaceCount` is null (old asset) and a number when present.
5. AI 评分 button is visibly disabled with the P4 tooltip.

Rebuild `dist/`, hard-refresh Studio, repeat select/score once embedded.

- [ ] **Step 3: Run the whole test suite**

Run:
```bash
bun test && bun run typecheck && bun run build
```
Expected: all tests pass; 0 typecheck errors; build OK.

- [ ] **Step 4: Docs**

Confirm `docs/adr/0004-on-demand-hybrid-quality-scoring.md` reflects lazy persistence (already amended in the grill). In `CONTEXT.md`, the `QualityReport` glossary entry already exists — verify it matches the shipped types. In `HANDOFF.md`, mark P3 done and link this plan.

- [ ] **Step 5: Commit**

```bash
git add HANDOFF.md CONTEXT.md docs/adr/0004-on-demand-hybrid-quality-scoring.md
git commit -m "docs(wb-gen3d): record quality scoring P3 (Phase A) completion"
```

---

## Self-Review (B)

**Spec coverage (PLAN §5 / §7 / §10 P3 / grill B1–B6):**
- B1 client objective → `score-quality` merge-only → B5 extractor (`objectiveMetrics.ts`) + B1 heuristics + B4 tool (no recompute). ✅
- B2 `sidecarToManifest` surfaces `custom.quality` + `custom.faceCount`→`targetFaceCount`; topology budget-fit else null → B3 Step 5 + B1 `scoreTopology`. ✅
- B3 `updateAssetQuality` under `withAssetLock`, only `custom.quality` → B3 Step 4. ✅
- B4 derived `prompt_fidelity` deferred → QualityInspector shows null + hint; objective recomputed per asset. ✅
- B5 lazy compute/persist → QualityInspector computes on select w/o disk write; persist only on 保存. ✅
- B6 AI button disabled + tooltip → QualityInspector. ✅
- §7 data model (`QualityReport`/`emptyQualityReport`/`reportToScore`/`targetFaceCount`/`custom.quality`) → B2. ✅
- §5 tool `gen3d:score-quality` (`exposedToAI:false`, mock-first AI) + schemas + registration → B4. ✅
- §5 UI `QualityInspector` replaces `InspectorReserved` → B6. ✅

**Placeholder scan:** all code present; heuristics + store are TDD with real assertions; tool/UI verified by build + full-chain manual. No TBD. ✅

**Type consistency:** `ObjectiveMetrics`/`ObjectiveScores`/`DEFAULT_WEIGHTS`/`weightedTotal` shared by extractor, tool, and UI. `QualityReport`/`QualityDim`/`reportToScore`/`emptyQualityReport` shared by manifest, store, tool. `ScoreQualityResult` used by UI matches the tool's return. `gen3d:score-quality` id consistent across handler/registry/schema/UI. `objective` keys are the four objective dims everywhere; `manual` adds `prompt_fidelity`+`notes`. ✅

**Decoupling check:** QualityInspector loads its own GLB (no `ModelViewer` import) → no dependency on Plan A. ✅
