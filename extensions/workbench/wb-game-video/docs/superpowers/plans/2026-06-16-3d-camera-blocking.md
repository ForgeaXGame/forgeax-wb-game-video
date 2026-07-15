# 3D 辅助相机调度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 wb-reel 素材库加一个低模 3D blockout 编辑器，玩家摆白模/图片/带色角色占位 + 带序号相机，渲染机位白模静帧作「软参考」并把相机/站位/配色转成提示词，与角色锚点+氛围参考一起喂 Seedance 出视频。

**Architecture:** 数据为真源（`scenario.blockouts` 注册表 + `scene.blockoutRef`），three.js 仅投影。轻档管线：机位静帧走 `reference_image`（绝不 first_frame）+ `BLOCKOUT_GUARD` 防白模泄漏。复用 wb-gen3d 原生 three.js viewer 内核。

**Tech Stack:** TypeScript, React 19, 原生 three.js@0.184 (+ `three/examples/jsm/controls/TransformControls`), Zustand(scenarioStore), vitest(happy-dom), Vite。

参考 spec：`docs/superpowers/specs/2026-06-16-3d-camera-blocking-design.md`

---

## 文件结构

- Create `src/forge/blockout/blockoutTypes.ts` — Blockout/Object/Camera 类型 + 常量(palette/guard)
- Create `src/forge/blockout/normalizeBlockout.ts` — normalize 纯函数
- Create `src/forge/blockout/cameraMath.ts` — mmToFov/fovToMm + lookAt 推导
- Create `src/forge/blockout/blockoutColor.ts` — colorForCharacter 稳定配色
- Create `src/forge/blockout/blockoutPrompt.ts` — buildBlockoutLegend / cameraToPrompt / BLOCKOUT_GUARD 拼装
- Create `src/forge/blockout/__tests__/*.test.ts` — 上述纯函数 TDD
- Create `src/forge/blockout/useBlockoutScene.ts` — 数据↔three 受控同步
- Create `src/forge/blockout/BlockoutEditor.tsx` — 编辑器 UI（列表/画布/属性）
- Create `src/forge/blockout/renderCameraStill.ts` — 离屏渲染机位静帧 → mediaStore
- Modify `src/scenario/types.ts` — 加 `Scenario.blockouts` / `Scene.blockoutRef` / Blockout 系列类型
- Modify `src/scenario/normalize.ts`(或同等入口) — 接 `normalizeBlockout`
- Modify `src/forge/AssetBoard.tsx` / `AssetCard.tsx` — 「用 3D 机位」入口 + 状态
- Modify `package.json` — 加 three 依赖

---

## Task 0: 引入 three 依赖

**Files:** Modify `package.json`

- [ ] Step 1: `bun add three@^0.184.0 && bun add -d @types/three@^0.184.1`（在 wb-reel 目录）
- [ ] Step 2: 验证 `node_modules/three` 存在，`bunx tsc --noEmit` 不因缺 three 报错
- [ ] Step 3:（不提交，按用户偏好）

---

## Task 1: 数据类型 + normalizeBlockout（TDD）

**Files:**
- Create `src/forge/blockout/blockoutTypes.ts`
- Create `src/forge/blockout/normalizeBlockout.ts`
- Test `src/forge/blockout/__tests__/normalizeBlockout.test.ts`

类型见 spec「scenario 数据」节（Blockout/BlockoutObject/BlockoutCamera/Transform/Vec3/枚举）。

- [ ] Step 1: 写失败测试

```ts
// @vitest-environment happy-dom 非必需（纯逻辑），可省
import { describe, it, expect } from 'vitest'
import { normalizeBlockout } from '../normalizeBlockout'

describe('normalizeBlockout', () => {
  it('相机按 order 升序稳定排序并重排 order 去重', () => {
    const b = normalizeBlockout({
      id: 'b1', name: 'x',
      cameras: [
        { id: 'c2', order: 5, name: 'B', transform: {}, fovMm: 35, framing: 'medium', move: 'static' },
        { id: 'c1', order: 5, name: 'A', transform: {}, fovMm: 35, framing: 'medium', move: 'static' },
      ],
      objects: [],
    } as any)
    expect(b.cameras.map((c) => c.id)).toEqual(['c2', 'c1']) // 同 order 保持输入序
    expect(b.cameras.map((c) => c.order)).toEqual([0, 1])    // 重排
  })

  it('丢弃 linkedAnchor 非法的对象引用但保留对象（anchor 置空）', () => {
    const b = normalizeBlockout({
      id: 'b', name: '', objects: [
        { id: 'o1', kind: 'capsule', transform: {}, linkedAnchor: { kind: 'character', id: 'missing' } },
      ], cameras: [],
    } as any, { validCharacterIds: new Set() })
    expect(b.objects[0].linkedAnchor).toBeUndefined()
  })

  it('补默认 transform（pos0/rot0/scale1）', () => {
    const b = normalizeBlockout({ id: 'b', name: '', objects: [{ id: 'o', kind: 'box' }], cameras: [] } as any)
    expect(b.objects[0].transform).toEqual({ pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } })
  })
})
```

- [ ] Step 2: Run `npx vitest run src/forge/blockout/__tests__/normalizeBlockout.test.ts` → FAIL
- [ ] Step 3: 实现 `blockoutTypes.ts`（类型）+ `normalizeBlockout(raw, ctx?)`：
  - `ctx?: { validCharacterIds?, validLocationIds?, validPropIds? }`，对应 anchor.kind 校验，非法置 `linkedAnchor=undefined`
  - 稳定排序：`cameras.slice().sort((a,b)=>a.order-b.order)`（JS sort 稳定）后重排 `order=index`
  - `normalizeTransform` 补默认
- [ ] Step 4: Run 测试 → PASS
- [ ] Step 5:（不提交）

---

## Task 2: cameraMath（焦段↔fov）（TDD）

**Files:** Create `src/forge/blockout/cameraMath.ts`; Test `__tests__/cameraMath.test.ts`

- [ ] Step 1: 失败测试

```ts
import { mmToFov, fovToMm } from '../cameraMath'
it('50mm 全画幅水平 fov ≈ 39.6°', () => {
  expect(mmToFov(50)).toBeCloseTo(39.6, 0)
})
it('mm→fov→mm 往返一致', () => {
  expect(fovToMm(mmToFov(35))).toBeCloseTo(35, 3)
})
```

- [ ] Step 2: Run → FAIL
- [ ] Step 3: 实现（水平 36mm）：`mmToFov(mm)=2*atan(36/(2*mm))*180/π`；`fovToMm(deg)=18/tan(deg*π/360)`
- [ ] Step 4: Run → PASS
- [ ] Step 5:（不提交）

---

## Task 3: blockoutColor（稳定配色）（TDD）

**Files:** Create `src/forge/blockout/blockoutColor.ts`; Test `__tests__/blockoutColor.test.ts`

- [ ] Step 1: 失败测试

```ts
import { colorForCharacter, BLOCKOUT_PALETTE } from '../blockoutColor'
it('同一角色 id 恒定取色', () => {
  expect(colorForCharacter('char-li')).toBe(colorForCharacter('char-li'))
})
it('取色来自调色板', () => {
  expect(BLOCKOUT_PALETTE).toContain(colorForCharacter('char-li'))
})
it('两个不同角色尽量不同色（调色板足够大时不同）', () => {
  expect(colorForCharacter('char-li')).not.toBe(colorForCharacter('char-wang'))
})
```

- [ ] Step 2: Run → FAIL
- [ ] Step 3: 实现：`BLOCKOUT_PALETTE`（8~12 高对比 hex）；`hash(id)` 简单字符串哈希 → `palette[hash%len]`。
  注：第三个用例对特定 id 需保证落不同槽——选 palette 长度与哈希使 'char-li'/'char-wang' 不撞；若撞则调哈希。
- [ ] Step 4: Run → PASS
- [ ] Step 5:（不提交）

---

## Task 4: blockoutPrompt（图例 + 运镜 + GUARD）（TDD）

**Files:** Create `src/forge/blockout/blockoutPrompt.ts`; Test `__tests__/blockoutPrompt.test.ts`

接口：
```ts
export const BLOCKOUT_GUARD: string
export function cameraToPrompt(cam: BlockoutCamera): string
export function buildBlockoutLegend(args: {
  blockout: Blockout
  camera: BlockoutCamera
  scenario: Pick<Scenario, 'characters'>
  anchorIndexOf: (charId: string) => number | undefined // 该角色参考图在 refs 序列里的序号(1-based)
}): string
export function composeBlockoutVideoPrompt(args): { prompt: string; warnings: string[] }
```

- [ ] Step 1: 失败测试

```ts
it('cameraToPrompt 含景别/焦段/运镜', () => {
  const s = cameraToPrompt({ framing: 'close', fovMm: 85, move: 'dolly-in' } as any)
  expect(s).toMatch(/close|特写/i)
  expect(s).toMatch(/85mm/)
  expect(s).toMatch(/dolly/i)
})
it('legend 把角色色映射到角色名+参考图序号', () => {
  const legend = buildBlockoutLegend({
    blockout: { objects: [{ id:'o', kind:'capsule', colorRole:'#ff0000', linkedAnchor:{kind:'character',id:'char-li'}, transform:{pos:{x:-1,y:0,z:0},rot:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}} }], cameras:[] } as any,
    camera: { transform:{pos:{x:0,y:1,z:3},rot:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}} } as any,
    scenario: { characters: { 'char-li': { id:'char-li', name:'李建' } } } as any,
    anchorIndexOf: () => 1,
  })
  expect(legend).toMatch(/李建/)
  expect(legend).toMatch(/#ff0000|红/i)
  expect(legend).toMatch(/参考图.?1|①/)
})
it('composeBlockoutVideoPrompt 始终含 GUARD 防白模泄漏', () => {
  const { prompt } = composeBlockoutVideoPrompt({ basePrompt:'两人对峙', blockout, camera, scenario, anchorIndexOf })
  expect(prompt).toContain(BLOCKOUT_GUARD)
})
```

- [ ] Step 2: Run → FAIL
- [ ] Step 3: 实现：
  - `BLOCKOUT_GUARD`=spec 的防泄漏文案。
  - `cameraToPrompt`：framing 词表 + `${fovMm}mm` + move 词表（dolly-in→“缓慢推近”/“slow dolly-in”）。
  - `buildBlockoutLegend`：遍历 character 占位，按相机做粗略入画/左右前后位置词（x<0 左、z 小近=前景），拼“{色名/hex} 占位＝{角色名}（参考图{序号}），{位置}”。
  - `composeBlockoutVideoPrompt`：`[basePrompt, legend, cameraToPrompt, BLOCKOUT_GUARD].join('\n\n')`。
- [ ] Step 4: Run → PASS
- [ ] Step 5:（不提交）

---

## Task 5: scenario 类型 + normalize 接线

**Files:** Modify `src/scenario/types.ts`（加 `Scenario.blockouts?` / `Scene.blockoutRef?` + 从 blockoutTypes re-export 或就地定义）; Modify scenario normalize 入口接 `normalizeBlockout`（遍历 `blockouts` 各项）。

- [ ] Step 1: 加类型（blockout 系列放 `scenario/types.ts` 以免循环依赖；blockout 模块从这里 import）
- [ ] Step 2: normalize：对 `raw.blockouts` 每项跑 `normalizeBlockout(v, { validCharacterIds: new Set(Object.keys(characters)), ... })`；`scene.blockoutRef` 指向不存在的 blockout 时置空
- [ ] Step 3: 跑既有 scenario normalize 测试 → 不回归
- [ ] Step 4:（不提交）

---

## Task 6: useBlockoutScene（数据↔three 受控同步）

**Files:** Create `src/forge/blockout/useBlockoutScene.ts`

- [ ] Step 1: 复用 wb-gen3d `createViewerCore` 思路自建：renderer + scene + OrbitControls + 网格(`GridHelper`) + 半球光。
- [ ] Step 2: `syncObjects(blockout)`：按 id diff 增删 mesh；kind→geometry（capsule/box/cylinder/plane）；角色占位用 `colorRole` 上 `MeshStandardMaterial`；billboard 用 `texMediaId` 的 URL 贴 `TextureLoader`。
- [ ] Step 3: 相机用 `CameraHelper` 线框；选中物体挂 `TransformControls`，`dragging-changed` 禁用 OrbitControls，拖动结束回调写回数据（pos/rot/scale）。
- [ ] Step 4: 冒烟：happy-dom 下 mount→渲染一帧不抛错（WebGL 在 happy-dom 可能不可用 → 该层不强测，仅手测）。
- [ ] Step 5:（不提交）

---

## Task 7: BlockoutEditor.tsx（编辑器 UI）

**Files:** Create `src/forge/blockout/BlockoutEditor.tsx`（+ 注入 CSS injectStyleOnce）

- [ ] Step 1: 三栏：左=物体/相机列表（增删、选中、相机拖排）；中=three 画布(mount ref)；右=选中项属性表单（位姿数值、kind/锚点下拉、相机 fovMm/framing/move/target）。
- [ ] Step 2: 顶部：blockout 选择（新建 / 复用现有 / 从场景克隆）写 `scenario.blockouts` + `scene.blockoutRef`（经 scenarioStore action）。
- [ ] Step 3: 「添加角色占位」从 `scenario.characters` 选 → 建 capsule，`linkedAnchor`+`colorRole=colorForCharacter(id)`；「添加道具/图片」同理。
- [ ] Step 4: 「进入此相机」把主视图切到该机位预览。
- [ ] Step 5:（不提交）

---

## Task 8: renderCameraStill（离屏静帧 → mediaStore）

**Files:** Create `src/forge/blockout/renderCameraStill.ts`

- [ ] Step 1: 用独立 `WebGLRenderer`（offscreen size 按目标 ratio），把 blockout 场景按 camera 位姿渲一帧 → `renderer.domElement.toDataURL('image/png')`。
- [ ] Step 2: dataURL → ingest `mediaStore`（kind=image，tag=`reel:blockout:${blockoutId}:${cameraId}`），返回 mediaId。
- [ ] Step 3: 手测（WebGL 需真实浏览器，不进 CI 单测）。
- [ ] Step 4:（不提交）

---

## Task 9: 接入素材库视频卡「用 3D 机位」

**Files:** Modify `src/forge/AssetBoard.tsx`, `src/forge/AssetCard.tsx`

- [ ] Step 1: 视频卡 reference 模式下加「用 3D 机位」入口：打开 `BlockoutEditor`（drawer/modal）选相机。
- [ ] Step 2: 选定后：`renderCameraStill` → 得 mediaId；把它**作为 referenceImageUrls 之一**（绝不 startFrame）；`composeBlockoutVideoPrompt` 结果并入卡片 prompt（与角色锚点/氛围参考共存）。
- [ ] Step 3: 提供「纯文本站位」开关：开 → 不送静帧图，仅文本进 prompt。
- [ ] Step 4: 走既有 `generateCardVideo`（mode='reference'）。
- [ ] Step 5:（不提交）

---

## Task 10: 构建 + 回归

- [ ] Step 1: `npx vitest run src/forge/blockout src/llm src/forge` → blockout 全过；既有视频测试不回归（已知 videoTaskStore/skillHygiene 8 例环境性失败除外）
- [ ] Step 2: `WB_REEL_PLUGIN_BUILD=1 npx vite build` → 成功，dist 更新
- [ ] Step 3: 手测主工程 :18920 素材库视频卡 → 3D 机位流程

---

## Self-Review

- 覆盖：spec 各节（数据/编辑器/配色防泄漏/渲染接视频/测试/复用粒度/依赖）均有对应 Task（0–10）。
- 无占位符：纯函数 Task 含真实测试与实现要点；three 视图层为说明性（WebGL 不可单测，明确手测）。
- 类型一致：`Blockout/BlockoutObject/BlockoutCamera/Transform/Vec3` 在 Task1 定义，后续 Task 引用同名；`colorForCharacter`/`composeBlockoutVideoPrompt`/`renderCameraStill` 跨 Task 命名一致。
- 防泄漏一致：管线层强制 referenceImageUrls（非 startFrame）+ GUARD，贯穿 Task4/Task9。
