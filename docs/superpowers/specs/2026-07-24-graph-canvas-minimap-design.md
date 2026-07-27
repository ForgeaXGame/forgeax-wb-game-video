# wb-game-video · 蓝图画布小地图导航

> 状态：🟢 SPEC（已定稿，待实现）  
> 日期：2026-07-24  
> 读者：实现本能力的开发 / AI agent  
> 范围：编辑器 `GraphCanvas` 左下角始终显示的 XYFlow `MiniMap`（与 Controls 同行、紧贴其右）；视口框拖拽 / 点击跳转；暗色主题与节点类型着色。  
> 不做：运行时玩家小地图；折叠/默认隐藏；节点搜索跳转面板；小地图自身滚轮缩放；自绘 SVG 概览；schema / runtime 改动。  
> 相关：`src/graph/canvas/GraphCanvas.tsx`（画布 SSOT）；`@xyflow/react` MiniMap。

一句话：**用官方 MiniMap 给蓝图编辑画布加始终可见的左下角缩略导航（Controls 右侧），不碰图数据契约。**

---

## 1. 背景与目标

### 1.1 现状

- 画布基于 `@xyflow/react`：已有 `Background`、`Controls`（`bottom-left`）。
- 右下 `.gv-canvas-chrome` 放「添加节点」等操作按钮。
- 大图（如 nodia demo）缺少全图概览与快速跳转。

### 1.2 成功标准（v1）

1. 进画布左下始终可见小地图（Controls 右侧同行）；节点按 badge 类型着色可读。
2. 拖视口框 / 点击小地图 → 主画布视口跳到对应区域。
3. 小地图 `zoomable={false}`；主画布缩放仍走 Controls / 触控板。
4. 右下 chrome 按钮不受影响、可点。
5. `readOnly`（试玩高亮）时小地图仍可导航视口。
6. `npx tsc --noEmit` 通过；不改三份核心 schema。

---

## 2. 已锁定决策

| # | 决策 | 说明 |
|---|---|---|
| D1 | 编辑器画布概览，非运行时 HUD | 落在 `GraphCanvas`，不进 `runtime/` |
| D2 | 自研 `GraphMiniMap`（非整站 MiniMap） | 边界只认节点包围盒；画节点+连线全貌；橙框=视口 |
| D3 | 完整导航 | `pannable`；点击跳转；`zoomable={false}` |
| D4 | `position="bottom-left"` + `left:52px` | 与 Controls 同行，紧贴其右 |
| D5 | 始终显示 | 无折叠、无默认隐藏开关 |
| D6 | `nodeColor` ← `BADGE_COLOR` | 读 `data.fx.data.badge`；缺省 `#4b5563` |
| D7 | 编辑 / readOnly 都显示 | 只导航视口，不放宽图编辑权限 |
| D8 | 不改 schema / runtime | 仅编辑器画布 UI |

---

## 3. 实现落点

### 3.1 主文件

`src/graph/canvas/GraphCanvas.tsx`

1. 从 `@xyflow/react` 增加导入 `MiniMap`。
2. 在 `<ReactFlow>` 内、`<Controls />` 旁挂载：

```tsx
<MiniMap
  position="bottom-left"
  pannable
  zoomable={false}
  nodeColor={minimapNodeColor}
  bgColor="#12151c"
  maskColor="rgba(8,10,14,0.42)"
  maskStrokeColor="#f08840"
  maskStrokeWidth={2}
  style={{ width: 168, height: 118 }}
/>
```
小地图语义：整图节点 = 地图；镂空区 + 橙框 = 当前视口；拖/点 = 迁移到对应位置。


3. `ensureCanvasStyle()`：
   - `.react-flow__minimap`：圆角、边框、阴影对齐 Controls（`#33373f` / 暗底）。
   - `.react-flow__panel.react-flow__minimap.bottom.left{left:52px}`：避开 Controls 竖条宽度 + 间距。

### 3.2 不改

- `GraphStudio.tsx`（除非实现时发现 props 必须透传；当前不需要）
- `src/runtime/**`、三份 schema
- 新依赖（已有 `@xyflow/react`）

---

## 4. 交互与布局

| 区域 | 行为 |
|---|---|
| 小地图节点色块 | 只读概览，按 badge 着色 |
| 视口遮罩框 | 可拖 → 平移主画布 |
| 小地图空白点击 | 视口中心跳到该 flow 坐标 |
| 小地图滚轮 | 无（`zoomable={false}`） |
| 左下 Controls | 不变：缩放 / fit；小地图在其右侧 |
| 右下 chrome | 仍在右下，不受小地图影响 |

尺寸约 **160×110**，不抢主画布。

---

## 5. 验收清单

1. 打开大图（nodia demo）：左下 Controls 右侧有小地图，类型色可辨。
2. 拖视口框 / 点小地图 → 主画布平移正确。
3. 小地图滚轮不缩放小地图；主画布缩放正常。
4. 右下「添加节点」等 chrome 可点、不被挡。
5. 试玩 `readOnly` 时小地图仍可导航。
6. `npx tsc --noEmit` 通过。

---

## 6. 测试策略

- 以手动验收为主（视口交互难在 happy-dom 里稳定测）。
- 不强制新增单元测试；若后续有 canvas chrome 布局测试可顺带断言 minimap 样式类存在。
- 类型检查必过。

---

## 7. 非目标（明确不做）

- 可折叠 / 默认隐藏 / 工具栏开关
- 小地图自身缩放（`zoomable`）
- 节点列表 / 搜索跳转侧栏
- 运行时视频上的玩家小地图
- 自绘概览或第三方地图库
`}
