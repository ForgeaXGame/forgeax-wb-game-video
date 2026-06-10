// Audit — append-only JSONL trail of provider activity. Records timing and
// outcome only; NEVER writes the api key, full request payload, or raw provider
// response. Lives under the global library so it stays out of source control.

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
  | 'rest_no_output';

export interface AuditRecord {
  ts: string;
  provider: ProviderId;
  mode: GenerationMode;
  event: AuditEvent;
  sourceJobId?: string | null;
  assetId?: string;
  cacheKey?: string;
  // Short, non-secret detail (e.g. status string, error class). Never payloads.
  detail?: string;
}

function projectRoot(): string {
  return process.env.FORGEAX_PROJECT_ROOT ?? resolve(process.cwd(), '.forgeax-runtime');
}

function auditPath(): string {
  return resolve(projectRoot(), '.forgeax', 'assets', 'gen3d', 'audit.jsonl');
}

export async function audit(record: AuditRecord): Promise<void> {
  const path = auditPath();
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, 'utf8');
}
