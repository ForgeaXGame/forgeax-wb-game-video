# wb-reel 素材库 · 3D 辅助相机调度（低模 blockout → 视频参考）

日期：2026-06-16
模块：`forgeax-studio/packages/marketplace/extensions/wb-reel`

## 背景与动机

素材库当前的视频生成卡（`AssetCard` 视频态）已支持「首尾帧 ⊕ 多模态参考」两种模式、
分辨率/比例、角色/场景/道具锚点参考（见 2026-06 视频参数重构）。但用户没有任何
**空间/机位**的可控手段：相机只能靠 `Shot.cameraHint` 自由文本描述，站位与构图全凭
模型脑补，跨镜一致性差。

用户诉求：在素材库加一个 **3D 辅助相机调度** —— 一个简单的低模 3D 空间，玩家自己摆放
图片、白模、锚点角色占位，并在场景内添加**带序号的相机**，相机按序号排序。每台相机给
视频模型提供**场景/构图/机位参考**，与现有 **提示词 + 角色参考 + 场景氛围参考** 合并，
一起喂给视频模型输出。

## 调研结论（决定架构走向）

AI 视频的「3D 辅助」业界分两档：

- **重档（ControlNet/IC-LoRA）**：3D 视口烘焙 Depth/Normal/OpenPose 多 pass，逐帧作
  ControlNet 强约束相机几何（ComfyUI + Yedp Action Director、LTX-2 ControlNet、Wan VACE、
  Kling 3.0 KlingCameraPath）。
- **轻档（参考图 + 提示词）**：渲染一张 blockout/泥膜静帧作构图参考 + 把相机语言写进
  提示词（Runway Director Mode、各家图生视频）。

**硬约束**：本工程视频后端是 Seedance（经 litellm 网关），只吃
`prompt + 首尾帧/参考图 + ratio/resolution/duration`，**不支持逐帧 Depth/Pose ControlNet
序列**。故本设计走**轻档**：3D 低模空间 → 渲染机位静帧（作软参考图）+ 相机参数 → 运镜
提示词。这一选择经用户确认（`scope_depth = still_prompt`）。

## 决策（已与用户对齐）

- **输出档位**：轻档。渲染白模构图静帧 + 相机转运镜提示词，喂 Seedance。
- **引擎**：复用 `wb-gen3d` 同款**原生 three.js@0.184**（无 R3F/drei），复用其 viewer 内核
  （`src/components/viewer/scene.ts`：`createViewerCore` / `placeAndMeasure` / `computeFrame`
  / `applyFrame`）模式，编辑器再补 `three/examples/jsm/controls/TransformControls`。
- **挂载粒度**：按场景（Scene）一个 blockout；且**可复用**其它场景的空间（A 场景的布景，
  后续节点也在 A 场景演出时直接复用 / 克隆）。
- **白模来源**：纯程序化基本体（胶囊/方块/圆柱/平面），零版权、零外部下载。
- **角色占位颜色区分** + **防白模泄漏**：见下「防白模泄漏与角色配色」一节（用户重点强调）。

## 架构与数据层

### scenario 数据（随剧本持久化）

新增**共享 blockout 注册表**，便于跨场景复用：

```ts
// scenario/types.ts
export interface Scenario {
  // ...
  blockouts?: Record<string, Blockout>   // 新增
}
export interface Scene {
  // ...
  blockoutRef?: string                   // 新增：引用 scenario.blockouts 的 id
}

export type BlockoutObjectKind = 'billboard' | 'box' | 'capsule' | 'cylinder' | 'plane'
export interface Vec3 { x: number; y: number; z: number }
export interface Transform { pos: Vec3; rot: Vec3; scale: Vec3 } // rot 为欧拉角(度)

export interface BlockoutObject {
  id: string
  kind: BlockoutObjectKind
  label?: string
  transform: Transform
  /** 关联锚点（角色/场景/道具）—— 角色占位据此取「角色色」与参考图 */
  linkedAnchor?: { kind: 'character' | 'location' | 'prop'; id: string; variantId?: string }
  /** billboard 贴图用的 mediaStore id（一般取 linkedAnchor 的参考图） */
  texMediaId?: string
  /** 角色占位的稳定配色（hex）；由角色 id 派生，详见配色一节 */
  colorRole?: string
}

export type CameraMove = 'static' | 'dolly-in' | 'dolly-out' | 'orbit' | 'pan' | 'crane'
export interface BlockoutCamera {
  id: string
  order: number              // 序号；相机列表 / 出图按它排
  name: string               // "机位 1" 等
  transform: Transform       // 相机位姿（用 pos + rot；target 由 rot 推或存 targetObjectId）
  fovMm: number              // 等效焦段(mm)，内部换算 three fov
  framing: ShotFraming       // 景别，复用现有类型
  move: CameraMove
  targetObjectId?: string    // 可选：朝向某物体（覆盖 rot 计算 lookAt）
}

export interface Blockout {
  id: string
  name: string
  objects: BlockoutObject[]
  cameras: BlockoutCamera[]
}
```

- `normalizeBlockout(raw): Blockout` 纯函数：补默认、丢弃非法 `linkedAnchor`（锚点不存在时
  静默丢，非破坏，与 `normalizeScenario` 同风格）、相机按 `order` 升序稳定排序、`order` 去重
  重排。**TDD**。
- 焦段↔fov 换算 `mmToFov(mm)` / `fovToMm(fov)`（基于 36mm 全画幅水平）纯函数。**TDD**。

### 复用粒度

- 新建场景 blockout：在 `scenario.blockouts` 建新 id，`scene.blockoutRef` 指向它。
- 复用现有：`scene.blockoutRef` 指向另一场景已用的 blockout id（多场景共享同一 `Blockout`，
  改一处全联动）。
- 从某场景克隆：深拷贝一份生成新 id（独立演化）。
- UI 提供「新建 / 复用现有 / 从场景克隆」三选一。

## 3D 编辑器（素材库新子面板「3D 相机调度」）

文件：`src/forge/blockout/`（新目录，集中本特性）

- `BlockoutEditor.tsx`：左列「物体 / 相机」列表（增删、选中、相机拖拽排序），中间 three
  画布（复用 `createViewerCore` 思路：renderer + OrbitControls + 网格地面 + Transform Gizmo），
  右列选中项属性（位姿、kind/锚点绑定、相机 fov/景别/运镜/朝向）。
- `useBlockoutScene.ts`：把 `Blockout` 数据 ↔ three 场景对象做受控同步（数据为真源，three
  仅投影）；`TransformControls` 拖动结束写回数据。
- 白模：程序化 `THREE.CapsuleGeometry`（角色）/`BoxGeometry`/`CylinderGeometry`/`PlaneGeometry`
  （图片广告牌用平面 + 锚点图贴图，URL 取自 `mediaStore`）。
- 相机用视锥线框（`CameraHelper` 或自绘）可视化；「进入此相机」把主视图切到该机位预览。
- three 视图层不做强单测（受控同步逻辑可抽纯函数另测）。

## 防白模泄漏与角色配色（用户重点）

### 角色配色

- 调色板 `BLOCKOUT_PALETTE`（高对比、稳定）。`colorForCharacter(characterId)` 纯函数：按
  角色 id 哈希取稳定色，保证同一角色每次同色、不同角色尽量错开（两个角色 → 两个明显不同色）。
- 编辑器列表与渲染静帧均显示该色；角色占位胶囊用 `colorRole` 着色。

### 相机/场景 → 提示词（纯函数，TDD）

- `buildBlockoutLegend(blockout, camera, scenario)`：生成「色彩图例」，把每个**入画**角色占位的
  颜色 → 角色名 + 其参考图序号 + 在画面中的位置/朝向/相互关系。例：
  > 布局参考：红色占位＝李建（参考图①），画面左前景；青色占位＝王芳（参考图②），右后景，二人对视。
- `cameraToPrompt(camera)`：景别 + 机位角度 + 焦段 + 运镜 → 运镜提示词；可回填
  `Shot.cameraHint` / `Shot.framing`（提供「回填到分镜」按钮，不自动改）。
- `BLOCKOUT_GUARD` 常量约束文案（核心防泄漏）：
  > 该 3D 参考图仅用于相机角度、景别、构图与角色站位；**不要**还原其中的灰白几何体 /
  > 彩色占位块 / 地面网格 / 泥膜质感；角色一律按各自参考图的真实外观渲染。

### feed 通道（管线层防泄漏，接现有视频模式）

- blockout 机位静帧默认走**多模态参考模式的 `reference_image`**（与角色锚点图并列作软参考），
  **绝不**放 `first_frame`（first_frame 会被高度还原 → 灰胶囊真被画出来）。
- 提供「**纯文本站位**」开关（最强保险）：blockout 静帧不作为图片发送，仅 `buildBlockoutLegend`
  + `cameraToPrompt` 的文本进 prompt，零图像泄漏风险。默认 = reference_image + 强约束。

## 取景渲染 → 接视频生成

- `renderCameraStill(blockout, cameraId): Promise<mediaId>`：离屏 three 渲染该机位白模构图静帧
  PNG → `mediaStore` ingest（kind=image，带 cardTag）。供「软参考」与编辑器缩略图。
- `AssetBoard` 视频卡新增「用 3D 机位」入口：
  1. 选场景 blockout + 一台相机；
  2. 渲染机位静帧 → 设为 `reference_image`（或按开关走纯文本）；
  3. `buildBlockoutLegend + cameraToPrompt + BLOCKOUT_GUARD` 并入 prompt；
  4. 与**角色锚点 + 场景氛围参考**合并，走既有 `generateCardVideo`（复用 mode/分辨率/比例链路）。
- 相机按 `order` 排序，可「逐机位批量出图/出视频」（复用 `orchestrateVideos` 的入队思路，
  本期可只做单机位手动触发，批量留后续）。

## 数据流

```
BlockoutEditor(数据为真源) ──写回──> scenario.blockouts[id]（localStorage + 磁盘镜像，沿用现有持久化）
        │
        ├─ renderCameraStill(cam) ──> mediaStore(image) ──┐
        ├─ buildBlockoutLegend(cam) ──┐                    │
        ├─ cameraToPrompt(cam) ───────┤ prompt 合并        │ reference_image（或纯文本则不送图）
        └─ BLOCKOUT_GUARD ────────────┘                    │
                                                            ▼
  AssetBoard 视频卡 ── prompt + 角色锚点 + 氛围参考 + 机位静帧 ──> generateCardVideo ──> Seedance
```

## 测试策略

- 纯函数 TDD：`normalizeBlockout`、`mmToFov/fovToMm`、`colorForCharacter`（稳定性 + 区分度）、
  `buildBlockoutLegend`（颜色↔角色↔位置映射、只列入画对象）、`cameraToPrompt`、相机 order 排序。
- three 视图层不强测；受控同步的数据→对象映射抽纯函数另测。
- 构建 `wb-reel` dist + 跑相关回归（保持既有视频参数测试不回归）。

## 范围与 YAGNI

- **做**：低模 blockout 编辑、程序化白模、图片广告牌、带序号相机、机位静帧、运镜/图例提示词、
  防泄漏双保险、按场景 + 跨场景复用、接视频卡单机位生成。
- **不做（本期砍）**：逐帧 Depth/Pose ControlNet；外部 gltf 资产库；相机关键帧动画曲线
  （先静态机位）；批量逐机位编排（留后续）；物理/碰撞。

## 依赖与构建影响

- 新增 `three@^0.184` + `@types/three`（与 wb-gen3d 对齐版本）。增量打包约几百 KB（three 主体）。
- 新目录 `src/forge/blockout/`；`scenario/types.ts` 增类型 + `normalizeScenario` 接 `normalizeBlockout`；
  `AssetBoard` / `AssetCard` 增「用 3D 机位」入口；持久化沿用现有 scenario 通道。
- 插件 `embeddedAlso` 走 dist：改完须 `WB_REEL_PLUGIN_BUILD=1 npx vite build` 重建 dist。

## 开放问题（实现期可定）

- 相机朝向：统一用 `targetObjectId`（lookAt 物体）还是欧拉 rot？倾向：有 target 用 target，
  否则用 rot。
- 静帧风格：纯白泥膜 vs 带角色色块。结论：带角色色块（满足配色区分），但 GUARD 文案兜底防泄漏。
