import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const demoPath = resolve(root, 'src/editor/demo/nodia.graph.json')
const videosDir = resolve(root, 'src/editor/assets/zhandou')
const fixturesDir = resolve(root, 'server/host/fixtures')

function collectMediaRefs(value, refs = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectMediaRefs(item, refs)
    return refs
  }
  if (!value || typeof value !== 'object') return refs
  if (value.media && typeof value.media === 'object' && typeof value.media.ref === 'string') {
    refs.push(value.media.ref)
  }
  for (const child of Object.values(value)) collectMediaRefs(child, refs)
  return refs
}

function writeFixture(name, value) {
  mkdirSync(fixturesDir, { recursive: true })
  writeFileSync(resolve(fixturesDir, name), `${JSON.stringify(value, null, 2)}\n`)
}

const blueprint = JSON.parse(readFileSync(demoPath, 'utf8'))
const basenames = readdirSync(videosDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && extname(entry.name) === '.mp4')
  .map((entry) => basename(entry.name, '.mp4'))
  .sort()

if (basenames.length !== 31 || new Set(basenames).size !== 31) {
  throw new Error(`Expected exactly 31 unique zhandou .mp4 files, found ${basenames.length}`)
}
if (basenames.some((id) => !/^[^/\\.]+$/.test(id))) {
  throw new Error('Bundled zhandou asset ids must be basename-only')
}

const assetsManifest = {
  version: 2,
  assets: basenames.map((id) => ({
    id,
    kind: 'video',
    productionType: 'bundled_video',
    status: 'ready',
    file: {
      provider: 'extension',
      key: `zhandou/${id}.mp4`,
      mime: 'video/mp4',
    },
  })),
}

const assetIds = new Set(basenames)
for (const ref of collectMediaRefs(blueprint)) {
  if (!assetIds.has(ref)) throw new Error(`Blueprint media.ref '${ref}' is not a bundled asset`)
}

writeFixture('nodia.blueprint.json', blueprint)
writeFixture('nodia.assets.json', assetsManifest)
