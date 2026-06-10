// LocalBlobStore — dev-time AssetStorage backed by the local filesystem.
//
// Layout (global library, not bound to a game — ADR-0001 / CONTEXT.md):
//   <root>/.forgeax/assets/gen3d/<assetId>/manifest.json
//   <root>/.forgeax/assets/gen3d/blobs/<sha256[0:2]>/<sha256>.<ext>
//
// Blobs are content-addressed by sha256 so identical bytes dedupe across assets.
// Everything lives under .forgeax/ which the repo gitignores; nothing here is
// source-controlled. Swap this impl for a COS/S3/R2/MinIO adapter in production
// without touching the AssetStorage interface or the manifest contract.

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { FileFormat, Gen3DAssetManifest } from '../shared/manifest';
import type {
  AssetStorage,
  PutBlobInput,
  PutBlobResult,
  ShareUrlInput,
  ShareUrlResult,
} from './asset-storage';

const GEN3D_ROOT_SEGMENTS = ['.forgeax', 'assets', 'gen3d'];

function projectRoot(): string {
  // Match the marketplace convention (see node-editor runtime.ts).
  return process.env.FORGEAX_PROJECT_ROOT ?? resolve(process.cwd(), '.forgeax-runtime');
}

function gen3dRoot(): string {
  return resolve(projectRoot(), ...GEN3D_ROOT_SEGMENTS);
}

function blobStorageKey(sha256: string, format: FileFormat): string {
  return `blobs/${sha256.slice(0, 2)}/${sha256}.${format}`;
}

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export interface LocalBlobStoreOptions {
  // Same-origin Studio base path used to build localUrl. null disables localUrl.
  localUrlBase?: string | null;
}

export class LocalBlobStore implements AssetStorage {
  private readonly localUrlBase: string | null;

  constructor(options: LocalBlobStoreOptions = {}) {
    this.localUrlBase = options.localUrlBase ?? null;
  }

  async putBlob(input: PutBlobInput): Promise<PutBlobResult> {
    const sha256 = sha256Hex(input.data);
    const storageKey = blobStorageKey(sha256, input.format);
    const absPath = resolve(gen3dRoot(), storageKey);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, input.data);
    return {
      storageKey,
      sha256,
      bytes: input.data.byteLength,
      localUrl: this.localUrlBase ? `${this.localUrlBase}/${storageKey}` : null,
    };
  }

  async putManifest(manifest: Gen3DAssetManifest): Promise<void> {
    const absPath = resolve(gen3dRoot(), manifest.assetId, 'manifest.json');
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  async getManifest(assetId: string): Promise<Gen3DAssetManifest | null> {
    const absPath = resolve(gen3dRoot(), assetId, 'manifest.json');
    try {
      const raw = await readFile(absPath, 'utf8');
      return JSON.parse(raw) as Gen3DAssetManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async listManifests(): Promise<Gen3DAssetManifest[]> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(gen3dRoot(), { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const manifests: Gen3DAssetManifest[] = [];
    for (const entry of entries) {
      // Asset manifests live in per-assetId directories. Skip the shared blobs
      // dir and any sidecar files (cache.jsonl, audit.jsonl).
      if (!entry.isDirectory() || entry.name === 'blobs') continue;
      const manifest = await this.getManifest(entry.name);
      if (manifest) manifests.push(manifest);
    }
    return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async shareUrl(input: ShareUrlInput): Promise<ShareUrlResult> {
    // Dev-only transport URL. A real adapter returns a presigned object-store
    // URL. This is request-time transport, never persisted as the asset ref.
    const url = this.localUrlBase
      ? `${this.localUrlBase}/${input.storageKey}`
      : `file://${resolve(gen3dRoot(), input.storageKey)}`;
    const expiresAt = input.expiresInSeconds
      ? new Date(Date.now() + input.expiresInSeconds * 1000).toISOString()
      : null;
    return { url, expiresAt };
  }
}
