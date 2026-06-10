// Generation orchestration — turns a pure ProviderResult into a durable
// Gen3DAssetManifest via AssetStorage. This is the layer that knows about both
// providers and storage; providers and the store stay unaware of each other
// (ADR-0001 decoupling). assetId is a random UUID because 3D generation is
// non-deterministic; request-level dedup is the cache layer's job (later).

import { randomUUID } from 'node:crypto';

import type { ProviderResult } from '../shared/catalog';
import {
  computeReadiness,
  emptyQuality,
  type Gen3DAssetManifest,
  type ManifestFile,
} from '../shared/manifest';
import type { AssetStorage } from './asset-storage';

export async function persistGeneration(
  result: ProviderResult,
  storage: AssetStorage,
): Promise<Gen3DAssetManifest> {
  const assetId = randomUUID();
  const now = new Date().toISOString();

  const files: ManifestFile[] = [];
  for (const file of result.files) {
    const stored = await storage.putBlob({
      data: file.data,
      format: file.format,
      role: file.role,
    });
    const isRiggedFbx = file.role === 'rigged_model' && file.format === 'fbx';
    files.push({
      fileId: randomUUID(),
      role: file.role,
      format: file.format,
      storageKey: stored.storageKey,
      bytes: stored.bytes,
      sha256: stored.sha256,
      localUrl: stored.localUrl,
      // Generation never produces a verified skeleton. Rigging readiness is set
      // only by a verified rigging step in wb-3d-pipeline, never inferred here.
      hasSkeleton: false,
      skeletonProfile: isRiggedFbx ? 'unknown' : 'unknown',
      animationInputReady: false,
    });
  }

  const manifest: Gen3DAssetManifest = {
    manifestVersion: 1,
    assetId,
    kind: 'mesh',
    provider: result.provider,
    providerMode: result.providerMode,
    mode: result.mode,
    sourceJobId: result.sourceJobId,
    sourceInputAssetIds: [],
    prompt: result.prompt,
    files,
    readiness: computeReadiness(files),
    quality: emptyQuality(),
    createdAt: now,
    updatedAt: now,
  };

  await storage.putManifest(manifest);
  return manifest;
}
