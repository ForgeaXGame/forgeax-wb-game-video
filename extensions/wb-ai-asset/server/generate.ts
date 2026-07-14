// Generation orchestration — turns a pure ProviderResult into a durable per-game
// asset (main GLB + sidefiles + sidecar) via the AssetStorage adapter. This is
// the layer that knows about both providers and storage; providers and the
// store stay unaware of each other (ADR-0001 decoupling). Identity is the
// game-relative assetPath (ADR-0002), not a random UUID.

import type { ProviderResult } from '../shared/catalog';
import type { AssetSlot, Gen3DAssetManifest } from '../shared/manifest';
import type { AssetFileInput, AssetStorage } from './asset-storage';
import * as cache from './cache';
import { audit } from './audit';
import { topologyReportForGlb } from './geometry-check';

export interface PersistInput {
  slug: string;
  assetSlot: AssetSlot;
  assetName: string;
  faceCount?: number;
  cacheKey: string;
  sourceInputAssetPaths?: string[];
}

export async function persistGeneration(
  result: ProviderResult,
  storage: AssetStorage,
  ctx: PersistInput,
): Promise<Gen3DAssetManifest> {
  const files: AssetFileInput[] = result.files.map((f) => ({
    data: f.data,
    format: f.format,
    role: f.role,
    ...(f.textureKind ? { textureKind: f.textureKind } : {}),
  }));
  return storage.writeAsset({
    slug: ctx.slug,
    assetSlot: ctx.assetSlot,
    assetName: ctx.assetName,
    files,
    meta: {
      provider: result.provider,
      providerMode: result.providerMode,
      mode: result.mode,
      sourceJobId: result.sourceJobId,
      prompt: result.prompt,
      sourceInputAssetPaths: ctx.sourceInputAssetPaths ?? [],
      ...(ctx.faceCount !== undefined ? { faceCount: ctx.faceCount } : {}),
      cacheKey: ctx.cacheKey,
    },
  });
}

export interface CachedGenerationResult {
  manifest: Gen3DAssetManifest;
  cacheHit: boolean;
}

// Cache-first generation. On a cacheKey hit, returns the existing manifest
// (loaded from the per-game store by assetPath, never a stale provider URL).
// A cache hit reuses the existing path and ignores any freshly-typed assetName.
// Otherwise runs the producer, persists a durable per-game asset, then records
// cacheKey -> assetPath only after the full success (write-after-success).
export async function generateCacheFirst(
  storage: AssetStorage,
  ctx: PersistInput,
  produce: () => Promise<ProviderResult>,
): Promise<CachedGenerationResult> {
  const cachedPath = await cache.lookup(ctx.slug, ctx.cacheKey);
  if (cachedPath) {
    const existing = await storage.getAsset(ctx.slug, cachedPath);
    if (existing) {
      await audit(ctx.slug, {
        ts: new Date().toISOString(),
        provider: existing.provider,
        mode: existing.mode,
        event: 'cache_hit',
        cacheKey: ctx.cacheKey,
        assetPath: cachedPath,
      });
      return { manifest: existing, cacheHit: true };
    }
    // Mapping points at a missing file (deleted without tombstone); fall through
    // and regenerate rather than crash.
  }

  const result = await produce();
  const manifest = await persistGeneration(result, storage, ctx);
  await cache.remember(ctx.slug, ctx.cacheKey, manifest.assetPath);
  // Phase 3 topology gate: score the produced GLB and record quality.topology
  // (mark-only — never fails the generation). Real outputs only; the mock GLB is
  // a deterministic placeholder, not real geometry to inspect.
  const scored = result.providerMode === 'real'
    ? await scoreTopology(storage, ctx.slug, manifest, result)
    : manifest;
  return { manifest: scored, cacheHit: false };
}

// Inspect the produced GLB and persist its auto topology score into the asset
// sidecar. Returns the refreshed manifest; if the result has no GLB, the original
// manifest is returned unchanged. Self-contained — topologyReportForGlb never
// throws (an unparseable GLB is itself recorded as degraded).
async function scoreTopology(
  storage: AssetStorage,
  slug: string,
  manifest: Gen3DAssetManifest,
  result: ProviderResult,
): Promise<Gen3DAssetManifest> {
  const glb = result.files.find((f) => f.role === 'source_mesh' && f.format === 'glb');
  if (!glb) return manifest;
  const report = await topologyReportForGlb(glb.data);
  return storage.updateAssetQuality(slug, manifest.assetPath, report);
}
