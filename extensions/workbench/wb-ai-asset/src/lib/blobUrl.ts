import type { ManifestFile } from '@shared/manifest';

// Resolve a same-origin URL for a manifest file's blob. The per-game store always
// sets localUrl to the Studio server's read-only /api/game-assets/<slug>/3d/<…>
// route, so we just use it.
export function blobUrl(file: ManifestFile | null | undefined): string | null {
  return file?.localUrl ?? null;
}
