import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(
  resolve(import.meta.dirname, '../BlueprintTab.tsx'),
  'utf8',
)

describe('BlueprintTab loopback edges', () => {
  it('marks edges that route from right to left as loopback edges', () => {
    expect(SOURCE).toContain('isLoopbackEdge')
    expect(SOURCE).toContain('loopback')
  })

  it('draws loopback edges with an elevated visible path above nodes', () => {
    expect(SOURCE).toContain('getLoopbackPath')
    expect(SOURCE).toContain('ks-bp-edge-loopback')
    expect(SOURCE).toContain('strokeDasharray')
  })
})
