# wb-reel 节点详情「画面为王」重构 + 「素材库」一级视图

日期：2026-06-14
模块：`forgeax-studio/packages/marketplace/plugins/wb-reel`

## 背景与动机

当前剧情树节点详情（`SceneDetailDrawer` inline）是 2 列 4 行 grid：左列自上而下堆叠
Stage 画面 → 版本条 → 时间轴+Dock → 场景 BGM，右列被「资产生成」(`StagePromptFloater`)
跨满高度吃掉 340–440px。结果图像/视频画面被压得很小，模块堆成一长条（见用户反馈图1）。

用户诉求（参考手机剪辑 App，见图2）：

1. **画面为王**：节点详情让图像/视频内容区占比最大，工具收成紧凑条。
2. **「素材库」升级为第四个一级视图**：与「剧本 / 图像 / 剧情树」并列，把「生成 + 素材库」
   相关工作集中到此视图，内容区铺满。

## 架构约束（split-pane）

- `pane=left` iframe → `ReelSidebar`（窄列，含视图切换 pill + 剧情树 `SceneMiniMap`）。
- `pane=center` iframe → `ForgeTab`（按 `forgeView` 切 script/image/tree pane）。
- 两 iframe 经 `crossPaneSync`(BroadcastChannel) 同步 `forgeView` 等 UI 路由。

## 方案

### 一、节点详情「画面为王」重构（`SceneDetailDrawer`）

把详情 body 从「2 列 4 行 grid」改为**单列竖向 flex**（剪辑 App 式）：

```
Stage 画面        flex: 1   ← 吃满剩余空间，绝对主角
版本条            flex: 0 0 auto（compact 单行，max-height 限高）
Timeline + Dock   flex: 0 0 auto（紧凑工具条；Dock 含 字幕/QTE/分支/音频）
```

变更点：

- **移除右列「资产生成」**：`StagePromptFloater variant="panel"`（含 `PromptTabs` + `ScenarioAssetLibrary`）
  从 `SceneDetailDrawer` 删除，迁到新「素材库」视图。
- **场景 BGM 收进 Dock 音频页**：`SceneBgmPanel` 从详情底部独立行移除，挂进 `TimelineDock`
  的「音频」标签页内（BGM 本属音频范畴）。不再单占一行抢画面高度。
- grid 改 flex column；画面 cell `flex: 1` + `min-height: 0`，版本条/时间轴行 `flex: 0 0 auto`。
- 删除随之失效的 CSS：右列 prompt cell、BGM cell、2 列 grid 模板、相关 `@media` 多列规则。

### 二、「素材库」第四个一级视图

- **类型**：`ForgeView` `'script'|'image'|'tree'` → 增加 `'assets'`。
- **shellStore**：`setForgeView` 校验白名单、persist `merge` 白名单、（如有）migrate 均加 `'assets'`。
- **侧边栏**：`ReelSidebar` 的 `VIEW_DEFS` 增加 `{ id:'assets', label:'素材库', hint:'本场景/分镜/剧本 素材生成与管理' }`。
- **内容区**：`ForgeTab` 增加第四个 `ks-forge-tab-pane`（`data-pane="assets"`，`hidden={forgeView!=='assets'}`），
  渲染新组件 `AssetsTab`。
- **`AssetsTab`（新文件 `src/forge/AssetsTab.tsx`）**：聚合现有「资产生成」整块——
  复用 `StagePromptFloater variant="panel"`（`PromptTabs` 生成区 + `ScenarioAssetLibrary` 素材库）。
  跟随 `scenarioStore.selectedSceneId`（在剧情树点谁就编辑谁的素材）。
  无选中节点时显示空态引导（去剧情树点一个节点）。
- **crossPaneSync**：`forgeView='assets'` 走既有 forgeView 同步通道，无需新增协议。

## 数据流

- 选中节点：`SceneMiniMap`(left) 点节点 → `crossPaneSync` 镜像 `selectedSceneId` → center。
- 「素材库」视图 `StagePromptFloater(panel)` 读 `scenario.scenes[selectedSceneId]`，与原详情右列行为一致。
- BGM：`SceneBgmPanel` 移动到 `TimelineDock` 音频页，props 仍是 `sceneId`，数据写 `scenario.setSceneBgm` 不变。

## 不做（YAGNI）

- 不改 `PromptTabs` / `ScenarioAssetLibrary` / `SceneBgmPanel` 内部逻辑，只搬位置。
- 不动 Player / 图像视图 / 剧本视图。
- 不引入新的跨 iframe 协议。

## 测试

- 构建：`tsc -p tsconfig.build.json && vite build` 必须 0 报错。
- 手验：① 详情画面明显变大、下方仅版本条+时间轴；② Dock 音频页能看到 BGM 两栏；
  ③ 侧栏出现第 4 个 pill「素材库」，点击 center 切到素材库，跟随选中节点；④ 切 iframe 后 forgeView 同步。

## 风险

- 删 grid CSS 时遗漏导致旧选择器残留 → 编译期无错但视觉错位；自测时逐项核对。
- `SceneBgmPanel` 进 Dock 后高度受限 → 给音频页内部滚动兜底。
