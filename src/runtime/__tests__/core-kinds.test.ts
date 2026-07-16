import { describe, expect, it } from 'vitest'
import {
  choiceKind,
  hotspotKind,
  qteKind,
  floatTextKind,
} from '../registry/core-kinds'

const ctx = { state: {} as never, nodeId: 'n', elapsedMs: 0 }

describe('core-kinds', () => {
  it('floatText: validate requires text; no outputs', () => {
    expect(floatTextKind.validate({ text: '+30' })).toEqual([])
    expect(floatTextKind.validate({ text: '' })).toHaveLength(1)
    expect(floatTextKind.outputs({ text: 'x' })).toEqual([])
  })

  it('choice: outputs per event id; resolve maps input → event id (无前缀/无 effects)', () => {
    const params = {
      events: [
        { id: 's1', label: '轻击' },
        { id: 's2', label: '重击' },
      ],
    }
    expect(choiceKind.outputs(params).map((h) => h.id)).toEqual(['s1', 's2'])
    const r = choiceKind.resolve!(ctx, params, 's1')
    expect(r.outcome).toBe('s1')
    // 缺省 input → defaultEvent/首项
    expect(choiceKind.resolve!(ctx, params, undefined).outcome).toBe('s1')
  })

  it('qte: three outcomes; resolve by string or hits', () => {
    expect(qteKind.outputs({}).map((h) => h.id)).toEqual(['pass', 'good', 'fail'])
    expect(qteKind.resolve!(ctx, {}, 'good').outcome).toBe('good')
    expect(qteKind.resolve!(ctx, { passingHits: 3 }, { hits: 3 }).outcome).toBe('pass')
    expect(qteKind.resolve!(ctx, { passingHits: 3 }, { hits: 1 }).outcome).toBe('fail')
  })

  it('hotspot: outputs event id; resolve id → id', () => {
    const params = { events: [{ id: 'door' }] }
    expect(hotspotKind.outputs(params).map((h) => h.id)).toEqual(['door'])
    expect(hotspotKind.resolve!(ctx, params, 'door').outcome).toBe('door')
  })
})
