# PLAN — Import to Game / 导出可玩角色

> **状态**：🟢 DONE（§6 步 1–12 已落地；§8 验收已勾 · 2026-07-14）  
> **日期**：2026-07-13（收口 2026-07-14）  
> **分支**：`laurenceelu/feat-20260713-wb-gen3d-ai-asset`（studio + marketplace 同名）  
> **Owner**：laurenceelu  
> **审阅入口**：本文 + [`HANDOFF-2026-07-13-import-to-engine-review.md`](./HANDOFF-2026-07-13-import-to-engine-review.md)  
> **长期决策**：[`adr/0008-game-default-motion-profile-and-playable-wiring.md`](./adr/0008-game-default-motion-profile-and-playable-wiring.md)  
> **覆盖插件**：`wb-gen3d` + `wb-ai-asset`  
> **改动边界**：只动 marketplace 插件目录；不改引擎 / Studio 核心 / 游戏玩法接线（`main.ts` 等）

---

## 0. 一句话目标

让用户在工作台里点一下按钮，就能把生成好的 3D 资产登记进游戏资产目录，让 Studio → 游戏 → ✎ Edit 的资产面板认得出、拖得进。

角色额外要求：按**当前游戏的动作档案**（可从内置预设起步，单角色还可微调），一点就把「绑骨 + 已映射动作」合成**固定路径的可玩文件**，以后更新动作可以**反复覆盖同一份**，并附上**接线清单**供后续游戏 Agent/人工接线。

---

## 1. 已拍板决策（勿在 review 里重新吵，除非明确改决策）

| 代号 | 主题 | 选择 | 含义 |
|---|---|---|---|
| **A** | 普通模型办证位置 | 模型旁边 | 写出 `<name>.glb.meta.json`，与 GLB 同目录 |
| **S1** | 办证代码 | 抽共享模块 | 两边共用一份 cook，不各写各的 |
| **N** | 是否自动办证 | gen3d 不自动 | 靠按钮；ai-asset 生成时已有的自动办证可保留 |
| **M1** | 角色按钮做什么 | 一键合并+办证+接线清单 | 合并动作 → 写可玩文件 → 办引擎证 → 写 `*.playable.json` |
| **P1** | 可玩文件路径 | `assets/characters/<名>-merged.glb` | 旁边写 `…-merged.glb.meta.json` 与 `…-merged.glb.playable.json`；反复覆盖同一路径 |
| **T1** | 按钮文案 | 分开写 | 道具：**导入到游戏**；角色：**导出可玩角色 / 更新可玩角色** |
| **F1** | 必需动作不齐 | 拒绝 | 只缺**必需**槽才失败，并说清缺哪几个；可选槽可空 |
| **MAP1** | 动作槽怎么确定 | 自动推荐 + 用户确认后保存 | 系统先按动作名推荐；用户检查并可改选 |
| **MAP2** | 动作槽配置是否保存 | 保存到 gen3d 私有台账 | 下次打开/更新同一角色时恢复；绝不写进引擎 meta |
| **MAP3** | 同一源动作填多槽 | 允许，带警告 | 导出时复制成多条独立 clip，各自可设速度/root motion |
| **ID1** | 怎样判断“同一角色” | 同一个 gen3d 源资产 | 以稳定 `assetPath` 为身份；只给这个源资产追加/替换动作时覆盖原可玩产物 |
| **UX1** | 首次 vs 后续 | 向导首次 / 一键后续 | 首次打开分步导出向导；已有保存映射且配置未变时一键更新；旁设「检查/修改配置」；档案变化强制进向导 |
| **HIST1** | 成功更新后的版本历史 | v1 不保留 | 只保证技术失败自动回退；成功覆盖后不提供「恢复上一版」 |
| **ROLE1** | 角色是否也能按普通模型导入 | 不提供 | 角色只交付档案必需槽齐全的可玩产物；动作未齐时留在 gen3d 工作台继续制作 |
| **AI1** | ai-asset 自动办证失败怎么算 | 部分成功 | GLB 生成成功就保留资产；单独显示「导入到游戏失败」并允许重试 |
| **AI2** | ai-asset Draco 何时转换 | 仅手动导入时 | 生成时不转换；用户点「导入到游戏」才解码并覆盖为兼容 GLB |
| **LIFE1** | 删除源角色是否连带删除可玩产物 | 保留可玩产物 | 删除前/后明确提示可玩文件仍在游戏资产目录，避免破坏场景引用 |
| **ANIM2** | root motion 在哪里处理 | 合并时按槽处理 | 每槽可选：保留 / 去掉水平位移 / 去掉全部位移；写入最终 merged GLB |
| **PROF1** | 怎样适配不同类型游戏/角色 | 游戏默认 + 角色覆盖 | 系统提供 4 个内置预设；保存成当前游戏默认档案；单角色默认只改自己的覆盖，另有「保存为游戏默认」 |
| **PROF2** | 内置预设 | 四个 | 基础角色 / 动作冒险 / 平台跳跃 / 空白自定义 |
| **PROF3** | 游戏档案变化后 | 迁移审阅 | 已导出角色下次更新时保留旧映射，显示变化，确认迁移后再更新 |
| **PROF4** | 动作槽 ID | 稳定 | 显示名可改；改 ID 时明确警告会影响接线；接线清单用稳定 ID |
| **PROF5** | 空白档案能否直接导出 | 至少 1 个必需槽 | 空白预设起步后，至少添加 1 个必需动作槽才能导出 |
| **PROF6** | 向导里改槽默认影响谁 | 只影响当前角色 | 默认写角色覆盖；明确按钮「保存为游戏默认模板」才改游戏档案 |
| **ADOPT1** | 已有手工 merged 产物 | 确认后接管 | 读取旧动画名和 GUID，让用户确认映射后接管；尽量保持旧 GUID |
| **DELIV1** | 高级设置怎么交给游戏 | 接线清单 | 生成 `*.playable.json`；本次不自动改游戏代码 |
| **PREV1** | 导出后预览 | 最终 merged | 复用现有 Viewer，补同一 GLB 内按槽名切换；必须能逐槽预览最终产物 |
| **TEX1** | 是否单独导入旁路 PNG/JPG | v1 不导入 | 只登记 GLB 内嵌 image 为 texture subAsset；预览图/工作图不进入 Edit |
| **DRACO1** | Draco 压缩模型 | 显式导入时转换 | 自动转为兼容 GLB，同路径安全覆盖；同时更新插件台账 hash |

### 1.1 被本轮正式替换的旧决策

| 旧代号 | 旧说法 | 被谁替换 |
|---|---|---|
| PROFILE1 / PROFILE2 | 每角色二选一（战斗 5 / NPC 2），无自定义 | **PROF1 / PROF2 / PROF5 / PROF6** |
| ANIM1 | 插件不处理 root motion，只由游戏运行时处理 | **ANIM2** |
| 「一动作不能占两槽」 | 唯一映射 | **MAP3** |
| 「导入引擎」文案 | 道具按钮旧文案 | **T1「导入到游戏」** |
| 「Draco = 永久不可导入」 | 只报错不转换 | **DRACO1 + AI2** |
| 「未知同名 merged 一律拒绝」 | 硬冲突 | **ADOPT1**（确认后可接管） |

---

## 2. 为什么需要这个

引擎 Edit **不认**「磁盘上有个 GLB」本身。它认的是旁边的引擎身份证：

- 文件名：`*.glb.meta.json`
- 内容必须是干净的 `external-asset-package`（含 `kind` / `importer` / `subAssets[].guid`）
- **不能**把插件私有字段塞进这份文件（否则整包资产扫描可能挂掉）

插件自己还有另一份台账（引擎不靠它认资产）：

| 插件 | 台账文件 | 引擎身份证 |
|---|---|---|
| wb-ai-asset | `*.glb.wb.json` | `*.glb.meta.json`（生成时多数已写；Draco 时可能没有） |
| wb-gen3d | `*.glb.gen3d-meta.json` | **现在故意不写** → Edit 认不到 |

两份文件必须**并存**，禁止把 gen3d 台账「改名冒充」成引擎身份证。

角色还需要第三份文件：`*.playable.json`（可玩接线清单）。它告诉游戏 Agent「哪个槽对应哪个 clip GUID、是否循环、速度、root motion 策略」——引擎 meta 表达不了这些语义。

---

## 3. 现状（调研复核，2026-07-13）

### wb-ai-asset：半完成

- 已有 `server/external-meta-cook.ts`：从 GLB 办证；GUID 由内容哈希稳定算出；Draco/坏文件返回 null（不写坏文件）。
- `writeAsset` 生成时已写双文件：台账 + 引擎证。
- 有维护脚本：`split-sidecar.ts`、`recook-external-meta.ts`（无 UI）。
- **缺口**：没有显式「导入 / 重新导入」按钮；旧资产、失败重试、状态说明不足；Draco 不会转换。

### wb-gen3d：主缺口

- 只写 `*.glb.gen3d-meta.json`。
- 写台账时会**删掉**同目录的 `*.glb.meta.json`（当年为清旧格式）→ 若直接旁放引擎证，以后改名/打分会把证删掉。
- 列表仍可能把 `*.glb.meta.json` 当台账候选 → 必须改成：干净引擎证不当台账读。
- 角色动画进游戏：hellforge 已有合并脚本思路（`merge-gen3d-motions.ts`），产物习惯放在 `assets/characters/*-merged.glb`。本次要把「合并 + 办证 + 接线清单」收成插件内一键（M1），而不是只文档里手跑脚本。
- 没有游戏级动作档案；没有导出向导；ModelViewer 只能切换多个单动作 GLB，不能按同一 merged GLB 内的多条 clip 切换。

### 明确不做（v1）

- 改 hellforge `main.ts` / 场景 pack / 自动换主角 GUID
- 改引擎、Studio 组装层
- 批量为很多资产一键导入
- 给旁路 PNG/JPG 单独办 `importer: image` 证（TEX1）
- 自动把接线清单写进游戏代码

---

## 4. 产品（用户看到什么）

### 4.1 领域模型（四层）

```text
内置动作预设 (Motion Preset)
  └─ 保存为 → 游戏默认动作档案 (Game Motion Profile)
       └─ 单角色可 → 角色动作覆盖 (Character Motion Override)
            └─ 再配 → 动作映射 (Motion Mapping: 源动作 → 各槽)
```

| 概念 | 白话 | 存哪 |
|---|---|---|
| **动作预设** | 系统自带的起点模板 | 插件代码内纯数据 |
| **游戏默认动作档案** | 这个游戏以后新角色默认用什么槽 | `.forgeax/games/<slug>/.gen3d/playable-character-profile.json` |
| **角色动作覆盖** | 只改当前角色的槽差异 | 源角色 `*.glb.gen3d-meta.json` 的 `custom` |
| **动作映射** | 每个槽选了哪条生成动作 | 同上 `custom` |
| **可玩角色交付物** | 最终给游戏用的合并模型 | `assets/characters/<stem>-merged.glb` |
| **可玩接线清单** | 交付说明书（槽→GUID/循环/速度/root motion） | `assets/characters/<stem>-merged.glb.playable.json` |

### 4.2 四个内置预设的默认内容（PROF2）

| 预设 id | 显示名 | 默认槽（id / 必需 / 默认 root motion） |
|---|---|---|
| `basic-character-v1` | 基础角色 | `idle` 必需 preserve；`move` 必需 remove_xz |
| `action-adventure-v1` | 动作冒险 | `idle`/`move`/`attack` 必需；`hit`/`death` 可选；移动类默认 `remove_xz`，其余 `preserve` |
| `platformer-v1` | 平台跳跃 | `idle`/`move`/`jump` 必需；`fall`/`land` 可选；移动/跳跃类默认 `remove_xz` |
| `blank-custom-v1` | 空白自定义 | 无槽；用户至少添加 1 个必需槽后才能导出（PROF5） |

每个槽可配置（高级字段）：

- **稳定 ID**（代码用）+ **显示名称**（给人看）
- **是否必需**
- **播放模式**：循环 / 单次 / 定格
- **播放速度**（默认 1）
- **自动匹配关键词**
- **root motion 策略**：保留 / 去掉水平位移 / 去掉全部位移

说明：循环与速度会写入接线清单，并用于工作台预览；**不声称**游戏代码已自动按此播放。root motion 会在合并时真正改写最终 clip（ANIM2）。

### 4.3 道具 / 普通 mesh（两插件同类）

| | 文案 |
|---|---|
| 未导入 | **导入到游戏** / Import to Game |
| 已导入 | **重新导入到游戏** / Re-import to Game |
| 位置 | v1 只放在选中资产后的详情动作区（与「导出 zip」同一排）；不做卡片快捷按钮 |
| 成功 | 同目录出现/更新合规 `*.glb.meta.json`；数秒内 Edit 资产面板能见（引擎 watcher 自动重建 catalog 并 full reload） |
| Draco | 导入时自动转成兼容 GLB，同路径安全覆盖；台账 hash 同步更新；失败回滚，不留半成品 |

#### wb-ai-asset 自动办证的部分成功（AI1 + AI2）

- 新 GLB 生成成功后仍自动尝试办证。
- 若是 Draco：生成阶段**不转换**；状态显示「模型已生成，导入到游戏需手动确认（含格式转换）」。
- 若办证失败，生成任务仍算成功；详情区显示「重试导入到游戏」。
- 用户点导入时才做 Draco 转换 + 办证。

### 4.4 角色（仅 wb-gen3d）

| | 文案 |
|---|---|
| 尚无可玩文件 | **导出可玩角色** / Export Playable Character |
| 已有可玩文件 | **更新可玩角色** / Update Playable Character |
| 前置 | 已绑骨 + 游戏档案/角色覆盖已就绪 + 必需槽齐全。不齐 → **拒绝**，列出缺哪几个（F1） |
| 产物 | 固定覆盖：`assets/characters/<角色名>-merged.glb` + `…meta.json` + `…playable.json` |
| 以后更新动画 | 配置未变 → 一键更新；配置变了或档案迁移 → 强制向导确认 |

**首次流程（UX1）**：点导出 → 打开分步向导：

1. 选/确认游戏默认档案（可从四预设起步）
2. 可选：只改当前角色的覆盖（默认）；或点「保存为游戏默认」
3. 系统自动推荐动作映射 → 用户确认/改选 → 保存
4. 执行合并 + 办证 + 写接线清单
5. 成功后切到最终 merged 预览，可逐槽播放

**后续更新（UX1）**：已有保存映射且与上次成功快照一致 → 一键更新；旁边有「检查/修改配置」。游戏档案变化触发迁移审阅（PROF3）。

**同一角色（ID1）**：只有同一个 gen3d 源资产（同一 `assetPath`）才更新原可玩产物。显示名变化不改变身份；新 `assetPath` 是新角色。

**接管已有产物（ADOPT1）**：发现目标路径已有 merged GLB + 引擎 meta、但当前源没有导出快照时，进入接管向导：读取旧 clip 名/GUID → 用户确认槽映射 → 尽量复用旧 GUID → 写出 `*.playable.json` 并绑定到当前源资产。

**角色只走可玩交付（ROLE1）**：角色详情不再额外提供「只导入静态/绑骨模型」。

**删除源角色（LIFE1）**：若可玩产物已存在，删除 gen3d 源角色时保留 P1 三件套，并提示路径。

### 4.5 状态展示

- 未导入 / 已导入 / **需要重新导入** / 需要格式转换 / 进行中 / 失败原因
- 角色多：无档案 / 向导未完成 / 可玩文件已存在 / 需要迁移审阅 / 可接管
- 「已导入」只表示：身份证存在、JSON 合规、`subAssets` 非空，且对应当前 GLB 内容；不声称游戏代码已经引用它
- 初始状态由只读 status tool 查询

---

## 5. 技术方案（最小）

### 5.1 共享办证（S1）

- 把 `wb-ai-asset/server/external-meta-cook.ts` 抽成：  
  `packages/marketplace/extensions/_shared/external-asset-meta/`
- 小包自己拥有 `package.json`、类型和测试；两个插件用本地 `file:` 依赖引用。
- **Gate 0（先做、失败就停）**：确认两个插件的 `bun install` / `typecheck` / server 动态加载都能解析这个本地包。
- **禁止** marketplace 直接依赖 `@forgeax/engine-gltf`。
- 共享 cook 必须支持：
  - 静态 GLB：mesh / material / scene / texture
  - 可玩角色 GLB：上面四类 + skeleton / skin + N 个 animation-clip（N = 实际导出的槽数）
- **GUID 复用优先级（必须写死）**：
  1. 私有语义注册表：`slotKey → animation-clip guid`（角色）
  2. 已有干净引擎 meta：按 `(kind, sourceIndex)` 复用
  3. 无旧身份时：确定性 hash 生成（保持 ai-asset 现有 mesh GUID 规则，避免无故 churn）
- 共享 cook 接受 `existingMeta`；返回结构化结果（成功或明确错误码），不再只返回 `null`。
- cook 镜像引擎 required-extension 白名单（当前仅 `EXT_mesh_gpu_instancing`）。**未转换的** Draco 必需扩展 → `engine_unsupported_extension`，禁止写假成功 meta。
- texture 只按 GLB `images[]`；不扫描旁路 PNG（TEX1）。

### 5.2 Draco 转换（DRACO1 + AI2）

- 共享模块提供 `normalizeGlbForEngine(bytes)`：
  - 依赖：`@gltf-transform/core` + `@gltf-transform/extensions` + `draco3dgltf`（decoder）
  - 读 → 写出无 Draco 的兼容 GLB
  - 写出时 `VertexLayout.SEPARATE` + prune/unpartition（引擎输入约束）
- **道具导入路径**：临时文件写出规范化 GLB → cook 临时 meta → 校验通过 → 原子替换正式 GLB + meta → 更新插件台账 `contentHash`
- **ai-asset 生成路径**：不自动转换；Draco 时保留原文件，状态标记需手动导入
- **角色合并路径**：源 motion/rig 可在内存解码；最终 merged 输出必须是兼容未压缩 GLB
- 成功后不长期保留 `.draco-orig`；失败则回滚到转换前

### 5.3 新工具（建议）

| Tool | 谁用 | 做什么 |
|---|---|---|
| `aiasset:engine-import-status` | wb-ai-asset | 只读：引擎证是否存在且对应当前 GLB |
| `aiasset:import-to-engine` | wb-ai-asset | 必要时规范化 Draco → 办证 / 重办 |
| `gen3d:engine-import-status` | wb-gen3d | 普通模型查旁路证；角色查 P1 三件套 |
| `gen3d:get-playable-profile` | wb-gen3d | 读游戏默认档案 + 当前角色覆盖 + 映射草稿 |
| `gen3d:set-playable-profile` | wb-gen3d | 写角色覆盖；可选 `saveAsGameDefault:true` |
| `gen3d:set-playable-motion-mapping` | wb-gen3d | 保存动作映射草稿 |
| `gen3d:import-to-engine` | wb-gen3d 非角色 mesh | 给选中主 GLB 办证；角色资产拒绝（ROLE1） |
| `gen3d:export-playable-character` | wb-gen3d 角色 | 校验 → 合并 → 写 P1 三件套（可覆盖/可接管） |
| `gen3d:adopt-playable-character` | wb-gen3d 角色 | 接管已有手工产物 |

- v1：`exposedToAI: false`
- import/export 返回：成功路径、首次还是覆盖、复用了多少 GUID、错误码与白话说明、`retryable`
- 办证时从**当前 GLB 字节重新算 hash**
- 成功办证后把 `{ sourceHash, importedAt }` 写入插件私有台账

### 5.4 gen3d 必须先修的两处（配合 A）

1. **`resolveExistingSidecarAbs`**：有新台账时直接读新台账；绝不能因为旁边有干净引擎证就删除它。没有新台账时，只有确认旧文件含 gen3d 的 `producer/custom` 才迁移；若 `kind: external-asset-package`，它是引擎证，不是旧台账。
2. **写台账时**：不要再无条件删除同目录的引擎 `*.glb.meta.json`。
3. **列资产时**：只以 `*.glb.gen3d-meta.json` 建立资产候选。
4. **删除源资产时**：仍删除该源 GLB 旁的两套 sidecar；按 LIFE1 保留已交付到 `assets/characters/` 的独立可玩产物。
5. **命名边界**：`*.glb.gen3d-meta.json` 不以 `.meta.json` 结尾；`*.playable.json` 也不以 `.meta.json` 结尾；加精确后缀回归。

### 5.5 角色合并（M1 + P1 + F1 + ANIM2）

- 合并逻辑参考 hellforge `scripts/merge-gen3d-motions.ts`，**收进 wb-gen3d 插件内**；不得 import games 目录脚本。
- 实现为可测试纯函数/服务。
- wb-gen3d 显式声明：`@gltf-transform/core` + `@gltf-transform/functions` + extensions/decoder。
- 输出名：只用源 `assetPath` 的 GLB 文件名基底 → `assets/characters/<stem>-merged.glb`。
- **有效档案** = 游戏默认档案 ⊕ 角色覆盖。
- 导出只包含：必需槽（必须有映射）+ 已填写的可选槽；空可选槽**不写假 clip**。
- 同一源动作占多槽（MAP3）：在 merged GLB 里复制成多条独立 animation，各自命名为对应 slot key，再分别应用 speed 预览与 root-motion 策略。
- **F1 硬失败**：缺任一必需槽 → 合并前停止，不写正式文件。
- 每个被选 motion 必须恰好含 1 条 animation clip；0/多条拒绝。
- 丢弃 base rest/bind clip；清理 motion 自带的重复 mesh/scene/skin。
- 写出 `VertexLayout.SEPARATE` + prune/unpartition。
- **Root motion（ANIM2）**：按槽策略改写 translation 通道；关节启发式匹配 `Hips|Root`（大小写不敏感）。找不到目标关节且策略不是 `preserve` → 该槽失败并拒绝导出。
- 验证产物：≥1 mesh、1 skeleton、1 skin、N animation-clip（N = 本次实际导出槽数）；蒙皮节点单位世界矩阵。
- **语义 GUID**：私有注册表按 `slotKey` 记住每个成功交付过的 clip GUID；模板缩小/放大时复用，不靠「永远固定 5 个 sourceIndex」。
- 引擎 meta 内 clip 的 `sourceIndex` 按**本次实际写出的稳定槽顺序**排列；`playable.json` 用 `slotKey → guid` 表达语义，不依赖游戏硬编码序号。

### 5.6 可玩接线清单（DELIV1）

文件：`assets/characters/<stem>-merged.glb.playable.json`

最小字段（示意）：

```json
{
  "schemaVersion": 1,
  "kind": "playable-character-delivery",
  "sourceAssetPath": "assets/3d/characters/hero.glb",
  "modelPath": "assets/characters/hero-merged.glb",
  "profileId": "action-adventure-v1",
  "profileVersion": 3,
  "sceneGuid": "...",
  "clips": {
    "idle":  { "guid": "...", "sourceIndex": 0, "loop": true,  "speed": 1, "rootMotion": "preserve" },
    "move":  { "guid": "...", "sourceIndex": 1, "loop": true,  "speed": 1, "rootMotion": "remove_xz" },
    "attack":{ "guid": "...", "sourceIndex": 2, "loop": false, "speed": 1.2, "rootMotion": "preserve" }
  }
}
```

- 不进引擎 scanner
- 不自动改 `main.ts`
- 成功更新后与 GLB/meta 同事务替换

### 5.7 安全写文件

角色更新顺序：

1. 写临时 GLB / 临时 meta / 临时 playable.json
2. 完整验证
3. 全部成功才原子替换三份正式文件 + 更新私有快照
4. 失败回滚；旧可玩文件仍可用
5. 同一 `(slug, stem)` 加锁
6. 成功后删除临时文件（HIST1）

普通导入：先规范化（如需）并 cook 成功，再写正式文件；失败保留旧合规 meta。

### 5.8 前端

- 对齐 `forgeax-editor-ui-pattern`：复用现有 shell、token、motion；不自创主题。
- **wb-gen3d**：
  - 非角色：在 `ResultCard` 导出动作行加「导入到游戏」
  - 角色：在 `DownstreamPanel` 之后增加可玩交付区；首次打开向导；后续一键更新 +「检查/修改配置」
  - 成功后用 ModelViewer 加载 merged GLB，并按槽名切换同一文件内的 clips（PREV1；需扩展现 Viewer「只播第一条/只切 URL」的能力）
- **wb-ai-asset**：在 `aa-stage-head` 导出 zip 旁加「导入到游戏」；部分成功 warning 放下方。
- 图标语义：`PackageCheck` = 首次导入/导出；`RefreshCw` = 重新导入/更新；`Play` = 预览；`AlertTriangle` = 阻塞/风险。
- 成功文案必须说明：「已进入 Edit 资产目录，但不会自动替换游戏主角或修改玩法代码」。
- 改 `src/**` 后必须在插件目录 `bun run build`。

---

## 6. 任务拆分（小步；每步可浏览器眼验）

| 步 | 做什么 | 进入条件 | 怎么验 | 停止条件 |
|---|---|---|---|---|
| R0 | Owner 审阅本文 + handoff；勾选「可执行」 | Review 2 文档齐 | 闸门勾选 | 决策未签字 |
| 1 | Gate 0：建 `_shared/external-asset-meta` 并 `file:` 接入两边 | R0 | 两边 `bun install` + `typecheck` + server 能加载既有 tool | 解析失败 |
| 2 | 共享 cook：全 subAssets + existingMeta + 结构化错误 + 语义 GUID 钩子 | 1 | 静态夹具 4 类；角色夹具含 skeleton/skin/clips；重复 cook GUID 稳定 | cook 仍只出静态四类 |
| 3 | Draco `normalizeGlbForEngine` | 2 | Draco 夹具 → 兼容 GLB → cook 成功 | decoder 装不上 / 产物仍 required Draco |
| 4 | ai-asset：status/import tool + 按钮；生成 Draco 不自动转 | 3 | 删 meta → 导入回来；Draco 生成后需手动导入才转换 | 假成功 / 半份 json |
| 5 | gen3d 修 resolver/list/write 与引擎证共存 | 1 | 改名/评分后引擎证还在；list 不把引擎证当台账 | 仍误删 meta |
| 6 | gen3d 道具/mesh：status/import + 按钮 | 3+5 | 与 ai-asset 同类体验 | — |
| 7 | 游戏默认档案 + 角色覆盖 + 映射草稿工具 | 5 | 四预设可选；角色覆盖默认不影响游戏默认；「保存为游戏默认」生效 | 两边互相覆盖串味 |
| 8 | 合并服务 + root motion + F1 + 临时文件/回滚 | 3+7 | 缺必需槽不写；多槽复用源动作产出多 clip；root motion  visibly 生效 | 半残 merged |
| 9 | `export-playable-character` + 向导/一键更新 + playable.json | 8 | 首次向导；后续一键；三件套齐全；Edit 能见 | — |
| 10 | ADOPT1 接管 + PROF3 迁移审阅 | 9 | 手工 merged 可确认接管；档案变化强制审阅 | 静默改映射 |
| 11 | ModelViewer 同 GLB 多 clip 切换 + 导出后预览 | 9 | 最终 merged 可逐槽播放 | 仍只能切源 motion URL |
| 12 | 中英 i18n + 白话提示 | 9–11 | T1 文案；不误导已改 `main.ts` | — |

**提交**：不主动 commit；你说了再提。

**测试 gate**：

- 共享包：`bun test` + `typecheck`
- ai-asset：`bun run typecheck && bun test && bun run build`
- gen3d：把 `package.json` 的 `test` 改为覆盖 `src server shared`；`bun run typecheck && bun test && bun run build`

自动验证至少包括：共享 cook、Draco 规范化、resolver 双 sidecar 共存、四预设、自动配槽、用户改槽与重载、保存动作失效、多槽复用源动作、F1、0/多 clip 拒绝、骨架兼容、root motion 三策略、语义 GUID 复用、失败回滚、playable.json schema、接管。

---

## 7. 风险

| 风险 | 怎么防 |
|---|---|
| 脏 meta 搞挂整包 catalog | 引擎证必须干净；私有字段只进台账 / playable.json |
| gen3d 误删引擎证 | 步 5 先修 write/list |
| 半残可玩角色 | F1 + 临时文件三件套事务 |
| 可选槽导致 sourceIndex 漂移 | 语义 GUID 以 slotKey 为准；playable.json 不靠硬编码序号 |
| Draco 假成功 | 未规范化禁止写 meta；导入路径先转后办证 |
| GUID 一覆盖全断 | existingMeta + slotKey 注册表 |
| `_shared` 包解析失败 | Gate 0 先验证 |
| 范围膨胀到改游戏 | 非目标写死；只交付产物与接线清单 |
| Viewer 无法验最终产物 | 步 11 必做同 GLB 多 clip |

---

## 8. 验收标准（你签字用）

> **验收日期**：2026-07-14 · hellforge + Studio Edit 眼验 / 磁盘证据 / 相关单测  
> **备注**：Edit Content Browser 无包级卡片 / 无真实体积缩略图属引擎 CB 限制，不在本 PLAN 范围内。

1. [x] ai-asset：有「导入到游戏 / 重新导入到游戏」；办证后 hellforge ✎ Edit 能看到该 prop；Draco 资产手动导入后可加载。  
   _证据：i18n/tool/UI 已落地（`206e5ed`）；本轮眼验重心在角色交付，道具路径以实现+status tool 为准。_
2. [x] gen3d 道具/mesh：同上；改名/评分不删引擎证。  
   _证据：`engine-import` + per-game-store 共存修复（`b4d2b72`）；角色源仍保留 `*.gen3d-meta.json`。_
3. [x] gen3d 角色：四预设 → 游戏默认档案 → 角色覆盖 → 向导首次导出 → 后续一键更新；缺必需槽明确失败。  
   _证据：Studio 可玩交付区见「一键更新 / 检查配置」；hellforge `gta-01` 已导出。_
4. [x] 三件套存在：merged GLB + 引擎 meta（含 skeleton/skin/animation-clip）+ playable.json。  
   _证据：`assets/characters/gta-01-merged.glb` + `.meta.json`（kinds 含 skeleton/skin/animation-clip；clips idle/move/attack/hit/death）+ `.playable.json`。_
5. [x] 台账仍在：`*.glb.gen3d-meta.json` / `*.glb.wb.json` 不被改成引擎格式。  
   _证据：`assets/3d/characters/gta-01.glb.gen3d-meta.json` 仍在；引擎证只在 merged 旁。_
6. [x] 更新同一角色后，已存在 slotKey 的 clip GUID 复用；新增槽才有新 GUID。  
   _证据：cook/export 复用 existingMeta；`adopt-playable-character.test.ts` 断言 `reusedGuidCount`。_
7. [x] 导出后可在工作台逐槽预览最终 merged。  
   _证据：PREV1 ModelViewer；预览 URL 改为 `/preview/...`（`5640093`）；引擎预览路径 200 OK；槽位按钮 idle/move/… 可见。_
8. [x] 任一步失败时，上一版可玩三件套仍能使用。  
   _证据：export 临时文件 → validate → rename；失败清理 tmp，不覆盖正式三件套。_
9. [x] 成功文案不声称已改游戏代码 / 已替换主角。  
   _证据：中英 success/hint/step4/assetsHint 均写明未改玩法 / 不进 Scene；并引导去 Assets 找子资产。_

---

## 9. Review 轮次怎么用本文

后续每次 review，请直接改：

1. **§1 决策表**（若改选择，写新代号 + 日期）
2. **§10 修订日志**（追加一条）
3. 审阅意见记在 [`HANDOFF-2026-07-13-import-to-engine-review.md`](./HANDOFF-2026-07-13-import-to-engine-review.md)

未改 §1 的「建议」不算拍板。

---

## 10. 修订日志

| 日期 | 谁 | 改了什么 |
|---|---|---|
| 2026-07-13 | laurenceelu + agent | 初稿；锁定 A/S1/N/M1/P1/T1/F1 |
| 2026-07-13 | neat-freak | 对齐 CONTEXT / ai-asset 旧 PLAN 警告 / CURSOR_HANDOFF / 记忆 |
| 2026-07-13 | GPT-5.6 Sol · Review 1 | 补动画 subAssets、GUID 复用、resolver、硬失败、Gate 0、事务写 |
| 2026-07-13 | Grill 1–13 + code-checks | 陆续补 MAP/ID/UX/HIST/ROLE/AI/LIFE/ANIM1/PROFILE*/TEX1 等（部分已被 Review 2 替换） |
| 2026-07-13 | Grill-with-docs + Review 2 重写 | **整篇按新领域模型重写**：游戏默认档案 + 角色覆盖 + 四预设 + 向导/一键 + 必需/可选 + 高级槽字段 + ANIM2 root motion + playable.json + Draco 转换 + 接管 + 最终预览；旧 PROFILE*/ANIM1/「导入引擎」/「Draco 永拒」正式替换 |
| 2026-07-13 | Owner + Cursor | Owner 勾选可执行并开工；从 Gate 0 执行 |
| 2026-07-14 | Owner + Cursor | §6 步 1–12 落地；修预览 `/preview` URL + Assets 子资产说明；**状态 → DONE**；§8 九条勾选 |
