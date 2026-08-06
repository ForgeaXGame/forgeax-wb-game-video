# Flow Node Preview Visual Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `FlowNodePreviewStage` with the completed `EditableNodePreviewStage` visual language without changing runtime or timeline behavior.

**Architecture:** Extract the preview-control SVGs and time formatter into a presentation-only shared module. Both preview modes consume the same frame and control-card classes; Flow retains its phase status, playback-rate selector, restart semantics, read-only append timeline, and existing callbacks.

**Tech Stack:** React, TypeScript, injected CSS, Vitest, Testing Library.

## Global Constraints

- Do not change runtime schemas, persisted graph data, engine behavior, or Flow callback contracts.
- Preserve Flow seek, pause, playback-rate, audio-toggle, restart, and timeline disclosure behavior.
- Reuse `nps-frame-edit` and `nps-video-controls`; do not create a second visual vocabulary.
- Do not commit unless explicitly requested.

---

### Task 1: Align the Flow preview presentation

**Files:**
- Create: `src/editor/shell/nodePreviewControls.tsx`
- Modify: `src/editor/shell/NodePreviewStage.tsx`
- Modify: `src/editor/shell/FlowNodePreviewStage.tsx`
- Test: `src/editor/shell/__tests__/NodePreviewStage-flow-visual.test.tsx`

**Interfaces:**
- Produces: `PreviewPlayIcon`, `PreviewPauseIcon`, `PreviewVolumeIcon`, `PreviewRefreshIcon`, and `formatPreviewTime(ms: number): string`.
- Consumes: existing `FlowNodePreviewState` callbacks and the shared Node Preview CSS classes.

- [ ] **Step 1: Write the failing visual-contract test**

Render `NodePreviewStage` with `mode="preview"` and a minimal `FlowNodePreviewState`. Assert that the Flow branch uses `nps-frame-edit` and `nps-video-controls`, exposes SVG-backed play/restart/audio controls, preserves the status and rate selector, renders current/total time, and retains the read-only append timeline.

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
bunx vitest run src/editor/shell/__tests__/NodePreviewStage-flow-visual.test.tsx
```

Expected: FAIL because Flow still renders `.nps-controls`, lacks `.nps-frame-edit`, and uses text glyphs.

- [ ] **Step 3: Extract shared presentation primitives**

Move the existing preview control SVGs and `fmtHudTime` implementation into `nodePreviewControls.tsx`; update `EditableNodePreviewStage` imports without changing behavior.

- [ ] **Step 4: Apply the shared visual shell to Flow**

Use `gc-frame nps-frame nps-frame-edit` for the stage and `nps-video-controls nps-flow-controls` for controls. Arrange play/restart/audio in `.nps-video-controls-left`; retain phase, rate, global time, and timeline toggle in `.nps-video-controls-right`. Keep all existing callbacks unchanged.

- [ ] **Step 5: Verify GREEN and related coverage**

Run:

```bash
bunx vitest run \
  src/editor/shell/__tests__/NodePreviewStage-flow-visual.test.tsx \
  src/editor/shell/__tests__/NodePreviewStage-layout.test.tsx \
  src/editor/video/__tests__/flowPreviewTimeline.test.ts \
  src/editor/video/__tests__/MaterialTimeline-viewport-geometry.test.tsx
```

Expected: the new test and relevant existing tests pass; any known baseline failures must be identified separately.

- [ ] **Step 6: Inspect live visual output if a production Flow entry exists**

Verify computed classes, icon geometry, timeline stability, and browser console errors. If no production Flow entry exists, report that limitation and rely on the rendered component test rather than claiming end-to-end integration.
