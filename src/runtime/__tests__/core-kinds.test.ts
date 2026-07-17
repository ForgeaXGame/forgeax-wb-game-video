import { beforeAll, describe, expect, it } from 'vitest'
import { floatTextKind, registerCoreKinds } from '../registry/core-kinds'
import { componentHandles } from '../registry/kind-registry'

beforeAll(() => { registerCoreKinds() })

describe('core-kinds', () => {
  it('floatText: validate requires text or expr', () => {
    expect(floatTextKind.validate!({ text: '+30' })).toEqual([])
    expect(floatTextKind.validate!({ text: '' })).toHaveLength(1)
  })

  it('choice/hotspot 出口 = inputs.events（handlesOf 派生）', () => {
    expect(componentHandles('choice', { events: [{ id: 's1' }, { id: 's2' }] }).map((h) => h.id)).toEqual(['s1', 's2'])
    expect(componentHandles('hotspot', { events: [{ id: 'door' }] }).map((h) => h.id)).toEqual(['door'])
  })

  it('qte 出口 = 组件静态 events（pass/good/fail）', () => {
    expect(componentHandles('qte', {}).map((h) => h.id)).toEqual(['pass', 'good', 'fail'])
  })
})
