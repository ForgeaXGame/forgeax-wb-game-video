import { useEffect, useState } from 'react'

import { useScenarioStore } from '../scenario/scenarioStore'
import { VIDEO_CLIPS, UI_SCHEMES, getVideoClip } from '../scenario/gameAssetCatalog'
import { injectStyleOnce } from '../styles/injectStyle'
import { BranchGateEditor } from '../editor/numeric/NumericEditors'
import type { BossRound, Branch, DecisionSpec, Effect, EntityStatEffect, GameVariable, Hotspot, PerformanceCue, Scenario, Scene, VarEffect } from '../scenario/types'
import type { DecisionOptType, DecisionFireAt, ChoicePresentation, HudPreset, MediaPlayMode, QteKind } from '../scenario/gameplayTypes'

/**
 * BlueprintGameplayPanel —— 蓝图视图右侧「玩法字段」可视化编辑面板(v9 M8)。
 *
 * 选中蓝图节点后出现，按 Scene.kind 上色，让作者直接编辑玩法骨架(无需手写 JSON):
 *   - 场景类别(kind)：story/battle/qte/choice，切换即给节点重新上色;
 *   - 限时选择(decision)：模式 + 倒计时 + 提示文案;
 *   - Boss 战(kind=battle)：Boss/玩家实体、胜负跳转、完美 flag、回合列表(增删/伤害);
 *   - 子流程返回点(returnsToCaller)：热点 call/return 的出口标记。
 *
 * 全部经 scenarioStore.updateScene 落同一 Scenario(SSOT)——蓝图、剧情树、运行时
 * 立刻同步。缺省字段不写，保持旧剧本零回归。
 */
function choiceHotspotId(branchId: string): string {
  return `choice-${branchId}`
}

function findChoiceHotspot(hotspots: Hotspot[], branch: Branch): Hotspot | undefined {
  return (
    hotspots.find((h) => h.id === choiceHotspotId(branch.id)) ??
    hotspots.find((h) => h.id === branch.id) ??
    hotspots.find((h) => h.targetSceneId === branch.targetSceneId && !h.detour)
  )
}

function isEmptyHotspot(h: Hotspot): boolean {
  return !h.targetSceneId && !h.detour?.dialogue?.length
}

/** 与 BlueprintRuntime.nodeHasPerformance 对齐：有 clip 或 VIDEO media 才算有独立演出。 */
function sceneHasPerformance(scene: Scene): boolean {
  if (scene.clipId) return true
  if (scene.media?.kind === 'VIDEO' && scene.media.ref) return true
  return false
}

function upsertChoiceHotspot(
  hotspots: Hotspot[],
  branch: Branch,
  patch: Partial<Hotspot>,
): Hotspot[] {
  const existing = findChoiceHotspot(hotspots, branch)
  const id = existing?.id ?? choiceHotspotId(branch.id)
  const next: Hotspot = {
    ...(existing ?? {
      id,
      x: 0.5,
      y: 0.55,
      mode: 'goto',
    }),
    ...patch,
    id,
    label: patch.label ?? existing?.label ?? branch.label ?? branch.targetSceneId,
    targetSceneId: branch.targetSceneId,
  }
  delete next.detour
  return [...hotspots.filter((h) => h.id !== id), next]
}

function removeChoiceHotspot(hotspots: Hotspot[], branch: Branch): Hotspot[] {
  const existing = findChoiceHotspot(hotspots, branch)
  if (!existing) return hotspots
  return hotspots.filter((h) => h.id !== existing.id)
}

function isTimedDecision(decision: DecisionSpec | undefined): boolean {
  return decision?.optType === 'timed' || decision?.mode === 'timed' || decision?.mode === 'wait'
}

function firstEntityId(scenario: Scenario, kind: 'boss' | 'player'): string {
  return Object.values(scenario.entities ?? {}).find((e) => e.kind === kind)?.id ?? `ent-${kind}`
}

function hpEffectValue(effects: Effect[] | undefined): number {
  const eff = effects?.find((e): e is EntityStatEffect => e.kind === 'entityStat' && e.stat === 'hp')
  return Math.abs(Number(eff?.value ?? 0))
}

function hpEffectTarget(effects: Effect[] | undefined, scenario: Scenario): 'boss' | 'player' {
  const eff = effects?.find((e): e is EntityStatEffect => e.kind === 'entityStat' && e.stat === 'hp')
  const entity = eff ? scenario.entities?.[eff.entityId] : undefined
  return entity?.kind === 'player' ? 'player' : 'boss'
}

function withHpEffect(effects: Effect[] | undefined, scenario: Scenario, target: 'boss' | 'player', value: number, idPrefix: string): Effect[] {
  const entityId = firstEntityId(scenario, target)
  const effect: EntityStatEffect = {
    id: `${idPrefix}-${target}-hp`,
    kind: 'entityStat',
    entityId,
    stat: 'hp',
    op: 'add',
    value: -Math.abs(Number.isFinite(value) ? value : 0),
  }
  const list = effects ?? []
  return list.some((e) => e.kind === 'entityStat' && e.stat === 'hp')
    ? list.map((e) => (e.kind === 'entityStat' && e.stat === 'hp' ? effect : e))
    : [effect, ...list]
}

export function BlueprintGameplayPanel({ onCollapse }: { onCollapse?: () => void }) {
  injectStyleOnce('bp-gameplay-panel', PANEL_CSS)
  const scenario = useScenarioStore((s) => s.scenario)
  const selectedSceneId = useScenarioStore((s) => s.selectedSceneId)
  const updateScene = useScenarioStore((s) => s.updateScene)
  const upsertVariable = useScenarioStore((s) => s.upsertVariable)

  const scene = scenario.scenes[selectedSceneId]
  if (!scene) return null

  const panelKind = scene.boss ? 'battle' : scene.qte?.cues.length ? 'qte' : scene.decision ? 'choice' : 'story'
  const hasPerformance = sceneHasPerformance(scene)
  const clip = hasPerformance ? getVideoClip(scene.clipId) : undefined
  const sceneIds = Object.keys(scenario.scenes)
  const entityEntries = Object.entries(scenario.entities ?? {})
  const bossEntities = entityEntries.filter(([, e]) => e.kind === 'boss')
  const playerEntities = entityEntries.filter(([, e]) => e.kind === 'player')
  const flagVars = Object.values(scenario.variables ?? {}).filter((v) => v.kind === 'flag')
  const numberVars = Object.values(scenario.variables ?? {}).filter((v) => v.kind === 'number')
  const items = Object.values(scenario.items ?? {})
  const choiceBranches = scene.branches.filter((b) => b.kind === 'choice')
  const timedDecision = isTimedDecision(scene.decision)
  const sceneTitles = scenario.scenes

  function setDecision(patch: Partial<DecisionSpec> | null): void {
    if (patch === null) {
      updateScene(selectedSceneId, {
        decision: undefined,
        branches: scene!.branches.map((branch) =>
          branch.kind === 'choice' ? { ...branch, kind: 'auto' } : branch,
        ),
      })
      return
    }
    const cur: DecisionSpec = scene!.decision ?? { mode: 'pause' }
    updateScene(selectedSceneId, { decision: { ...cur, ...patch } })
  }

  function setRounds(rounds: BossRound[]): void {
    if (!scene!.boss) return
    updateScene(selectedSceneId, { boss: { ...scene!.boss, rounds } })
  }

  function setChoiceUi(choiceUi: 'default' | 'battleSkillBar'): void {
    const nextExt: Record<string, unknown> = { ...(scene!.ext ?? {}) }
    if (choiceUi === 'default') delete nextExt.choiceUi
    else nextExt.choiceUi = choiceUi
    updateScene(selectedSceneId, { ext: Object.keys(nextExt).length > 0 ? nextExt : undefined })
  }

  function setQteUi(qteUi: 'default' | 'battleParry'): void {
    const nextExt: Record<string, unknown> = { ...(scene!.ext ?? {}) }
    if (qteUi === 'default') delete nextExt.qteUi
    else nextExt.qteUi = qteUi
    updateScene(selectedSceneId, { ext: Object.keys(nextExt).length > 0 ? nextExt : undefined })
  }

  function defaultChoiceTarget(): string {
    return Object.keys(scenario.scenes).find((id) => id !== selectedSceneId) ?? selectedSceneId
  }

  function addChoiceBranch(): void {
    const id = `choice-${Date.now().toString(36)}`
    updateScene(selectedSceneId, {
      decision: scene!.decision ?? { optType: 'static', mode: 'pause', prompt: '请选择' },
      kind: scene!.kind === 'choice' ? scene!.kind : 'choice',
      branches: [
        ...scene!.branches,
        {
          id,
          kind: 'choice',
          label: `选项 ${choiceBranches.length + 1}`,
          targetSceneId: defaultChoiceTarget(),
        },
      ],
    })
  }

  function removeChoiceBranch(branchId: string): void {
    const branches = scene!.branches.filter((b) => b.id !== branchId)
    const hasChoice = branches.some((b) => b.kind === 'choice')
    updateScene(selectedSceneId, {
      branches,
      decision: hasChoice ? scene!.decision : undefined,
      kind: hasChoice && scene!.kind !== 'choice' ? 'choice' : scene!.kind,
    })
  }

  return (
    <div className={`ks-bgp ks-kind-${panelKind}`} data-testid="bp-gameplay-panel">
      <div className="ks-bgp-head">
        <div className="ks-bgp-head-main">
          <span className="ks-bgp-title">{scene.title || selectedSceneId}</span>
          <span className="ks-bgp-sub">玩法字段</span>
        </div>
        {onCollapse && (
          <button
            type="button"
            className="ks-bgp-collapse"
            aria-label="收起配置"
            title="收起"
            onClick={onCollapse}
          >
            收起 ›
          </button>
        )}
      </div>

      <div className="ks-bgp-content">
      {/* 演出 —— 对齐原型「演出」组：有 clip 才展示完整演出字段；纯逻辑节点仅保留「无」 */}
      <section className="ks-bgp-sec">
        <label className="ks-bgp-lbl" title="当前节点引用的视频片段与播放方式。">演出</label>
        {!hasPerformance && (
          <p className="ks-bgp-hint">
            纯逻辑 / 隐藏计算节点：无独立演出；运行时逻辑叠加在上一段视频上执行，不会换片。
          </p>
        )}
        <div className="ks-bgp-field">
          <span className="ks-bgp-fk" title="绑定到该节点的视频片段；选「无」表示纯逻辑或占位节点。">演出编号</span>
          <select
            className="ks-bgp-input"
            value={scene.clipId ?? ''}
            onChange={(e) =>
              updateScene(selectedSceneId, { clipId: e.target.value || undefined })
            }
          >
            <option value="">无</option>
            {VIDEO_CLIPS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            {scene.clipId && !getVideoClip(scene.clipId) && (
              <option value={scene.clipId}>{scene.clipId}（自定义）</option>
            )}
          </select>
        </div>
        {hasPerformance && (
          <>
            <div className="ks-bgp-field">
              <span className="ks-bgp-fk" title="视频片段库里的类型信息，只读展示。">视频类型</span>
              <span className="ks-bgp-fv">{clip?.type ?? '—'}</span>
            </div>
            {clip && (
              <div className="ks-bgp-field">
                <span className="ks-bgp-fk" title="单次播放或循环播放；loop 常用于待机/探索场合。">演出方式</span>
                <select
                  className="ks-bgp-input"
                  value={scene.mediaPlayMode ?? (clip.type === 'loop' ? 'loop' : 'once')}
                  onChange={(e) =>
                    updateScene(selectedSceneId, {
                      mediaPlayMode:
                        (e.target.value as MediaPlayMode) === 'once'
                          ? undefined
                          : (e.target.value as MediaPlayMode),
                    })
                  }
                >
                  <option value="once">单次</option>
                  <option value="loop">循环</option>
                </select>
              </div>
            )}
            <div className="ks-bgp-field">
              <span className="ks-bgp-fk" title="来自视频片段库的时长信息，只读展示。">演出时长</span>
              <span className="ks-bgp-fv">
                {clip?.durMs != null ? `${Math.round(clip.durMs / 1000)}s` : '—'}
              </span>
            </div>
          </>
        )}
      </section>

      {/* 界面 —— HUD 方案取自左栏「界面」固定库（UI_SCHEMES），二者同源 */}
      <section className="ks-bgp-sec">
        <label className="ks-bgp-lbl" title="该节点播放时叠加的 HUD 方案，例如战斗界面、探索界面或隐藏界面。">界面</label>
        <div className="ks-bgp-field">
          <span className="ks-bgp-fk" title="只控制显示层，不等同于节点的玩法逻辑。">HUD 方案</span>
          <select
            className="ks-bgp-input"
            value={scene.hudPreset ?? 'main'}
            onChange={(e) =>
              updateScene(selectedSceneId, {
                hudPreset:
                  (e.target.value as HudPreset) === 'main'
                    ? undefined
                    : (e.target.value as HudPreset),
              })
            }
          >
            {UI_SCHEMES.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {hasPerformance && (
        <PerformanceCuesSection
          scenario={scenario}
          cues={scene.performance?.cues ?? []}
          durationMs={scene.durationMs}
          onChange={(next) =>
            updateScene(selectedSceneId, { performance: next.length ? { cues: next } : undefined })
          }
        />
      )}

      {/* 选项 —— 对齐原型「选项 / 限时 QTE」组 */}
      <section className="ks-bgp-sec">
        <label className="ks-bgp-lbl" title="配置该节点是否弹出选项、倒计时或限时 QTE；实际去向由 choice / qte 分支连线决定。">选项</label>
        <div className="ks-bgp-field">
          <span className="ks-bgp-fk">类型</span>
          <select
            className="ks-bgp-input"
            value={scene.decision?.optType ?? (scene.decision?.mode === 'timed' || scene.decision?.mode === 'wait' ? 'timed' : scene.decision ? 'static' : 'none')}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'none') {
                setDecision(null)
                return
              }
              const optType = v as DecisionOptType
              setDecision({
                optType,
                mode: optType === 'timed' ? 'wait' : optType === 'static' ? 'pause' : undefined,
              })
            }}
          >
            <option value="none">无（场景结束出选项）</option>
            <option value="static">不限时选项</option>
            <option value="timed">限时选项</option>
            <option value="timed_qte">限时 QTE</option>
          </select>
        </div>

        {scene.decision?.optType === 'timed_qte' ? (
          <>
            <div className="ks-bgp-field">
              <span className="ks-bgp-fk">QTE 类型</span>
              <select
                className="ks-bgp-input"
                value={scene.decision.qteKind ?? 'timing'}
                onChange={(e) => setDecision({ qteKind: e.target.value as QteKind })}
              >
                <option value="parry">防反 QTE</option>
                <option value="timing">精准时点</option>
                <option value="mash">快速连打</option>
                <option value="sequence">方向序列</option>
                <option value="sweep">摇杆划动</option>
              </select>
            </div>
            <div className="ks-bgp-field">
              <span className="ks-bgp-fk">QTE UI</span>
              <select
                className="ks-bgp-input"
                value={scene.ext?.qteUi === 'battleParry' ? 'battleParry' : 'default'}
                onChange={(e) => setQteUi(e.target.value as 'default' | 'battleParry')}
              >
                <option value="default">默认 QTE 按钮</option>
                <option value="battleParry">战斗防反按键</option>
              </select>
            </div>
          </>
        ) : scene.decision ? (
          <>
            <div className="ks-bgp-field">
              <span className="ks-bgp-fk">按钮样式</span>
              <select
                className="ks-bgp-input"
                value={scene.ext?.choiceUi === 'battleSkillBar' ? 'battleSkillBar' : 'default'}
                onChange={(e) => setChoiceUi(e.target.value as 'default' | 'battleSkillBar')}
              >
                <option value="default">默认选择卡片</option>
                <option value="battleSkillBar">战斗技能栏</option>
              </select>
            </div>
            {!timedDecision && (
              <div className="ks-bgp-field">
                <span className="ks-bgp-fk">呈现方式</span>
                <select
                  className="ks-bgp-input"
                  value={scene.decision.presentation ?? 'list'}
                  onChange={(e) =>
                    setDecision({ presentation: e.target.value as ChoicePresentation })
                  }
                >
                  <option value="list">清单呈现</option>
                  <option value="hotspot">画面热区</option>
                </select>
              </div>
            )}
            {timedDecision && (
              <>
                <div className="ks-bgp-field">
                  <span className="ks-bgp-fk">倒计时</span>
                  <input
                    className="ks-bgp-input"
                    type="number"
                    min={500}
                    step={500}
                    placeholder="倒计时 ms"
                    value={scene.decision.timeoutMs ?? ''}
                    onChange={(e) =>
                      setDecision({ timeoutMs: e.target.value ? Number(e.target.value) : undefined })
                    }
                  />
                </div>
                <div className="ks-bgp-field">
                  <span className="ks-bgp-fk">超时默认</span>
                  <select
                    className="ks-bgp-input"
                    value={scene.decision.defaultBranchId ?? ''}
                    onChange={(e) =>
                      setDecision({ defaultBranchId: e.target.value || undefined })
                    }
                  >
                    <option value="">超时默认走第一项</option>
                    {choiceBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label ?? sceneTitles[b.targetSceneId]?.title ?? b.targetSceneId}
                      </option>
                    ))}
                    {scene.decision.defaultBranchId &&
                      !choiceBranches.some((b) => b.id === scene.decision?.defaultBranchId) && (
                        <option value={scene.decision.defaultBranchId}>
                          {scene.decision.defaultBranchId}
                        </option>
                      )}
                  </select>
                </div>
              </>
            )}
            <div className="ks-bgp-field">
              <span className="ks-bgp-fk">窗口起点</span>
              <input
                className="ks-bgp-input"
                type="number"
                placeholder="窗口起点 ms"
                value={scene.decision.windowStartMs ?? ''}
                onChange={(e) =>
                  setDecision({ windowStartMs: e.target.value ? Number(e.target.value) : undefined })
                }
              />
            </div>
            <div className="ks-bgp-field">
              <span className="ks-bgp-fk">窗口终点</span>
              <input
                className="ks-bgp-input"
                type="number"
                placeholder="窗口终点 ms"
                value={scene.decision.windowEndMs ?? ''}
                onChange={(e) =>
                  setDecision({ windowEndMs: e.target.value ? Number(e.target.value) : undefined })
                }
              />
            </div>
            <div className="ks-bgp-field">
              <span className="ks-bgp-fk">跳转时点</span>
              <select
                className="ks-bgp-input"
                value={scene.decision.fireAt ?? 'on_pick'}
                onChange={(e) => setDecision({ fireAt: e.target.value as DecisionFireAt })}
              >
                <option value="on_pick">选完立即跳转</option>
                <option value="video_end">等视频结束再跳转</option>
              </select>
            </div>
            <div className="ks-bgp-field">
              <span className="ks-bgp-fk">提示文案</span>
              <input
                className="ks-bgp-input"
                type="text"
                placeholder="提示文案"
                value={scene.decision.prompt ?? ''}
                onChange={(e) => setDecision({ prompt: e.target.value || undefined })}
              />
            </div>
          </>
        ) : null}
      </section>

      <section className="ks-bgp-sec">
        <div className="ks-bgp-vidhead">
          <label className="ks-bgp-lbl" title="每个选项/出边的条件、跳转与状态变化。">分支</label>
          {scene.decision?.optType !== 'timed_qte' && (
            <button type="button" className="ks-bgp-linkbtn" onClick={addChoiceBranch}>
              + 添加选项
            </button>
          )}
        </div>
        {choiceBranches.length === 0 ? (
          <p className="ks-bgp-hint">当前节点没有 choice 分支。</p>
        ) : (
          <div className="ks-bgp-branches">
            {choiceBranches.map((branch) => (
              <BranchGateEditor
                key={branch.id}
                branch={branch}
                scenario={scenario}
                variables={Object.values(scenario.variables ?? {})}
                items={items}
                onPatch={(patch) =>
                  updateScene(selectedSceneId, {
                    branches: scene.branches.map((b) => (b.id === branch.id ? { ...b, ...patch } : b)),
                  })
                }
                onRemove={() => removeChoiceBranch(branch.id)}
              />
            ))}
          </div>
        )}
      </section>

      {scene.decision?.presentation === 'hotspot' && !timedDecision && (
        <ChoiceHotspotsSection
          branches={choiceBranches}
          sceneTitles={sceneTitles}
          hotspots={scene.hotspots ?? []}
          onChange={(hotspots) =>
            updateScene(selectedSceneId, { hotspots: hotspots.length ? hotspots : undefined })
          }
        />
      )}

      <NumericAttrsSection
        scenario={scenario}
        effects={scene.onEnterEffects ?? []}
        numberVars={numberVars}
        onChange={(next) =>
          updateScene(selectedSceneId, { onEnterEffects: next.length ? next : undefined })
        }
        onCreateVariable={(name) => {
          const id = uniqueVariableId(scenario.variables ?? {}, name)
          upsertVariable({ id, name, kind: 'number', initial: 0 })
          return id
        }}
      />

      {/* Boss 战（仅 battle） */}
      {scene.boss && (
        <section className="ks-bgp-sec">
          <label className="ks-bgp-lbl" title="配置 Boss 实体、胜负去向和回合伤害。">Boss 战</label>
          {bossEntities.length === 0 ? (
            <p className="ks-bgp-hint">先在剧本里登记 kind=&apos;boss&apos; 的实体</p>
          ) : (
            <>
              <select
                className="ks-bgp-input"
                value={scene.boss?.entityId ?? ''}
                onChange={(e) =>
                  updateScene(selectedSceneId, {
                    boss: {
                      entityId: e.target.value,
                      rounds: scene.boss?.rounds ?? [],
                      playerEntityId: scene.boss?.playerEntityId,
                      winSceneId: scene.boss?.winSceneId,
                      loseSceneId: scene.boss?.loseSceneId,
                      perfectFlagVarId: scene.boss?.perfectFlagVarId,
                    },
                  })
                }
              >
                <option value="">选择 Boss 实体…</option>
                {bossEntities.map(([id, e]) => (
                  <option key={id} value={id}>
                    {e.name}
                  </option>
                ))}
              </select>

              {scene.boss?.entityId && (
                <>
                  <SceneSelect
                    label="胜利跳转"
                    value={scene.boss.winSceneId}
                    sceneIds={sceneIds}
                    onChange={(v) =>
                      updateScene(selectedSceneId, { boss: { ...scene.boss!, winSceneId: v } })
                    }
                  />
                  <SceneSelect
                    label="失败跳转"
                    value={scene.boss.loseSceneId}
                    sceneIds={sceneIds}
                    onChange={(v) =>
                      updateScene(selectedSceneId, { boss: { ...scene.boss!, loseSceneId: v } })
                    }
                  />
                  {playerEntities.length > 0 && (
                    <select
                      className="ks-bgp-input"
                      value={scene.boss.playerEntityId ?? ''}
                      onChange={(e) =>
                        updateScene(selectedSceneId, {
                          boss: { ...scene.boss!, playerEntityId: e.target.value || undefined },
                        })
                      }
                    >
                      <option value="">玩家实体（默认取第一个 player）</option>
                      {playerEntities.map(([id, e]) => (
                        <option key={id} value={id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {flagVars.length > 0 && (
                    <select
                      className="ks-bgp-input"
                      value={scene.boss.perfectFlagVarId ?? ''}
                      onChange={(e) =>
                        updateScene(selectedSceneId, {
                          boss: { ...scene.boss!, perfectFlagVarId: e.target.value || undefined },
                        })
                      }
                    >
                      <option value="">完美通关 flag（解锁隐藏结局）</option>
                      {flagVars.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* 回合列表 */}
                  <div className="ks-bgp-rounds">
                    {(scene.boss.rounds ?? []).map((r, i) => (
                      <div key={r.id} className="ks-bgp-round">
                        <input
                          className="ks-bgp-input ks-bgp-round-label"
                          type="text"
                          placeholder={`回合${i + 1} 招式名`}
                          value={r.label ?? ''}
                          onChange={(e) =>
                            setRounds(
                              scene.boss!.rounds.map((x) =>
                                x.id === r.id ? { ...x, label: e.target.value || undefined } : x,
                              ),
                            )
                          }
                        />
                        <input
                          className="ks-bgp-input ks-bgp-round-dmg"
                          type="number"
                          title="命中→Boss 伤害"
                          placeholder="→Boss"
                          value={hpEffectValue(r.hitEffects)}
                          onChange={(e) =>
                            setRounds(
                              scene.boss!.rounds.map((x) =>
                                x.id === r.id
                                  ? { ...x, hitEffects: withHpEffect(x.hitEffects, scenario, 'boss', Number(e.target.value) || 0, `${x.id}-hit`) }
                                  : x,
                              ),
                            )
                          }
                        />
                        <input
                          className="ks-bgp-input ks-bgp-round-dmg"
                          type="number"
                          title="失手→玩家 伤害"
                          placeholder="→我"
                          value={hpEffectValue(r.missEffects)}
                          onChange={(e) =>
                            setRounds(
                              scene.boss!.rounds.map((x) =>
                                x.id === r.id
                                  ? { ...x, missEffects: withHpEffect(x.missEffects, scenario, 'player', Number(e.target.value) || 0, `${x.id}-miss`) }
                                  : x,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          className="ks-bgp-round-del"
                          title="删除回合"
                          onClick={() => setRounds(scene.boss!.rounds.filter((x) => x.id !== r.id))}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="ks-bgp-add"
                      onClick={() =>
                        setRounds([
                          ...(scene.boss?.rounds ?? []),
                          {
                            id: `r${Date.now().toString(36)}`,
                            hitEffects: withHpEffect([], scenario, 'boss', 25, `r${Date.now().toString(36)}-hit`),
                            missEffects: withHpEffect([], scenario, 'player', 20, `r${Date.now().toString(36)}-miss`),
                          },
                        ])
                      }
                    >
                      + 添加回合
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}

      <SceneFlagsSection
        flags={scene.setFlags ?? []}
        flagVars={flagVars}
        onChange={(next) => updateScene(selectedSceneId, { setFlags: next.length ? next : undefined })}
      />

      <section className="ks-bgp-sec">
        <label className="ks-bgp-check">
          <input
            type="checkbox"
            checked={!!scene.returnsToCaller}
            onChange={(e) => updateScene(selectedSceneId, { returnsToCaller: e.target.checked || undefined })}
          />
          子流程返回点（热点 call/return 出口）
        </label>
      </section>

      <VideoGenSection
        sceneId={selectedSceneId}
        title={scene.title}
        ext={scene.ext}
        onChange={(next) => updateScene(selectedSceneId, { ext: next })}
      />

      <ExtAttrsSection
        ext={scene.ext}
        onChange={(next) => updateScene(selectedSceneId, { ext: next })}
      />
      </div>
    </div>
  )
}

function SceneFlagsSection({
  flags,
  flagVars,
  onChange,
}: {
  flags: string[]
  flagVars: { id: string; name: string }[]
  onChange: (next: string[]) => void
}) {
  if (flagVars.length === 0 && flags.length === 0) return null

  function patch(i: number, flagId: string): void {
    const next = flags.slice()
    next[i] = flagId
    onChange(next.filter(Boolean))
  }

  return (
    <section className="ks-bgp-sec">
      <label className="ks-bgp-lbl" title="进入该节点时记下的剧情状态，供后续分支条件使用。">剧情标记</label>
      {flags.map((flagId, i) => (
        <div key={`${flagId}-${i}`} className="ks-bgp-row">
          <select
            className="ks-bgp-input"
            value={flagId}
            onChange={(e) => patch(i, e.target.value)}
          >
            <option value="">选择标记…</option>
            {flagVars.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
            {flagId && !flagVars.some((v) => v.id === flagId) && (
              <option value={flagId}>{flagId}</option>
            )}
          </select>
          <button
            type="button"
            className="ks-bgp-round-del"
            onClick={() => onChange(flags.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      {flagVars.length > 0 && (
        <button type="button" className="ks-bgp-add" onClick={() => onChange([...flags, ''])}>
          + 添加标记
        </button>
      )}
    </section>
  )
}

function PerformanceCuesSection({
  scenario,
  cues,
  durationMs,
  onChange,
}: {
  scenario: Scenario
  cues: PerformanceCue[]
  durationMs: number
  onChange: (next: PerformanceCue[]) => void
}) {
  function patch(id: string, next: PerformanceCue): void {
    onChange(cues.map((cue) => (cue.id === id ? next : cue)))
  }

  function addCue(): void {
    onChange([
      ...cues,
      {
        id: `judge-${Date.now().toString(36)}`,
        atMs: Math.min(Math.max(0, durationMs), 1000),
        effects: withHpEffect([], scenario, 'boss', 100, `judge-${Date.now().toString(36)}`),
        label: '命中',
      },
    ])
  }

  const total = cues.reduce((sum, cue) => sum + hpEffectValue(cue.effects), 0)

  return (
    <section className="ks-bgp-sec">
      <div className="ks-bgp-vidhead">
        <label className="ks-bgp-lbl" title="真实判定事件；蓝图和视频时间轴共用这一组数据。">判定</label>
        {cues.length > 0 && <span className="ks-bgp-calc-total">总计 {total}</span>}
      </div>
      {cues.length === 0 ? (
        <p className="ks-bgp-hint">暂无判定项。</p>
      ) : (
        <div className="ks-bgp-calcs">
          {cues.map((cue, i) => (
            <PerformanceCueRow
              key={cue.id}
              cue={cue}
              index={i}
              scenario={scenario}
              durationMs={durationMs}
              onChange={(next) => patch(cue.id, next)}
              onRemove={() => onChange(cues.filter((c) => c.id !== cue.id))}
            />
          ))}
        </div>
      )}
      <button type="button" className="ks-bgp-add" onClick={addCue}>
        + 添加判定
      </button>
    </section>
  )
}

function PerformanceCueRow({
  cue,
  index,
  scenario,
  durationMs,
  onChange,
  onRemove,
}: {
  cue: PerformanceCue
  index: number
  scenario: Scenario
  durationMs: number
  onChange: (next: PerformanceCue) => void
  onRemove: () => void
}) {
  const target = hpEffectTarget(cue.effects, scenario)
  const value = hpEffectValue(cue.effects)

  function setTarget(nextTarget: 'boss' | 'player'): void {
    onChange({ ...cue, effects: withHpEffect(cue.effects, scenario, nextTarget, value, cue.id) })
  }

  function setValue(nextValue: number): void {
    const n = Number.isFinite(nextValue) ? Math.max(0, nextValue) : 0
    onChange({ ...cue, effects: withHpEffect(cue.effects, scenario, target, n, cue.id) })
  }

  return (
    <div className="ks-bgp-calc-row">
      <span className="ks-bgp-calc-no">{index + 1}</span>
      <input
        className="ks-bgp-input"
        type="text"
        placeholder="标签"
        value={cue.label ?? ''}
        onChange={(e) => onChange({ ...cue, label: e.target.value || undefined })}
      />
      <select
        className="ks-bgp-input"
        value={target}
        onChange={(e) => setTarget(e.target.value as 'boss' | 'player')}
      >
        <option value="boss">Boss</option>
        <option value="player">玩家</option>
      </select>
      <input
        className="ks-bgp-input"
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
      />
      <input
        className="ks-bgp-input"
        type="number"
        min={0}
        max={durationMs}
        title="结算时刻(ms)"
        value={cue.atMs}
        onChange={(e) => onChange({ ...cue, atMs: Math.max(0, Number(e.target.value) || 0) })}
      />
      <button type="button" className="ks-bgp-round-del" title="删除判定项" onClick={onRemove}>
        ✕
      </button>
    </div>
  )
}

type NumericAttrOp = 'add' | 'sub' | 'set'

type AttributeOption =
  | { key: string; label: string; kind: 'var'; varId: string }
  | { key: string; label: string; kind: 'entityStat'; entityId: string; stat: 'hp' }

function attributeOptions(scenario: Scenario, numberVars: GameVariable[]): AttributeOption[] {
  const variableOptions: AttributeOption[] = numberVars.map((v) => ({
    key: `var:${v.id}`,
    label: v.name || v.id,
    kind: 'var',
    varId: v.id,
  }))
  const entityOptions: AttributeOption[] = Object.values(scenario.entities ?? {}).map((e) => ({
    key: `entity:${e.id}:hp`,
    label: `${e.name || e.id} · HP`,
    kind: 'entityStat',
    entityId: e.id,
    stat: 'hp',
  }))
  return [...variableOptions, ...entityOptions]
}

function attributeKey(effect: VarEffect | EntityStatEffect): string {
  return effect.kind === 'var'
    ? `var:${effect.varId}`
    : `entity:${effect.entityId}:${effect.stat}`
}

function fallbackAttributeOption(effect: VarEffect | EntityStatEffect, scenario: Scenario): AttributeOption {
  if (effect.kind === 'var') {
    return {
      key: `var:${effect.varId}`,
      label: scenario.variables?.[effect.varId]?.name ?? effect.varId,
      kind: 'var',
      varId: effect.varId,
    }
  }
  return {
    key: `entity:${effect.entityId}:hp`,
    label: `${scenario.entities?.[effect.entityId]?.name ?? effect.entityId} · HP`,
    kind: 'entityStat',
    entityId: effect.entityId,
    stat: 'hp',
  }
}

function NumericAttrsSection({
  scenario,
  effects,
  numberVars,
  onChange,
  onCreateVariable,
}: {
  scenario: Scenario
  effects: Effect[]
  numberVars: GameVariable[]
  onChange: (next: Effect[]) => void
  onCreateVariable: (name: string) => string
}) {
  const [newName, setNewName] = useState('')
  const options = attributeOptions(scenario, numberVars)
  const attrEffects = effects.filter((e): e is VarEffect | EntityStatEffect =>
    e.kind === 'var' || (e.kind === 'entityStat' && e.stat === 'hp'),
  )
  const otherEffects = effects.filter((e) => !attrEffects.includes(e as VarEffect | EntityStatEffect))

  function addExisting(): void {
    const first = options[0]
    if (!first) return
    onChange([...effects, effectFromAttribute(`attr-${Date.now().toString(36)}`, first.key, 'add', 1, options)])
  }

  function addNew(): void {
    const name = newName.trim()
    if (!name) return
    const varId = onCreateVariable(name)
    onChange([...effects, { id: `var-${Date.now().toString(36)}`, kind: 'var', varId, op: 'add', value: 1 }])
    setNewName('')
  }

  function patch(id: string, next: VarEffect | EntityStatEffect): void {
    onChange([...otherEffects, ...attrEffects.map((e) => (e.id === id ? next : e))])
  }

  return (
    <section className="ks-bgp-sec">
      <label className="ks-bgp-lbl" title="进入该节点时结算的数值变化，试玩运行时会真实生效。">属性</label>
      {attrEffects.length === 0 && (
        <p className="ks-bgp-hint">暂无节点属性；可从全局数值和实体 HP 中选择。</p>
      )}
      {attrEffects.length > 0 && (
        <div className="ks-bgp-stats">
          {attrEffects.map((effect) => (
            <NumericAttrRow
              key={effect.id}
              effect={effect}
              options={options.some((o) => o.key === attributeKey(effect)) ? options : [...options, fallbackAttributeOption(effect, scenario)]}
              onChange={(next) => patch(effect.id, next)}
              onRemove={() => onChange([...otherEffects, ...attrEffects.filter((e) => e.id !== effect.id)])}
            />
          ))}
        </div>
      )}
      {options.length > 0 && (
        <button type="button" className="ks-bgp-add" onClick={addExisting}>
          + 添加属性
        </button>
      )}
      <div className="ks-bgp-row">
        <input
          className="ks-bgp-input"
          type="text"
          placeholder="新增属性名，如 士气"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addNew()
            }
          }}
        />
        <button type="button" className="ks-bgp-add ks-bgp-add--inline" onClick={addNew}>
          新建
        </button>
      </div>
    </section>
  )
}

function NumericAttrRow({
  effect,
  options,
  onChange,
  onRemove,
}: {
  effect: VarEffect | EntityStatEffect
  options: AttributeOption[]
  onChange: (next: VarEffect | EntityStatEffect) => void
  onRemove: () => void
}) {
  const op = numericAttrOp(effect)
  const amount = numericAttrAmount(effect)
  const selected = attributeKey(effect)
  return (
    <div className="ks-bgp-stat-row">
      <select
        className="ks-bgp-input"
        value={selected}
        onChange={(e) => onChange(effectFromAttribute(effect.id, e.target.value, op, amount, options))}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        className="ks-bgp-input"
        value={op}
        onChange={(e) => onChange(effectFromAttribute(effect.id, selected, e.target.value as NumericAttrOp, amount, options))}
      >
        <option value="add">加</option>
        <option value="sub">减</option>
        <option value="set">初始</option>
      </select>
      <input
        className="ks-bgp-input"
        type="number"
        value={amount}
        onChange={(e) => onChange(effectFromAttribute(effect.id, selected, op, Number(e.target.value), options))}
      />
      <button type="button" className="ks-bgp-round-del" title="删除属性" onClick={onRemove}>
        ✕
      </button>
    </div>
  )
}

function numericAttrOp(effect: VarEffect | EntityStatEffect): NumericAttrOp {
  if (effect.op === 'set') return 'set'
  return effect.value < 0 ? 'sub' : 'add'
}

function numericAttrAmount(effect: VarEffect | EntityStatEffect): number {
  return effect.op === 'add' ? Math.abs(effect.value) : effect.value
}

function effectFromAttribute(
  id: string,
  optionKey: string,
  op: NumericAttrOp,
  rawValue: number,
  options: AttributeOption[],
): VarEffect | EntityStatEffect {
  const option = options.find((o) => o.key === optionKey) ?? options[0]
  const value = Number.isFinite(rawValue) ? rawValue : 0
  const nextValue = op === 'set' ? value : op === 'sub' ? -Math.abs(value) : Math.abs(value)
  if (!option || option.kind === 'var') {
    return {
      id,
      kind: 'var',
      varId: option?.kind === 'var' ? option.varId : '',
      op: op === 'set' ? 'set' : 'add',
      value: nextValue,
    }
  }
  return {
    id,
    kind: 'entityStat',
    entityId: option.entityId,
    stat: option.stat,
    op: op === 'set' ? 'set' : 'add',
    value: nextValue,
  }
}

function uniqueVariableId(existing: Record<string, GameVariable>, name: string): string {
  const ascii = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const stem = ascii ? `var-${ascii}` : `var-${Date.now().toString(36)}`
  let id = stem
  let i = 2
  while (existing[id]) {
    id = `${stem}-${i}`
    i += 1
  }
  return id
}

/**
 * 画面选项热区 —— 不新增 schema，只把现有 scene.hotspots 作为 choice 分支的画面坐标配置。
 */
function ChoiceHotspotsSection({
  branches,
  sceneTitles,
  hotspots,
  onChange,
}: {
  branches: Branch[]
  sceneTitles: Record<string, { title?: string }>
  hotspots: Hotspot[]
  onChange: (next: Hotspot[]) => void
}) {
  const emptyHotspots = hotspots.filter(isEmptyHotspot)

  function patch(branch: Branch, p: Partial<Hotspot>): void {
    onChange(upsertChoiceHotspot(hotspots, branch, p))
  }

  function enableAll(): void {
    let next = hotspots
    branches.forEach((branch, i) => {
      const x = (i + 1) / (branches.length + 1)
      next = upsertChoiceHotspot(next, branch, { x, y: 0.55 })
    })
    onChange(next)
  }

  return (
    <section className="ks-bgp-sec">
      <div className="ks-bgp-vidhead">
        <label className="ks-bgp-lbl" title="把 choice 分支显示为视频画面上的可点击区域；跳转目标仍由分支连线决定。">画面选项热区</label>
        {branches.length > 0 && (
          <button type="button" className="ks-bgp-linkbtn" onClick={enableAll}>
            补齐
          </button>
        )}
      </div>
      {branches.length === 0 ? (
        <p className="ks-bgp-hint">当前节点没有 choice 分支，先在蓝图里连出选项。</p>
      ) : (
        branches.map((branch, i) => {
          const hotspot = findChoiceHotspot(hotspots, branch)
          const target = branch.targetSceneId
          const targetTitle = sceneTitles[target]?.title ?? target
          const xPct = Math.round(((hotspot?.x ?? (i + 1) / (branches.length + 1)) * 100) * 10) / 10
          const yPct = Math.round(((hotspot?.y ?? 0.55) * 100) * 10) / 10
          const rPct = Math.round(((hotspot?.r ?? 0.08) * 100) * 10) / 10
          return (
            <div key={branch.id} className="ks-bgp-hotspot-card">
              <div className="ks-bgp-hotspot-head">
                <span className="ks-bgp-hotspot-title">{branch.label ?? branch.id}</span>
                <span className="ks-bgp-hotspot-target">→ {targetTitle}</span>
              </div>
              {!hotspot ? (
                <button
                  type="button"
                  className="ks-bgp-add"
                  onClick={() => patch(branch, { x: xPct / 100, y: yPct / 100 })}
                >
                  启用这个选项的画面热区
                </button>
              ) : (
                <>
                  <input
                    className="ks-bgp-input"
                    type="text"
                    placeholder="画面提示名"
                    value={hotspot.label ?? branch.label ?? ''}
                    onChange={(e) => patch(branch, { label: e.target.value || undefined })}
                  />
                  <div className="ks-bgp-row">
                    <label className="ks-bgp-mini">
                      <span>X%</span>
                      <input
                        className="ks-bgp-input"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={xPct}
                        onChange={(e) => patch(branch, { x: Math.max(0, Math.min(100, Number(e.target.value))) / 100 })}
                      />
                    </label>
                    <label className="ks-bgp-mini">
                      <span>Y%</span>
                      <input
                        className="ks-bgp-input"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={yPct}
                        onChange={(e) => patch(branch, { y: Math.max(0, Math.min(100, Number(e.target.value))) / 100 })}
                      />
                    </label>
                    <label className="ks-bgp-mini">
                      <span>范围%</span>
                      <input
                        className="ks-bgp-input"
                        type="number"
                        min={2}
                        max={40}
                        step={1}
                        value={rPct}
                        onChange={(e) => patch(branch, { r: Math.max(2, Math.min(40, Number(e.target.value))) / 100 })}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="ks-bgp-round-del ks-bgp-hotspot-remove"
                    onClick={() => onChange(removeChoiceHotspot(hotspots, branch))}
                  >
                    关闭这个热区
                  </button>
                </>
              )}
            </div>
          )
        })
      )}
      {emptyHotspots.length > 0 && (
        <button
          type="button"
          className="ks-bgp-add"
          onClick={() => onChange(hotspots.filter((h) => !isEmptyHotspot(h)))}
        >
          清理 {emptyHotspots.length} 个未绑定热区
        </button>
      )}
    </section>
  )
}

/**
 * ext 里被一等区块占用的保留键 —— 扩展属性区会隐藏它们，避免和专门的编辑区
 * （如「视频生成」用 ext.video）重复编辑同一份数据。
 */
const RESERVED_EXT_KEYS = ['video', 'choiceUi', 'qteUi']

/** 节点级视频生成配置（落在 Scene.ext.video，借 seedance 字段精简而来）。 */
interface VideoGenConfig {
  prompt?: string
  durationSec?: number
  size?: string
  firstFrame?: string
  lastFrame?: string
  stitchPrev?: boolean
}

function readVideoConfig(ext: Record<string, unknown> | undefined): VideoGenConfig {
  const v = ext?.video
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as VideoGenConfig) : {}
}

/**
 * VideoGenSection —— 蓝图节点的「生成视频」入口。
 *
 * 配置（提示词 / 时长 / 尺寸 / 首尾帧 / 衔接）落在 Scene.ext.video（用 stage② 的
 * 扩展位，不新造 typed 字段）；「添加到对话」把配置打包成结构化中文指令，经
 * postMessage(FORGEAX_COMPOSER_INSERT) 预填到宿主 studio 主对话框，由作者发送、
 * Nodia 据此调 gvid:generate-video。生成本身永远走 chat（不在工坊内联直连）。
 */
function VideoGenSection({
  sceneId,
  title,
  ext,
  onChange,
}: {
  sceneId: string
  title: string
  ext: Record<string, unknown> | undefined
  onChange: (next: Record<string, unknown> | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const cfg = readVideoConfig(ext)

  function setCfg(patch: Partial<VideoGenConfig>): void {
    const merged: VideoGenConfig = { ...cfg, ...patch }
    const cleaned: VideoGenConfig = {}
    if (merged.prompt) cleaned.prompt = merged.prompt
    if (merged.durationSec) cleaned.durationSec = merged.durationSec
    if (merged.size) cleaned.size = merged.size
    if (merged.firstFrame) cleaned.firstFrame = merged.firstFrame
    if (merged.lastFrame) cleaned.lastFrame = merged.lastFrame
    if (merged.stitchPrev) cleaned.stitchPrev = true

    const nextExt: Record<string, unknown> = { ...(ext ?? {}) }
    if (Object.keys(cleaned).length > 0) nextExt.video = cleaned
    else delete nextExt.video
    onChange(Object.keys(nextExt).length > 0 ? nextExt : undefined)
  }

  function addToChat(): void {
    const text = [
      `请为蓝图节点「${title || sceneId}」生成视频（sceneId: ${sceneId}，调用 gvid:generate-video）：`,
      `- 画面提示词：${cfg.prompt?.trim() || '（沿用该节点已有视频提示词）'}`,
      `- 时长：${cfg.durationSec ? `${cfg.durationSec} 秒` : '默认'}`,
      `- 尺寸：${cfg.size || '默认'}`,
      `- 首帧：${cfg.firstFrame?.trim() || '无'}`,
      `- 尾帧：${cfg.lastFrame?.trim() || '无'}`,
      `- 衔接上一镜尾帧：${cfg.stitchPrev ? '是' : '否'}`,
    ].join('\n')
    try {
      window.parent?.postMessage({ type: 'FORGEAX_COMPOSER_INSERT', text }, '*')
    } catch {
      /* 不在 iframe 内 / 跨域受限：静默降级（standalone 调试态） */
    }
  }

  return (
    <section className="ks-bgp-sec">
      <div className="ks-bgp-vidhead">
        <label className="ks-bgp-lbl">视频生成</label>
        <button type="button" className="ks-bgp-vidtoggle" onClick={() => setOpen((o) => !o)}>
          {open ? '收起' : '配置 ▾'}
        </button>
      </div>
      {open && (
        <div className="ks-bgp-vidform">
          <textarea
            className="ks-bgp-input ks-bgp-vidprompt"
            rows={3}
            placeholder="画面提示词（留空 = 沿用该节点已有视频提示词）"
            value={cfg.prompt ?? ''}
            onChange={(e) => setCfg({ prompt: e.target.value || undefined })}
          />
          <div className="ks-bgp-row">
            <input
              className="ks-bgp-input"
              type="number"
              min={3}
              max={12}
              placeholder="时长(s)"
              value={cfg.durationSec ?? ''}
              onChange={(e) => setCfg({ durationSec: e.target.value ? Number(e.target.value) : undefined })}
            />
            <select
              className="ks-bgp-input"
              value={cfg.size ?? ''}
              onChange={(e) => setCfg({ size: e.target.value || undefined })}
            >
              <option value="">尺寸（默认）</option>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>
          <input
            className="ks-bgp-input"
            type="text"
            placeholder="首帧 URL（可选）"
            value={cfg.firstFrame ?? ''}
            onChange={(e) => setCfg({ firstFrame: e.target.value || undefined })}
          />
          <input
            className="ks-bgp-input"
            type="text"
            placeholder="尾帧 URL（可选）"
            value={cfg.lastFrame ?? ''}
            onChange={(e) => setCfg({ lastFrame: e.target.value || undefined })}
          />
          <label className="ks-bgp-check">
            <input
              type="checkbox"
              checked={!!cfg.stitchPrev}
              onChange={(e) => setCfg({ stitchPrev: e.target.checked })}
            />
            衔接上一镜尾帧（画面连贯）
          </label>
          <button type="button" className="ks-bgp-add ks-bgp-addchat" onClick={addToChat}>
            添加到对话（交给 Nodia 生成）
          </button>
        </div>
      )}
    </section>
  )
}

/**
 * 常用扩展属性键的「快捷添加」建议 —— 反映「常规情况下也有这些属性」，但不写死成
 * typed 字段：点一下即在 ext 里加一个空值，作者再填。已存在的键会从建议里隐藏。
 */
const EXT_SUGGESTIONS = ['界面方案', '阶段', '敌将', '限时(s)', '备注']

/**
 * ExtAttrsSection —— 节点级通用扩展属性编辑区（backed by Scene.ext）。
 *
 * typed 一等字段（场景类别/选择呈现/Boss…）之外的任意自定义玩法维度都落这里。
 * 键 = 属性名，值 = 文本或 JSON（标量/数组/对象皆可）。Nodia 也按规则写同一个 ext。
 */
function ExtAttrsSection({
  ext,
  onChange,
}: {
  ext: Record<string, unknown> | undefined
  onChange: (next: Record<string, unknown> | undefined) => void
}) {
  const entries = Object.entries(ext ?? {}).filter(([k]) => !RESERVED_EXT_KEYS.includes(k))
  const [newKey, setNewKey] = useState('')

  function setKey(key: string, value: unknown): void {
    onChange({ ...(ext ?? {}), [key]: value })
  }
  function removeKey(key: string): void {
    const next = { ...(ext ?? {}) }
    delete next[key]
    onChange(Object.keys(next).length > 0 ? next : undefined)
  }
  function addKey(key: string): void {
    const k = key.trim()
    if (!k || RESERVED_EXT_KEYS.includes(k) || (ext && k in ext)) return
    setKey(k, '')
    setNewKey('')
  }

  const suggestions = EXT_SUGGESTIONS.filter((s) => !ext || !(s in ext))

  return (
    <section className="ks-bgp-sec">
      <label className="ks-bgp-lbl">扩展属性</label>
      <p className="ks-bgp-hint">按规则自定义维度（Nodia 可写）；值支持文本或 JSON。</p>

      {entries.length > 0 && (
        <div className="ks-bgp-ext">
          {entries.map(([k, v]) => (
            <ExtRow
              key={k}
              attrKey={k}
              value={v}
              onChangeValue={(nv) => setKey(k, nv)}
              onRemove={() => removeKey(k)}
            />
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="ks-bgp-chips">
          {suggestions.map((s) => (
            <button key={s} type="button" className="ks-bgp-chip" onClick={() => addKey(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}

      <div className="ks-bgp-row">
        <input
          className="ks-bgp-input"
          type="text"
          placeholder="新增属性名…"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addKey(newKey)
            }
          }}
        />
        <button type="button" className="ks-bgp-add ks-bgp-add--inline" onClick={() => addKey(newKey)}>
          添加
        </button>
      </div>
    </section>
  )
}

/**
 * 单条扩展属性行。值用本地 raw 文本驱动输入，提交时尝试解析为 JSON（对象/数组/
 * 布尔/数字/null），失败则按纯文本存——这样标量与结构化值都能往返不丢。
 */
function ExtRow({
  attrKey,
  value,
  onChangeValue,
  onRemove,
}: {
  attrKey: string
  value: unknown
  onChangeValue: (next: unknown) => void
  onRemove: () => void
}) {
  const display = typeof value === 'string' ? value : JSON.stringify(value)
  const [raw, setRaw] = useState(display)

  // 外部（如 Nodia）改写同一个 ext 键时，同步回本地输入。
  useEffect(() => {
    setRaw(typeof value === 'string' ? value : JSON.stringify(value))
  }, [value])

  function commit(text: string): void {
    setRaw(text)
    onChangeValue(coerceExtValue(text))
  }

  return (
    <div className="ks-bgp-ext-row">
      <span className="ks-bgp-ext-key" title={attrKey}>
        {attrKey}
      </span>
      <input
        className="ks-bgp-input ks-bgp-ext-val"
        type="text"
        value={raw}
        onChange={(e) => commit(e.target.value)}
      />
      <button type="button" className="ks-bgp-round-del" title="删除属性" onClick={onRemove}>
        ✕
      </button>
    </div>
  )
}

/** 文本→值：能解析成 JSON 标量/结构就解析，否则原样当字符串。 */
function coerceExtValue(text: string): unknown {
  const t = text.trim()
  if (t === '') return ''
  const looksStructured =
    t.startsWith('{') ||
    t.startsWith('[') ||
    t === 'true' ||
    t === 'false' ||
    t === 'null' ||
    /^-?\d+(\.\d+)?$/.test(t)
  if (looksStructured) {
    try {
      return JSON.parse(t)
    } catch {
      return text
    }
  }
  return text
}

function SceneSelect({
  label,
  value,
  sceneIds,
  onChange,
}: {
  label: string
  value: string | undefined
  sceneIds: string[]
  onChange: (v: string | undefined) => void
}) {
  const scenario = useScenarioStore((s) => s.scenario)
  return (
    <select
      className="ks-bgp-input"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">{label}…</option>
      {sceneIds.map((id) => (
        <option key={id} value={id}>
          {scenario.scenes[id]?.title ?? id}
        </option>
      ))}
    </select>
  )
}

const PANEL_CSS = `
.ks-bgp {
  position: absolute;
  top: 12px; right: 12px; bottom: 12px;
  width: 300px;
  z-index: 12;
  display: flex; flex-direction: column; gap: 14px;
  padding: 16px;
  overflow-y: auto;
  background: rgba(12, 14, 22, 0.92);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.1);
  border-left: 3px solid var(--ks-kind, rgba(255,255,255,0.3));
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  color: rgba(255,255,255,0.9);
  font-size: 13px;
}
/* kind 主题色（与蓝图节点上色一致） */
.ks-bgp.ks-kind-story  { --ks-kind: #94a3b8; }
.ks-bgp.ks-kind-battle { --ks-kind: #ef4444; }
.ks-bgp.ks-kind-qte    { --ks-kind: #22d3ee; }
.ks-bgp.ks-kind-choice { --ks-kind: #f59e0b; }
.ks-bgp-head {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.ks-bgp-head-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.ks-bgp-collapse {
  all: unset;
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--ks-kind, rgba(255,255,255,0.7));
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  transition: color .12s ease, background .12s ease;
}
.ks-bgp-collapse:hover { color: #fff; background: rgba(255,255,255,0.14); }
.ks-bgp-title { font-size: 15px; font-weight: 600; color: #fff; }
.ks-bgp-sub { font-size: 11px; letter-spacing: 0.18em; color: var(--ks-kind); }
.ks-bgp-sec { display: flex; flex-direction: column; gap: 6px; }
.ks-bgp-lbl { font-size: 11px; letter-spacing: 0.1em; color: rgba(255,255,255,0.55); }
.ks-bgp-hint { font-size: 11px; color: rgba(255,255,255,0.45); margin: 0; }
.ks-bgp-input {
  width: 100%;
  padding: 6px 8px;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 6px;
  color: #fff; font-size: 12px;
  box-sizing: border-box;
}
.ks-bgp-row { display: flex; gap: 6px; }
/* 标签 + 控件成行（演出编号 / 视频类型 / 演出方式 / 演出时长 / HUD 方案） */
.ks-bgp-field { display: grid; grid-template-columns: 68px minmax(0, 1fr); align-items: center; gap: 8px; }
.ks-bgp-field .ks-bgp-input { width: 100%; }
.ks-bgp-fk { font-size: 12px; color: rgba(255,255,255,0.55); }
.ks-bgp-fv { font-size: 12px; color: #fff; text-align: right; font-variant-numeric: tabular-nums; }
.ks-bgp-rounds { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.ks-bgp-round { display: grid; grid-template-columns: 1fr 56px 56px 24px; gap: 4px; align-items: center; }
.ks-bgp-round-del {
  background: none; border: none; color: rgba(248,113,113,0.8);
  cursor: pointer; font-size: 13px; padding: 0;
}
.ks-bgp-add {
  padding: 6px; border-radius: 6px; cursor: pointer;
  background: rgba(255,255,255,0.06);
  border: 1px dashed rgba(255,255,255,0.22);
  color: rgba(255,255,255,0.75); font-size: 12px;
}
.ks-bgp-linkbtn {
  background: none;
  border: none;
  color: var(--ks-kind, rgba(255,255,255,0.7));
  cursor: pointer;
  font-size: 11px;
  padding: 0;
}
.ks-bgp-linkbtn:hover { color: #fff; }
.ks-bgp-check { display: flex; align-items: center; gap: 8px; font-size: 12px; color: rgba(255,255,255,0.82); cursor: pointer; }
.ks-bgp-hotspot-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(255,255,255,0.045);
  border: 1px solid rgba(255,255,255,0.1);
}
.ks-bgp-hotspot-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.ks-bgp-hotspot-title { color: #fff; font-size: 12px; font-weight: 600; }
.ks-bgp-hotspot-target {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255,255,255,0.42);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
}
.ks-bgp-mini { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.ks-bgp-mini span { font-size: 10px; color: rgba(255,255,255,0.45); }
.ks-bgp-hotspot-remove { align-self: flex-start; font-size: 12px; }

/* ── 判定项 ─────────────────────────────────────────── */
.ks-bgp-calc-total { font-size: 11px; color: rgba(255,255,255,0.62); font-variant-numeric: tabular-nums; }
.ks-bgp-calcs { display: flex; flex-direction: column; gap: 6px; }
.ks-bgp-calc-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 58px 56px 64px 24px;
  gap: 4px;
  align-items: center;
}
.ks-bgp-calc-no {
  color: var(--ks-kind, rgba(255,255,255,0.65));
  font-size: 11px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* ── 数值属性 ─────────────────────────────────────────── */
.ks-bgp-stats { display: flex; flex-direction: column; gap: 6px; }
.ks-bgp-stat-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 52px 58px 24px;
  gap: 4px;
  align-items: center;
}

/* ── 扩展属性 ─────────────────────────────────────────── */
.ks-bgp-ext { display: flex; flex-direction: column; gap: 6px; }
.ks-bgp-ext-row { display: grid; grid-template-columns: 88px 1fr 24px; gap: 6px; align-items: center; }
.ks-bgp-ext-key {
  font-size: 11px; color: rgba(255,255,255,0.7);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ks-bgp-ext-val { font-family: var(--font-mono, ui-monospace, monospace); }
.ks-bgp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ks-bgp-chip {
  padding: 3px 8px; border-radius: 999px; cursor: pointer; font-size: 11px;
  background: rgba(255,255,255,0.06);
  border: 1px dashed rgba(255,255,255,0.22);
  color: rgba(255,255,255,0.7);
}
.ks-bgp-chip:hover { color: #fff; border-color: rgba(255,255,255,0.4); }
.ks-bgp-add--inline { flex: none; padding: 6px 12px; }

/* ── 视频生成 ─────────────────────────────────────────── */
.ks-bgp-vidhead { display: flex; align-items: center; justify-content: space-between; }
.ks-bgp-vidtoggle {
  background: none; border: none; cursor: pointer; font-size: 11px;
  color: var(--ks-kind, rgba(255,255,255,0.7));
}
.ks-bgp-vidtoggle:hover { color: #fff; }
.ks-bgp-vidform { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
.ks-bgp-vidprompt { resize: vertical; min-height: 48px; line-height: 1.4; }
.ks-bgp-addchat {
  margin-top: 2px;
  background: color-mix(in srgb, var(--ks-kind, #22d3ee) 22%, transparent);
  border: 1px solid var(--ks-kind, rgba(255,255,255,0.3));
  color: #fff; font-weight: 600;
}
.ks-bgp-addchat:hover { background: color-mix(in srgb, var(--ks-kind, #22d3ee) 34%, transparent); }
`
