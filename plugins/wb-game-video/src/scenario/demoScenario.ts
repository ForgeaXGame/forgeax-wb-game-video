import type { MediaRef, PerformanceCue, Scenario, Scene } from './types'
import {
  coldCliffMediaId,
  primeColdCliffDemoMedia,
  type ColdCliffVideoKey,
} from './coldCliffDemoMedia'

/** bundled demo 的固定 id —— 单一真源，供持久化层判定"这是内置 demo，不得抢占 activeId"。 */
export const BUNDLED_DEMO_ID = 'demo-001'
export const COMBAT_BLUEPRINT_DEMO_ID = 'demo-combat-blueprint'

function vid(key: ColdCliffVideoKey): MediaRef {
  return { kind: 'VIDEO', ref: coldCliffMediaId(key), meta: {} }
}

function cutscene(
  id: string,
  title: string,
  video: ColdCliffVideoKey,
  next: string,
  durationMs: number,
  pos: { x: number; y: number },
  extra?: Partial<Scene>,
): Scene {
  return {
    id,
    title,
    media: vid(video),
    durationMs,
    pos,
    dialogue: extra?.dialogue ?? [],
    branches: [{ id: `${id}-auto`, kind: 'auto', targetSceneId: next }],
    ...extra,
  }
}

/**
 * 演示剧情 —— 「女武士·冷蓝悬崖」分支视频流（与 seedance prototype/game-config.js 同 DAG）。
 *
 *   S1 → L1 ─┬ Tcave → S2a ─┐
 *            └ Tbridge → S2b ┘→ S3 → Lb1 → Tr1a/R1a | Tr1b/R1b → Lb2(QTE) → … → S4a/S4b
 */
export function getDemoScenario(): Scenario {
  return getLegacyColdCliffDemoScenario()
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
    clipId: clipId ?? 'idle01',
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

  // 顶层战斗蓝图：进战 → 定先攻 → 先手行动 → 血量判定 → 后手行动 → 回合结束 → 胜负。
  add(bpScene('combat-enter', '进战待机', 'idle01', { x: 80, y: 220 }, {
    mediaPlayMode: 'loop',
    branches: [auto('enter-init', 'combat-init', 'Out')],
  }))
  add(bpScene('combat-init', '出手判断', undefined, { x: 300, y: 220 }, {
    durationMs: 600,
    branches: [
      auto('init-me', 'combat-a-my', '我方先手'),
      auto('init-foe', 'combat-b-ai', '敌方先手'),
    ],
  }))
  add(bpScene('combat-a-my', '我方回合', undefined, { x: 520, y: 120 }, {
    subFlowRef: 'g-cb-my',
    branches: [auto('a-my-check', 'combat-a-check', '行动完毕')],
  }))
  add(bpScene('combat-b-ai', '敌方回合', undefined, { x: 520, y: 340 }, {
    subFlowRef: 'g-cb-ai',
    branches: [auto('b-ai-check', 'combat-b-check', '行动完毕')],
  }))
  add(bpScene('combat-a-check', '血量判定', undefined, { x: 760, y: 120 }, {
    durationMs: 600,
    branches: [
      auto('a-check-ai', 'combat-a-ai', '敌方出手'),
      auto('a-check-over', 'combat-settle', '分出胜负'),
    ],
  }))
  add(bpScene('combat-b-check', '血量判定', undefined, { x: 760, y: 340 }, {
    durationMs: 600,
    branches: [
      auto('b-check-my', 'combat-b-my', '我方出手'),
      auto('b-check-over', 'combat-settle', '分出胜负'),
    ],
  }))
  add(bpScene('combat-a-ai', '敌方回合（后手）', undefined, { x: 980, y: 120 }, {
    subFlowRef: 'g-cb-ai',
    branches: [auto('a-ai-round', 'combat-round', '行动完毕')],
  }))
  add(bpScene('combat-b-my', '我方回合（后手）', undefined, { x: 980, y: 340 }, {
    subFlowRef: 'g-cb-my',
    branches: [auto('b-my-round', 'combat-round', '行动完毕')],
  }))
  add(bpScene('combat-round', '回合结束判定', undefined, { x: 1220, y: 220 }, {
    durationMs: 600,
    branches: [
      auto('round-over', 'combat-settle', '分出胜负'),
      auto('round-next', 'combat-init', '下一回合'),
    ],
  }))
  add(bpScene('combat-settle', '胜负判定', undefined, { x: 1440, y: 220 }, {
    durationMs: 600,
    branches: [
      auto('settle-win', 'combat-win', '胜利'),
      auto('settle-lose', 'combat-lose', '失败'),
    ],
  }))
  add(bpScene('combat-win', '战斗胜利', 'shengli', { x: 1660, y: 120 }, {
    hudPreset: 'hidden',
    branches: [],
  }))
  add(bpScene('combat-lose', '战斗失败', 'shibai', { x: 1660, y: 340 }, {
    hudPreset: 'hidden',
    branches: [],
  }))

  // 子蓝图：我方回合。
  add(bpScene('cb-my-wait', '战斗待机', 'idle01', { x: 80, y: 520 }, {
    mediaPlayMode: 'loop',
    kind: 'choice',
    decision: { optType: 'static', prompt: '选择技能' },
    branches: [
      choice('my-s1', 'cb-my-pjudge', '轻攻击'),
      choice('my-s2', 'cb-my-zjudge', '重攻击'),
      choice('my-s3', 'cb-my-meditate', '冥想'),
      choice('my-ult', 'cb-my-ult', '灭世'),
    ],
  }))
  add(bpScene('cb-my-pjudge', '轻攻击变招判定', undefined, { x: 320, y: 360 }, {
    durationMs: 500,
    branches: [
      auto('pjudge-plain', 'cb-my-pu', '轻攻击'),
      auto('pjudge-combo', 'cb-my-pu2', '变招'),
    ],
  }))
  add(bpScene('cb-my-pu', '轻攻击', 'pugong', { x: 560, y: 280 }, {
    performance: { cues: [{ id: 'pu-hit', atMs: 1500, damageToBoss: 80, label: '轻攻击命中' }] },
    branches: [auto('pu-done', 'cb-my-done', 'Out')],
  }))
  add(bpScene('cb-my-pu2', '轻攻击·变招', 'pugong2', { x: 560, y: 440 }, {
    performance: {
      cues: [
        { id: 'pu2-1', atMs: 1000, damageToBoss: 20, label: '第1段' },
        { id: 'pu2-2', atMs: 1400, damageToBoss: 25, label: '第2段' },
        { id: 'pu2-3', atMs: 1800, damageToBoss: 30, label: '第3段' },
        { id: 'pu2-4', atMs: 2200, damageToBoss: 35, label: '第4段' },
      ] as PerformanceCue[],
    },
    branches: [auto('pu2-done', 'cb-my-done', 'Out')],
  }))
  add(bpScene('cb-my-zjudge', '重攻击变招判定', undefined, { x: 320, y: 680 }, {
    durationMs: 500,
    branches: [
      auto('zjudge-plain', 'cb-my-heavy', '重攻击'),
      auto('zjudge-combo', 'cb-my-heavy2', '变招'),
    ],
  }))
  add(bpScene('cb-my-heavy', '重攻击', 'zhonggongji', { x: 560, y: 620 }, {
    performance: { cues: [{ id: 'heavy-hit', atMs: 2000, damageToBoss: 140, label: '重击命中' }] },
    branches: [auto('heavy-done', 'cb-my-done', 'Out')],
  }))
  add(bpScene('cb-my-heavy2', '重攻击·变招', 'zhonggongji2', { x: 560, y: 780 }, {
    performance: {
      cues: [
        { id: 'heavy2-1', atMs: 1800, damageToBoss: 90, label: '第1段' },
        { id: 'heavy2-2', atMs: 3000, damageToBoss: 120, label: '第2段' },
      ] as PerformanceCue[],
    },
    branches: [auto('heavy2-done', 'cb-my-done', 'Out')],
  }))
  add(bpScene('cb-my-meditate', '冥想', 'huiqi', { x: 560, y: 940 }, {
    branches: [auto('meditate-done', 'cb-my-done', 'Out')],
  }))
  add(bpScene('cb-my-ult', '灭世', 'dazhao', { x: 560, y: 1100 }, {
    performance: { cues: [{ id: 'ult-hit', atMs: 7000, damageToBoss: 260, label: '灭世命中' }] },
    branches: [auto('ult-done', 'cb-my-done', 'Out')],
  }))
  add(bpScene('cb-my-done', '行动完毕', undefined, { x: 820, y: 520 }, {
    durationMs: 500,
    branches: [],
  }))

  // 子蓝图：敌方回合。
  add(bpScene('cb-ai-bt', '行为树决策', undefined, { x: 80, y: 1380 }, {
    durationMs: 500,
    branches: [auto('ai-atk', 'cb-ai-tele', '进攻')],
  }))
  add(bpScene('cb-ai-tele', '攻击前摇', 'difanggongjiqianyao', { x: 320, y: 1380 }, {
    kind: 'qte',
    decision: { optType: 'timed_qte', qteKind: 'parry' },
    qte: {
      window: { perfect: 120, great: 260, good: 480 },
      score: { perfect: 100, great: 70, good: 40, miss: 0 },
      timeoutMs: 2600,
      cues: [{ id: 'parry', shape: 'tap', x: 0.5, y: 0.55, appearAt: 700, targetAt: 1300, label: '防反' }],
    },
    branches: [
      { id: 'ai-qte-pass', kind: 'qte_pass', targetSceneId: 'cb-ai-block', label: '受击防反' },
      { id: 'ai-qte-fail', kind: 'qte_fail', targetSceneId: 'cb-ai-hurt', label: '受击' },
    ],
  }))
  add(bpScene('cb-ai-block', '受击防反', 'fangfan', { x: 560, y: 1280 }, {
    performance: { cues: [{ id: 'block-hit', atMs: 2000, damageToBoss: 95, label: '防反反击' }] },
    branches: [auto('block-done', 'cb-ai-done', 'Out')],
  }))
  add(bpScene('cb-ai-dodge', '受击闪避', 'shanbi', { x: 560, y: 1440 }, {
    performance: { cues: [{ id: 'dodge-hit', atMs: 2000, damageToBoss: 55, label: '闪避反击' }] },
    branches: [auto('dodge-done', 'cb-ai-done', 'Out')],
  }))
  add(bpScene('cb-ai-hurt', '受击', 'shouji', { x: 560, y: 1600 }, {
    performance: { cues: [{ id: 'hurt-hit', atMs: 1000, damageToPlayer: 90, label: '受击' }] },
    branches: [auto('hurt-done', 'cb-ai-done', 'Out')],
  }))
  add(bpScene('cb-ai-done', '行动完毕', undefined, { x: 820, y: 1440 }, {
    durationMs: 500,
    branches: [],
  }))

  return {
    id: COMBAT_BLUEPRINT_DEMO_ID,
    title: '无常豺 · 战斗蓝图',
    synopsis: '按原型战斗蓝图顺序演示：进战待机 → 定先攻 → 我方/敌方回合子蓝图 → 回合结束 → 胜负。',
    originIdea: '从新影游平台交互原型迁移的层级战斗蓝图 demo。',
    rootSceneId: 'combat-enter',
    defaultCharMs: 32,
    schemaVersion: 9,
    modules: { gameplay: true, rules: true },
    variables: {},
    entities: {
      'ent-player': { id: 'ent-player', name: '主将', kind: 'player', maxHp: 1000, initialHp: 1000 },
      'ent-boss': { id: 'ent-boss', name: '无常豺', kind: 'boss', maxHp: 1200, initialHp: 1200 },
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
        rootSceneId: 'cb-my-wait',
        parentSceneId: 'combat-a-my',
        sceneIds: [
          'cb-my-wait',
          'cb-my-pjudge',
          'cb-my-pu',
          'cb-my-pu2',
          'cb-my-zjudge',
          'cb-my-heavy',
          'cb-my-heavy2',
          'cb-my-meditate',
          'cb-my-ult',
          'cb-my-done',
        ],
      },
      'g-cb-ai': {
        id: 'g-cb-ai',
        title: '敌方回合',
        rootSceneId: 'cb-ai-bt',
        parentSceneId: 'combat-b-ai',
        sceneIds: ['cb-ai-bt', 'cb-ai-tele', 'cb-ai-block', 'cb-ai-dodge', 'cb-ai-hurt', 'cb-ai-done'],
      },
    },
  }
}

function getLegacyColdCliffDemoScenario(): Scenario {
  primeColdCliffDemoMedia()

  return {
    id: BUNDLED_DEMO_ID,
    title: '女武士 · 冷蓝悬崖',
    synopsis: '雾气弥漫的悬崖小径，冰蓝巨龙降临——三回合对峙，终局一击定胜负。',
    originIdea: '分支 FMV 战斗演示：岔路选择 → Boss 登场 → 三回合 QTE/抉择 → 胜负结局。',
    rootSceneId: 's1',
    defaultCharMs: 32,
    schemaVersion: 9,
    variables: {
      'flag-met-traveler': {
        id: 'flag-met-traveler',
        name: '遇见旅人',
        kind: 'flag',
        initial: 0,
      },
    },
    entities: {
      'ent-player': {
        id: 'ent-player',
        name: '女武士',
        kind: 'player',
        maxHp: 100,
        initialHp: 100,
      },
      'ent-boss': {
        id: 'ent-boss',
        name: '冰蓝巨龙',
        kind: 'boss',
        maxHp: 300,
        initialHp: 300,
      },
    },
    ui: {
      hud: [
        { element: 'playerHp', show: 'battle' },
        { element: 'bossHp', show: 'battle' },
      ],
    },
    characters: {},
    locations: {},
    scenes: {
      s1: cutscene('s1', 'S1 · 开场·岔路', 's1', 'l1', 14000, { x: 80, y: 200 }, {
        hudPreset: 'explore',
        hotspots: [
          {
            id: 'traveler',
            x: 0.38,
            y: 0.48,
            r: 0.07,
            once: true,
            label: '旅人',
            detour: {
              speaker: '旅人',
              dialogue: [
                '前方的路很危险，你自己小心。',
                '左边洞穴据说有捷径，右边吊桥风景更好……',
              ],
              setFlagVarIds: ['flag-met-traveler'],
            },
          },
        ],
        dialogue: [
          {
            id: 'd1',
            role: 'narration',
            text: '雾气弥漫的悬崖小径，她在岔路口停下脚步……',
            startMs: 400,
            endMs: 4000,
          },
        ],
      }),

      l1: {
        id: 'l1',
        title: 'L1 · 岔路待机',
        kind: 'choice',
        media: vid('l1'),
        mediaPlayMode: 'loop',
        hudPreset: 'main',
        durationMs: 120000,
        pos: { x: 280, y: 200 },
        dialogue: [],
        decision: {
          optType: 'timed',
          mode: 'wait',
          timeoutMs: 9000,
          defaultBranchId: 'l1-cave',
          windowStartMs: 400,
          windowEndMs: 120000,
          fireAt: 'on_pick',
          prompt: '选择岔路（超时默认进洞穴）',
        },
        branches: [
          {
            id: 'l1-cave',
            label: '进洞穴',
            kind: 'choice',
            targetSceneId: 'tcave',
          },
          {
            id: 'l1-bridge',
            label: '过吊桥',
            kind: 'choice',
            targetSceneId: 'tbridge',
            condition: {
              all: [{ type: 'flag', varId: 'flag-met-traveler', equals: true }],
            },
          },
        ],
      },

      tcave: cutscene('tcave', 'T · 进洞穴', 'tcave', 's2a', 2000, { x: 480, y: 80 }),
      s2a: {
        id: 's2a',
        title: 'S2a · 洞穴',
        kind: 'qte',
        media: vid('s2a'),
        durationMs: 9000,
        pos: { x: 680, y: 80 },
        hudPreset: 'main',
        decision: {
          optType: 'timed_qte',
          qteKind: 'sequence',
          windowStartMs: 1800,
          windowEndMs: 7500,
        },
        dialogue: [
          {
            id: 'd1',
            role: 'narration',
            text: '火把微光跳动，她步入幽暗洞穴深处……',
            startMs: 300,
            endMs: 3500,
          },
        ],
        qte: {
          window: { perfect: 150, great: 300, good: 500 },
          score: { perfect: 100, great: 60, good: 30, miss: 0 },
          passingScore: 60,
          cues: [
            {
              id: 's2a-l',
              shape: 'tap',
              x: 0.28,
              y: 0.58,
              appearAt: 2200,
              targetAt: 3000,
              label: '←',
              triggerKey: 'ArrowLeft',
              slowMo: { rate: 0.35, leadInMs: 220, holdAfterHitMs: 180 },
            },
            {
              id: 's2a-r',
              shape: 'tap',
              x: 0.5,
              y: 0.58,
              appearAt: 3200,
              targetAt: 4000,
              label: '→',
              triggerKey: 'ArrowRight',
            },
            {
              id: 's2a-u',
              shape: 'tap',
              x: 0.72,
              y: 0.58,
              appearAt: 4200,
              targetAt: 5000,
              label: '↑',
              triggerKey: 'ArrowUp',
            },
          ],
        },
        branches: [
          { id: 's2a-pass', kind: 'qte_pass', targetSceneId: 's3' },
          { id: 's2a-fail', kind: 'qte_fail', targetSceneId: 's3' },
        ],
      },
      tbridge: cutscene('tbridge', 'T · 过吊桥', 'tbridge', 's2b', 2000, { x: 480, y: 320 }),
      s2b: {
        id: 's2b',
        title: 'S2b · 吊桥',
        kind: 'qte',
        media: vid('s2b'),
        durationMs: 9000,
        pos: { x: 680, y: 320 },
        hudPreset: 'main',
        decision: {
          optType: 'timed_qte',
          qteKind: 'timing',
          windowStartMs: 2000,
          windowEndMs: 7800,
        },
        dialogue: [
          {
            id: 'd1',
            role: 'narration',
            text: '狂风呼啸，她踏上摇晃的深渊吊桥……',
            startMs: 300,
            endMs: 3500,
          },
        ],
        qte: {
          window: { perfect: 120, great: 280, good: 480 },
          score: { perfect: 100, great: 60, good: 30, miss: 0 },
          passingScore: 30,
          cues: [
            {
              id: 's2b-1',
              shape: 'tap',
              x: 0.5,
              y: 0.55,
              appearAt: 2800,
              targetAt: 3800,
              label: '节奏 1',
            },
            {
              id: 's2b-2',
              shape: 'tap',
              x: 0.5,
              y: 0.55,
              appearAt: 4200,
              targetAt: 5200,
              label: '节奏 2',
            },
            {
              id: 's2b-3',
              shape: 'tap',
              x: 0.5,
              y: 0.55,
              appearAt: 5600,
              targetAt: 6600,
              label: '节奏 3',
            },
          ],
        },
        branches: [
          { id: 's2b-pass', kind: 'qte_pass', targetSceneId: 's3' },
          { id: 's2b-fail', kind: 'qte_fail', targetSceneId: 's3' },
        ],
      },

      s3: cutscene('s3', 'S3 · Boss登场', 's3', 'lb1', 10000, { x: 900, y: 200 }, {
        hudPreset: 'battle',
        dialogue: [
          {
            id: 'd1',
            role: 'narration',
            text: '天空骤暗——冰蓝巨龙俯冲降临！',
            startMs: 400,
            endMs: 4500,
          },
        ],
      }),

      lb1: {
        id: 'lb1',
        title: 'Lb1 · 对峙待机',
        kind: 'choice',
        media: vid('lb1'),
        mediaPlayMode: 'loop',
        hudPreset: 'battle',
        durationMs: 120000,
        pos: { x: 1100, y: 200 },
        dialogue: [],
        decision: {
          mode: 'pause',
          prompt: '第一回合 · 进攻则伤龙，巨龙反扑则伤你',
        },
        branches: [
          {
            id: 'lb1-heavy',
            label: '重劈',
            kind: 'choice',
            targetSceneId: 'tr1a',
          },
          {
            id: 'lb1-thrust',
            label: '突刺',
            kind: 'choice',
            targetSceneId: 'tr1b',
          },
        ],
      },

      tr1a: cutscene('tr1a', 'T · 重劈', 'tr1a', 'r1a', 2000, { x: 1300, y: 80 }),
      r1a: cutscene('r1a', 'R1a · 回合1·重劈', 'r1a', 'lb2', 9000, { x: 1500, y: 80 }, {
        hudPreset: 'battle',
        performance: {
          cues: [
            { id: 'r1a-hit', atMs: 1800, damageToBoss: 45, label: '重劈命中！' },
            { id: 'r1a-counter', atMs: 4200, damageToPlayer: 18, label: '龙爪反击' },
          ] as PerformanceCue[],
        },
        dialogue: [
          {
            id: 'd1',
            role: 'narration',
            text: '重劈！刀光迸出蓝色火花……',
            startMs: 300,
            endMs: 3500,
          },
        ],
      }),
      tr1b: cutscene('tr1b', 'T · 突刺', 'tr1b', 'r1b', 2000, { x: 1300, y: 320 }),
      r1b: cutscene('r1b', 'R1b · 回合1·突刺', 'r1b', 'lb2', 9000, { x: 1500, y: 320 }, {
        hudPreset: 'battle',
        performance: {
          cues: [
            { id: 'r1b-hit', atMs: 1900, damageToBoss: 32, label: '突刺命中' },
            { id: 'r1b-counter', atMs: 4300, damageToPlayer: 22, label: '龙尾扫击' },
          ] as PerformanceCue[],
        },
        dialogue: [
          {
            id: 'd1',
            role: 'narration',
            text: '突刺！长刀划开龙鳞……',
            startMs: 300,
            endMs: 3500,
          },
        ],
      }),

      lb2: {
        id: 'lb2',
        title: 'Lb2 · 对峙待机',
        kind: 'qte',
        media: vid('lb2'),
        mediaPlayMode: 'loop',
        hudPreset: 'battle',
        durationMs: 120000,
        pos: { x: 1700, y: 200 },
        dialogue: [],
        decision: {
          optType: 'timed_qte',
          qteKind: 'parry',
          windowStartMs: 0,
          windowEndMs: 120000,
        },
        qte: {
          window: { perfect: 200, great: 400, good: 700 },
          score: { perfect: 100, great: 60, good: 30, miss: 0 },
          passingScore: 30,
          timeoutMs: 8000,
          cues: [
            {
              id: 'lb2-tap',
              shape: 'tap',
              x: 0.5,
              y: 0.55,
              appearAt: 800,
              targetAt: 2600,
              label: '空格 · 反击',
              triggerKey: ' ',
            },
          ],
        },
        branches: [
          { id: 'lb2-pass', kind: 'qte_pass', targetSceneId: 'tr2a' },
          { id: 'lb2-fail', kind: 'qte_fail', targetSceneId: 'tr2b' },
        ],
      },

      tr2a: cutscene('tr2a', 'T · 格挡反击', 'tr2a', 'r2a', 2000, { x: 1900, y: 80 }),
      r2a: cutscene('r2a', 'R2a · 回合2·格挡反击', 'r2a', 'lb3', 9000, { x: 2100, y: 80 }, {
        hudPreset: 'battle',
        performance: {
          cues: [
            { id: 'r2a-hit', atMs: 2000, damageToBoss: 55, label: '格挡反击！' },
          ] as PerformanceCue[],
        },
        dialogue: [
          {
            id: 'd1',
            role: 'narration',
            text: '抓住破绽，举刀反击，重创巨龙！',
            startMs: 300,
            endMs: 3500,
          },
        ],
      }),
      tr2b: cutscene('tr2b', 'T · 侧身格挡', 'tr2b', 'r2b', 2000, { x: 1900, y: 320 }),
      r2b: cutscene('r2b', 'R2b · 回合2·格挡闪避', 'r2b', 'lb3', 9000, { x: 2100, y: 320 }, {
        hudPreset: 'battle',
        performance: {
          cues: [
            { id: 'r2b-miss', atMs: 2100, damageToPlayer: 28, label: '格挡失误' },
          ] as PerformanceCue[],
        },
        dialogue: [
          {
            id: 'd1',
            role: 'narration',
            text: '时机错过，侧身勉强避开龙爪……',
            startMs: 300,
            endMs: 3500,
          },
        ],
      }),

      lb3: {
        id: 'lb3',
        title: 'Lb3 · 终局待机',
        kind: 'choice',
        media: vid('lb3'),
        mediaPlayMode: 'loop',
        hudPreset: 'battle',
        durationMs: 120000,
        pos: { x: 2300, y: 200 },
        dialogue: [],
        decision: {
          mode: 'pause',
          prompt: '终局一击 · 进攻则斩龙取胜，防守则被吐息击溃',
        },
        branches: [
          {
            id: 'lb3-all',
            label: '全力一击',
            kind: 'choice',
            targetSceneId: 'tr3a',
          },
          {
            id: 'lb3-guard',
            label: '保守防御',
            kind: 'choice',
            targetSceneId: 'tr3b',
          },
        ],
      },

      tr3a: cutscene('tr3a', 'T · 全力一击', 'tr3a', 's4a', 2000, { x: 2500, y: 80 }),
      s4a: {
        id: 's4a',
        title: 'S4a · 结局·胜',
        media: vid('s4a'),
        durationMs: 10000,
        pos: { x: 2700, y: 80 },
        dialogue: [
          {
            id: 'd1',
            role: 'narration',
            text: '胜利！巨龙轰然倒地，女武士收刀挺立。',
            startMs: 600,
          },
        ],
        branches: [],
      },
      tr3b: cutscene('tr3b', 'T · 保守防御', 'tr3b', 's4b', 2000, { x: 2500, y: 320 }),
      s4b: {
        id: 's4b',
        title: 'S4b · 结局·败',
        media: vid('s4b'),
        durationMs: 10000,
        pos: { x: 2700, y: 320 },
        dialogue: [
          {
            id: 'd1',
            role: 'narration',
            text: '败… 冰蓝吐息将你击退，长刀脱手。',
            startMs: 600,
          },
        ],
        branches: [],
      },
    },
  }
}
