# 组件契约收敛：inputs 作唯一真源 + 组件自吐事件

> 状态：🟡 SPEC（落地中）· 2026-07-17
> 目标：把「组件声明 / 配置 / 运行时」全部对齐到一个模型——**组件 = `inputs`（输入）+ `events`（吐出的事件）**。
> 不考虑向后兼容，直接按目标态走（本仓 demo/存档随之迁移）。

## 1. 心智模型（目标态）

一个 overlay 里放若干**组件实例**；运行引擎解析 overlay、把组件按其 `inputs` 发到视频上；
组件在浏览器里自己渲染、自己判定（计时/计数/命中），**跑完直接 `emit` 一个已声明的 `event`**；
引擎只负责「收到组件的 event → 按 `reactions`/边路由（含 advance 换节点）」。

- **没有阻塞式交互判定机制**：判定型交互（QTE/防反/连打/限时）与「点击发事件」同构——都走同一条
  非阻塞事件通道（`emitComponentEvent`）。
- **节点的"等待"是声明式副产物**：节点若没有无条件自动出边、走向全靠 `event → advance`，自然停在那等组件 emit。

## 2. 组件定义 = ComponentManifest + 运行时渲染

组件不再是「一堆分散方法的 KindPlugin」，而是**导出一个 ComponentManifest**（作者契约）+ 一个渲染实现（Player 侧）。

```ts
interface ComponentInput {
  key: string
  label?: string
  valueType: 'string' | 'number' | 'boolean' | 'color' | 'bind' | 'json'
  required?: boolean
  default?: unknown          // 放宽到任意（含结构化默认，如选项数组/拍点数组）
  options?: { value: string; label: string }[]   // 有 options ⇒ 编辑器出 select
  component?: 'textStyle' | 'effects' | 'events' | 'hotspotEvents' | 'qteCues' | 'entity' | 'attr' | 'color'  // 复合控件提示（可选；标量不填）
}

interface ComponentEvent {          // 组件会吐哪些事件（= 出口 handle 来源）
  id: string
  label?: string
  // 将来事件若需自带入参，再加 inputs?: ComponentInput[]
}

interface ComponentManifest {
  id: string
  label?: string
  role: 'presentation' | 'interaction'   // 仅用于编辑器分类/默认 UI；运行时不再据此分派判定
  surface?: 'hud'
  stageRelative?: boolean
  inputs: ComponentInput[]        // 唯一输入声明（SSOT）
  events: ComponentEvent[]        // 组件吐出的事件；出口 handle = events（不再有 outputs()）
}
```

### 被删除 / 收敛的东西

| 旧物 | 处置 |
|---|---|
| `form` / `FormField` / `deriveInputsFromForm` | **删**。编辑器改按 `inputs` 的 `valueType`/`options`/`component` 出控件 |
| `defaults()` | **删**。新建实例初值 = 由 `inputs[].default` 组装 |
| `outputs(params)` | **删**。出口 handle 由 `events` 派生（choice/qte 的选项即 events） |
| `resolve()` | **删**。判定搬进组件内部，自行 `emit` 最终 event |
| `present()` | **删**。组件自己渲染 |
| `render()`（floatText 的 expr 求值） | 逻辑挪到 **Player**：组件声明 `expr` input，渲染时求值 |
| `validate(params)` | 必填/类型 → 由 `inputs.required/valueType` 校验；跨字段校验（如 floatText `text\|\|expr`）留可选作者期钩子 |
| `ComponentEvent.payload` | **删**（无人用；将来需要再定义） |

### 运行时只剩

- 发组件（按 inputs）；
- 收组件 emit 的事件 → 路由到 `reactions`/边；
- Player 侧渲染 + expr 求值。

判定型组件的**契约**：生命周期内**必须恰好 emit 一个已声明 event**（含超时兜底，如 3s 到点 emit `fail`）。

## 3. 数据键：`params` → `inputs`

overlay child / spawn / directive / snapshot / 运行时的**存值袋** `params` 统一改名 `inputs`
（`OverlayChild.inputs`、`spawn.inputs`…）。`inputs` 的键必须是该组件 `ComponentManifest.inputs[].key` 的子集。

> 命名注意：`ComponentManifest.inputs` 是**定义**（`ComponentInput[]`），`OverlayChild.inputs` 是**值**（`Record`）。
> 同名不同义，按用户决定统一叫 `inputs`。

## 4. 落地阶段（每阶段 tsc + vitest 必须绿）

1. **Schema**：删 `ComponentEvent.payload`（✅ 已做）；`ComponentInput.default` 放宽为 `unknown`、加可选 `component`。
2. **Registry**：`KindPlugin` 收敛为 manifest（`id/label/role/surface/inputs/events`）+ 渲染引用；删 `form/deriveInputsFromForm`；`getManifest` 直接投影；`deriveOutputs` 改为「events → handles」；`defaults` 由 `inputs[].default` 组装。
3. **core-kinds / 组件**：各 kind 的 `form:[...]` → `inputs:[...]`（复合项标 `component`）；补 `battleHpBar.inputs`（✅ 已做）。判定型（qte）把 `resolve` 逻辑下沉到皮肤 `emit`。
4. **编辑器**：`KindFormFields` 改读 `manifest.inputs` 按 `valueType/options/component` 出控件并挂到 NodeInspector；spawn/QTE 检视器对齐 `inputs`。
5. **值键 rename**：`params → inputs`（语义替换，避开 `URLSearchParams` 等无关词）。
6. **数据迁移**：`nodia.graph.json` + `builtin-schemes` 的 `params → inputs`。
7. **测试/fixtures 全绿**。

## 4b. 实施状态（2026-07-17）

- ✅ 阶段 1（schema：删 payload、default→unknown、加 component）
- ✅ 阶段 2/3（删 form/FormField/deriveInputsFromForm；全部 kind 声明 inputs；getManifest 投影）
- ✅ 阶段 4（KindFormFields 改 inputs 驱动）
- ✅ 阶段 5/6（值键 `params→inputs`；demo `nodia.graph.json` 数据迁移）
- ✅ **B（resolve 下沉）**：删 `resolve`/`continue`/`ResolveResult`；交互皮肤自判定后 `submit`(=emit) 最终 event id，
  引擎 `submitInteraction` 直接把它当 outcome 路由（超时 `submit(undefined)` 落 `inputs.defaultEvent`，兜底 `'fail'`）。
- ✅ **manifest 化（吸收 C）**：`KindPlugin` 收敛为「manifest 数据（id/label/role/surface/stageRelative/aliases/inputs/events）
  + 少量可选逃生舱（`render?`/`validate?`）」。**删掉 `outputs()`/`defaults()`/`present()` 方法**：
  - 出口 handle 由 `registry.handlesOf`（实例 `inputs.events` 优先，否则组件静态 `events`）派生；
  - 新建初值由 `buildDefaults(inputs)`（读 `inputs[].default`）组装；
  - `defaultsForComponent` / `componentHandles` 供编辑器（graphMaterialOps）调用；
  - `render?` 仅 floatText 保留（按 `expr` 求值算飘字文本）；`validate?` 转可选（跨字段校验，如 floatText `text||expr`）。
  - 测试 kind 从 `outputs:()=>[...]` 改为声明 `events:[...]`（更干净）；`GameNode.outputs`（节点 handle 数组）不受影响。
- ✅ **p4b（inputs 面板挂进 NodeInspector · 以 NodeInspector 为准）**：每个挂载列出其 children，按
  `KindFormFields`（读 `manifest.inputs`、valueType/options 出控件、复合 component 提示交视频轨）编辑，写成本挂载的
  稀疏 `overrides[childId].inputs`（共享方案未改组件仍跟随原型）。

## 5. 取舍备注

- 判定权归**客户端**（组件内判定）：headless 引擎不再权威复算；自动演示/测试改成「直接 emit 事件」驱动（更简单）。对 chat 驱动的网页 demo 可接受；若将来要服务端权威/防作弊，再引入可选的引擎侧复算。

## 6. Kind 概念退役 + component 单层化（2026-07-19，已完成）

上面 §4b 的"实施状态"记录里仍称呼当时的类型/文件为 `KindPlugin`/`KindRegistry`/`KindFormFields`——
这是历史记录，如实反映当时的命名。本次改动把这套残留命名与「顶层 component + `inputs.component`
皮肤覆盖」双层结构一次性收尾：

- **机械改名**（36 文件，不改行为）：`kind-registry.ts`→`component-registry.ts`
  （`KindPlugin`→`ComponentDef`、`KindRegistry`→`ComponentRegistry`、`registerKind`→`registerComponent`、
  `getKind`/`getComponent` 合并为 `getComponent`……）；`core-kinds.ts`→`core-components.ts`
  （`qteKind`/`inkKouKind`… 去 `Kind` 后缀→`qteComponent`/`inkKouComponent`…）；
  `kind-form-fields.tsx`→`component-form-fields.tsx`（`KindFormFields`→`ComponentFormFields`）；
  14 个测试文件同步。全仓已不再有 `Kind` 字样指代这套注册表概念。
- **拍平双层 `component`**：`inkKou`/`battleParry`/`inkYingMo`/`battleSkillBar` 从"顶层 `qte`/`choice` +
  `inputs.component` 皮肤覆盖"提升为**独立顶层 `component` id**——manifest 补 `family: 'qte' | 'choice'`
  元数据，`graphMaterialOps.ts` 的分类/识别逐一改查 `componentFamily()`（`isQteComponent`/`isChoiceComponent`），
  不再维护 `QTE_COMPONENT_IDS`/`CHOICE_COMPONENT_IDS` 硬编码集合。`effectiveComponent()`/`paramComponent`
  这类"内层优先"读取逻辑与 `OverlayChildStyleEditor` 的皮肤切换下拉一并删除：**创建时一次性选定是哪个
  组件，创建后没有"换皮肤/换类型"的编辑入口**。引擎侧 `inputs.component` 镜像回填（`expand-overlay.ts`
  `toInstanceChild` / `engine.ts` `runElement`/`doSpawn`）与 `rendererRegistry.tsx` 对应的双层回退读取
  同步清除——`OverlayChild.component` 现在是唯一真源，`inputs` 里不会再出现 `component` 键。
- **数据迁移 + 顺带修复时间轴 bug**：`nodia.graph.json` 21 个节点专属挂载 `ov-<nodeId>` 改名
  `node:<nodeId>`（`materialKindForChild` 靠 `mount.overlay.startsWith('node:')` 判断"是否方案来源"，
  旧命名一直被误判成方案来源，時間軸拖拽只写 `window`/`trigger`，`InkKouLayer` 却只读 `inputs.cues`，
  两者从未对上）；8 处双层 `component` 实例（1 个 inkKou + 6 个 inkYingMo + 1 个 battleParry）拍平为
  单层，并补上缺失的 `inputs.cues`（`InkKouLayer`/`BattleParryLayer` 都以 `cues[]` 驱动时间轴/预览，
  没有 cues 时它们要么退化成与时间轴脱节的固定单帧、要么在时间轴上完全不可见）。
  `materialKindForChild` 同步改用 `isQteComponent`/`isChoiceComponent`（而非字面 `=== 'qte'`），因为
  「新建默认样式」现在直接落盘 `inkKou`/`battleParry` 等顶层皮肤 id，字面判断会漏判。
