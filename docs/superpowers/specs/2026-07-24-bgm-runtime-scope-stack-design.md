# wb-game-video · 跨节点 BGM 作用域栈

> 状态：🟢 SPEC（已定稿，待实现）  
> 日期：2026-07-24  
> 读者：实现本能力的开发 / AI agent  
> 范围：文档/节点级 BGM 配置；runtime 作用域栈；音频资产并入 `assets/manifest`；`stop` 与 `jump`/清局两种结束时机。  
> 不做：时间轴 BGM clip 作为床轨 SSOT；`BlueprintDoc.bgm` runtime 读取；独立 `type: 'bgm'` 节点；消费 `wb-bgm` 的 `audio/` 作为主路径；`until: [nodeId]` 式的下游 id 清单（子蓝图会因此不自洽、改名即失效）。  
> 相关：[`2026-07-22-game-package-storage-design.md`](./2026-07-22-game-package-storage-design.md)（资产 id→manifest→url）；[`node-runtime-spec.md`](../../node-runtime-spec.md)（callStack / descend）。

一句话：**配了就一直播，直到别处结束它。** BGM 是会话级栈；配置只认 `doc.bgm` + `node.data.bgm`；
结束只有两个来源——`mode: 'stop'`、`jump`/清局。**BGM 配置不得要求作者改蓝图结构。**

---

## 1. 背景与目标

### 1.1 产品语义

- 常规播默认床轨 BGM1。
- **任何**节点上配 BGM2 即起播，并**一直播下去**（跨多少节点都不停）；再配 BGM3 则压住 BGM2。
- 结束**只**由作者显式表达：某节点 `mode: 'stop'` → 回到上一层还没结束的那首（BGM2，再 stop 回 BGM1）。
  没有「出了那个子流程/子蓝图就自动结束」这回事（D8b 已撤，见 §10）。
- 战斗等多回合循环、内部子流程频繁压弹时，**不得**因「出子流程」误切回叙事曲，也不得每轮多叠一层。
- **配 BGM 不需要为此改蓝图结构**（不要求把一段节点包进容器）。

### 1.2 现状缺口

- Play 路径视频常 `muted`；无 BGM 会话、无 audio directive。
- 编辑器时间轴 `AudioItem` 仅展示、不落盘、不驱动 runtime。
- `MediaKind` 仅 `image | video`；`wb-bgm` 可落到 `audio/`，本扩展不消费。
- `callStack` 已存在（`subFlow` / `subFlowPack`），适合做容器作用域寿命信号，但 **≠** 每次 pop 都换 BGM。

### 1.3 成功标准

1. 文档可配默认床轨；任何节点可配 BGM；缺省字段旧图零行为变化。
2. 节点配了 `bgm` → 起播并跨节点持续；**离开该节点不结束**。
3. 结束两来源可用且只此两种：`mode: 'stop'`（回上一层未结束的）、`jump`/清局。
4. 多回合循环回同一节点：同 `ref` 续播、不重开（除非 `restart: true`），且**不重复叠层**。
5. 音频资产：`blueprint` / 节点只挂 id；`assets/manifest.json` 含 `kind: 'audio'`；壳层 resolve，引擎只传 id。
6. §6 两种写法（平铺 + 子蓝图）都能跑出 §6.3 的听感，且都不需要改图结构。

---

## 2. 已锁定决策

| # | 决策 | 说明 |
|---|---|---|
| D1 | 作用域栈，非全局绝对时间轴 | 床轨跟状态/作用域走，不跟整局绝对 ms |
| D2 | 配置 SSOT 仅两处 | `GameScenario.bgm?`（文档默认）+ `NodeData.bgm?`（作用域 owner） |
| D3 | 不读 `BlueprintDoc.bgm` | 避免子蓝图顶层与节点双源；包设置若做「推荐 BGM」仅编辑器模板，写入调用节点 |
| D4 | 子流程 = 子蓝图读法 | 均读 **caller 节点** `data.bgm`；在 `descend` 时 apply |
| D5 | **默认粘住**：配了就一直播 | 节点上配 `bgm` = 起播并**持续**，跨多少节点都不停；离开该节点**不**结束，弹 `callStack` 帧 / 局内清空 `callStack` 也不结束。结束只有两个来源：别处 `mode: 'stop'`、`jump`/清局 |
| D6 | 出口无知**不再是默认** | 想在 `win`/`lose` 结束战斗曲，就在那个节点上配 `mode: 'stop'`（显式、就近）。恢复目标由栈决定（回到上一层未结束的），作者不用知道上一首是什么 |
| D7 | 内层无 `bgm` = 继承 | 不配的节点一律不动 BGM 栈 |
| D8 | `mode: push \| replace \| stop` | 默认 `push`（记住被压住的那首）；`replace` 换曲不记住、不加深；`stop` 结束当前层、回到上一层未结束的 |
| D9 | 资产落盘 = A | 并进 `assets/manifest`，`MediaKind` 含 `audio`；与 video/image 同 resolve |
| D10 | 时间轴 | 床轨 **不是** MaterialTimeline clip SSOT；本能力不改时间轴数据模型 |
| D11 | 不要求容器 | BGM 配置**不得**反过来要求作者改蓝图结构。跨节点靠 D5 默认粘住即可；容器与普通节点走同一条规则，**不是**作用域 |
| D12 | 不新增 BGM 节点类型 | 可选属性，不是 `type: 'bgm'` |
| D13 | 文档床是地板 | `stop` 不弹 `__doc__` 层（返回 null、不发指令）；想静音起局就别配 `doc.bgm` |

---

## 3. Schema

### 3.1 文档默认床轨

挂在 `GameScenario` / `GraphLibraryDocument` 根（与 `variables` / `entities` 同级）：

```ts
export interface DocumentBgm {
  ref: string
  volume?: number       // 0..1，默认 1
  fadeInMs?: number
  fadeOutMs?: number    // 文档床**离场**时的淡出（默认 0 = 硬切）
  loop?: boolean        // 默认 true
}

// GameScenario 增量
bgm?: DocumentBgm
```

- 缺省：开局不播床轨（静音起局，直到首个带 `bgm` 的作用域）。
- **禁止**把默认床轨只写在入口节点 `n_open.data.bgm` 上充当「整局默认」：它确实会一直播（D5），
  但它是**作用域层**——`jump` 会把它退掉、清局会按 `scenario.bgm` 重 derive，之后整局就再没有床轨了。
  整局默认只有写在这里才是地板（`stop` 也弹不掉，D13）。
- `fadeOutMs` 不是可选装饰：淡出恒取自**离场那一帧**（`BgmStack.resume` / `apply`），而文档床的离场
  正是「叙事床 → 战斗床」这条最常听到的转场。缺了它，进战斗时正响的叙事床 0ms 掉到静音，再由战斗床
  按自己的 `fadeInMs` 淡入——中间是一段听得出来的空档，§6.1 的 demo 配置也写不出对淡。

### 3.2 节点作用域 BGM

```ts
export type AudioRef = string

export interface NodeBgm {
  /** `mode: 'stop'` 时可省（那一条不引入新曲子）；其余情况必填。 */
  ref?: AudioRef
  /**
   * - `push`（默认）：起播并**记住**当前正响的那首，一直播到有人结束它。
   * - `replace`：换曲但**不**记住上一首（栈深不变）——「这首之后不需要回去」。
   * - `stop`：结束当前这层，回到上一层还没结束的那首。文档床不弹（D13）。
   */
  mode?: 'push' | 'replace' | 'stop'
  volume?: number
  fadeInMs?: number
  fadeOutMs?: number
  /**
   * 同 ref 再次成为栈顶时是否从头播。
   * 默认 false = 续播（回合循环友好）。
   */
  restart?: boolean
}

// NodeData 增量（SubFlow* 自动继承）
bgm?: NodeBgm
```

### 3.3 校验

| 规则 | 级别 |
|---|---|
| `ref` 非空 string（`mode: 'stop'` 时可省，给了也忽略） | error |
| `mode: 'stop'` 之外缺 `ref` | error |
| `volume` ∈ [0, 1] | error |
| `fade*Ms` ≥ 0 | error |
| `mode` ∈ push \| replace \| stop | error |
| `restart` 是布尔（`normalizeFrame` 的 `?? false` 会把 `'false'` 当真） | error |
| `mode: 'stop'` 同时给 `ref`（那一条不引入曲子，给了也忽略） | warning |
| `ref` 可在 `assets/manifest` 解析为 audio | warning→日后 error |
| 一个环里有 ≥2 个各自起播（`push`）的节点、环内没有 `mode: 'stop'` | warning |

最后一条（`bgm.cycle.stacking`）是产品侧的补偿而非运行时策略：每转一圈栈都会多叠一层是 D8
「记住上一首」的必然结果（运行时**不得**替作者合并），但症状是「『结束当前音乐』没反应」，
不能只留给耳朵去查。`mode: 'stop'` 是**唯一**能让它闭嘴的东西——包内图的环也照报不误，因为
出包不结束任何一层。判据与已知盲区见 `validate.ts` 的 `checkBgmStackingCycle`。

### 3.4 刻意不进 schema

- 独立 BGM 节点 type  
- `until: [nodeId]` 式的下游 id 清单（见文首「不做」）  
- `BlueprintDoc.bgm`（runtime）  
- 时间轴持久化 audio clip  

---

## 4. Runtime 行为

### 4.1 BGM 栈（会话级）

与 `variables` 类似，**不**随 `playClip` / overlay 清理。

```ts
interface BgmStackFrame {
  // '__doc__' | `${blueprintId}::${nodeId}` —— **必须带蓝图前缀**：nodeId 只在单张蓝图内唯一
  // （engine 每次切图重建节点索引），可复用包里的 `combat` / `enter` 这类通名跟主图 caller 撞车
  // 是常态，共用 owner 会互弹对方的层（战斗床在包里就掉回叙事床，且再也回不来）。
  owner: string
  ref: string
  volume: number
  fadeInMs: number
  fadeOutMs: number
  restart: boolean
  /** 默认 true（床轨都是循环垫）；只有文档床能显式关掉，`NodeBgm` 无此字段 → 节点层恒 true。 */
  loop: boolean
}
```

栈的两个行为出口（对应 D8）：`apply`（push / replace）、`stop()`（结束当前层，回到下一层；
只剩 `__doc__` 时返回 null）。`clear()` 仍供 `jump` / 清局用。
**没有**按 `callStack` 深度自动结束的方法——帧深度与层寿命无关。

`apply` 的一条退化规则：**没有可换的栈顶时 `replace` 退化成 push**（栈空，或栈顶就是 `__doc__`
文档床）。文档床那条是硬要求——就地改写地板会把新曲子写成 `owner: '__doc__'` 的那一帧，于是
`stop()` 按 D13 弹不掉它：作者后面写的「结束当前音乐」全成静默 no-op，`unwindBgmToDocBed`
也再没有原床轨可退。空栈那条同理：静默丢弃会让「把 mode 从 push 改成 replace」表现成整段没声。

播放器（`HTMLAudioElement` 或等价）由 play 壳持有；引擎发指令（id + 栈操作），壳 `resolveAsset(ref)` 后播。引擎不进 URL。

### 4.2 钩子（对齐现有调度）

这些**不是**作者在配置里勾选的「触发类型」，而是 runtime 已有生命周期上的**固定检查点**：  
走到该点时，若相关对象上**有** `bgm` 配置则动栈；**没有配置则空操作**。

作者只写 `doc.bgm` / `node.data.bgm`。**离开节点不再是结束信号**（D5）——这是与初版最大的差别。

```text
onStart(doc):
  if doc.bgm → push(owner='__doc__', doc.bgm)

// owner(nodeId) = `${当前执行蓝图 id}::${nodeId}`（见 §4.1 的 owner 说明）
onDescend(caller):                    // runIntent descend 之后（已 pushCall、还没切图）
  if caller.data.bgm → applyNodeBgm(caller)

onEnter(node) when 非「刚 descend 的容器下钻」:
  if node.data.bgm && !isSubflowContainer(node) → applyNodeBgm(node)

applyNodeBgm(node):
  mode === 'stop' → stack.stop()                      // 结束当前层，回到上一层未结束的
  否则:
    owner = owner(node.id)
    // 防叠层守卫（**必须有**：多回合循环回到同一个配了 bgm 的节点是常态，见 §9 风险表）
    if stack.top()?.owner !== owner:
      stack.apply({ ...bgm, owner })                  // 别人的层在上面 / 栈空 → 正常压一层
    else if top.ref === bgm.ref && !bgm.restart:
      什么都不做                                       // 自己那层已在栈顶、曲子没变 → 一条指令都不发
    else:
      stack.apply({ ...bgm, owner, mode: 'replace' })
      // 作者显式 restart（每轮从头播），或这层的曲子被别人 replace 走了（该换回自己那首）：
      // 就地换栈顶，**绝不加深栈**。每轮压一层的话栈无界增长，之后一次 `stop` 只退回上一轮的
      // 同一首（作者听到的是「『结束当前音乐』没反应」）。
      // replace 保留本层的 owner：这一层仍归第一次开它的那个作用域，于是下一轮走进来时守卫认得出。

onLeaveNode(node):                    // 走边 / 弹帧 / 硬打断都经 runExit
  什么都不做                          // ← 初版在这里 pop，v2 去掉（D5）

onCallStackPop(frame):                // advanceAuto 现有 pop 路径，弹帧之后
  什么都不做                          // 帧深度与层寿命无关（D5 / D11）

onCallStackWipe():                    // 局内一次清空整个 callStack 的三条路径（见下表）
  什么都不做                          // 同上：清栈不是作者说的「结束」
```

守卫那三行由 `engine.bgm.test.ts` 的 §9-5 钉死（整局 directive 列表 + 每轮栈深恒为 2）。
把它当「未文档化的偏差」删掉会立刻退回「每轮 +1 层」的无界增长。

**`jump` / 局内清栈 / 会话结束**这几处的实际行为**各不相同**，不是一句「清栈停播」：

| 生命周期 | 床轨行为 | 落点 |
|---|---|---|
| 默认 `jump`（保留全局态，**作者跳转**） | 只退**作用域层**（容器 / 节点那些层），栈底文档床留着继续响；栈上只剩文档床时一条指令都不发。淡出取**正在响的那条**（第一次离场帧），不是退栈途中最深那层的 | `engine.ts` `jumpToNode` → `unwindBgmToDocBed(false)` |
| `jump` + `resetGlobals`（清局） | 清整栈并按 `scenario.bgm` **重新 derive** 文档床（从头起播），与 `resetGlobalsState` 同步 | `engine.ts` `jumpToNode` → `unwindBgmToDocBed(true)` |
| `callStack` 弹帧（容器正常弹回 caller） | **什么都不做**，一条指令都不发：帧深度与层寿命无关 | `engine.ts` `advanceAuto` 的 pop 分支 |
| **局内硬打断**（容器 handle 出边 / 显式 advance 走容器边 / 规则 watch advance） | `callStack` 被清空，**BGM 栈原样**：层是作者明写的「一直播」，继续响到某处 `mode: 'stop'` | `engine.ts`（三处 `this.state.callStack = []`，均不碰 BGM） |
| 会话结束（`phase === 'ended'`） | 引擎**不发任何指令**——停播归壳层生命周期（试玩面卸载 / 重开时收摊） | `BgmPlayer.tsx` 的 unmount cleanup |

「作者跳转 / 清局」与「局内硬打断」的分界是**谁说了要结束**：`jump` 是导航整体重置（作者从外面
按的），局内那三条只是剧情/规则把玩家弹出了容器——把作者明写的「一直播」在那里作废，等于 BGM
配置反过来要求作者别用容器（D11 的反目标），也与 D5 直接矛盾。

会话结束这条是刻意的：走到 `win` 时叙事床必须仍在响（§6.2 最后两行）。若引擎在 `ended` 上补一条停播，
那两行立刻变假、每次通关都会在结局画面上静音。

这几行行为由 `engine.bgm.test.ts` 的 `describe('jump / 清局（与现有 reset 语义对齐）')` 与
`describe('局内清 callStack：BGM 栈原样，层继续响')` 钉死。

`apply`：

- `mode === 'push'`（默认）：push 新帧；若 `!restart && top.ref === bgm.ref` 不重开解码（续播）。
- `mode === 'replace'`：替换栈顶（栈深不变），换曲 + fade；**这层的 owner 保持不变**。
  没有可换的栈顶时（栈空 / 栈顶是文档床）退化成 push，见 §4.1。

**禁止**：任意 `callStack.pop` / `callStack` 清空动 BGM——层不绑 `callStack`。

### 4.3 结束时机对照

| 层 | 起 | 止 |
|---|---|---|
| `__doc__` 文档床 | `start` | 会话结束 / 清局；`stop` 弹不掉它（D13），`replace` 也改不动它（§4.1） |
| 节点层（含容器节点那一句） | 进入该节点 / `descend` | **只有**别处 `mode: 'stop'`，或**作者跳转** `jump` / 清局。弹 `callStack` 帧、局内硬打断（清 `callStack` 那三条路径）都**不**结束它 |

### 4.4 与 returning 容器

弹回容器时引擎 `returningTo` 跳过再下钻并 `advance`。Returning 再 enter 容器 **不得**再次 apply
`data.bgm`（否则每轮战斗都会多叠一层）。

---

## 5. 资产落盘（决策 A）

对齐游戏包存储 SPEC（D8）：

```text
.forgeax/games/<slug>/
  assets/
    manifest.json          # 含 kind: "audio"
    media/<id>.<ext>       # mp3 / ogg / wav 等
  blueprint.json           # 只挂 ref
```

- 扩展 `MediaKind = 'image' | 'video' | 'audio'`（或等价 registry 类型）。
- Resolve 顺序与现有 media 一致：绝对 URL → registry → Kino/`/__gva__/media/:id` 等壳层逻辑；**新增 audio 分支**，引擎只传 id。
- **不以** `wb-bgm` 的 `audio/manifest.json` 为 SSOT；若产品仍用 wb-bgm 生产文件，导入/attach 时应写入 `assets/`，不在 play 路径双读。

---

## 6. 作者写法（两种，都**不**要求改图结构）

文档根都是：`bgm: { ref: "bgm-story", loop: true, fadeOutMs: 1200 }`

### 6.1 平铺图（主路径，D11）

```text
n_open → … → enter ⇄ a_my / b_ai ⇄ enter → win
                                        └→ lose
```

- 战斗入口 `enter.data.bgm = { ref: "bgm-battle", fadeInMs: 800, fadeOutMs: 600 }`
- 回合节点 `a_my` / `b_ai` / 技能节点：**都不配**
- `win.data.bgm = { mode: "stop" }`、`lose.data.bgm = { mode: "stop" }`
- 无需容器、无需列节点 id、`enter` 循环回来也不会重开（同 ref 续播）

### 6.2 有子蓝图时（包自洽 = 每条出口终端都写 `stop`）

战斗已经是一个 `subFlowPack` 时，包可以自己收摊、主图和 `win`/`lose` 什么都不用写 —— 但**自洽的
唯一手段是在包的每一个出口终端上写 `mode: 'stop'`**。出包（弹 `callStack` 帧）本身不结束任何一层。

- `bp-combat` 的 `enter.data.bgm = { ref: "bgm-battle", fadeInMs: 800, fadeOutMs: 600 }`
- `bp-combat` 的出口终端 `t_end.data.bgm = { mode: "stop" }` —— 包有几条出口终端就写几处；
  漏一处，那条路走出去时战斗床会留在栈上。

> [!WARNING]
> **从终端以外的路径离开这个包，包的音乐会漏给调用方继续播。** 容器 handle 出边、显式 `advance`
> 走容器的边、规则 watch advance（判胜/判负那类硬打断）都会把玩家弹出包却**不经过**任何终端，
> 于是那句 `stop` 压根没跑。这是撤销「随作用域自动结束」那条决策时**明确接受**的代价（§10 修订记录）：
> 想在硬打断后收掉它，就在硬打断的落点节点（`win` / `lose` 等）上也写一句 `mode: 'stop'`。
> 由 `engine.bgm.test.ts` 的 `describe('接受的后果：包没走 stop 出去 → 音乐漏给调用方')` 钉死。

### 6.3 验收听感（两种写法一致）

| 步骤 | BGM |
|---|---|
| 序章 | bgm-story |
| 进战斗 | bgm-battle |
| 回合/技能来回、循环回 `enter` | 仍 bgm-battle，**不重开、不多叠层** |
| 到 `win`（主图的 `stop`，或包内出口终端的 `stop`） | 回 bgm-story |
| `win` 演出中 | bgm-story 仍在响（引擎不在 `ended` 上停播） |

---

## 7. 编辑器（最小）

- 游戏设置：编辑 `doc.bgm`（选 audio 资产）。
- 节点检视器：可选 `data.bgm` —— 资产、`mode`（起播并记住 / 换曲不记住 / **结束当前音乐**）、
  fade、restart。**没有**作用域勾选。
  - `mode: 'stop'` 时资产输入应收起（那一条不引入新曲子）。
  - 提示文案必须讲清 **默认是一直播**，不能再说「离开本节点就恢复」，也不能引导「用容器包住」；
    还得明说**弹回外层的子流程/子蓝图同样不结束**（否则作者会自己脑补一条不存在的自动结束）。
- 时间轴：**不**新增床轨 clip 落盘，本能力不改时间轴模型。
- 校验：未解析 ref 的 warning。

---

## 8. 实现落点（指引，非本 SPEC 任务拆解）

| 区域 | 方向 |
|---|---|
| `graph-schema.ts` | `DocumentBgm` / `NodeBgm`；`GameScenario.bgm`；`NodeData.bgm` |
| `engine.ts` | descend / enter 钩子；**离开节点、弹帧、清 `callStack` 都不动栈**；BGM 栈态；directive 给壳 |
| Play 壳（`GamePlayer` / `GameStage`） | 音频元素；`resolveAsset`；unmute 策略与现视频 muted 解耦 |
| assets registry / manifest | `audio` kind |
| validate | §3.3 |
| 验收 | §6 两种写法各一条合成图用例（平铺 + 子蓝图出口终端 `stop`）；不改 nodia demo 图 |

Schema 变更须按仓库 AGENTS 征得同意后再改落盘形状（本 SPEC 即同意后的目标形态）。

---

## 9. 风险与测试要点

| 风险 | 缓解 |
|---|---|
| returning 再 enter 二次 push（每轮多叠一层） | returning 路径跳过 apply；单测断言整局 directive 序列，不只断言 ref |
| 循环里反复进入同一个配了 `bgm` 的节点 → 层数增长 | 同 ref 且已在栈顶时不重复压层；单测钉住多轮后的栈深 |
| 作者忘了写 `stop` | 曲子一直播（**这是设计**，D5）；编辑器文案说清，别做成静默失败 |
| 包被硬打断弹出 → 包的音乐漏给调用方 | **已接受**（§6.2 的 WARNING）；对策是在硬打断落点上也写 `mode: 'stop'` |
| **漏播的包被放在循环里 → 每转一圈叠一层，无上限** | **没有任何自动防线**：栈顶那条防重压守卫挡不住（再进包时栈顶是环里另一个 pusher 的层，owner 不同 → 照压）；`bgm.cycle.stacking` 也看不见（它只走单张图，包内的 pusher 在另一张图里，而主图那个容器节点自身没配 `bgm`，凑不满「环内 ≥2 个 pusher」）。只能靠 §6.2 的 WARNING：**包一定要在每个出口写 `stop`**。由 `engine.bgm.test.ts` 的「漏播在循环里会逐圈叠加」用例钉住这一事实 |
| `jump` 飞出作用域漏结束 | `unwindBgmToDocBed` 生命周期表单测 |
| 同 ref 循环重开刺耳 | 默认 `restart: false` |
| 与视频 muted 混淆 | BGM 独立通道，不依赖 video 音轨 |

最低单测：

1. doc 床 + 节点 push → **离开该节点后仍在响**（v2 的核心差别）  
2. `mode: 'stop'` → 回到上一层未结束的；只剩文档床时 `stop` 不发指令（D13）  
3. 包内起播 → 内层弹帧与出包都不发指令，音乐跟着出包继续响  
4. 包的出口终端写了 `stop` → 出包回叙事床；**没写就漏给调用方**（§6.2 的已接受后果）  
5. 多回合循环：整局 directive 序列长度不随轮数增长，栈深不增长  
6. `replace` 不加深栈、不记住上一首  
7. `restart: false` 续播  

---

## 10. 修订记录

| 日期 | 说明 |
|---|---|
| 2026-07-24 | 初稿定稿：作用域栈；SSOT 两处；资产 A；demo 战斗大容器 |
| 2026-07-24 | 去掉二期/duck/sting/`until`；澄清 §4.2 为 runtime 生命周期检查点 |
| 2026-07-27 | 实现后校准（与代码对齐）：§4.1 owner 加蓝图前缀（跨图同名 nodeId 会互弹）；§4.2 把「onJump / resetGlobals / session end 清栈停播」换成三行实际行为表；§3.1 `DocumentBgm` 补 `fadeOutMs` |
| 2026-07-27 | v2 全量评审后校准：§4.1 补 `BgmStackFrame.loop`、`replace` 在文档床上的退化规则、`endScopesDeeperThan` 的真实规则（过滤任意位置的过期帧，可能改栈却返回 `null`）；§4.2 pseudocode 补**防叠层守卫**（此前只在代码里，照 SPEC 重写会把它删掉）、三行表拆成「作者跳转 / 清局」vs「局内硬打断」（后者只结束 `endsWithScope` 层）、jump 淡出取正在响的那条；§3.1 入口节点那条改用 `graph-schema.ts` 的正确措辞；§3.3 补 `restart`/`endsWithScope` 类型、stop+`ref` warn、环内叠层 warn；§4.3 两处随之更新 |
| 2026-07-27 | **v2 语义改版（产品决策）**：默认从「节点寿命」改为**粘住**——配了就一直播，离开节点不结束（D5）。新增 `mode: 'stop'`（就近显式结束，回上一层未结束的）与 `endsWithScope`（可选自动结束，按 push 那一刻的 `callStack` 深度）。容器不再是隐式作用域、也不再是推荐路径（D11：BGM 配置不得要求改蓝图结构）。仍不做 `until: [nodeId]` 清单（子蓝图不自洽 + 改名即失效）。§6 改成平铺 / 子蓝图两种写法 |
| 2026-07-27 | **撤销 `endsWithScope`（产品决策）**：D8b 整条作废，字段、`BgmStackFrame.endsAtDepth`、`BgmStack.endScopesDeeperThan`、`engine.endBgmScopesOnCallStackWipe` 一并删除。**结束只剩两个来源**：`mode: 'stop'` 与 `jump`/清局；`callStack` 弹帧与局内清空 `callStack` 从此**一律不动 BGM 栈**（§4.2 生命周期表、§4.3）。<br/>**明确接受的两条代价**：①「让一个包自洽」得在包的**每条出口终端**上写 `mode: 'stop'`（§6.2 重写）；② 包被硬打断弹出（没走终端）时，包的音乐**漏给调用方**继续播——`engine.bgm.test.ts` 的「接受的后果」用例把它钉成决策而非意外。<br/>连带：§3.3 去掉 `endsWithScope` 的类型 error 与 stop 组合 warn；`bgm.cycle.stacking` 现在**只**认 `mode: 'stop'`，此前靠「可能是包内图，出包即止」保守放过的环从此照报（那种图确实收不住）；编辑器去掉「到本子流程/子蓝图结束为止」勾选，段首文案改为明说「弹回外层同样不结束」 |
