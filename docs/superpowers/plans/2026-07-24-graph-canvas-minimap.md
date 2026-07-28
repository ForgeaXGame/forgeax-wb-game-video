# Graph Canvas MiniMap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **Spec SSOT:** [`../specs/2026-07-24-graph-canvas-minimap-design.md`](../specs/2026-07-24-graph-canvas-minimap-design.md)

**Goal:** 在蓝图编辑画布右下角始终显示可导航的 XYFlow `MiniMap`（拖视口框 / 点击跳转），暗色主题 + badge 着色，并与右下 chrome 按钮避让。

**Architecture:** 只改 `GraphCanvas.tsx`：挂载官方 `MiniMap`，用已有 `BADGE_COLOR` 派生 `nodeColor`；在 `ensureCanvasStyle()` 补 minimap 样式并把 `.gv-canvas-chrome` 上移。抽出纯函数 `minimapNodeColor` 便于单测。不碰 schema / runtime / GraphStudio。

**Tech Stack:** TypeScript · React · `@xyflow/react` ^12 · vitest + happy-dom · Testing Library（可选渲染断言）

## Global Constraints

- 不改三份核心 schema：`node-config-schema.ts` / `react-flow-schema.ts` / `graph-schema.ts`
- 不改 `src/runtime/**`
- 不做折叠 / 默认隐藏 / 搜索跳转 / 小地图自身缩放（`zoomable={false}`）
- 位置固定 `bottom-right`；始终显示
- 尺寸约 `160×110`；`maskStrokeColor` 用 `#f08840`（现有 accent）
- **提交：非用户明确要求不 commit**（plan 里的 commit 步骤默认跳过）

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/graph/canvas/GraphCanvas.tsx` | 挂载 MiniMap；`ensureCanvasStyle` 样式 + chrome `bottom`；导出/内联 `minimapNodeColor` |
| `src/graph/canvas/__tests__/minimapNodeColor.test.ts` | `minimapNodeColor` 纯函数单测 |
| `docs/superpowers/specs/2026-07-24-graph-canvas-minimap-design.md` | 已定稿 SPEC（只读） |

不新建组件文件；不改 `GraphStudio.tsx`。

---

### Task 1: `minimapNodeColor` 纯函数 + 单测

**Files:**
- Create: `src/graph/canvas/__tests__/minimapNodeColor.test.ts`
- Modify: `src/graph/canvas/GraphCanvas.tsx`（在 `BADGE_COLOR` 旁导出纯函数）

**Interfaces:**
- Consumes: 现有 `BADGE_COLOR`（同文件）、`CanvasNodeViewData` 形状（`data.fx.data.badge`）
- Produces: `export function minimapNodeColor(node: { data: unknown }): string`

- [x] **Step 1: Write the failing test**

创建 `src/graph/canvas/__tests__/minimapNodeColor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { minimapNodeColor } from '../GraphCanvas'

function nodeWithBadge(badge: string | undefined) {
  return {
    data: {
      fx: { data: { badge } },
    },
  }
}

describe('minimapNodeColor', () => {
  it('maps known badges to BADGE_COLOR', () => {
    expect(minimapNodeColor(nodeWithBadge('qte'))).toBe('#8b5cf6')
    expect(minimapNodeColor(nodeWithBadge('choice'))).toBe('#3b82f6')
    expect(minimapNodeColor(nodeWithBadge('pack'))).toBe('#3b82f6')
    expect(minimapNodeColor(nodeWithBadge('subflow'))).toBe('#eab308')
  })

  it('falls back to #4b5563 when badge missing or unknown', () => {
    expect(minimapNodeColor(nodeWithBadge(undefined))).toBe('#4b5563')
    expect(minimapNodeColor(nodeWithBadge('nope'))).toBe('#4b5563')
    expect(minimapNodeColor({ data: {} })).toBe('#4b5563')
    expect(minimapNodeColor({ data: null })).toBe('#4b5563')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

```bash
cd packages/marketplace/extensions/wb-game-video
npx vitest run src/graph/canvas/__tests__/minimapNodeColor.test.ts
```

Expected: FAIL（`minimapNodeColor` 未导出 / 未定义）

- [x] **Step 3: Implement `minimapNodeColor`**

在 `GraphCanvas.tsx` 的 `BADGE_COLOR` 常量之后、`HANDLE_COLOR` 之前插入：

```ts
/** MiniMap 节点填色：读 RF node.data.fx.data.badge → BADGE_COLOR。 */
export function minimapNodeColor(node: { data: unknown }): string {
  const data = node.data as CanvasNodeViewData | null | undefined
  const badge = data?.fx?.data?.badge
  if (typeof badge === 'string' && BADGE_COLOR[badge]) return BADGE_COLOR[badge]!
  return '#4b5563'
}
```

注意：`CanvasNodeViewData` 当前定义在文件更下方。两种合法做法任选其一：
1. 把 `interface CanvasNodeViewData` 上移到 `BADGE_COLOR` 之前；或
2. 在函数内用窄类型断言，不依赖完整 interface：

```ts
export function minimapNodeColor(node: { data: unknown }): string {
  const badge = (node.data as { fx?: { data?: { badge?: string } } } | null | undefined)?.fx?.data?.badge
  if (typeof badge === 'string' && BADGE_COLOR[badge]) return BADGE_COLOR[badge]!
  return '#4b5563'
}
```

推荐做法 2（少挪动文件结构）。

- [x] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/graph/canvas/__tests__/minimapNodeColor.test.ts
```

Expected: PASS（2 tests）

- [ ] **Step 5: Commit（仅当用户要求时）**

```bash
git add src/graph/canvas/GraphCanvas.tsx src/graph/canvas/__tests__/minimapNodeColor.test.ts
git commit -m "$(cat <<'EOF'
feat(wb-game-video): add minimapNodeColor helper for canvas MiniMap

EOF
)"
```

默认跳过。

---

### Task 2: 挂载 MiniMap + 暗色样式 + chrome 避让

**Files:**
- Modify: `src/graph/canvas/GraphCanvas.tsx`（import、`ensureCanvasStyle`、`<ReactFlow>` 子节点、`.gv-canvas-chrome` bottom）

**Interfaces:**
- Consumes: Task 1 的 `minimapNodeColor`；`@xyflow/react` 的 `MiniMap`
- Produces: 画布右下始终可见可导航小地图

- [x] **Step 1: 在 import 列表加入 `MiniMap`**

把现有：

```ts
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BaseEdge,
  Controls,
  // ...
} from '@xyflow/react'
```

改为包含：

```ts
  MiniMap,
```

（与 `Controls` 同级即可。）

- [x] **Step 2: 更新 `ensureCanvasStyle()` 的 CSS**

在现有 `.react-flow__controls...` 规则旁追加 minimap 样式；并把 `.gv-canvas-chrome` 的 `bottom:12px` 改为 `bottom:134px`：

```css
.react-flow__minimap{
  border-radius:8px;
  overflow:hidden;
  border:1px solid #33373f;
  box-shadow:0 2px 12px rgba(0,0,0,.5);
  background:#1a1d24;
}
.gv-canvas-chrome{position:absolute;right:12px;bottom:134px;z-index:5;display:flex;gap:6px;pointer-events:none}
```

（整段仍写在 `s.textContent = \`...\`` 模板字符串里；保留其余既有规则不变。）

- [x] **Step 3: 在 `<ReactFlow>` 内挂载 MiniMap**

把：

```tsx
        <Background />
        <Controls position="bottom-left" />
      </ReactFlow>
```

替换为：

```tsx
        <Background />
        <Controls position="bottom-left" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable={false}
          nodeColor={minimapNodeColor}
          bgColor="#1a1d24"
          maskColor="rgba(0,0,0,0.55)"
          maskStrokeColor="#f08840"
          style={{ width: 160, height: 110 }}
        />
      </ReactFlow>
```

- [x] **Step 4: 类型检查**

```bash
cd packages/marketplace/extensions/wb-game-video
npx tsc --noEmit
```

Expected: 无错误退出（exit 0）

- [x] **Step 5: 跑相关单测**

```bash
npx vitest run src/graph/canvas/__tests__/minimapNodeColor.test.ts
```

Expected: PASS

- [ ] **Step 6: 手动验收（dev server）** — 待你本地确认

```bash
npm run dev
```

浏览器打开画布（建议 nodia demo），核对 spec §5：

1. 右下始终有小地图，节点色可辨  
2. 拖视口框 / 点小地图 → 主画布平移  
3. 小地图滚轮不缩放小地图；主画布缩放正常  
4. 「添加节点 / 引用蓝图 / 居中 / 自适应」在小地图上方，可点  
5. 试玩 `readOnly` 时小地图仍可导航  

- [ ] **Step 7: Commit（仅当用户要求时）**

```bash
git add src/graph/canvas/GraphCanvas.tsx
git commit -m "$(cat <<'EOF'
feat(wb-game-video): add always-on canvas MiniMap navigation

EOF
)"
```

默认跳过。

---

### Task 3: Spec 覆盖核对（实现后自检，不改代码除非有缺口）

**Files:**
- Read: `docs/superpowers/specs/2026-07-24-graph-canvas-minimap-design.md`

- [x] **Step 1: 对照 D1–D8 与验收清单打勾**

| Spec | 应对 |
|---|---|
| D1 编辑器画布 | Task 2 仅改 GraphCanvas |
| D2 原生 MiniMap | Task 2 `<MiniMap />` |
| D3 pannable + zoomable false | Task 2 props |
| D4 bottom-right | Task 2 `position` |
| D5 始终显示 | 无折叠逻辑 |
| D6 BADGE_COLOR | Task 1 + `nodeColor={minimapNodeColor}` |
| D7 readOnly 也显示 | MiniMap 无 `readOnly` 条件隐藏 |
| D8 不改 schema/runtime | 文件列表无 runtime/schema |
| chrome 避让 | Task 2 `bottom:134px` |
| tsc | Task 2 Step 4 |

若有缺口，在本 Task 内最小补丁修回，再重跑 `npx tsc --noEmit` 与 `npx vitest run src/graph/canvas/__tests__/minimapNodeColor.test.ts`。

---

## Spec coverage (self-review)

| Spec 要求 | Task |
|---|---|
| 右下 MiniMap 始终显示 | Task 2 |
| pannable / 点击跳转 / zoomable false | Task 2 |
| 暗色 + maskStroke accent | Task 2 |
| nodeColor ← BADGE_COLOR | Task 1–2 |
| chrome 上移避让 | Task 2 |
| readOnly 可导航 | Task 2（无条件挂载） |
| 不改 schema/runtime | Global + 文件表 |
| 单测（纯函数）+ 手动验收 | Task 1 + Task 2 Step 6 |
| tsc | Task 2 Step 4 |

无 TBD / 无跨 task 命名不一致（统一 `minimapNodeColor`）。
