import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(
  resolve(import.meta.dirname, '../BlueprintGameplayPanel.tsx'),
  'utf8',
)

describe('BlueprintGameplayPanel presentation controls', () => {
  it('exposes battle skill bar as a first-class choice UI control backed by ext.choiceUi', () => {
    expect(SOURCE).toContain('setChoiceUi')
    expect(SOURCE).toContain('choiceUi')
    expect(SOURCE).toContain('battleSkillBar')
    expect(SOURCE).toContain('战斗技能栏')
  })

  it('hides choiceUi from the generic extension editor to avoid duplicate editing paths', () => {
    expect(SOURCE).toContain("RESERVED_EXT_KEYS = ['video', 'choiceUi', 'qteUi']")
  })

  it('exposes battle parry as a first-class QTE UI control backed by ext.qteUi', () => {
    expect(SOURCE).toContain('setQteUi')
    expect(SOURCE).toContain('qteUi')
    expect(SOURCE).toContain('battleParry')
    expect(SOURCE).toContain('战斗防反按键')
  })

  it('collapses performance detail fields when the scene has no clip (logic-only nodes)', () => {
    expect(SOURCE).toContain('function sceneHasPerformance')
    expect(SOURCE).toContain('纯逻辑 / 隐藏计算节点')
    expect(SOURCE).toContain('{hasPerformance && (')
  })

  it('exposes every out-edge (auto/qte/choice) to the branch editor, not only choice branches', () => {
    // 之前只渲染 choiceBranches → auto/qte 出边（含 hpRatio 条件、qteOutcome）无法编辑。
    expect(SOURCE).toContain('scene.branches.map((branch) => (')
    expect(SOURCE).toContain('分支 / 出边')
    // 仅 choice 分支保留删除入口，避免误删剧情树连线
    expect(SOURCE).toContain("branch.kind === 'choice' ? () => removeChoiceBranch(branch.id) : undefined")
  })

  it('exposes a QTE spec editor (window/score/timeout/outcomeLabels) for qte scenes', () => {
    expect(SOURCE).toContain('function QteSpecSection')
    expect(SOURCE).toContain('{scene.qte && (')
    expect(SOURCE).toContain('setWindow')
    expect(SOURCE).toContain('setScore')
    expect(SOURCE).toContain('setLabel')
    expect(SOURCE).toContain('timeoutMs')
    expect(SOURCE).toContain('outcomeLabels')
  })
})
