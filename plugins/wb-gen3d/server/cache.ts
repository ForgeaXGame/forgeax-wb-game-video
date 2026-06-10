// Cache — request-level dedup. Stores ONLY cacheKey -> assetId mappings, never
// provider responses or URLs (ADR-0001 / CONTEXT.md). On hit, the caller loads
// the manifest from AssetStorage by assetId, so a hit never returns a dead
// provider URL. Append-only JSONL; last write for a key wins.

import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function projectRoot(): string {
  return process.env.FORGEAX_PROJECT_ROOT ?? resolve(process.cwd(), '.forgeax-runtime');
}

function cachePath(): string {
  return resolve(projectRoot(), '.forgeax', 'assets', 'gen3d', 'cache.jsonl');
}

interface CacheEntry {
  cacheKey: string;
  assetId: string;
}

export async function lookup(cacheKey: string): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(cachePath(), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  let hit: string | null = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as CacheEntry;
    if (entry.cacheKey === cacheKey) hit = entry.assetId;
  }
  return hit;
}

// Append a mapping only AFTER provider call + blob download + manifest write all
// succeeded (write-after-success, ADR-0001 Cache).
export async function remember(cacheKey: string, assetId: string): Promise<void> {
  const path = cachePath();
  await mkdir(dirname(path), { recursive: true });
  const entry: CacheEntry = { cacheKey, assetId };
  await appendFile(path, `${JSON.stringify(entry)}\n`, 'utf8');
}
