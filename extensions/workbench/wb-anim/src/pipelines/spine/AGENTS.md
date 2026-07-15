# Spine 骨骼角色创建管线

## 概述

完整的 Spine 2D 骨骼角色创建工作室，从文本描述到可用游戏角色的全流程管线。

## 架构

```
spine/
  index.ts              ← IPipeline 适配器（框架入口）
  AGENTS.md             ← 本文件
  editor/               ← 自包含的 Spine 编辑器模块（18 个文件）
    SpineEditor.ts      ← 编辑器主入口，全屏 overlay，管理 5 个 Tab
    StudioState.ts      ← 状态定义 + Tab 元数据
    StudioStorage.ts    ← IndexedDB 持久化
    types.ts            ← Spine JSON 格式 + 编辑器类型系统
    CharacterDesignTab  ← Tab 1: AI 文/图生成角色立绘
    ExplosionTab        ← Tab 2: 将角色拆分为身体部件
    AutoBindTab         ← Tab 3: 自动匹配骨骼模板 + 手动微调
    AnimWorkshopTab     ← Tab 4: AI/手动关键帧动画编辑
    GameUploadTab       ← Tab 5: 导出 Spine JSON + Atlas + 注入游戏
    PipelinePanel       ← AI 生成流水线面板（6 步）
    SpineRenderer       ← Canvas 2D 骨骼渲染器
    SpineDataParser     ← Spine JSON 解析 + 世界变换计算
    AnimationTimeline   ← 时间轴组件
    BoneTreePanel       ← 骨骼树状展示
    PropertyPanel       ← 属性面板
    BindingPanel        ← 绑定面板
    AIAnimPanel         ← AI 动画生成面板
    TemplateLibrary     ← 骨骼模板库
```

## 工作流（5 步）

1. **角色设计** — 输入文本描述 → AI 生成全身立绘（MCP: `image-gemini`）
2. **拆分部件** — 语义分割角色图 → 各部位抠图（MCP: `image-segmentation` + `image-remove-bg`）
3. **自动绑骨** — 选择骨骼模板 → 自动匹配部件到插槽 → 手动微调
4. **动作工坊** — AI 或手动创建关键帧动画 → 实时预览
5. **导出** — 生成 Spine JSON + Spritesheet → 导出文件 / 注入游戏

## AI 流水线（6 步自动化）

`PipelinePanel.ts` 定义了 MCP 驱动的自动化流水线：

| 步骤 | 操作 | MCP 工具 |
|------|------|----------|
| 1 | 生成角色图 | `image-gemini: text_to_image` |
| 2 | 语义分割 | `image-segmentation` |
| 3 | 抠图处理 | `image-remove-bg` |
| 4 | 缩放适配 | `image-postprocess` |
| 5 | 绑定骨骼 | 内置骨骼编辑器 |
| 6 | 生成动画 | LLM API |

## 开发须知

### 代码约定
- 所有 UI 为纯 DOM 操作，不依赖 React/Vue 等框架
- CSS 内嵌于 `SpineEditor.ts` 末尾（`STUDIO_CSS` 常量），使用 `se-` / `sd-` / `ab-` / `aw-` / `bp-` 前缀避免冲突
- 状态通过 `StudioState` 接口在 Tab 间共享，`onStateChange` 回调触发 UI 刷新
- 数据持久化使用 IndexedDB（`StudioStorage.ts`），自动保存间隔 1.5s
- 所有 import 为相对路径（`./xxx`），模块完全自包含

### 修改指南
- **添加新 Tab**: 实现 `StudioTab` 接口，在 `StudioState.ts` 的 `TAB_META` 中添加条目，在 `SpineEditor.ts` 的 `build()` 中实例化
- **修改 AI 流水线**: 编辑 `PipelinePanel.ts` 中的 `DEFAULT_STEPS` 数组
- **修改骨骼渲染**: 编辑 `SpineRenderer.ts`（纯 Canvas 2D）
- **修改动画系统**: 编辑 `AnimationTimeline.ts` + `AnimWorkshopTab.ts`
- **添加骨骼模板**: 将文件放入 `public/spine-assets/<name>/`，包含 `skeleton.json` + `skeleton.atlas` + `skeleton.png`

### 与框架的集成
- `index.ts` 是 `IPipeline` 适配器，`createUI()` 渲染侧边栏面板，"打开 Spine 工作室" 按钮触发 `SpineEditor.toggle()`
- `SpineEditor` 是全屏 overlay（z-index 300），阻止事件冒泡到 Three.js 场景
- 关闭编辑器后回到 character-editor 主界面，Three.js 场景继续渲染

### 示例骨骼资产
```
public/spine-assets/
  player/   — 玩家角色（含多套动画：待机、攻击、技能等）
  guaiwu/   — 怪物
  zmb2/     — 僵尸
```
