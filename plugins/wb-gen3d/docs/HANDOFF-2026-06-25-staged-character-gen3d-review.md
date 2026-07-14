# HANDOFF 2026-06-25 — Staged Character Gen3D Review

> **状态**: REVIEW HANDOFF · 2026-06-25 Asia/Hong_Kong  
> **主计划**: [`PLAN-2026-06-25-staged-character-gen3d-flow.md`](./PLAN-2026-06-25-staged-character-gen3d-flow.md)  
> **分支**: `laurenceelu/feat-20260625-migrate-gen3d-to-forgeax-core`  
> **目的**: 给 review agent 快速审阅 2D→3D 分阶段体验修复方案，不要求实现。

---

## 1 · Reviewer 先读顺序

1. [`PLAN-2026-06-25-staged-character-gen3d-flow.md`](./PLAN-2026-06-25-staged-character-gen3d-flow.md) §0-§4
2. `packages/marketplace/plugins/wb-character/src/shared/CharacterDesign.ts`
   - `renderConceptsCenter()`
   - `renderFinalCenter()`
   - `navigateToAnim()`
3. `packages/marketplace/plugins/wb-character/src/lib/api-client.ts`
4. `packages/marketplace/plugins/wb-gen3d/src/components/SetupSidebar.tsx`
5. `packages/interface/src/components/Confirm/ConfirmDialog.tsx`
6. `packages/marketplace/plugins/wb-gen3d/forgeax-extension.json`
7. `packages/marketplace/src/system-prompt/80-workbench-agents.md`

## 2 · Review 目标

请重点判断这份方案是否真正解决用户实测问题：

- CLI 不应在“生成角色”后直接跑完整 2D→3D→rig→motion。
- `wb-character` 需要用户可见的“生成 3D 四视图”按钮。
- 四视图生成后应停下，让用户决定是否送去 `wb-gen3d`。
- `wb-gen3d` 收到 handoff 后只预填，不自动生成 3D。
- 静态 3D 生成完成后默认交付静态资产，不自动绑骨和套动作。
- `auto-rig` / `apply-motion` 必须有真实确认弹窗，而不是只靠 prompt。

## 3 · 已核实代码事实

### `wb-character` 端缺入口

`renderFinalCenter()` 当前 actions 里没有 3D 四视图按钮，只有动画入口：

```1696:1736:packages/marketplace/plugins/wb-character/src/shared/CharacterDesign.ts
  private renderFinalCenter(): void {
    if (!this.centerEl) return
    // ...
          <div class="cd-preview-actions" data-cd="actions" style="display:none">
            <button class="cd-btn" data-action="back-concepts">← 返回概念图</button>
            <button class="cd-btn" data-action="regen-final">重新生成设定图</button>
            ${detailBtnHtml}
            <button class="cd-btn cd-btn-accent cd-btn-xl" data-action="go-pixel">${confirmText}</button>
          </div>
```

### `wb-gen3d` 端已能接收 handoff

`SetupSidebar` 已读取 `forgeax:anim-handoff`，目标为 `@forgeax-extension/wb-gen3d` 时会切到 views mode 并预填四视图：

```67:105:packages/marketplace/plugins/wb-gen3d/src/components/SetupSidebar.tsx
  // Cross-workbench handoff from wb-character「送去生成 3D 模型」: the Studio host
  // writes the view URLs to a shared same-origin localStorage key ...
  useEffect(() => {
    const HANDOFF_KEY = 'forgeax:anim-handoff';
    const SELF_PLUGIN_ID = '@forgeax-extension/wb-gen3d';
    // ...
      setMode('views');
      setAssetSlot('characters');
      setFrontUrl(views.front);
      setBackUrl(views.back ?? '');
      setLeftUrl(views.left ?? '');
      setRightUrl(views.right ?? '');
```

### 确认弹窗链路有字段漂移

`ConfirmDialog` 当前读 `confirmId`，但后端确认机制使用 `token`。这会导致 `requireConfirm` 即便写在 manifest 里也无法端到端弹窗。

```28:42:packages/interface/src/components/Confirm/ConfirmDialog.tsx
interface ConfirmRequiredEnv {
  topic: 'tool.confirm-required';
  payload: {
    confirmId: string;
    toolId: string;
    args?: unknown;
    caller?: { kind?: string };
    message?: string | null;
    expiresAt?: number;
  };
}
```

### rig/motion 当前对 AI 开放但缺硬确认

`gen3d:auto-rig` 和 `gen3d:apply-motion` 当前 `exposedToAI: true`，描述写了 opt-in 和余额预检，但 manifest 还没有 `requireConfirm`。

## 4 · 方案审阅重点

### 必须保留的产品原则

- **静态优先**：默认只交付静态 3D 角色。
- **动作 opt-in**：只有用户明确要求“会动/走/跑/挥手/动作”才进入 rig/motion。
- **用户选图优先**：自然语言“生成角色”不应绕过 `wb-character` 的候选图/确认体验。
- **UI handoff 不自动执行 3D**：`wb-character` 只把四视图交给 `wb-gen3d`，生成按钮仍由用户在 `wb-gen3d` 点击。

### 需要 review 的风险点

- `generateTurnaroundFor3D()` 如何从 final image 获取 reference：优先复用 `ensurePortraitOnDisk()` / `writeManifest()`，不要直接把大 base64 塞进 handoff。
- `forgeax:anim-handoff` 这个 key 名不准确，但 `wb-gen3d` 已依赖它。计划建议本批不改 key，避免扩大影响。
- `requireConfirm` 是硬门控，但只对 AI/skill caller 生效；UI 用户直接点击应继续绕过确认，避免重复弹窗。
- `character:generate-turnaround` returns schema 当前与 handler 实际返回不一致，必须修，否则后续 AI 工具描述会继续误导。
- prompt 改动不能替代 `requireConfirm`；review 时不要只接受“文案说会确认”。

## 5 · 建议 review 输出格式

请按以下结构返回：

1. **Blockers**: 必须先修，否则方案无法落地或会继续误触发。
2. **Design Risks**: 方案可行但需要调整的设计风险。
3. **Missing Tests**: 必须补的测试。
4. **Scope Check**: 是否有超出本线边界的改动。
5. **Go / No-Go**: 是否建议进入实现。

## 6 · 本轮不做

- 不做引擎侧加载 gen3d 角色并 Play。
- 不把整个 `wb-character` 前端状态机一次性重构成 AI tool。
- 不重命名 `forgeax:anim-handoff` key。
- 不改 provider 计费策略。
- 不扩大到道具/场景/建筑 3D 生成；本线只看角色。
