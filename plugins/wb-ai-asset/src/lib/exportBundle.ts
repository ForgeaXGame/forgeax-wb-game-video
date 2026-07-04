// Export one asset (its main GLB + every same-basename sidefile: textures,
// preview) plus a manifest.json into a single .zip the user can hand off. Pure
// front-end: each file is fetched from the existing /api/game-assets route
// (resolved by blobUrl) and zipped in the browser, so no server route, tool, or
// dependency is added.
import type { Gen3DAssetManifest } from '@shared/manifest';
import { blobUrl } from './blobUrl';
import { createZip, type ZipEntry } from './zip';
import { t } from '@/i18n';

export interface BundleFile {
  // Path inside the zip (under the asset's root dir).
  name: string;
  // Same-origin URL to fetch the bytes from.
  url: string;
}

export interface BundlePlan {
  zipName: string;
  rootDir: string;
  // On-disk files to fetch (excludes the generated manifest.json).
  files: BundleFile[];
  manifestJson: string;
}

// "assets/3d/meshes/barrel.glb" → "barrel". The asset's main-GLB stem is already
// sanitized (PerGameAssetStore.sanitizeBaseName), so it is safe as both the
// zip's root folder and the download file name.
function bundleBaseName(assetPath: string): string {
  const leaf = assetPath.split('/').pop() ?? 'asset';
  return leaf.replace(/\.glb$/i, '') || 'asset';
}

// Pure: decide what goes into the bundle. All files share the asset's basename
// (per-game store invariant), so their leaf names are unique inside rootDir.
export function planBundle(manifest: Gen3DAssetManifest): BundlePlan {
  const root = bundleBaseName(manifest.assetPath);
  const files: BundleFile[] = [];
  for (const f of manifest.files) {
    const url = blobUrl(f);
    if (!url) continue;
    const leaf = f.storageKey.split('/').pop() ?? `${f.role}.${f.format}`;
    files.push({ name: `${root}/${leaf}`, url });
  }
  return {
    zipName: `${root}.zip`,
    rootDir: root,
    files,
    manifestJson: JSON.stringify(manifest, null, 2),
  };
}

// Side-effecting: fetch every file, build the zip, trigger a browser download.
export async function downloadBundle(manifest: Gen3DAssetManifest): Promise<void> {
  const plan = planBundle(manifest);
  const entries: ZipEntry[] = [];
  for (const file of plan.files) {
    const res = await fetch(file.url);
    if (!res.ok) {
      throw new Error(t('error.downloadFail', { name: file.name, status: res.status }));
    }
    entries.push({ name: file.name, data: new Uint8Array(await res.arrayBuffer()) });
  }
  entries.push({
    name: `${plan.rootDir}/manifest.json`,
    data: new TextEncoder().encode(plan.manifestJson),
  });
  triggerDownload(createZip(entries), plan.zipName);
}

function triggerDownload(bytes: Uint8Array<ArrayBuffer>, filename: string): void {
  const blob = new Blob([bytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click-initiated download has taken the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
