import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(resolve(import.meta.dirname, '..', relativePath), 'utf8')
}

describe('BlueprintPlayer prototype combat visuals', () => {
  it('keeps gameplay HUD inside the contained video content rect', () => {
    const s = source('BlueprintPlayer.tsx')
    expect(s).toContain('computeVideoContentRect')
    expect(s).toContain('className="bpx-content-ui"')
  })

  it('only resets clip elapsed time when a new clip starts playing', () => {
    const s = source('BlueprintPlayer.tsx')
    expect(s).toContain("dirs.some((d) => d.type === 'playClip')")
    expect(s).toContain('if (resetElapsed) setElapsed(0)')
  })

  it('keeps the video element stable across overlay-only state changes', () => {
    const s = source('BlueprintPlayer.tsx')
    expect(s).toContain('memo(function StableBlueprintVideo')
    expect(s).toContain('<StableBlueprintVideo')
    expect(s).not.toContain("key={clip?.nodeId ?? 'boot'}")
  })

  it('double-buffers clip changes so the old video stays visible until the next can play', () => {
    const s = source('BlueprintPlayer.tsx')
    expect(s).toContain('frontSlot')
    expect(s).toContain('bpx-video-buffer')
    expect(s).toContain('onCanPlay={() => activateSlot')
  })

  it('passes qi runtime vars into the HUD and renders rage pips under the player bar', () => {
    const player = source('BlueprintPlayer.tsx')
    const hud = source('hud/HudLayer.tsx')
    const health = source('hud/HealthBar.tsx')

    expect(player).toContain('vars={vars}')
    expect(hud).toContain('vars?: VarState')
    expect(hud).toContain('energy={qiEnergy}')
    expect(health).toContain('ks-hud-rage')
    expect(health).toContain('ks-hud-pip')
  })

  it('uses A/B/C style choice labels instead of numeric 01/02 labels', () => {
    const choice = source('ChoiceLayer.tsx')
    expect(choice).toContain('String.fromCharCode(65 + index)')
  })

  it('routes combat skill choices to the prototype bottom skill bar presentation', () => {
    const player = source('BlueprintPlayer.tsx')
    const demo = readFileSync(
      resolve(import.meta.dirname, '../../scenario/demoScenario.ts'),
      'utf8',
    )
    const skill = source('BattleSkillLayer.tsx')

    expect(demo).toContain("choiceUi: 'battleSkillBar'")
    expect(player).toContain('isBattleSkillChoice(scene)')
    expect(player).toContain('<BattleSkillLayer')
    expect(skill).toContain('pvb-skills')
    expect(skill).toContain('pvb-skill')
  })
})
