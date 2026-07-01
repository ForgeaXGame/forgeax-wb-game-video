import type { MediaRef, PerformanceCue, Scenario, Scene } from './types'

/** bundled demo 的固定 id —— 单一真源，供持久化层判定"这是内置 demo，不得抢占 activeId"。 */
export const BUNDLED_DEMO_ID = 'demo-001'
export const COMBAT_BLUEPRINT_DEMO_ID = BUNDLED_DEMO_ID

/**
 * 默认演示剧情 —— 新影游平台 standalone 原型的「战斗蓝图」。
 * 首屏 demo / 试玩预览必须与当前原型蓝图一一对齐。
 */
export function getDemoScenario(): Scenario {
  return getBlueprintCombatDemoScenario()
}

function placeholderMedia(): MediaRef {
  return { kind: 'PLACEHOLDER', meta: {} }
}

function bpScene(
  id: string,
  title: string,
  clipId: string | undefined,
  pos: { x: number; y: number },
  extra?: Partial<Scene>,
): Scene {
  return {
    id,
    title,
    media: placeholderMedia(),
    clipId: clipId ?? 'vd-wcc-idle',
    durationMs: extra?.durationMs ?? 3200,
    pos,
    dialogue: extra?.dialogue ?? [],
    branches: extra?.branches ?? [],
    hudPreset: extra?.hudPreset ?? 'battle',
    ...extra,
  }
}

function auto(id: string, targetSceneId: string, label?: string) {
  return { id, kind: 'auto' as const, targetSceneId, label }
}

function choice(id: string, targetSceneId: string, label: string) {
  return { id, kind: 'choice' as const, targetSceneId, label }
}

export function getBlueprintCombatDemoScenario(): Scenario {
  const scenes: Record<string, Scene> = {}
  const add = (s: Scene): void => {
    scenes[s.id] = s
  }

  // 顶层战斗蓝图：严格对齐 `新影游平台交互原型-standalone.html` 的 bp-combat。
  add(bpScene('enter', '进战待机', 'vd-wcc-idle', { x: 80, y: 220 }, {
    mediaPlayMode: 'loop',
    durationMs: 8000,
    background: '承接 L3 决战单挑调用（输入小怪·无常豺）：镜头切入战场，主将与小怪列阵对峙、亮明双方血量 / 技能，进入回合制战斗的待机 loop。',
    branches: [auto('enter-init', 'init', 'Out')],
  }))
  add(bpScene('init', '出手判断', 'vd-wcc-idle', { x: 300, y: 220 }, {
    durationMs: 600,
    background: '每回合开始，比较双方「出手速度」做隐藏计算判定本回合先攻方（速度大者先手，相等则空藏先手；无界面选项）。',
    branches: [
      auto('init-me', 'a_my', '我方先手'),
      auto('init-foe', 'b_ai', '敌方先手'),
    ],
  }))
  add(bpScene('a_my', '我方回合', 'vd-wcc-idle', { x: 520, y: 120 }, {
    subFlowRef: 'g-cb-my',
    background: '我方先手出手：进入战斗待机 loop，弹出战斗界面；空藏选技能后做技能表演与数值计算，更新双方血量 / 状态。',
    branches: [auto('a-my-check', 'a_chk', '行动完毕')],
  }))
  add(bpScene('b_ai', '敌方回合', 'vd-wcc-qianyao', { x: 520, y: 340 }, {
    subFlowRef: 'g-cb-ai',
    background: '敌方先手出手：敌将按自身行为树评估局势、决策行动（进攻 / 技能 / 防御蓄力），执行演出并做数值结算。',
    branches: [auto('b-ai-check', 'b_chk', '行动完毕')],
  }))
  add(bpScene('a_chk', '血量判定', 'vd-wcc-idle', { x: 760, y: 120 }, {
    durationMs: 600,
    background: '我方（先手）行动后隐藏计算双方血量：敌方血量清空则本回合直接分出胜负；否则进入敌方出手（本回合后手）。',
    branches: [
      {
        ...auto('a-check-ai', 'a_ai', '敌方出手'),
        condition: { all: [{ type: 'hpRatio', entityId: 'ent-boss', op: 'gt', value: 0 }] },
      },
      auto('a-check-over', 'settle', '分出胜负'),
    ],
  }))
  add(bpScene('b_chk', '血量判定', 'vd-wcc-idle', { x: 760, y: 340 }, {
    durationMs: 600,
    background: '敌方（先手）行动后隐藏计算双方血量：我方血量清空则本回合直接分出胜负；否则进入我方出手（本回合后手）。',
    branches: [
      {
        ...auto('b-check-my', 'b_my', '我方出手'),
        condition: { all: [{ type: 'hpRatio', entityId: 'ent-player', op: 'gt', value: 0 }] },
      },
      auto('b-check-over', 'settle', '分出胜负'),
    ],
  }))
  add(bpScene('a_ai', '敌方回合', 'vd-wcc-qianyao', { x: 980, y: 120 }, {
    subFlowRef: 'g-cb-ai',
    background: '本回合后手：敌将按行为树决策并执行行动、做数值结算，更新双方血量 / 状态——至此本回合双方均已出手。',
    branches: [auto('a-ai-round', 'round', '行动完毕')],
  }))
  add(bpScene('b_my', '我方回合', 'vd-wcc-idle', { x: 980, y: 340 }, {
    subFlowRef: 'g-cb-my',
    background: '本回合后手：我方进入战斗待机 loop、选技能并做技能表演与数值结算，更新双方血量 / 状态——至此本回合双方均已出手。',
    branches: [auto('b-my-round', 'round', '行动完毕')],
  }))
  add(bpScene('round', '回合结束判定', 'vd-wcc-idle', { x: 1220, y: 220 }, {
    durationMs: 600,
    background: '本回合双方均已出手，隐藏计算双方血量：任一方血量清空则战斗结束、进入胜负判定；否则进入下一回合、重新做出手判断。',
    branches: [
      {
        ...auto('round-next', 'init', '下一回合'),
        condition: {
          all: [
            { type: 'hpRatio', entityId: 'ent-player', op: 'gt', value: 0 },
            { type: 'hpRatio', entityId: 'ent-boss', op: 'gt', value: 0 },
          ],
        },
      },
      auto('round-over', 'settle', '分出胜负'),
    ],
  }))
  add(bpScene('settle', '胜负判定', 'vd-wcc-idle', { x: 1440, y: 220 }, {
    durationMs: 600,
    background: '一方血量清空，战斗结束：隐藏计算比较双方存活——敌将（无常豺）倒下则我方胜利、主将倒下则我方失败。',
    branches: [
      {
        ...auto('settle-win', 'win', '胜利'),
        condition: { all: [{ type: 'hpRatio', entityId: 'ent-boss', op: 'lte', value: 0 }] },
      },
      auto('settle-lose', 'lose', '失败'),
    ],
  }))
  add(bpScene('win', '战斗胜利', 'vd-wcc-shengli', { x: 1660, y: 120 }, {
    hudPreset: 'hidden',
    durationMs: 10000,
    background: '我方胜利：空藏力克敌将、傲立胜场的得胜演出（敌将无常豺力竭溃灭），结果（胜利）回传叙事 L3 → E1。',
    branches: [],
  }))
  add(bpScene('lose', '战斗失败', 'vd-wcc-shibai', { x: 1660, y: 340 }, {
    hudPreset: 'hidden',
    durationMs: 6000,
    background: '我方失败：空藏力竭不支、颓然倒地的败亡演出（敌将无常豺得胜），结果（失败）回传叙事 L3 → E2。',
    branches: [],
  }))

  // 子蓝图：我方回合。严格对齐 `g-cb-my`。
  add(bpScene('wait', '战斗待机', 'vd-wcc-idle', { x: 60, y: 490 }, {
    mediaPlayMode: 'loop',
    durationMs: 8000,
    kind: 'choice',
    decision: { optType: 'static', prompt: '选择技能' },
    background: '我方回合待机循环（idle）：弹出战斗界面，呈现 4 个技能（轻攻击 / 重攻击 / 冥想 / 灭世），按当前气力 / 冷却可用性灰显不可选项，等待空藏选择（防反不在此选择，改由敌方进攻时的「防反」反应触发）。',
    branches: [
      choice('my-s1', 'pjudge', '轻攻击'),
      choice('my-s2', 'zjudge', '重攻击'),
      choice('my-s3', 'fuzhu', '冥想'),
      choice('my-ult', 'ult', '灭世'),
    ],
  }))
  add(bpScene('pjudge', '变招判定', 'vd-wcc-idle', { x: 380, y: 130 }, {
    durationMs: 500,
    background: '选定轻攻击后、出手前先做隐藏计算（50% 概率，无界面选项）：本次轻击究竟以「轻攻击」还是「轻攻击·变招」打出。',
    branches: [
      auto('pjudge-plain', 'pu', '轻攻击'),
      auto('pjudge-combo', 'pu2', '变招'),
    ],
  }))
  add(bpScene('pu', '轻攻击', 'vd-wcc-pugong', { x: 700, y: 40 }, {
    durationMs: 5000,
    background: '变招判定为普通：欺身前扑挥击，命中迸出爪痕 / 刀痕与受击顿帧（威力1.0·命中100%·不可破防）。',
    performance: { cues: [{ id: 'pu-hit', atMs: 1000, damageToBoss: 80, label: '命中结算 威力1.0' }] },
    branches: [auto('pu-done', 'my-done', 'Out')],
  }))
  add(bpScene('pu2', '轻攻击·变招', 'vd-wcc-pugong2', { x: 700, y: 220 }, {
    durationMs: 5000,
    background: '变招判定触发：本次以轻攻击变招（反手补击 / 连段）打出，沿演出分 4 次逐次递增结算（威力 0.25 → 0.3 → 0.35 → 0.4）。',
    performance: {
      cues: [
        { id: 'pu2-1', atMs: 600, damageToBoss: 20, label: '第1段 威力0.25' },
        { id: 'pu2-2', atMs: 800, damageToBoss: 24, label: '第2段 威力0.3' },
        { id: 'pu2-3', atMs: 1300, damageToBoss: 28, label: '第3段 威力0.35' },
        { id: 'pu2-4', atMs: 1800, damageToBoss: 32, label: '第4段 威力0.4' },
      ] as PerformanceCue[],
    },
    branches: [auto('pu2-done', 'my-done', 'Out')],
  }))
  add(bpScene('zjudge', '变招判定', 'vd-wcc-idle', { x: 380, y: 490 }, {
    durationMs: 500,
    background: '选定重攻击（已扣气力2）后、出手前先做隐藏计算（50% 概率，无界面选项）：本次重击究竟以「重攻击」还是「重攻击·变招」打出。',
    branches: [
      auto('zjudge-plain', 'zhong', '重攻击'),
      auto('zjudge-combo', 'z2', '变招'),
    ],
  }))
  add(bpScene('zhong', '重攻击', 'vd-wcc-zhong', { x: 700, y: 400 }, {
    durationMs: 6000,
    background: '变招判定为普通：蓄力后一记沉重扑砸 / 重劈，单组大字伤害弹出（威力1.8·命中95%·暴击+5%·破防）。',
    performance: { cues: [{ id: 'zhong-hit', atMs: 1700, damageToBoss: 144, label: '命中结算 威力1.8' }] },
    branches: [auto('zhong-done', 'my-done', 'Out')],
  }))
  add(bpScene('z2', '重攻击·变招', 'vd-wcc-zhong2', { x: 700, y: 580 }, {
    durationMs: 6000,
    background: '变招判定触发：本次以重击变招（延迟 / 二段变化）打出，沿演出分 2 次逐次递增结算（威力 1.0 → 1.4）。',
    performance: {
      cues: [
        { id: 'z2-1', atMs: 2500, damageToBoss: 80, label: '第1段 威力1.0' },
        { id: 'z2-2', atMs: 3700, damageToBoss: 112, label: '第2段 威力1.4' },
      ] as PerformanceCue[],
    },
    branches: [auto('z2-done', 'my-done', 'Out')],
  }))
  add(bpScene('fuzhu', '冥想', 'vd-wcc-huiqi', { x: 700, y: 760 }, {
    durationMs: 5000,
    background: '空藏冥想调息：回复气力+2、回血12%最大生命、解除异常状态（不造成伤害），用后进入 3 回合冷却。',
    performance: { cues: [{ id: 'fuzhu-heal', atMs: 2000, label: '回气回血结算' }] },
    branches: [auto('fuzhu-done', 'my-done', 'Out')],
  }))
  add(bpScene('ult', '灭世', 'vd-wcc-dazhao', { x: 700, y: 940 }, {
    durationMs: 12000,
    background: '气力满（5）方可释放，释放清空气力；招牌绝技长前摇蓄力后全力爆发（威力3.0·命中100%）。',
    performance: { cues: [{ id: 'ult-hit', atMs: 7000, damageToBoss: 240, label: '命中结算 威力3.0' }] },
    branches: [auto('ult-done', 'my-done', 'Out')],
  }))
  add(bpScene('my-done', '行动完毕', 'vd-wcc-idle', { x: 1020, y: 490 }, {
    durationMs: 500,
    background: '我方行动结算完成，交还战斗主循环（进入血量判定）。',
    branches: [],
  }))

  // 子蓝图：敌方回合。严格对齐 `g-cb-ai`。
  add(bpScene('bt', '行为树决策', 'vd-wcc-idle', { x: 80, y: 1380 }, {
    durationMs: 500,
    background: '敌将行为树读取双方血量 / 状态做隐藏计算评估，本回合发起进攻（无界面选项）：进入攻击前摇预警，随后由空藏在前摇窗口做「防反」QTE 决定结果。',
    branches: [auto('ai-atk', 'tele', '进攻')],
  }))
  add(bpScene('tele', '攻击前摇', 'vd-wcc-qianyao', { x: 320, y: 1380 }, {
    kind: 'qte',
    durationMs: 4000,
    decision: { optType: 'timed_qte', qteKind: 'parry', timeoutMs: 2600, prompt: '防反 QTE' },
    background: '小怪压低重心、利爪后扬、双目锁定的起手蓄力，给予空藏可读的预警窗口；窗口内空藏做「防反」QTE 输入，按时机隐藏计算三档判定结果。',
    qte: {
      window: { perfect: 120, great: 260, good: 480 },
      score: { perfect: 100, great: 70, good: 40, miss: 0 },
      timeoutMs: 2600,
      outcomeLabels: { pass: '受击防反', good: '受击闪避', fail: '受击' },
      cues: [{ id: 'parry', shape: 'tap', x: 0.5, y: 0.55, appearAt: 700, targetAt: 1300, label: '防反' }],
    },
    branches: [
      { id: 'ai-qte-great', kind: 'qte_pass', qteOutcome: 'pass', targetSceneId: 'block', label: '受击防反' },
      { id: 'ai-qte-good', kind: 'qte_pass', qteOutcome: 'good', targetSceneId: 'dodgeP', label: '受击闪避' },
      { id: 'ai-qte-fail', kind: 'qte_fail', qteOutcome: 'fail', targetSceneId: 'hurt', label: '受击' },
    ],
  }))
  add(bpScene('block', '受击防反', 'vd-wcc-fangfan', { x: 560, y: 1280 }, {
    durationMs: 4000,
    background: '受击防反：主将精准格挡卸力、周身泛起反震光罩——完全免疫来袭伤害，并顺势反击敌方（威力1.2）。',
    performance: { cues: [{ id: 'block-hit', atMs: 1800, damageToBoss: 96, label: '反击结算 威力1.2' }] },
    branches: [auto('block-done', 'ai-done', 'Out')],
  }))
  add(bpScene('dodgeP', '受击闪避', 'vd-wcc-shanbi', { x: 560, y: 1440 }, {
    durationMs: 4000,
    background: '受击闪避：主将侧身卸力闪避，完全免疫来袭伤害并顺势反击敌方（威力0.8）；消耗气力1。',
    performance: { cues: [{ id: 'dodge-hit', atMs: 2000, damageToBoss: 64, label: '反击结算 威力0.8' }] },
    branches: [auto('dodge-done', 'ai-done', 'Out')],
  }))
  add(bpScene('hurt', '受击', 'vd-wcc-shouji', { x: 560, y: 1600 }, {
    durationMs: 4000,
    background: '防反失败：主将未能防反、正面中招踉跄硬直破势，承受小怪攻击全额伤害（命中100%·暴击8%），但受击积累气力+1。',
    performance: { cues: [{ id: 'hurt-hit', atMs: 10, damageToPlayer: 120, label: '受击结算' }] },
    branches: [auto('hurt-done', 'ai-done', 'Out')],
  }))
  add(bpScene('ai-done', '行动完毕', 'vd-wcc-idle', { x: 820, y: 1440 }, {
    durationMs: 500,
    background: '敌方行动结算完成，交还战斗主循环（进入血量判定）。',
    branches: [],
  }))

  return {
    id: COMBAT_BLUEPRINT_DEMO_ID,
    title: '战斗蓝图',
    synopsis: '回合制循环（待机 / 演出 / 结算）：进战待机 → 出手判断 → 先手出手 → 后手出手 → 回合结束 → 胜负。',
    originIdea: '从新影游平台交互原型迁移的层级战斗蓝图 demo。',
    rootSceneId: 'enter',
    defaultCharMs: 32,
    schemaVersion: 9,
    modules: { gameplay: true, rules: true },
    variables: {},
    entities: {
      'ent-player': { id: 'ent-player', name: '空藏', kind: 'player', maxHp: 1000, initialHp: 1000 },
      'ent-boss': { id: 'ent-boss', name: '小怪 · 无常豺', kind: 'boss', maxHp: 1200, initialHp: 1200 },
    },
    ui: {
      hud: [
        { element: 'playerHp', show: 'always' },
        { element: 'bossHp', show: 'always' },
        { element: 'score', show: 'always' },
      ],
    },
    characters: {},
    locations: {},
    scenes,
    blueprintGraphs: {
      'g-cb-my': {
        id: 'g-cb-my',
        title: '我方回合',
        rootSceneId: 'wait',
        parentSceneId: 'a_my',
        sceneIds: [
          'wait',
          'pjudge',
          'pu',
          'pu2',
          'zjudge',
          'zhong',
          'z2',
          'fuzhu',
          'ult',
          'my-done',
        ],
      },
      'g-cb-ai': {
        id: 'g-cb-ai',
        title: '敌方回合',
        rootSceneId: 'bt',
        parentSceneId: 'b_ai',
        sceneIds: ['bt', 'tele', 'block', 'dodgeP', 'hurt', 'ai-done'],
      },
    },
  }
}
