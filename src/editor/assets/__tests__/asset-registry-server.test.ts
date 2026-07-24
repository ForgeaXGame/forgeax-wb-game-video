import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import {
  deleteReferenceImage,
  readManifest,
  registerReferenceImage,
  resolveAssetFilePath,
} from '../../../../server/asset-registry'
import tools from '../../../../server/tool-handlers'

let root: string
let assetsDir: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gva-registry-'))
  assetsDir = resolve(root, '.forgeax/games/demo/assets')
  mkdirSync(resolve(root, '.forgeax'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('reference image registry ownership', () => {
  it('stores uploaded bytes and manifest through the existing registry', async () => {
    const id = 'a-img-00000000-0000-4000-8000-000000000000'
    const file = `media/${id}.png`
    mkdirSync(resolve(assetsDir, 'media'), { recursive: true })
    writeFileSync(resolve(assetsDir, file), new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    const asset = await registerReferenceImage(assetsDir, {
      id,
      file,
      fileName: 'hero.png',
      mime: 'image/png',
      bytes: 4,
      referenceType: 'character',
    })

    expect(asset.productionType).toBe('character_ref')
    expect(asset.file).toMatch(/^media\/a-img-[a-f0-9-]+\.png$/)
    expect(readManifest(assetsDir).assets).toContainEqual(expect.objectContaining({ id: asset.id }))
    expect(existsSync(resolve(assetsDir, asset.file!))).toBe(true)

    await expect(deleteReferenceImage(assetsDir, asset.id)).resolves.toBe('deleted')
    expect(existsSync(resolve(assetsDir, asset.file!))).toBe(false)
  })

  it('rejects external paths outside the selected game root', () => {
    const outside = resolve(root, '.env')
    writeFileSync(outside, 'secret')

    expect(resolveAssetFilePath(assetsDir, {
      id: 'a-unsafe',
      kind: 'image',
      productionType: 'character_ref',
      status: 'ready',
      externalPath: outside,
      createdAt: 1,
      updatedAt: 1,
    })).toBeNull()
  })

  it('routes upload and delete through the extension tool backend', async () => {
    const ctx = { caller: { kind: 'user' }, toolId: 'test', cwd: resolve(root, 'extension'), projectRoot: root }
    const id = 'a-img-11111111-1111-4111-8111-111111111111'
    const file = `media/${id}.png`
    mkdirSync(resolve(assetsDir, 'media'), { recursive: true })
    writeFileSync(resolve(assetsDir, file), new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    const uploaded = await tools['gen:register-reference-image']({
      gameSlug: 'demo',
      id,
      file,
      fileName: 'scene.png',
      mime: 'image/png',
      bytes: 4,
      referenceType: 'scene',
    }, ctx)

    expect(uploaded.error).toBeUndefined()
    expect(uploaded.asset?.productionType).toBe('scene_ref')

    const deleted = await tools['gen:delete-reference-image']({
      gameSlug: 'demo',
      id: uploaded.asset?.id,
    }, ctx)
    expect(deleted).toEqual({ deleted: true })
  })
})
