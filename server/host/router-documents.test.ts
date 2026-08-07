import { describe, expect, it } from 'vitest'
import type { WorkbenchExtensionContext } from '@forgeax/workbench-host/node'
import { createWbGameVideoRouter } from './router'

const decoder = new TextDecoder()
const encoder = new TextEncoder()

function contextFor(files: Record<string, string>): {
  context: WorkbenchExtensionContext
  files: Record<string, string>
} {
  const store = { ...files }
  return {
    files: store,
    context: {
      gameId: 'game-1',
      files: {
        read: async (path: string) => {
          const value = store[path]
          return value === undefined ? null : encoder.encode(value)
        },
        write: async (path: string, contents: Uint8Array) => {
          store[path] = decoder.decode(contents)
        },
        withLocks: async <T>(_keys: readonly string[], operation: () => Promise<T>) => (
          operation()
        ),
      },
    } as unknown as WorkbenchExtensionContext,
  }
}

function request(path: string) {
  return {
    gameId: 'game-1',
    runtimeId: 'runtime-1',
    method: 'GET',
    path,
    headers: {},
    query: {},
    body: new Uint8Array(),
  } as const
}

describe('wb-game-video document routing', () => {
  it('returns an empty document list for a new project', async () => {
    const { context } = contextFor({})
    const router = createWbGameVideoRouter(context)

    const response = await router.handle(request('documents'))

    expect(response.status).toBe(200)
    expect(JSON.parse(decoder.decode(response.body))).toEqual({ documents: [] })
  })

  it('lists a docs/ intake record and reads its body from game root', async () => {
    const files = {
      'assets/manifest.json': JSON.stringify({
        version: 2,
        assets: [{
          id: 'doc-intake',
          kind: 'document',
          name: '需求',
          status: 'ready',
          mimeType: 'text/markdown',
          provider: { kind: 'local', ref: 'docs/demo_intake.md' },
          createdAt: 1,
          updatedAt: 2,
          meta: { documentType: 'intake' },
        }],
      }),
      'docs/demo_intake.md': '# Intake',
    }
    const { context } = contextFor(files)
    const router = createWbGameVideoRouter(context)

    const list = await router.handle(request('documents'))
    expect(JSON.parse(decoder.decode(list.body))).toEqual({
      documents: [{ id: 'doc-intake', name: '需求', documentType: 'intake', updatedAt: 2 }],
    })

    const one = await router.handle(request('documents/doc-intake'))
    expect(JSON.parse(decoder.decode(one.body))).toEqual({
      document: { id: 'doc-intake', name: '需求', documentType: 'intake', updatedAt: 2 },
      content: '# Intake',
    })
  })

  it('upserts markdown under docs/ and registers doc-<type>', async () => {
    const { context, files } = contextFor({
      'assets/manifest.json': JSON.stringify({ version: 2, assets: [] }),
    })
    const router = createWbGameVideoRouter(context)

    const res = await router.handle({
      ...request('documents/upsert'),
      method: 'POST',
      headers: { 'content-type': ['application/json'] },
      body: encoder.encode(JSON.stringify({
        documentType: 'core',
        slug: 'demo',
        name: '核心方案',
        content: '# Core\n',
      })),
    })

    expect(res.status).toBe(200)
    const body = JSON.parse(decoder.decode(res.body))
    expect(body.document).toMatchObject({
      id: 'doc-core',
      documentType: 'core',
      name: '核心方案',
    })
    expect(files['docs/demo_core.md']).toBe('# Core\n')
    const manifest = JSON.parse(files['assets/manifest.json']!)
    expect(manifest.assets).toEqual([
      expect.objectContaining({
        id: 'doc-core',
        kind: 'document',
        name: '核心方案',
        provider: { kind: 'local', ref: 'docs/demo_core.md' },
        meta: { documentType: 'core' },
      }),
    ])
  })

  it('registers existing file when content omitted', async () => {
    const { context, files } = contextFor({
      'assets/manifest.json': JSON.stringify({ version: 2, assets: [] }),
      'docs/demo_pillar.md': '# Pillar',
    })
    const router = createWbGameVideoRouter(context)

    const res = await router.handle({
      ...request('documents/upsert'),
      method: 'POST',
      headers: { 'content-type': ['application/json'] },
      body: encoder.encode(JSON.stringify({
        documentType: 'pillar',
        slug: 'demo',
      })),
    })

    expect(res.status).toBe(200)
    const body = JSON.parse(decoder.decode(res.body))
    expect(body.document).toMatchObject({
      id: 'doc-pillar',
      name: '支柱',
      documentType: 'pillar',
    })
    expect(files['docs/demo_pillar.md']).toBe('# Pillar')
    const manifest = JSON.parse(files['assets/manifest.json']!)
    expect(manifest.assets).toEqual([
      expect.objectContaining({
        id: 'doc-pillar',
        kind: 'document',
        name: '支柱',
        status: 'ready',
        mimeType: 'text/markdown',
        provider: { kind: 'local', ref: 'docs/demo_pillar.md' },
        meta: { documentType: 'pillar' },
      }),
    ])
  })

  it('overwrites same documentType while preserving createdAt', async () => {
    const { context, files } = contextFor({
      'assets/manifest.json': JSON.stringify({
        version: 2,
        assets: [{
          id: 'doc-core',
          kind: 'document',
          name: '旧核心',
          status: 'ready',
          mimeType: 'text/markdown',
          provider: { kind: 'local', ref: 'docs/demo_core.md' },
          createdAt: 100,
          updatedAt: 200,
          meta: { documentType: 'core' },
        }],
      }),
      'docs/demo_core.md': '# Old core',
    })
    const router = createWbGameVideoRouter(context)

    const res = await router.handle({
      ...request('documents/upsert'),
      method: 'POST',
      headers: { 'content-type': ['application/json'] },
      body: encoder.encode(JSON.stringify({
        documentType: 'core',
        slug: 'demo',
        name: '核心方案',
        content: '# New core\n',
      })),
    })

    expect(res.status).toBe(200)
    const body = JSON.parse(decoder.decode(res.body))
    expect(body.document).toMatchObject({
      id: 'doc-core',
      name: '核心方案',
      documentType: 'core',
    })
    expect(body.document.updatedAt).toBeGreaterThan(200)
    expect(files['docs/demo_core.md']).toBe('# New core\n')
    const manifest = JSON.parse(files['assets/manifest.json']!)
    expect(manifest.assets).toHaveLength(1)
    expect(manifest.assets[0]).toMatchObject({
      id: 'doc-core',
      name: '核心方案',
      createdAt: 100,
      provider: { kind: 'local', ref: 'docs/demo_core.md' },
      meta: { documentType: 'core' },
    })
    expect(manifest.assets[0].updatedAt).toBe(body.document.updatedAt)
  })

  it('returns structured error when register-only upsert targets a missing file', async () => {
    const { context } = contextFor({
      'assets/manifest.json': JSON.stringify({ version: 2, assets: [] }),
    })
    const router = createWbGameVideoRouter(context)

    const res = await router.handle({
      ...request('documents/upsert'),
      method: 'POST',
      headers: { 'content-type': ['application/json'] },
      body: encoder.encode(JSON.stringify({
        documentType: 'inquiry',
        slug: 'demo',
      })),
    })

    expect(res.status).toBe(200)
    const body = JSON.parse(decoder.decode(res.body))
    expect(body.document).toBeNull()
    expect(body.error).toMatch(/Document file missing/)
  })

  it('infers slug from project.json when slug is omitted', async () => {
    const { context, files } = contextFor({
      'assets/manifest.json': JSON.stringify({ version: 2, assets: [] }),
      'project.json': JSON.stringify({ slug: 'my-game' }),
    })
    const router = createWbGameVideoRouter(context)

    const res = await router.handle({
      ...request('documents/upsert'),
      method: 'POST',
      headers: { 'content-type': ['application/json'] },
      body: encoder.encode(JSON.stringify({
        documentType: 'intake',
        content: '# Intake\n',
      })),
    })

    expect(res.status).toBe(200)
    expect(JSON.parse(decoder.decode(res.body)).document).toMatchObject({
      id: 'doc-intake',
      documentType: 'intake',
    })
    expect(files['docs/my-game_intake.md']).toBe('# Intake\n')
  })
})
