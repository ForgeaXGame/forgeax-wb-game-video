// Cache — request-level dedup, per-game (ADR-0002 / CONTEXT.md). Stores ONLY
// cacheKey -> assetPath mappings (+ delete tombstones), never provider responses
// or URLs. On hit, the caller loads the manifest from the per-game store by
// assetPath, so a hit never returns a dead provider URL.
//
// Per-game: cache.jsonl lives under .forgeax/games/<slug>/.gen3d/ so game-A and
// game-B never mis-hit each other (entries hold game-relative paths). The cache
// is naturally slug-isolated, so cacheKey need not include the slug, and
// deleting a game removes its cache with the directory.
//
// Append-only JSONL; last write for a key wins. A tombstone ({cacheKey,
// deleted:true}) written by gen3d:delete-asset makes lookup() miss so a
// deliberately deleted asset never resurrects / re-burns quota.

import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function projectRoot(): string {
  return process.env.FORGEAX_PROJECT_ROOT ?? resolve(process.cwd(), '.forgeax-runtime');
}

function safeSlug(slug: string): string {
  if (!slug || slug.includes('/') || slug.includes('\\') || slug === '..' || slug.includes('\0')) {
    throw Object.assign(new Error(`unsafe slug ${JSON.stringify(slug)}`), { code: 'invalid_slug' });
  }
  return slug;
}

function cachePath(slug: string): string {
  return resolve(projectRoot(), '.forgeax', 'games', safeSlug(slug), '.wb-ai-asset', 'cache.jsonl');
}

interface CacheEntry {
  cacheKey: string;
  assetPath?: string;
  deleted?: boolean;
}

// Returns the live assetPath for a cacheKey, or null if unseen or tombstoned.
export async function lookup(slug: string, cacheKey: string): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(cachePath(slug), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  let hit: string | null = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as CacheEntry;
    if (entry.cacheKey !== cacheKey) continue;
    // Last write wins: a later tombstone clears an earlier mapping, and a later
    // mapping (regenerate after delete) clears an earlier tombstone.
    hit = entry.deleted ? null : (entry.assetPath ?? null);
  }
  return hit;
}

// Append a mapping only AFTER provider call + file write all succeeded
// (write-after-success).
export async function remember(slug: string, cacheKey: string, assetPath: string): Promise<void> {
  const path = cachePath(slug);
  await mkdir(dirname(path), { recursive: true });
  const entry: CacheEntry = { cacheKey, assetPath };
  await appendFile(path, `${JSON.stringify(entry)}\n`, 'utf8');
}

// Append a tombstone so a deleted asset's cacheKey no longer resolves.
export async function tombstone(slug: string, cacheKey: string): Promise<void> {
  const path = cachePath(slug);
  await mkdir(dirname(path), { recursive: true });
  const entry: CacheEntry = { cacheKey, deleted: true };
  await appendFile(path, `${JSON.stringify(entry)}\n`, 'utf8');
}
