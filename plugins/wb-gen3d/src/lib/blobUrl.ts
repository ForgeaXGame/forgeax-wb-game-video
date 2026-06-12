import type { ManifestFile } from '@shared/manifest';

// Resolve a same-origin URL for a manifest file's blob. Prefer the persisted
// localUrl (new assets, written once the server route + localUrlBase landed),
// but fall back to deriving it from the always-present storageKey so assets
// generated before that change still preview. Mirrors the server route in
// packages/server/src/main.ts: /api/gen3d-blobs/<storageKey>.
export const BLOB_BASE = '/api/gen3d-blobs';

export function blobUrl(file: ManifestFile | null | undefined): string | null {
  if (!file) return null;
  if (file.localUrl) return file.localUrl;
  if (file.storageKey) return `${BLOB_BASE}/${file.storageKey}`;
  return null;
}

// Scratch / pose-standardization preview: prefer the per-game scratch route;
// fall back to the provider-hosted sourceUrl when local bytes are not yet served.
export function scratchPreviewUrl(result: {
  localUrl: string | null;
  sourceUrl: string | null;
  storageKey: string;
}): string | null {
  if (result.localUrl) return result.localUrl;
  if (result.sourceUrl) return result.sourceUrl;
  // Legacy global blobs only — scratch keys (.gen3d/tmp/…) are NOT under gen3d-blobs.
  if (result.storageKey && !result.storageKey.startsWith('.gen3d/')) {
    return `${BLOB_BASE}/${result.storageKey}`;
  }
  return null;
}
