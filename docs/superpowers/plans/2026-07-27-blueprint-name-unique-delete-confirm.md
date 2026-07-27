# Blueprint name unique + delete confirm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject duplicate blueprint titles on create/rename (trim + case-insensitive), and require an inline confirm dialog before deleting an unreferenced blueprint.

**Architecture:** Pure title helpers in `blueprint-title.ts`; store `createBlueprint` / `renameBlueprint` return result objects and enforce uniqueness; `BlueprintLibraryView` surfaces errors and gates delete with a `val-dialog*` ConfirmDialog (styles also in `CATALOG_CSS` so the蓝图 tab works without visiting视频).

**Tech Stack:** TypeScript, React, Zustand (`useGraphScenario`), Vitest

## Global Constraints

- Title normalize: `trim()` then `toLocaleLowerCase('zh-CN')`
- Duplicate → `{ ok: false, reason: 'duplicate_title' }`; no state change
- Delete with refs / main → keep existing `alert` block; no confirm dialog
- Delete with no refs → ConfirmDialog then `deleteBlueprint`
- Out of scope: NodeInspector auto-titled sub-blueprints; extracting shared ConfirmDialog package

---

### Task 1: Title uniqueness helpers + store enforcement

**Files:**
- Create: `extensions/wb-game-video/src/editor/persist/blueprint-title.ts`
- Create: `extensions/wb-game-video/src/editor/persist/__tests__/blueprint-title.test.ts`
- Modify: `extensions/wb-game-video/src/editor/persist/graphScenarioStore.ts`
- Modify: `extensions/wb-game-video/src/editor/persist/__tests__/graph-store-blueprints.test.ts`

**Interfaces:**
- Produces:
  - `normalizeBlueprintTitle(title: string): string`
  - `isBlueprintTitleTaken(blueprints: Record<string, { id: string; title: string }>, title: string, excludeId?: string): boolean`
  - `createBlueprint(title?: string): { ok: true; id: string } | { ok: false; reason: 'duplicate_title' }`
  - `renameBlueprint(id: string, title: string): { ok: true } | { ok: false; reason: 'duplicate_title' | 'not_found' }`

- [ ] **Step 1: Write failing pure-function tests**

```ts
import { describe, it, expect } from 'vitest'
import { normalizeBlueprintTitle, isBlueprintTitleTaken } from '../blueprint-title'

describe('normalizeBlueprintTitle', () => {
  it('trims and lowercases with zh-CN', () => {
    expect(normalizeBlueprintTitle('  新蓝图  ')).toBe(normalizeBlueprintTitle('新蓝图'))
    expect(normalizeBlueprintTitle('Ab')).toBe(normalizeBlueprintTitle('ab'))
  })
})

describe('isBlueprintTitleTaken', () => {
  const packs = {
    a: { id: 'a', title: '新蓝图' },
    b: { id: 'b', title: 'Other' },
  }
  it('detects trim/case duplicates', () => {
    expect(isBlueprintTitleTaken(packs, ' 新蓝图 ')).toBe(true)
    expect(isBlueprintTitleTaken(packs, 'OTHER')).toBe(true)
  })
  it('allows the same id when excluded', () => {
    expect(isBlueprintTitleTaken(packs, '新蓝图', 'a')).toBe(false)
  })
})
```

- [ ] **Step 2: Implement helpers + store return types; update store tests**

Implement helpers; change `createBlueprint` / `renameBlueprint` signatures; store trimmed title; reject duplicates. Update existing tests to use `.id` from create result. Add tests for duplicate create/rename failure.

- [ ] **Step 3: Run tests**

```bash
cd extensions/wb-game-video && bun test src/editor/persist/__tests__/blueprint-title.test.ts src/editor/persist/__tests__/graph-store-blueprints.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add extensions/wb-game-video/src/editor/persist/blueprint-title.ts \
  extensions/wb-game-video/src/editor/persist/__tests__/blueprint-title.test.ts \
  extensions/wb-game-video/src/editor/persist/graphScenarioStore.ts \
  extensions/wb-game-video/src/editor/persist/__tests__/graph-store-blueprints.test.ts
git commit -m "feat(wb-game-video): reject duplicate blueprint titles in store"
```

---

### Task 2: BlueprintLibraryView UX (create error + delete confirm)

**Files:**
- Modify: `extensions/wb-game-video/src/editor/shell/BlueprintLibraryView.tsx`
- Modify: `extensions/wb-game-video/src/editor/shell/catalogCss.ts` (add `val-dialog*` rules mirrored from `graphVideoViewStyles.ts`)

**Interfaces:**
- Consumes: store result types from Task 1; `blueprintsReferencing` from `graph/edit/blueprint-refs.ts`

- [ ] **Step 1: Wire create/rename duplicate handling**

On create failure keep compose open, show inline error「已存在同名蓝图」. On rename failure `alert` same copy.

- [ ] **Step 2: Wire delete confirm**

Pre-check main / refs → existing alerts. Else set `pendingDeleteId` and render ConfirmDialog using `val-dialog*` classes; confirm calls `deleteBlueprint`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(wb-game-video): confirm blueprint delete; surface duplicate title errors"
```

---

### Task 3: Verify + PR

- [ ] Run focused + related tests
- [ ] Push branch + `gh pr create` against `forgeax-marketplace` `main`
