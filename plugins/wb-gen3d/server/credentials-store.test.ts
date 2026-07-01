// Unit tests for the plugin-self-managed credentials store.
// Fully injected: every read/write targets a fresh os.tmpdir() file, never the real
// plugin .env. process.env CRED_KEYS are snapshotted + cleared in beforeEach and
// restored in afterEach so the live-apply path can't leak into sibling tests.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CRED_KEYS, maskKey, readCredentials, writeCredentials } from './credentials-store';

let dir: string;
let envPath: string;
const original: Record<string, string | undefined> = {};
const LITELLM_ENV_KEYS = ['LITELLM_PROXY_KEY', 'LITELLM_PROXY_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL'] as const;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbgen3d-cred-'));
  envPath = join(dir, '.env');
  for (const k of [...CRED_KEYS, ...LITELLM_ENV_KEYS]) {
    original[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of [...CRED_KEYS, ...LITELLM_ENV_KEYS]) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('maskKey: undefined/empty → null; len ≤ 8 → ***; len > 8 → first4...last4', () => {
  expect(maskKey(undefined)).toBeNull();
  expect(maskKey('')).toBeNull();
  expect(maskKey('1234567')).toBe('***');
  expect(maskKey('12345678')).toBe('***');
  expect(maskKey('123456789')).toBe('1234...6789');
  expect(maskKey('sk-abcdefghijklmnop')).toBe('sk-a...mnop');
});

test('readCredentials: parses quoted values, masks COS secrets, plaintext bucket/region', () => {
  writeFileSync(
    envPath,
    [
      'GEN3D_ENABLE_REAL_PROVIDERS=1',
      'COS_SECRET_ID=cosid-secret-abcdef',
      'COS_SECRET_KEY=coskey-secret-ghijkl',
      'COS_BUCKET=forgeax-1000000123456789',
      'COS_REGION=ap-guangzhou',
    ].join('\n'),
    'utf8',
  );
  process.env.ANTHROPIC_API_KEY = 'sk-anthropic-global-key';
  const s = readCredentials(envPath);
  expect(s.ok).toBe(true);
  expect(s.realProvidersEnabled).toBe(true);
  expect(s.litellmConfigured).toBe(true);
  expect(s.litellmProxyKey).toBe('sk-a...-key');
  expect(s.credentials.COS_SECRET_ID).toBe('cosi...cdef');
  expect(s.credentials.COS_SECRET_KEY).toBe('cosk...ijkl');
  expect(s.credentials.COS_BUCKET).toBe('forgeax-1000000123456789');
  expect(s.credentials.COS_REGION).toBe('ap-guangzhou');
});

test('readCredentials: missing file → all null, switch off, litellm from global env', () => {
  process.env.LITELLM_PROXY_KEY = 'sk-litellm-global';
  const s = readCredentials(envPath);
  expect(s.realProvidersEnabled).toBe(false);
  expect(s.litellmConfigured).toBe(true);
  expect(s.litellmProxyKey).toBe('sk-l...obal');
  expect(s.credentials.COS_SECRET_ID).toBeNull();
  expect(s.credentials.COS_BUCKET).toBeNull();
});

test('writeCredentials: COS secrets masked + plaintext bucket/region persist + live-apply', () => {
  const state = writeCredentials(
    {
      COS_SECRET_ID: 'cosid-live-1234567',
      COS_SECRET_KEY: 'coskey-live-8765432',
      COS_BUCKET: 'forgeax-bucket',
      COS_REGION: 'ap-shanghai',
    },
    envPath,
  );
  expect(state.credentials.COS_SECRET_ID).toBe('cosi...4567');
  expect(state.credentials.COS_SECRET_KEY).toBe('cosk...5432');
  expect(state.credentials.COS_BUCKET).toBe('forgeax-bucket');
  expect(state.credentials.COS_REGION).toBe('ap-shanghai');
  expect(process.env.COS_SECRET_ID).toBe('cosid-live-1234567');
  expect(process.env.COS_SECRET_KEY).toBe('coskey-live-8765432');
  const text = readFileSync(envPath, 'utf8');
  expect(text).toContain('COS_SECRET_ID=cosid-live-1234567');
  expect(text).toContain('COS_BUCKET=forgeax-bucket');
});

test('writeCredentials: LiteLLM keys in patch are silently dropped', () => {
  writeCredentials(
    {
      GEN3D_ENABLE_REAL_PROVIDERS: '1',
      LITELLM_PROXY_KEY: 'sk-should-not-persist',
      LITELLM_PROXY_BASE_URL: 'https://evil.example.com',
    },
    envPath,
  );
  const text = readFileSync(envPath, 'utf8');
  expect(text).toContain('GEN3D_ENABLE_REAL_PROVIDERS=1');
  expect(text).not.toContain('LITELLM_PROXY_KEY');
  expect(text).not.toContain('LITELLM_PROXY_BASE_URL');
});

test('writeCredentials: preserves comments + unknown lines, updates key in place', () => {
  const initial = [
    '# wb-gen3d credentials',
    'COS_SECRET_ID=oldid1234567',
    'UNRELATED_NOTE=keep-me',
    '',
    '# trailing comment',
  ].join('\n');
  writeFileSync(envPath, initial, 'utf8');

  writeCredentials({ COS_SECRET_ID: 'newidABCDEFG' }, envPath);

  const text = readFileSync(envPath, 'utf8');
  expect(text).toContain('# wb-gen3d credentials');
  expect(text).toContain('UNRELATED_NOTE=keep-me');
  expect(text).toContain('# trailing comment');
  expect(text).toContain('COS_SECRET_ID=newidABCDEFG');
  expect(text).not.toContain('oldid1234567');
});

test('writeCredentials: empty string clears (file KEY=, process.env deleted, reads null)', () => {
  writeCredentials({ COS_SECRET_ID: 'cosid-12345678' }, envPath);
  expect(process.env.COS_SECRET_ID).toBe('cosid-12345678');

  const cleared = writeCredentials({ COS_SECRET_ID: '' }, envPath);
  expect(cleared.credentials.COS_SECRET_ID).toBeNull();
  expect(process.env.COS_SECRET_ID).toBeUndefined();
  expect(readFileSync(envPath, 'utf8')).toContain('COS_SECRET_ID=');
});

test('writeCredentials: drops non-whitelist fields (slug, EVIL_KEY)', () => {
  writeCredentials({ slug: 'cow-survivor', EVIL_KEY: 'pwned', COS_SECRET_ID: 'cosid-ok-12345678' }, envPath);
  const text = readFileSync(envPath, 'utf8');
  expect(text).toContain('COS_SECRET_ID=cosid-ok-12345678');
  expect(text).not.toContain('slug');
  expect(text).not.toContain('EVIL_KEY');
});

test('writeCredentials: patch with only non-whitelist fields is a no-op (no .env created)', () => {
  const s = writeCredentials({ slug: 'cow', EVIL_KEY: 'x', LITELLM_PROXY_KEY: 'sk-nope' }, envPath);
  expect(existsSync(envPath)).toBe(false);
  expect(s.credentials.COS_SECRET_ID).toBeNull();
});

test('writeCredentials: coerces number via String(); drops boolean/object values', () => {
  writeCredentials({ GEN3D_ENABLE_REAL_PROVIDERS: 1, COS_SECRET_ID: true } as Record<string, unknown>, envPath);
  expect(process.env.GEN3D_ENABLE_REAL_PROVIDERS).toBe('1');
  expect(process.env.COS_SECRET_ID).toBeUndefined();
  expect(readFileSync(envPath, 'utf8')).toContain('GEN3D_ENABLE_REAL_PROVIDERS=1');
});

test('readCredentials: process.env wins over file for plugin-local keys', () => {
  writeFileSync(envPath, 'COS_SECRET_ID=file-value-123456', 'utf8');
  process.env.COS_SECRET_ID = 'proc-value-7890XY';
  const s = readCredentials(envPath);
  expect(s.credentials.COS_SECRET_ID).toBe('proc...90XY');
});

test('writeCredentials: atomic write leaves no .tmp leftover', () => {
  writeCredentials({ COS_SECRET_ID: 'cosid-12345678' }, envPath);
  expect(existsSync(`${envPath}.tmp`)).toBe(false);
  expect(existsSync(envPath)).toBe(true);
});
