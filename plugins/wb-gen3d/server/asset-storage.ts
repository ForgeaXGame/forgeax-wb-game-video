// AssetStorage — adapter boundary for durable 3D asset persistence.
//
// The adapter owns blob bytes + manifests. It does NOT know which provider
// produced an asset (asset-store decoupling rule, ADR-0001). Production can swap
// LocalBlobStore for a Tencent COS/S3/R2/MinIO adapter without changing this
// interface or the Gen3DAssetManifest contract.

import type { FileFormat, FileRole, Gen3DAssetManifest } from '../shared/manifest';

export interface PutBlobInput {
  // Raw bytes to persist. Provider URLs must be downloaded into bytes before
  // reaching the store; the store never holds a provider/browser URL.
  data: Uint8Array;
  format: FileFormat;
  role: FileRole;
}

export interface PutBlobResult {
  storageKey: string;
  sha256: string;
  bytes: number;
  // Same-origin Studio URL for local preview/download, or null if the adapter
  // cannot stream the blob from Studio.
  localUrl: string | null;
}

export interface ShareUrlInput {
  storageKey: string;
  // Lifetime hint in seconds for the short-lived external URL.
  expiresInSeconds?: number;
}

export interface ShareUrlResult {
  // Request-time transport URL handed to an external provider (e.g. Hunyuan
  // motion_retarget). NEVER the canonical asset reference; do not persist it as
  // such. The durable truth stays storageKey + manifest.
  url: string;
  expiresAt: string | null;
}

export interface AssetStorage {
  putBlob(input: PutBlobInput): Promise<PutBlobResult>;
  putManifest(manifest: Gen3DAssetManifest): Promise<void>;
  getManifest(assetId: string): Promise<Gen3DAssetManifest | null>;
  listManifests(): Promise<Gen3DAssetManifest[]>;
  // Create a short-lived URL an external provider can fetch. Local dev returns a
  // same-origin file URL; production adapters return a presigned object-store URL.
  shareUrl(input: ShareUrlInput): Promise<ShareUrlResult>;
}
