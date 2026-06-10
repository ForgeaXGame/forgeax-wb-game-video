import type { ManifestFile } from '@shared/manifest';

// Resolve a same-origin URL for a manifest file's blob. Prefer the persisted
// localUrl (new assets, written once the server route + localUrlBase landed),
// but fall back to deriving it from the always-present storageKey so assets
// generated before that change still preview. Mirrors the server route in
// packages/server/src/main.ts: /api/gen3d-blobs/<storageKey>.
const BLOB_BASE = '/api/gen3d-blobs';

export function blobUrl(file: ManifestFile | null | undefined): string | null {
  if (!file) return null;
  if (file.localUrl) return file.localUrl;
  if (file.storageKey) return `${BLOB_BASE}/${file.storageKey}`;
  return null;
}
