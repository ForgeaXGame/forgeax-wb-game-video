# Plan C — Provider-Specific Parameters (P5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose each provider's verified high-value native parameters (Meshy `ai_model`/`model_type`/`should_remesh`/`topology`/`pose_mode`/`decimation_mode`; Rodin `tier`/`quality`/`mesh_mode`/`material`/`TAPose`/`use_original_alpha`/`quality_override`) through a single `shared/provider-params.ts` spec that drives: ① a collapsible advanced panel in `SetupSidebar`, ② an open `providerParams` tool arg, ③ server-side field validation/forwarding into each provider's `buildPayload`/`buildForm`.

**Architecture (grill C1/C2):** The param-spec is the single source of truth. JSON schemas declare `providerParams` as an **open object** (no per-field schema, no generator); the **server** validates field-by-field via the pure `filterProviderParams()` against the spec's `verified` + `appliesToModes` + type whitelist, dropping anything undeclared/unverified/ill-typed. Verified = "documented to exist" (PROVIDER_PARAMS §0); params are inert in mock/no-key runs and only take effect when the provider runs for real. C touches only the generation input chain — **no coupling** to the viewer (A) or scoring (B).

**Tech Stack:** TypeScript 5.7, bun test (pure `filterProviderParams`), React 19 (SetupSidebar), Bun providers.

**Scope guard:** Only doc-verified native params (PROVIDER_PARAMS §6). **Excluded on purpose:** deprecated Meshy (`art_style`/`symmetry_mode`/`negative_prompt`); post-process-only competitor fields (auto-size/pivot); `geometry_file_format` (store keeps GLB-only — changing it would break persistence); all `⏳ 待验证` fields (Rodin HighPack/seed/geometry-instructions, Hunyuan PolygonType/GenerateType).

**Conventions:** All commands run from `packages/marketplace/extensions/wb-gen3d/`. `bun test` needs the runner from Plan A P1.2 Step 2b (`"test": "bun test"` + tsconfig `"exclude": ["**/*.test.ts"]`); if not present, add it first (Task C0). After `src/**` changes, `bun run build` + hard-refresh Workbench.

**SSOT:** `docs/PROVIDER_PARAMS.md` (the verified field catalog this plan implements).

**Suggested branch:** `laurenceelu/feat-20260614-gen3d-provider-params`.

---

## File Structure

| File | New/Mod | Responsibility |
|---|---|---|
| `shared/provider-params.ts` | **New** | `ParamField` type, `providerParamSpec` (verified fields), pure `filterProviderParams()` |
| `shared/provider-params.test.ts` | **New** | bun tests: whitelist / verified / appliesToModes / type coercion / clamp |
| `server/providers/meshy.ts` | Mod | `MeshyGenerateInput.params?`; spread params in `buildPayload` (+ should_remesh/topology dependency) |
| `server/providers/rodin.ts` | Mod | `RodinGenerateInput.params?`; `form.set` params in `buildForm` (override hardcoded tier/material/qualityOverride) |
| `server/tool-handlers.ts` | Mod | `BaseGenArgs.providerParams?`; `buildProviderParams()` helper; fold into cacheKey + pass to meshy/rodin inputs (text/image/views) |
| `schemas/text-to-3d.args.json` | Mod | add open `providerParams` object |
| `schemas/image-to-3d.args.json` | Mod | add open `providerParams` object |
| `schemas/views-to-3d.args.json` | Mod | add open `providerParams` object |
| `src/components/SetupSidebar.tsx` | Mod | advanced "provider 专属参数" collapsible (spec-driven), state, include in submit |
| `src/ui-meta.ts` | Mod | add `params` icon |
| `docs/CAPABILITY_MATRIX.md` | Mod | note param-spec exposure + link PROVIDER_PARAMS |

> `src/types.ts`: **no change needed** — param types live in `shared/provider-params.ts` and are imported where used (keeps the change surgical; spec §9's file list is a superset).

---

## Task C0: Ensure the bun test runner is wired

**Files:** `package.json`, `tsconfig.json` (skip if Plan A/B already did this)

- [ ] **Step 1:** Confirm `"test": "bun test"` in `package.json` scripts and `"exclude": ["**/*.test.ts"]` in `tsconfig.json`; add if missing.
- [ ] **Step 2:** Run `bun run typecheck` → expect 0 errors.

---

## Task C1: Param-spec + pure filter (`shared/provider-params.ts`) — TDD

**Files:**
- Create: `shared/provider-params.ts`
- Test: `shared/provider-params.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/provider-params.test.ts
import { test, expect } from 'bun:test';
import { filterProviderParams, providerParamSpec } from './provider-params';

test('meshy text: keeps verified+applicable fields, drops unknown + deprecated', () => {
  const out = filterProviderParams('meshy', 'text', {
    ai_model: 'meshy-6',
    topology: 'quad',
    art_style: 'realistic', // deprecated → not in spec → dropped
    bogus: 'x', // unknown → dropped
  });
  expect(out).toEqual({ ai_model: 'meshy-6', topology: 'quad' });
});

test('meshy model_type only applies to image mode', () => {
  expect(filterProviderParams('meshy', 'text', { model_type: 'lowpoly' })).toEqual({});
  expect(filterProviderParams('meshy', 'image', { model_type: 'lowpoly' })).toEqual({
    model_type: 'lowpoly',
  });
});

test('enum rejects invalid values; bool rejects non-bool', () => {
  expect(filterProviderParams('meshy', 'text', { ai_model: 'meshy-9' })).toEqual({});
  expect(filterProviderParams('meshy', 'text', { should_remesh: 'yes' as unknown as boolean })).toEqual(
    {},
  );
  expect(filterProviderParams('meshy', 'text', { should_remesh: true })).toEqual({
    should_remesh: true,
  });
});

test('rodin int clamps to range; quality enum validated', () => {
  expect(filterProviderParams('rodin', 'text', { quality_override: 5_000_000 })).toEqual({
    quality_override: 200000,
  });
  expect(filterProviderParams('rodin', 'text', { quality_override: 10 })).toEqual({
    quality_override: 1000,
  });
  expect(filterProviderParams('rodin', 'text', { quality: 'ultra' })).toEqual({});
  expect(filterProviderParams('rodin', 'text', { quality: 'high' })).toEqual({ quality: 'high' });
});

test('rodin use_original_alpha is image/views only', () => {
  expect(filterProviderParams('rodin', 'text', { use_original_alpha: true })).toEqual({});
  expect(filterProviderParams('rodin', 'image', { use_original_alpha: true })).toEqual({
    use_original_alpha: true,
  });
});

test('hunyuan_workflow has no advanced params (empty spec → {})', () => {
  expect(providerParamSpec.hunyuan_workflow).toEqual([]);
  expect(filterProviderParams('hunyuan_workflow', 'text', { anything: 1 })).toEqual({});
});

test('undefined raw → {}', () => {
  expect(filterProviderParams('meshy', 'text', undefined)).toEqual({});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
bun test shared/provider-params.test.ts
```
Expected: FAIL — `Cannot find module './provider-params'`.

- [ ] **Step 3: Write the implementation**

```ts
// shared/provider-params.ts
// Single source of truth for provider-specific generation parameters. The same
// spec drives the SetupSidebar advanced panel AND the server-side filter. Only
// fields with verified:true (documented to exist, PROVIDER_PARAMS §0) are ever
// rendered or forwarded; appliesToModes gates per generation mode. Native API
// field names are used as keys so the filtered output spreads straight into each
// provider's payload/form. (grill C1/C2)
import type { GenerationMode } from './manifest';

export type ProviderKey = 'hunyuan_workflow' | 'meshy' | 'rodin';

export type ParamType = 'enum' | 'bool' | 'int' | 'text';

export interface ParamOption {
  value: string;
  label: string;
}

export interface ParamField {
  key: string; // native API field name (sent as-is)
  label: string;
  type: ParamType;
  options?: ParamOption[]; // enum
  min?: number; // int
  max?: number; // int
  default?: string | number | boolean;
  help?: string;
  appliesToModes: GenerationMode[];
  verified: boolean; // false → never rendered, never forwarded
}

// Verified high-value subset (PROVIDER_PARAMS.md §6, 2026-06-14).
// Excluded by design: deprecated Meshy art_style/symmetry_mode/negative_prompt;
// geometry_file_format (store is GLB-only); all ⏳ unverified fields.
export const providerParamSpec: Record<ProviderKey, ParamField[]> = {
  meshy: [
    {
      key: 'ai_model',
      label: '模型版本',
      type: 'enum',
      options: [
        { value: 'meshy-5', label: 'Meshy 5' },
        { value: 'meshy-6', label: 'Meshy 6' },
      ],
      default: 'meshy-6',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'model_type',
      label: '网格类型',
      type: 'enum',
      options: [
        { value: 'standard', label: '标准' },
        { value: 'lowpoly', label: '低面数' },
      ],
      help: 'lowpoly 会忽略 ai_model/topology/面数等设置',
      appliesToModes: ['image'],
      verified: true,
    },
    {
      key: 'should_remesh',
      label: '重建网格',
      type: 'bool',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'topology',
      label: '拓扑',
      type: 'enum',
      options: [
        { value: 'triangle', label: '三角面' },
        { value: 'quad', label: '四边面' },
      ],
      help: '仅在「重建网格」开启时生效',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'decimation_mode',
      label: '自适应减面',
      type: 'enum',
      options: [
        { value: '1', label: '超高' },
        { value: '2', label: '高' },
        { value: '3', label: '中' },
        { value: '4', label: '低' },
      ],
      help: '设置后覆盖「目标面数」',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'pose_mode',
      label: '姿态模式',
      type: 'enum',
      options: [
        { value: 'a-pose', label: 'A-pose' },
        { value: 't-pose', label: 'T-pose' },
      ],
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
  ],
  rodin: [
    {
      key: 'tier',
      label: '模型档',
      type: 'enum',
      options: [
        { value: 'Regular', label: 'Regular' },
        { value: 'Gen-2', label: 'Gen-2' },
        { value: 'Detail', label: 'Detail' },
        { value: 'Smooth', label: 'Smooth' },
        { value: 'Sketch', label: 'Sketch' },
      ],
      default: 'Regular',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'quality',
      label: '面数档位',
      type: 'enum',
      options: [
        { value: 'high', label: '高' },
        { value: 'medium', label: '中' },
        { value: 'low', label: '低' },
        { value: 'extra-low', label: '极低' },
      ],
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'mesh_mode',
      label: '拓扑',
      type: 'enum',
      options: [
        { value: 'Quad', label: '四边面' },
        { value: 'Raw', label: 'Raw (三角)' },
      ],
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'material',
      label: '材质类型',
      type: 'enum',
      options: [
        { value: 'PBR', label: 'PBR' },
        { value: 'Shaded', label: 'Shaded' },
        { value: 'All', label: 'All' },
      ],
      default: 'PBR',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'quality_override',
      label: '自定义面数',
      type: 'int',
      min: 1000,
      max: 200000,
      help: '设置后覆盖「面数档位」与目标面数',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'TAPose',
      label: 'T/A 姿态',
      type: 'bool',
      appliesToModes: ['text', 'image', 'views'],
      verified: true,
    },
    {
      key: 'use_original_alpha',
      label: '使用原始透明通道',
      type: 'bool',
      appliesToModes: ['image', 'views'],
      verified: true,
    },
  ],
  hunyuan_workflow: [],
};

const clampInt = (n: number, min?: number, max?: number): number => {
  let v = Math.round(n);
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
};

// Validate + coerce raw UI/AI params into the native fields a provider accepts.
// Drops anything not in the spec, not verified, not applicable to the mode, or
// failing type/enum/range checks. Output spreads directly into payload/form.
export function filterProviderParams(
  provider: ProviderKey,
  mode: GenerationMode,
  raw: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!raw) return out;
  for (const f of providerParamSpec[provider] ?? []) {
    if (!f.verified) continue;
    if (!f.appliesToModes.includes(mode)) continue;
    const v = raw[f.key];
    if (v === undefined || v === null) continue;
    if (f.type === 'bool') {
      if (typeof v === 'boolean') out[f.key] = v;
    } else if (f.type === 'int') {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) out[f.key] = clampInt(n, f.min, f.max);
    } else if (f.type === 'enum') {
      if (typeof v === 'string' && (f.options ?? []).some((o) => o.value === v)) out[f.key] = v;
    } else if (f.type === 'text') {
      if (typeof v === 'string' && v.trim()) out[f.key] = v.trim();
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
bun test shared/provider-params.test.ts && bun run typecheck
```
Expected: PASS (7 tests); 0 typecheck errors.

- [ ] **Step 5: Commit**

```bash
git add shared/provider-params.ts shared/provider-params.test.ts
git commit -m "feat(wb-gen3d): provider param-spec + pure filterProviderParams + tests (P5)"
```

---

## Task C2: Forward params in providers (`meshy.ts`, `rodin.ts`)

**Files:**
- Modify: `server/providers/meshy.ts`, `server/providers/rodin.ts`

- [ ] **Step 1: Meshy — accept + spread params**

In `MeshyGenerateInput` (`meshy.ts:31-42`) add:
```ts
  aiModel?: string;
  // Validated native params (filterProviderParams output) spread into the payload.
  params?: Record<string, string | number | boolean>;
}
```
Add a private helper + call it in the text/image/views branches of `buildPayload` (`:129-157`). Replace the text branch return and the `applyMeshOptions` tail to apply params:
```ts
  private buildPayload(input: MeshyGenerateInput): Record<string, unknown> {
    const polycount =
      input.targetPolycount !== undefined ? clampTargetPolycount(input.targetPolycount) : undefined;

    if (input.mode === 'text') {
      const payload: Record<string, unknown> = { mode: 'preview', prompt: input.prompt ?? '' };
      if (input.aiModel) payload.ai_model = input.aiModel;
      if (polycount) {
        payload.should_remesh = true;
        payload.target_polycount = polycount;
      }
      this.applyProviderParams(payload, input.params);
      return payload;
    }
    if (input.mode === 'refine') {
      const payload: Record<string, unknown> = { mode: 'refine', preview_task_id: input.previewTaskId };
      if (input.texturePrompt) payload.texture_prompt = input.texturePrompt;
      if (typeof input.enablePbr === 'boolean') payload.enable_pbr = input.enablePbr;
      return payload; // refine is a texture stage; no geometry params
    }
    if (input.mode === 'image') {
      const payload: Record<string, unknown> = { image_url: input.imageUrl ?? '' };
      this.applyMeshOptions(payload, input, polycount);
      this.applyProviderParams(payload, input.params);
      return payload;
    }
    // views
    const payload: Record<string, unknown> = { image_urls: (input.imageUrls ?? []).slice(0, 4) };
    this.applyMeshOptions(payload, input, polycount);
    this.applyProviderParams(payload, input.params);
    return payload;
  }

  // Spread validated native params; topology requires should_remesh to take
  // effect, so enable it implicitly when topology is requested without it.
  private applyProviderParams(
    payload: Record<string, unknown>,
    params: Record<string, string | number | boolean> | undefined,
  ): void {
    if (!params) return;
    Object.assign(payload, params);
    if (payload.topology !== undefined && payload.should_remesh === undefined) {
      payload.should_remesh = true;
    }
  }
```

- [ ] **Step 2: Rodin — accept + set params (override hardcoded defaults)**

In `RodinGenerateInput` (`rodin.ts:44-51`) add:
```ts
  qualityOverride?: number;
  // Validated native params (filterProviderParams output) applied to the form,
  // overriding the hardcoded tier/material/quality_override when present.
  params?: Record<string, string | number | boolean>;
}
```
In `buildForm` (`:158-194`), after the existing appends and before the `return form;`, apply params with `form.set` (overrides earlier `append`):
```ts
    if (input.params) {
      for (const [key, value] of Object.entries(input.params)) {
        form.set(key, typeof value === 'boolean' ? String(value) : String(value));
      }
    }
    return form;
```
(Booleans become `'true'`/`'false'` multipart strings — the Rodin API parses these. `tier`/`material`/`quality_override` set here override the hardcoded values; `geometry_file_format` stays `glb` because it is not exposed.)

- [ ] **Step 3: Typecheck + build**

Run:
```bash
bun run typecheck && bun run build
```
Expected: 0 errors; build OK. (The new `params?` field is optional, so existing callers in `tool-handlers.ts` still compile until C3 passes it.)

- [ ] **Step 4: Commit**

```bash
git add server/providers/meshy.ts server/providers/rodin.ts
git commit -m "feat(wb-gen3d): forward validated providerParams in Meshy/Rodin payloads (P5)"
```

---

## Task C3: Thread `providerParams` through the tool handlers

**Files:**
- Modify: `server/tool-handlers.ts`

- [ ] **Step 1: Import the filter + extend `BaseGenArgs`**

Add the import near the top (`:1-32` area):
```ts
import { filterProviderParams } from '../shared/provider-params';
```
Extend `BaseGenArgs` (`:160-168`):
```ts
interface BaseGenArgs {
  slug?: string;
  assetSlot?: AssetSlot;
  assetName?: string;
  provider?: ProviderId;
  enablePbr?: boolean;
  enableFbxUrl?: boolean;
  targetPolycount?: number;
  // Open bag of provider-specific params; validated server-side per spec (C1).
  providerParams?: Record<string, unknown>;
}
```

- [ ] **Step 2: Add a helper that produces filtered params + cache bits**

Add near `resolvePolycount` (`:209`):
```ts
// Validate the open providerParams bag against the spec and produce both the
// filtered native params (forwarded to the provider) and prefixed cache bits (so
// changing a param yields a fresh asset instead of a stale cache hit). hunyuan
// has no advanced params, so this is a no-op for it.
function buildProviderParams(
  provider: GenProvider,
  mode: GenerationMode,
  raw: Record<string, unknown> | undefined,
): {
  filtered: Record<string, string | number | boolean>;
  cacheBits: Record<string, string | number | boolean>;
} {
  const filtered = filterProviderParams(provider, mode, raw);
  const cacheBits: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(filtered)) cacheBits[`pp:${k}`] = v;
  return { filtered, cacheBits };
}
```

- [ ] **Step 3: Use it in `textTo3D` (`:246-273`)**

```ts
async function textTo3D(args: TextTo3DArgs): Promise<GenerateResult> {
  const slug = requireSlug(args.slug);
  const prompt = args.prompt.trim();
  if (!prompt) throw Object.assign(new Error('prompt is required'), { code: 'invalid_prompt' });
  const assetSlot = resolveSlot(args.assetSlot);
  const provider = resolveProvider(args.provider);
  const faceCount = resolvePolycount(args.targetPolycount, provider);
  const enablePbr = args.enablePbr ?? true;
  const enableFbxUrl = args.enableFbxUrl ?? false;
  const { filtered, cacheBits } = buildProviderParams(provider, 'text', args.providerParams);
  const cacheKey = makeCacheKey(provider, 'text', {
    assetSlot,
    prompt,
    faceCount,
    enablePbr,
    enableFbxUrl,
    ...cacheBits,
  });
  return runGeneration(
    provider,
    'text',
    { slug, assetSlot, assetName: defaultName(args.assetName, prompt), faceCount, cacheKey },
    {
      hunyuan: { mode: 'text', prompt, faceCount, enablePbr, enableFbxUrl },
      meshy: { mode: 'text', prompt, targetPolycount: faceCount, enablePbr, params: filtered },
      rodin: { mode: 'text', prompt, qualityOverride: faceCount, params: filtered },
    },
    prompt,
  );
}
```

- [ ] **Step 4: Use it in `imageTo3D` (`:275-302`)**

```ts
  const enableFbxUrl = args.enableFbxUrl ?? false;
  const { filtered, cacheBits } = buildProviderParams(provider, 'image', args.providerParams);
  const cacheKey = makeCacheKey(provider, 'image', {
    assetSlot,
    imageUrl,
    faceCount,
    enablePbr,
    enableFbxUrl,
    ...cacheBits,
  });
  return runGeneration(
    provider,
    'image',
    { slug, assetSlot, assetName: defaultName(args.assetName, `image-${provider}`), faceCount, cacheKey },
    {
      hunyuan: { mode: 'image', imageUrl, faceCount, enablePbr, enableFbxUrl },
      meshy: { mode: 'image', imageUrl, targetPolycount: faceCount, enablePbr, params: filtered },
      rodin: { mode: 'image', imageUrl, qualityOverride: faceCount, params: filtered },
    },
    null,
  );
```

- [ ] **Step 5: Use it in `viewsTo3D` (`:304-351`)**

```ts
  const cacheKey = makeCacheKey(provider, 'views', {
    assetSlot,
    ...normalizedViews,
    faceCount,
    enablePbr,
    enableFbxUrl,
    ...buildProviderParams(provider, 'views', args.providerParams).cacheBits,
  });
  const { filtered } = buildProviderParams(provider, 'views', args.providerParams);
  return runGeneration(
    provider,
    'views',
    { slug, assetSlot, assetName: defaultName(args.assetName, `views-${provider}`), faceCount, cacheKey },
    {
      hunyuan: {
        mode: 'views',
        views: normalizedViews as Partial<Record<ViewSlot, string>>,
        faceCount,
        enablePbr,
        enableFbxUrl,
      },
      meshy: { mode: 'views', imageUrls: meshyUrls, targetPolycount: faceCount, enablePbr, params: filtered },
      rodin: { mode: 'views', imageUrls: meshyUrls, qualityOverride: faceCount, params: filtered },
    },
    null,
  );
```

- [ ] **Step 6: Typecheck + build**

Run:
```bash
bun run typecheck && bun run build
```
Expected: 0 errors; build OK.

- [ ] **Step 7: Commit**

```bash
git add server/tool-handlers.ts
git commit -m "feat(wb-gen3d): validate + thread providerParams into generation + cacheKey (P5)"
```

---

## Task C4: Open `providerParams` in the generation schemas

**Files:**
- Modify: `schemas/text-to-3d.args.json`, `schemas/image-to-3d.args.json`, `schemas/views-to-3d.args.json`

- [ ] **Step 1: Add the open object property to each schema**

In each file, add this property inside `properties` (keep the root `"additionalProperties": false`):
```json
    "providerParams": {
      "type": "object",
      "additionalProperties": true,
      "description": "Provider-specific native params (validated server-side against shared/provider-params.ts; unverified/inapplicable fields are dropped). See docs/PROVIDER_PARAMS.md."
    }
```
For `text-to-3d.args.json` insert it after the `targetPolycount` property (`:42`), before the closing of `properties`. For `image-to-3d.args.json` and `views-to-3d.args.json`, add the identical property inside their `properties` objects.

- [ ] **Step 2: Validate JSON + build**

Run:
```bash
bun run build
```
Expected: build OK (invalid JSON would fail the bundling/copy). Optionally sanity-check with `bun -e "JSON.parse(require('fs').readFileSync('schemas/text-to-3d.args.json','utf8'));JSON.parse(require('fs').readFileSync('schemas/image-to-3d.args.json','utf8'));JSON.parse(require('fs').readFileSync('schemas/views-to-3d.args.json','utf8'));console.log('ok')"` → prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add schemas/text-to-3d.args.json schemas/image-to-3d.args.json schemas/views-to-3d.args.json
git commit -m "feat(wb-gen3d): declare open providerParams in generation schemas (P5)"
```

---

## Task C5: Advanced params panel in `SetupSidebar`

**Files:**
- Modify: `src/ui-meta.ts`, `src/components/SetupSidebar.tsx`

- [ ] **Step 1: Add a `params` icon to `ui-meta.ts`**

Add `SlidersHorizontal` to the lucide import (`:5-23`) and to `EDITOR_ICON_MAP` (`:27-45`):
```ts
  SlidersHorizontal,
} from 'lucide-react';
```
```ts
  lowpoly: Shrink,
  params: SlidersHorizontal,
} as const;
```

- [ ] **Step 2: Add provider-params state + reset-on-provider-change**

In `SetupSidebar`, import the spec and a value type, add state, and reset when `provider` changes:
```tsx
import { providerParamSpec, type ParamField } from '@shared/provider-params';
// ...
type ParamValue = string | number | boolean;
const [providerParams, setProviderParams] = useState<Record<string, ParamValue>>({});
// Fields differ per provider; clear stale values when the provider switches.
useEffect(() => setProviderParams({}), [provider]);

const visibleParamFields: ParamField[] = providerParamSpec[provider].filter(
  (f) => f.verified && f.appliesToModes.includes(mode),
);
```

- [ ] **Step 3: Render the collapsible panel inside the 生成参数 StepCard**

Inside the last `StepCard` (生成参数, `:283-322`), after the PBR checkbox and before the trailing `step-note`s, render the advanced panel (only when there are visible fields):
```tsx
{visibleParamFields.length > 0 && (
  <details className="adv-params">
    <summary className="adv-params-summary">
      <ParamsIcon size={13} /> 高级参数（{providerMeta[provider].label} 专属）
    </summary>
    <div className="adv-params-body">
      {visibleParamFields.map((f) => (
        <ProviderParamControl
          key={f.key}
          field={f}
          value={providerParams[f.key]}
          onChange={(v) =>
            setProviderParams((p) => {
              const next = { ...p };
              if (v === undefined) delete next[f.key];
              else next[f.key] = v;
              return next;
            })
          }
        />
      ))}
    </div>
    <p className="step-note">仅在该 provider 真机生成时生效；mock / 未配置时忽略。</p>
  </details>
)}
```
Add `const ParamsIcon = EDITOR_ICON_MAP.params;` near the other icon consts.

- [ ] **Step 4: Add the `ProviderParamControl` sub-component (same file)**

```tsx
function ProviderParamControl({
  field,
  value,
  onChange,
}: {
  field: ParamField;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean | undefined) => void;
}) {
  if (field.type === 'bool') {
    return (
      <label className="fx-check">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span>{field.label}</span>
      </label>
    );
  }
  if (field.type === 'enum') {
    return (
      <label className="field">
        <span className="field-label">{field.label}</span>
        <select
          className="adv-select"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        >
          <option value="">（默认）</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {field.help && <span className="step-note">{field.help}</span>}
      </label>
    );
  }
  if (field.type === 'int') {
    return (
      <label className="field">
        <span className="field-label">
          {field.label}
          {field.min !== undefined && field.max !== undefined ? ` (${field.min}–${field.max})` : ''}
        </span>
        <input
          className="fx-input"
          type="number"
          min={field.min}
          max={field.max}
          value={value === undefined ? '' : (value as number)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
        {field.help && <span className="step-note">{field.help}</span>}
      </label>
    );
  }
  return (
    <label className="field">
      <span className="field-label">{field.label}</span>
      <input
        className="fx-input"
        type="text"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      />
    </label>
  );
}
```

- [ ] **Step 5: Include params in the submit payload**

In `submit()` (`:80-95`), extend `common` to carry the params only when non-empty:
```tsx
  function submit() {
    if (!canSubmit) return;
    const targetPolycount = tierToFaceCount(provider, polycountTier);
    const common: Record<string, unknown> = { provider, assetSlot, enablePbr, targetPolycount };
    if (Object.keys(providerParams).length > 0) common.providerParams = providerParams;
    if (mode === 'text') {
      onGenerate('text', { prompt: prompt.trim(), ...common });
    } else if (mode === 'image') {
      onGenerate('image', { imageUrl: imageUrl.trim(), ...common });
    } else {
      const views: Record<string, string> = { front_image_url: frontUrl.trim() };
      if (backUrl.trim()) views.back_image_url = backUrl.trim();
      if (leftUrl.trim()) views.left_image_url = leftUrl.trim();
      if (rightUrl.trim()) views.right_image_url = rightUrl.trim();
      onGenerate('views', { views, ...common });
    }
  }
```

- [ ] **Step 6: Add styles to `src/styles.css`**

```css
.adv-params { margin-top: 8px; border-top: 1px solid var(--color-divider-subtle); padding-top: 8px; }
.adv-params-summary { cursor: pointer; font-size: 12px; color: var(--color-text-secondary); display: flex; align-items: center; gap: 6px; }
.adv-params-body { display: grid; gap: 8px; margin-top: 8px; }
.adv-select, .fx-input {
  border: 1px solid var(--color-border-default); border-radius: var(--radius-md);
  background: var(--color-background-floating); color: var(--color-text-primary); padding: 6px 8px; font-size: 12px;
}
```
(If `.fx-input` already exists in `styles.css`, drop the duplicate selector and keep only `.adv-select` + `.adv-params*`.)

- [ ] **Step 7: Typecheck + build + visual**

Run:
```bash
bun run typecheck && bun run build
```
Visual (`bun run dev`): switch provider → the advanced panel shows the right fields (Meshy vs Rodin vs none for 混元); switch mode → `model_type` only appears for Meshy image, `use_original_alpha` only for Rodin image/views; selecting "（默认）" clears the field; switching provider resets the panel. Rebuild `dist/`, hard-refresh Studio.

- [ ] **Step 8: Commit**

```bash
git add src/ui-meta.ts src/components/SetupSidebar.tsx src/styles.css
git commit -m "feat(wb-gen3d): spec-driven provider advanced params panel in SetupSidebar (P5)"
```

---

## Task C6: End-to-end verification + docs

**Files:** `docs/CAPABILITY_MATRIX.md`, `HANDOFF.md`

- [ ] **Step 1: Filter correctness (server)**

Run:
```bash
bun test shared/provider-params.test.ts && bun run typecheck && bun run build
```
Expected: tests pass; 0 errors; build OK.

- [ ] **Step 2: UI → tool round-trip (mock; params inert but threaded)**

`bun run dev`. With mock providers (no keys): pick Meshy, set `ai_model=Meshy 6` + `topology=四边面`, generate. Confirm the generation succeeds (mock) and a *different* param set produces a *new* asset (cacheBits changed the cacheKey — not a cache hit). Confirm an undeclared/garbage param can't be injected via UI (panel only renders spec fields). Pick 混元 → no advanced panel.

- [ ] **Step 3: (Optional, real-key) forwarding spot-check**

If a Meshy/Rodin key is available with `GEN3D_ENABLE_REAL_PROVIDERS=1`, generate with `topology=quad` (Meshy) / `mesh_mode=Quad` (Rodin) and confirm via the provider audit/log that the native field went out in the payload/form. (Skip if no key — params are inert in mock by design, grill C2.)

- [ ] **Step 4: Docs**

In `docs/CAPABILITY_MATRIX.md`, add a short note that provider-specific params are now exposed via `shared/provider-params.ts` (verified subset only) and link `docs/PROVIDER_PARAMS.md`. In `HANDOFF.md`, mark P5 done and link this plan.

- [ ] **Step 5: Commit**

```bash
git add docs/CAPABILITY_MATRIX.md HANDOFF.md
git commit -m "docs(wb-gen3d): record provider params P5 completion + capability note"
```

---

## Self-Review (C)

**Spec coverage (PLAN §6 / §10 P5 / grill C1–C2 / PROVIDER_PARAMS §6):**
- C1 validation layering: open `providerParams` in schema + server-side field filter, no generator → C4 (schema) + C1 (`filterProviderParams`) + C3 (handler). ✅
- C2 `verified` = doc-existence; render+forward when verified+applicable; inert in mock → spec `verified` gate + C5 panel + "mock 忽略" notes. ✅
- C.2 spec drives four places: ① SetupSidebar panel (C5), ② tool arg `providerParams` (C3), ③ JSON schema (C4), ④ `buildPayload`/`buildForm` (C2). ✅
- C.3 verified subset (Meshy ai_model/model_type/should_remesh/topology/decimation_mode/pose_mode; Rodin tier/quality/mesh_mode/material/quality_override/TAPose/use_original_alpha) → C1 spec. Deprecated/⏳/geometry_file_format excluded (documented). ✅
- C.4 no coupling to A/B → only generation chain touched. ✅

**Placeholder scan:** all code present; `filterProviderParams` is TDD; provider/handler/schema/UI verified by typecheck+build+round-trip. No TBD. ✅

**Type consistency:** `ProviderKey` (= `GenProvider` union) used in spec + filter + handler `buildProviderParams`; `ParamField`/`ParamType`/`ParamOption` shared by spec + UI control; `filterProviderParams(provider, mode, raw)` signature identical at every call site; provider `params?: Record<string, string|number|boolean>` matches `filtered` output exactly; native field keys (`ai_model`, `topology`, `quality_override`, …) consistent spec↔provider. ✅

**Behavior-safety check:** `geometry_file_format` intentionally not exposed (store is GLB-only); Meshy `topology` auto-enables `should_remesh`; Rodin params use `form.set` to override hardcoded `tier`/`material`/`quality_override`. ✅
