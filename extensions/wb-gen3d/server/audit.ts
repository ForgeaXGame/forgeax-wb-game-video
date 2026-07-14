// Audit — append-only JSONL trail of provider activity, per-game (ADR-0002).
// Records timing and outcome only; NEVER writes the api key, full request
// payload, or raw provider response. Lives under the game's .gen3d/ dir so it
// stays out of source control and is removed when the game is deleted.

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { GenerationMode, ProviderId } from '../shared/manifest';

export type AuditEvent =
  | 'submit'
  | 'poll_succeeded'
  | 'poll_failed'
  | 'poll_timeout'
  | 'cache_hit'
  | 'rate_blocked'
  | 'rest_succeeded'
  | 'rest_failed'
  | 'rest_no_output'
  | 'asset_deleted';

export interface AuditRecord {
  ts: string;
  provider: ProviderId;
  mode: GenerationMode;
  event: AuditEvent;
  sourceJobId?: string | null;
  assetPath?: string;
  cacheKey?: string;
  // Short, non-secret detail (e.g. status string, error class). Never payloads.
  detail?: string;
}

function projectRoot(): string {
  return process.env.FORGEAX_PROJECT_ROOT ?? resolve(process.cwd(), '.forgeax-runtime');
}

function safeSlug(slug: string): string {
  if (!slug || slug.includes('/') || slug.includes('\\') || slug === '..' || slug.includes('\0')) {
    throw Object.assign(new Error(`unsafe slug ${JSON.stringify(slug)}`), { code: 'invalid_slug' });
  }
  return slug;
}

function auditPath(slug: string): string {
  return resolve(projectRoot(), '.forgeax', 'games', safeSlug(slug), '.gen3d', 'audit.jsonl');
}

export async function audit(slug: string, record: AuditRecord): Promise<void> {
  const path = auditPath(slug);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, 'utf8');
}
