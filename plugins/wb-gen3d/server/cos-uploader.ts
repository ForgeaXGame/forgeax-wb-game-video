// COS uploader — hosts a local input image on cloud object storage (COS) and returns a
// time-limited presigned URL. Input images are TRANSFER artifacts, not assets:
// they exist only so a provider (Hunyuan/Meshy) whose API fetches by URL can
// reach a user's local file. Rodin takes bytes directly and never needs this.
//
// The key is content-addressed (sha256) under a fixed prefix so repeated
// uploads of the same image are idempotent. Nothing here is logged.

import COS from 'cos-nodejs-sdk-v5';
import { createHash } from 'node:crypto';

import type { CosEnv } from './env';

const KEY_PREFIX = 'wb-gen3d/inputs';

export interface CosUploadResult {
  url: string;
  bytes: number;
  sha256: string;
  // Seconds until the presigned URL expires (from now).
  expiresInSec: number;
}

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

// Map a small set of input mimetypes to a file extension for the COS key.
// Covers images (pose/views inputs) and 3D models (rig/motion transfer URLs).
// Unknown types fall back to .bin; the presigned URL still works for fetchers.
function extForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'model/gltf-binary':
      return 'glb';
    case 'model/fbx':
    case 'application/octet-stream':
      return 'fbx';
    default:
      return 'bin';
  }
}

// Mimetype to send when COS-hosting a model file of a known format, so the
// content-addressed key carries the right extension for URL-fetching providers.
export function mimeForModelFormat(format: 'glb' | 'fbx'): string {
  return format === 'glb' ? 'model/gltf-binary' : 'model/fbx';
}

export class CosUploader {
  private readonly env: CosEnv;
  private readonly cos: COS;

  constructor(env: CosEnv) {
    this.env = env;
    this.cos = new COS({ SecretId: env.secretId, SecretKey: env.secretKey });
  }

  async upload(data: Uint8Array, mimetype: string): Promise<CosUploadResult> {
    const sha256 = sha256Hex(data);
    const key = `${KEY_PREFIX}/${sha256}.${extForMime(mimetype)}`;
    const body = Buffer.from(data);

    await new Promise<void>((resolvePut, rejectPut) => {
      this.cos.putObject(
        {
          Bucket: this.env.bucket,
          Region: this.env.region,
          Key: key,
          Body: body,
          ContentType: mimetype,
        },
        (err) => (err ? rejectPut(err) : resolvePut()),
      );
    });

    const url = await new Promise<string>((resolveUrl, rejectUrl) => {
      this.cos.getObjectUrl(
        {
          Bucket: this.env.bucket,
          Region: this.env.region,
          Key: key,
          Sign: true,
          Expires: this.env.signExpiresSec,
        },
        (err, dataOut) => (err ? rejectUrl(err) : resolveUrl(dataOut.Url)),
      );
    });

    return { url, bytes: data.byteLength, sha256, expiresInSec: this.env.signExpiresSec };
  }
}
