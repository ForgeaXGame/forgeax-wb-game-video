/**
 * Post-kind-layout: Vite aliases must reach packages/contracts/*, not the
 * stale packages/marketplace/{types,agent-runtime} paths from the flat layout.
 */
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ManifestKindSchema } from '@forgeax/types'
import { PLUGIN_MANIFEST_KINDS } from '@forgeax/types/plugin-layout'
import { NoopKernel } from '@forgeax/agent-runtime'

const pluginRoot = resolve(import.meta.dirname, '../..')

describe('wb-skill contracts Vite aliases', () => {
  it('resolve packages/contracts/types and agent-runtime on disk', () => {
    const typesEntry = resolve(pluginRoot, '../../../../contracts/types/src/index.ts')
    const runtimeEntry = resolve(pluginRoot, '../../../../contracts/agent-runtime/src/index.ts')
    expect(existsSync(typesEntry)).toBe(true)
    expect(existsSync(runtimeEntry)).toBe(true)
    expect(typesEntry.replace(/\\/g, '/')).toContain('/packages/contracts/types/')
    expect(runtimeEntry.replace(/\\/g, '/')).toContain('/packages/contracts/agent-runtime/')
  })

  it('imports resolve through the Vite @forgeax/* aliases (root + subpath)', () => {
    expect(ManifestKindSchema.options).toContain('workbench')
    expect(PLUGIN_MANIFEST_KINDS).toContain('workbench')
    expect(typeof NoopKernel).toBe('function')
  })
})
