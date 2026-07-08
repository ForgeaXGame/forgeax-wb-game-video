# AGENTS.md — wb-game-video（视频游戏工坊）给 AI 看的入口

> 你（AI agent）被丢进 `packages/marketplace/plugins/wb-game-video/` 时，先读这份。
> 比 `README.md` / `SKILL.md` 浓缩，按你查信息的优先级排版。深入细节再翻那两份。
> 最后更新：2026-07-03。

---

## 它是什么

`@forgeax-plugin/wb-game-video` = **玩法优先的视频游戏编辑器 + 运行时**（fork 自
影游工坊 wb-reel）。作者把「玩法结构（Boss 战 / 血条 / QTE / 限时选择 / 画面热点）
+ 视频画面 + 分支」拼成一份可序列化的 `Scenario` JSON；运行时按 `elapsedMs`
**确定性回放**、按蓝图状态机推进。

- 与纯叙事 FMV（wb-reel）的分野：这里是**玩法驱动**（视频上叠血条/QTE/技能栏），
  wb-reel 是叙事驱动。两包 fork 同源、独立演化。
- **编辑期**（`mode='editor'`）拼装 Scenario，LLM 只做草稿生成；**运行期**
  （`mode='player'`）读同一份 Scenario 确定性回放。详见 `README.md`。

## 1 分钟跑起来

```bash
cd packages/marketplace/plugins/wb-game-video
npm run dev            # vite dev server，端口 15185（forgeax-plugin.json standalone.port）
# 沉浸式试玩表面：http://localhost:15185/?surface=player&scn=<scenarioId>&game=<slug>
npx vitest run         # 单测（vitest + happy-dom）
```

> [!CAUTION]
> **改数据前先杀掉在跑的 dev server。** 运行中的 server 有 3s 磁盘轮询 `saveDb`，
> 会把它内存里的旧 scenario 写回磁盘、**覆盖你刚改的 scenarios.json**。踩过这个坑
> （详见 `docs/superpowers/specs/2026-07-03-guishimen-fmv-design.md` 同类记录 /
> nodia 叙事 spec §9）。

## 心智模型：数据 → 编译 → 运行时

```
scenarios.json (Scenario)
  │  scene.kind: story|battle|qte|choice
  │  scene.media {kind: VIDEO|IMAGE_PROMPT|IMAGE_STATIC|PLACEHOLDER, ref}
  │  scene.decision {optType, fireAt, timeoutMs, ...}  scene.qte {cues,window,score}
  │  scene.branches[] {kind: auto|choice|qte_pass|qte_fail, condition, effects}
  │  scene.ext {qteUi, choiceUi}   scene.hudPreset
  │  variables{} entities{} blueprintGraphs{}(子流程)
  ▼  blueprint/scenarioToBlueprint.ts  —— Scene → Blueprint 节点（hud/qte/sceneKind 编译）
Blueprint graph（start 节点 = rootSceneId 那个 scene）
  ▼  blueprint/runtime/engine.ts  —— 状态机：start() 从 elementType==='start' 起跑
BlueprintPlayer.tsx（试玩运行时，App.tsx USE_BLUEPRINT_RUNTIME=true）
  └─ 按 scene.ext / hudPreset 分派 UI 层（见下）
```

## 关键目录（改 X 看哪里）

| 你要 | 看 |
|---|---|
| 运行时试玩（**当前活跃入口**） | `player/BlueprintPlayer.tsx`（`USE_BLUEPRINT_RUNTIME=true`；`player/Player.tsx` 是保留回退，别改错） |
| Scene→Blueprint 编译 | `blueprint/scenarioToBlueprint.ts`（`hudFor`/`compileQte`/`isRoot→'start'`） |
| 状态机引擎 | `blueprint/runtime/engine.ts`（`start`/`chooseOption`/`submitQteOutcome`/`resolveQteOutcome`） |
| 类型 / 枚举 SSOT | `scenario/gameplayTypes.ts`（SceneKind/HudPreset/DecisionOptType/DecisionFireAt/QteKind/QteUi/ChoiceUi）、`scenario/types.ts` |
| QTE 判定 | `qte/QTEEngine.ts`（judgeTap/judgeHold/tallyQTE） |
| 蓝图节点属性面板（作者配玩法） | `forge/BlueprintGameplayPanel.tsx`（qteUi/choiceUi/hud 下拉、optType/fireAt/timeout） |
| 条件 / 效果求值 | `player/conditionEval.ts`（isBranchAvailable/evaluateCondition/applyEffects） |
| 数据加载 / 持久化 | `scenario/scenarioPersistBoot.ts`（磁盘对账 epoch、refreshBuiltinDemoInDb） |

## UI 层分派（scene.ext / hudPreset 是开关）

`BlueprintPlayer` 用**守卫函数读 `scene.ext`** 挑 UI 层，全是并列 else-if，default 走通用：

| 场景意图 | QTE 层（`interaction.type==='qte'`） | 选项层（`choiceVisible`） | HUD |
|---|---|---|---|
| 战斗防反 | `ext.qteUi='battleParry'` → `BattleParryLayer`（`isBattleParryQte`） | — | `hudPreset='battle'` |
| 战斗技能栏 | — | `ext.choiceUi='battleSkillBar'` → `BattleSkillLayer`（`isBattleSkillChoice`） | battle |
| 叙事·叩 | `ext.qteUi='inkKou'` → `InkKouLayer`（`isInkKouQte`） | — | `hudPreset='narrative'` |
| 叙事·应默 | — | `ext.choiceUi='inkYingMo'` → `InkYingMoLayer`（`isInkYingMoChoice`） | narrative |
| 叙事四维飘字 | — | — | `hudPreset='narrative'` 时挂 `NarrativeStatsLayer`（读 scenario.variables 理智/佛性/业障/痴） |
| 通用 | 通用 QTE 按钮 | `ChoiceLayer` | main/hidden/explore |

> 加新 UI 变体：镜像 `BattleParryLayer`/`BattleSkillLayer` 写守卫 + 组件，在
> BlueprintPlayer additive 挂载（新 else-if，别动 default 分支），面板加下拉选项，
> 类型枚举补值。参考 nodia 叙事的 inkKou/inkYingMo/narrative 落地（3 处 additive）。

## 你 90% 会踩的坑

1. **`demo-001` 是保留 id。** `scenario/demoScenario.ts` 的 bundled 演示剧本硬编码
   id `demo-001`（`BUNDLED_DEMO_ID`）。任何游戏的 scenario **复用它** → boot 时
   `refreshBuiltinDemoInDb` 因 rootSceneId 不同触发 `fullReplace`，把你的剧本**整本
   顶替**成 28-scene 内置 demo，试玩恒显 demo。→ 每个真实游戏用自己的 id（如
   `nodia-main`），`manifest.meta.scenarioId` 必须与 `scenario.id` 一致（媒体
   hydrate 按它过滤）。有 `scenario/scenarioDemoIdMigration.ts` 专治历史串台。
2. **当前运行时是 `BlueprintPlayer.tsx`，不是 `Player.tsx`。** 挂载点、UI 分派都在
   前者；后者是 `USE_BLUEPRINT_RUNTIME=false` 的回退，改错地方白改。
3. **改 scenarios.json 前杀 dev server**（见上「1 分钟跑起来」的 CAUTION）。
4. **`scene.ext` 是 `Record<string,unknown>`**（开放对象）——新增 `qteUi`/`choiceUi`
   约定键不触发 schemaVersion bump。

## 深入文档

| 你要 | 看 |
|---|---|
| 包定位 / 编辑期vs运行期 / 媒体三态 / Scenario 结构 | `README.md` |
| AI 调用指南（蓝图/玩法/剧本/媒体/Seedance 任务） | `SKILL.md`（trigger `/gamevideo`） |
| 插件声明（surface / tool / port / permissions） | `forgeax-plugin.json` |
| nodia 叙事接入战斗的真实案例（叩/应默/四维 + 保留id坑） | `<repo>/docs/superpowers/specs/2026-07-03-nodia-narrative-intro-design.md` + `plans/2026-07-03-nodia-narrative-intro.md` |
