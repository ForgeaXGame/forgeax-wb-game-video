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
    expect(SOURCE).toContain("RESERVED_EXT_KEYS = ['video', 'choiceUi']")
  })
})
