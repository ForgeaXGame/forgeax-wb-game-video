import { describe, expect, it } from 'vitest'

import { authoringOptionLabel } from '../authoring-option-label'

describe('authoringOptionLabel', () => {
  it('只展示中文名称，并移除已有的技术 id 后缀', () => {
    expect(authoringOptionLabel('敌方水墨血条', 'base:BattleEnemyHpBar')).toBe('敌方水墨血条')
    expect(authoringOptionLabel('战斗床 (a-aud-battle)', 'a-aud-battle')).toBe('战斗床')
  })

  it('没有中文名称时保留英文名称和技术 id 兜底', () => {
    expect(authoringOptionLabel('Enemy HP Bar', 'base:BattleEnemyHpBar'))
      .toBe('Enemy HP Bar (base:BattleEnemyHpBar)')
    expect(authoringOptionLabel(undefined, 'edge-ms9xy8nc')).toBe('edge-ms9xy8nc')
  })
})
