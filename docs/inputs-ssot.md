# 组件契约收敛：inputs 作唯一真源 + 组件自吐事件

> 状态：🟢 SPEC（已落地）· 2026-07-17 · 修订 2026-07-21
> 目标：把「组件声明 / 配置 / 运行时」全部对齐到一个模型——**组件 = `inputs`（输入）+ `events`（吐出的事件）**。
> 不考虑向后兼容，直接按目标态走（本仓 demo/存档随之迁移）。
>
> **2026-07-21 并轨收尾**：已删 `ComponentDef.role` / `surface`；交互不再走 `openInteraction`/`submitInteraction`；
> 全部组件统一 `renderOverlay` + 皮肤 `emit` → `emitComponentEvent`；超时由皮肤自 emit `defaultEvent`。

## 1. 心智模型（目标态）

一个 overlay 里放若干**组件实例**；运行引擎解析 overlay、把组件按其 `inputs` 发到视频上；
组件在浏览器里自己渲染、自己判定（计时/计数/命中），**跑完直接 `emit` 一个已声明的 `event`**；
引擎只负责「收到组件的 event → 按 `reactions`/边路由（含 advance 换节点）」。

- **没有阻塞式交互判定机制**：判定型交互（QTE/防反/连打/限时）与「点击发事件」同构——都走同一条
  非阻塞事件通道（`emitComponentEvent`）。
- **节点的"等待"是声明式副产物**：节点若没有无条件自动出边、走向全靠 `event → advance`，自然停在那等组件 emit。

## 2. 组件定义 = ComponentManifest + 运行时渲染

组件是**导出一个 ComponentDef / Manifest**（作者契约）+ 一个 Overlay 渲染实现（Player 侧）。

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
  id: string                         // 注册键 = OverlayChild.component
  label?: string
  inputs: ComponentInput[]           // 唯一输入声明（SSOT）
  events: ComponentEvent[]           // 组件吐出的事件；出口 handle = events（不再有 outputs()）
  // 无 role / surface：调度与渲染一律 renderOverlay + emit
}
```

> 代码侧类型名是 `ComponentDef`（`component-registry.ts`）；上表用 Manifest 描述作者契约形状。

### 被删除 / 收敛的东西

| 旧物 | 处置 |
|---|---|
| `ComponentDef.role` / `surface` | **删**。不再区分 presentation/interaction/hud 调度标签 |
| `openInteraction` / `submitInteraction` / `snapshot.interaction` / `awaitInteraction` | **删**。统一 `renderOverlay` + `emitComponentEvent` |
| `InteractionProps` / `submit` / 独立 interaction 渲染表 | **删**。皮肤统一 `OverlayProps`（`overlay` / `emit` / `ctx`） |
| `form` / `FormField` / `deriveInputsFromForm` | **删**。编辑器改按 `inputs` 的 `valueType`/`options`/`component` 出控件 |
| `defaults()` | **删**。新建实例初值 = 由 `inputs[].default` 组装 |
| `outputs(params)` | **删**。出口 handle 由 `events` 派生（choice/qte 的选项即 events） |
| `resolve()` / `continue` | **删**。判定搬进组件内部，自行 `emit` 最终 event |
| `present()` | **删**。组件自己渲染 |
| `render()`（floatText 的 expr 求值） | **删**。绘制时由 OverlayComponent + SkinCtx resolve（同 battleHpBar） |
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
2. **Registry**：`ComponentDef`（`label`/`inputs`/`events` + 可选钩子）+ `registerOverlayRenderer`；删 `form/deriveInputsFromForm`；出口 =「events → handles」；`defaults` 由 `inputs[].default` 组装。
3. **skins/components**：各组件同文件声明 `inputs`（复合项标 `component` 控件提示）；判定型把逻辑留在皮肤，到点/命中后 `emit`。
4. **编辑器**：`ComponentFormFields` 读 `manifest.inputs` 出控件；spawn/QTE 检视器对齐 `inputs`。
5. **值键 rename**：`params → inputs`（语义替换，避开 `URLSearchParams` 等无关词）。
6. **数据迁移**：`nodia.graph.json` + 界面方案的 `params → inputs`。
7. **测试/fixtures 全绿**。
8. **并轨（2026-07-21）**：删 `role`/`surface`；交互并进 overlay；`emitComponentEvent` 对齐旧 submit 的 reactions + 默认找边；超时皮肤自 emit。

## 4b. 实施状态（2026-07-17 → 2026-07-21）

- ✅ 阶段 1（schema：删 payload、default→unknown、加 component）
- ✅ 阶段 2/3（删 form/FormField/deriveInputsFromForm；全部组件声明 inputs）
- ✅ 阶段 4（ComponentFormFields 改 inputs 驱动）
- ✅ 阶段 5/6（值键 `params→inputs`；demo `nodia.graph.json` 数据迁移）
- ✅ **判定下沉**：删 `resolve`/`continue`/`ResolveResult`；皮肤自判定后 `emit(eventId)`；
  引擎 `emitComponentEvent` 跑 mount `reactions`，无显式 advance 时按 handle 找边；
  超时由皮肤 `useDefaultEventTimeout` → `emit(defaultEvent ?? 'fail')`（不再 Player `submit(undefined)`）。
- ✅ **manifest 化**：`ComponentDef` = 数据契约 + 可选 `validate?`；出口由 `handlesOf` 派生；新建初值由 `buildDefaults`。
- ✅ **删 `ComponentDef.render`**（2026-07-21）：floatText expr 改绘制时 `resolveFloatTextDisplay(ctx)`；引擎一律 `renderOverlay`。
- ✅ **删 `role` / `surface` / 独立 interaction 层**（2026-07-21）：全部 `registerOverlayRenderer`；
  demo 交互皮补 `STAGE_FILL_LAYOUT` + `timeoutMs`/`defaultEvent`。
- ✅ **inputs 面板**：挂载 children 按 manifest.inputs 编辑。

## 5. 取舍备注

- 判定权归**客户端**（组件内判定）：headless 引擎不再权威复算；自动演示/测试改成「直接 emit 事件」驱动（更简单）。对 chat 驱动的网页 demo 可接受；若将来要服务端权威/防作弊，再引入可选的引擎侧复算。

## 6. Kind 概念退役 + component 单层化（2026-07-19，已完成）

上面 §4b 的"实施状态"记录里仍称呼当时的类型/文件为 `KindPlugin`/`KindRegistry`/`KindFormFields`——
这是历史记录，如实反映当时的命名。本次改动把这套残留命名与「顶层 component + `inputs.component`
皮肤覆盖」双层结构一次性收尾：

- **机械改名**（36 文件，不改行为）：`kind-registry.ts`→`component-registry.ts`
  （`KindPlugin`→`ComponentDef`、`KindRegistry`→`ComponentRegistry`、`registerKind`→`registerComponent`、
  `getKind`/`getComponent` 合并为 `getComponent`……）；契约已下沉到 `skins/components/*`
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

## 7. 取色器 + `component: 'numberExpr'`（2026-07-20，已完成）

### 取色器

新增手写组件 `ColorPicker.tsx`（不引第三方依赖，交互布局参考 react-colorful / Element Plus）：
色相饱和度方形拖拽面 + 色相条 + 透明度条 + hex/rgba 文本框 + 预设色块，折叠态是显示当前色的
色块按钮。对外 `value`/`onChange` 仍是 `string | undefined`（`#rrggbb` 或 `rgba(r,g,b,a)`），
接入原有 `inp.component === 'color'` 分支（`ComponentFormFields`）与 `GraphTextStylePicker.tsx`
的字色/描边色两处，不改变任何落盘数据形状。

### `numberExpr`：把"允许表达式"收敛成 `ComponentInput.component` 标记

编辑器判断"这个输入允许表达式"，走的是同一套 `ComponentInput.component` 机制（跟
`color`/`entity`/`attr` 同源）：新增取值 `numberExpr`，语义 = 该字段存
`NumOrExpr`（`number | { expr: string; pick?: ValuePick }`，`graph-schema.ts`），渲染器换成
既有的 `ValueExprEditor`（经 `editors.tsx` 的 `ValueInput` 薄封装）。

**边界（务必遵守）**：运行时只在三处真正对 `{expr}` 求值——`GraphEffect.value`、
`NodeAction.spawn.inputs`（引擎 `resolveBind` 统一求值）、`floatText.expr`（组件 `render()`
钩子显式 `evalExpr`）。`OverlayChild.inputs` 里其余挂载态组件的 number 字段引擎不解 `{expr}`，
**不要**给这些字段打 `numberExpr` 标记——打了也不会生效，是假承诺。

落地范围：

- `floatText.expr`：从裸字符串迁移为常量/表达式两态（`inputs` 声明
  `component: 'numberExpr'`）。`GraphVideoView.tsx` 里原来手写的 `FloatValuePickEditor`
  特判 + 平行的 `inputs.valuePick` sidecar 字段**整体删除**——`pick` 现在内嵌在
  `NumOrExpr.pick` 里，`valuePick` 概念退役，改成通用 `ValueInput` 直接绑定 `expr`。
  **`FloatTextParams.expr` 的类型不写成 `NumOrExpr`**，而是本地窄类型
  `number | { expr: string }`（不含 `pick`，也不从 schema 导入 `NumOrExpr`）——runtime
  的 `FloatText.tsx` 只消费 `expr` 字段本身，`pick` 是纯编辑器 sidecar，与
  `apply-effects.ts::resolveValue` 处理 `GraphEffect.value`（同样在 schema 里声明成
  `NumOrExpr`，但消费端只本地声明 `number | { expr: string }`）的既有写法保持一致。
  编辑器侧（`ValueInput`/`graphMaterialOps.ts`/`previewResolve.ts`）仍按完整 `NumOrExpr`
  读写——两个方向的结构赋值都成立（多一个可选 `pick` field 不影响双向兼容），无需改动。
- `NodeAction.spawn.inputs`（`SpawnInputsEditor`）：字段若在模板 manifest 里标了
  `component: 'numberExpr'`，跳过常量/表达式/引用三态选择器，直接渲染 `ValueInput`
  （绑定 `pickers?.entities/variables`）。新增 `SpawnInputsEditor.pickers?: EditorPickerCtx`
  参数，经 `NodeInspector.tsx` → 直传、`SettlementEditor.tsx` → `SettlementSpawnEditor.tsx`
  两层补传 `entities`/`variables`。
- `ComponentFormFields`（`component-form-fields.tsx`）新增通用 `numberExpr` 分支，供以后新组件
  在 manifest 里打标记即可直接获得表达式下拉——当前没有强制消费者，是预留入口。
- `NumOrExpr` → 求值器认的字符串源码这步转换（`number`→`String`／`{expr}`→`.expr`）**不设跨模块共享
  helper**：三个真正求值的消费方（`FloatText.tsx` 的 `resolveFloatTextDisplay`、`graphMaterialOps.ts` 的
  `floatPreviewParams`、`previewResolve.ts` 的 `resolveFloatTextPreviewLabel`）各自在本地写一个不
  导出的小函数，与 `apply-effects.ts::resolveValue` 处理 `GraphEffect.value` 的既有写法一致——
  `runtime/engine/expr.ts` 只认字符串，不感知 `NumOrExpr` 这个「值形状」概念，也不引入
  schema 的类型依赖。同理，`FloatTextParams.expr` 也不声明成 `NumOrExpr`，
  而是本地最窄类型 `number | { expr: string }`（不含 `pick`，也不从 schema import `NumOrExpr`）。

## 8. 运算符符号化统一：`OpSymbolButtons` + Effect 层减/除靠取反/取倒数（2026-07-20，已完成）

**背景**：`ValueExprEditor.tsx` 选取公式模式下，每一项（term）的运算符原本用 `<select>` 出
`+/-/*//`，但首项（`terms[0]`）被硬限制只有 `+/-`（"首项没有左操作数，×÷ 无意义"）。同时
`GraphEffect.op`（`NumericEffectOp = 'add'|'mul'|'set'`）在 Effect 编辑器另开一个独立
`<select>`，文案是"增加/乘以/设为"，没有"减少"/"除以"（减靠填负值、除完全没有）。这是两套
不一致的运算符 UI。

**落地**：

- 新增共享展示组件 `OpSymbolButtons.tsx`（`editor/shell/`）：一行按钮，纯展示 + 回调，不
  绑定任何具体语义，Effect 层与 term 层各自传入自己的 option 列表复用同一份视觉/交互。
- **Term 层**：`patchTerm`/`normalizeTerms` 去掉"首项强制 +/-"的限制，四个符号对所有项一视
  同仁。首项的 ×÷ 语义定义为一元变换（`valueExprPick.ts::leadTerm`）：`+`/`×` = 原值，
  `-` = 取反（已有行为），`/` = 取倒数（`1/(...)`，新行为）——跟 Effect 层的减/除是同一套
  "取反/取倒数"心智，只是作用对象从"整条表达式"收窄到"首项自身"。
  `compileValuePick` 相应改为 `leadTerm(op, atomRef(...))` 而不是只特判 `-`。
- **Effect 层**：`NumericEffectOp` **不新增字面量**（仍只有 `add/mul/set`，schema 不动）。
  UI 换成 `EffectOpButtons`（现落户 `OpSymbolButtons.tsx`，避免 `editors.tsx` ↔
  `ValueExprEditor.tsx` 互相 import 成环）：５个符号按钮 `+ − × ÷ =`，其中 `+/×/=` 直接对应
  `add/mul/set`（真实持久化状态，选中态跟 `op` 联动），`−`/`÷` 是**一次性动作按钮**（点击时用
  `valueExprPick.ts` 新增的 `negateNumOrExpr`/`reciprocalNumOrExpr` 对当前 `value` 做一次
  取反/取倒数变换，然后落盘成 `op:'add'`/`op:'mul'`），点完按钮本身不留"选中"视觉（因为落盘
  状态只有 add/mul/set 三态，`−`和`+`、`÷`和`×`在数据层不可区分，靠变换后的数值本身体现符号）。
  Effect 编辑器**不再单独出"运算"字段**——`ValueInput`/`ValueExprEditor` 新增可选入参
  `effectOp?: { op, onOpChange }`，挂了就在组件顶部（跟"常量/选取公式"模式切换同一行）多渲染
  这排符号按钮；不挂（`floatText.expr`/`spawn.inputs` 等其余消费方）则完全不受影响。
- **已知局限**：`negateNumOrExpr`/`reciprocalNumOrExpr` 作用于 `{expr, pick}` 形态时会丢弃
  `pick`（改成 `{expr: "-(...)"}` / `{expr: "1/(...)"}`，无 `pick`）——因为取反/取倒数是包在
  整条表达式外层，原 `pick` 描述的是未包裹前的项，保留会在重开"选取公式"面板时显示跟实际
  落盘不一致的公式。丢弃后重开面板会看到一个空白起始项（不是数据丢失，只是选取器 UI 需要
  重新选一次；已求值的字符串本身不受影响）。这个粗糙边缘只出现在"对着一个刚用公式选取器选完
  的字段又点 Effect 层减/除按钮"这种叠加场景，判定为可接受。
