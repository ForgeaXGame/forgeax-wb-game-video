// Unit tests for the plugin-self-managed credentials store. Fully injected:
// every read/write targets a fresh os.tmpdir() file, never the real plugin
// .env. process.env CRED_KEYS are snapshotted + cleared in beforeEach and
// restored in afterEach so the live-apply path can't leak into sibling tests
// (e.g. the rig smoke that pins GEN3D_ENABLE_REAL_PROVIDERS).
//
// parseEnv / serializeEnv are file-local (kept private, mirroring settings.ts),
// so their round-trip + comment/unknown-line preservation is exercised through
// the public writeCredentials/readCredentials surface.

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CRED_KEYS, maskKey, readCredentials, writeCredentials } from './credentials-store';

let dir: string;
let envPath: string;
const original: Record<string, string | undefined> = {};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbgen3d-cred-'));
  envPath = join(dir, '.env');
  // Snapshot then clear so the file drives state deterministically (process.env
  // otherwise wins on read).
  for (const k of CRED_KEYS) {
    original[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of CRED_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('maskKey: undefined/empty → null; len ≤ 8 → ***; len > 8 → first4...last4', () => {
  expect(maskKey(undefined)).toBeNull();
  expect(maskKey('')).toBeNull();
  expect(maskKey('1234567')).toBe('***'); // len 7
  expect(maskKey('12345678')).toBe('***'); // len 8 (boundary)
  expect(maskKey('123456789')).toBe('1234...6789'); // len 9
  expect(maskKey('sk-abcdefghijklmnop')).toBe('sk-a...mnop');
});

test('readCredentials: parses quoted values, masks secrets, base url plaintext, switch boolean', () => {
  writeFileSync(
    envPath,
    [
      'MESHY_API_KEY="meshy-secret-123456"',
      "RODIN_API_KEY='rodin-secret-7890'",
      'HUNYUAN_BASE_URL=https://hy.example.com/v1',
      'GEN3D_ENABLE_REAL_PROVIDERS=1',
    ].join('\n'),
    'utf8',
  );
  const s = readCredentials(envPath);
  expect(s.ok).toBe(true);
  expect(s.realProvidersEnabled).toBe(true);
  expect(s.credentials.MESHY_API_KEY).toBe('mesh...3456'); // unquoted + masked
  expect(s.credentials.RODIN_API_KEY).toBe('rodi...7890');
  expect(s.credentials.HUNYUAN_BASE_URL).toBe('https://hy.example.com/v1'); // plaintext
  expect(s.credentials.HUNYUAN_API_KEY).toBeNull(); // unset
});

test('readCredentials: missing file → all null, switch off', () => {
  const s = readCredentials(envPath); // file does not exist
  expect(s.realProvidersEnabled).toBe(false);
  expect(s.credentials.HUNYUAN_API_KEY).toBeNull();
  expect(s.credentials.HUNYUAN_BASE_URL).toBeNull();
  expect(s.credentials.MESHY_API_KEY).toBeNull();
  expect(s.credentials.RODIN_API_KEY).toBeNull();
});

test('writeCredentials → masked state, live process.env, and persisted file', () => {
  const state = writeCredentials(
    {
      GEN3D_ENABLE_REAL_PROVIDERS: '1',
      MESHY_API_KEY: 'meshy-live-key-123456',
      HUNYUAN_BASE_URL: 'https://hy.local/v1',
    },
    envPath,
  );
  expect(state.realProvidersEnabled).toBe(true);
  expect(state.credentials.MESHY_API_KEY).toBe('mesh...3456');
  expect(state.credentials.HUNYUAN_BASE_URL).toBe('https://hy.local/v1');
  // live-applied so env.ts read() sees it without a restart
  expect(process.env.MESHY_API_KEY).toBe('meshy-live-key-123456');
  expect(process.env.GEN3D_ENABLE_REAL_PROVIDERS).toBe('1');
  // persisted to disk
  expect(readFileSync(envPath, 'utf8')).toContain('MESHY_API_KEY=meshy-live-key-123456');
});

test('writeCredentials: preserves comments + unknown lines, updates key in place', () => {
  const initial = [
    '# wb-gen3d credentials',
    'HUNYUAN_API_KEY=oldkey1234567',
    'UNRELATED_NOTE=keep-me',
    '',
    '# trailing comment',
  ].join('\n');
  writeFileSync(envPath, initial, 'utf8');

  writeCredentials({ HUNYUAN_API_KEY: 'newkeyABCDEFG' }, envPath);

  const text = readFileSync(envPath, 'utf8');
  expect(text).toContain('# wb-gen3d credentials');
  expect(text).toContain('UNRELATED_NOTE=keep-me');
  expect(text).toContain('# trailing comment');
  expect(text).toContain('HUNYUAN_API_KEY=newkeyABCDEFG');
  expect(text).not.toContain('oldkey1234567');
});

test('writeCredentials: empty string clears (file KEY=, process.env deleted, reads null)', () => {
  writeCredentials({ MESHY_API_KEY: 'meshy-secret-123456' }, envPath);
  expect(process.env.MESHY_API_KEY).toBe('meshy-secret-123456');

  const cleared = writeCredentials({ MESHY_API_KEY: '' }, envPath);
  expect(cleared.credentials.MESHY_API_KEY).toBeNull();
  expect(process.env.MESHY_API_KEY).toBeUndefined();

  const text = readFileSync(envPath, 'utf8');
  expect(text).toContain('MESHY_API_KEY=');
  expect(text).not.toContain('meshy-secret-123456');
});

test('writeCredentials: drops non-whitelist fields (slug, EVIL_KEY)', () => {
  writeCredentials(
    { slug: 'cow-survivor', EVIL_KEY: 'pwned', MESHY_API_KEY: 'meshy-ok-123456' },
    envPath,
  );
  const text = readFileSync(envPath, 'utf8');
  expect(text).toContain('MESHY_API_KEY=meshy-ok-123456');
  expect(text).not.toContain('slug');
  expect(text).not.toContain('EVIL_KEY');
  expect(text).not.toContain('cow-survivor');
  expect(text).not.toContain('pwned');
  expect(process.env.slug).toBeUndefined();
  expect(process.env.EVIL_KEY).toBeUndefined();
});

test('writeCredentials: patch with only non-whitelist fields is a no-op (no .env created)', () => {
  const s = writeCredentials({ slug: 'cow', EVIL_KEY: 'x' }, envPath);
  expect(existsSync(envPath)).toBe(false);
  expect(s.credentials.MESHY_API_KEY).toBeNull();
});

test('writeCredentials: coerces number via String(); drops boolean/object values', () => {
  writeCredentials(
    { GEN3D_ENABLE_REAL_PROVIDERS: 1, MESHY_API_KEY: true, RODIN_API_KEY: { a: 1 } } as Record<
      string,
      unknown
    >,
    envPath,
  );
  expect(process.env.GEN3D_ENABLE_REAL_PROVIDERS).toBe('1'); // number → '1'
  expect(process.env.MESHY_API_KEY).toBeUndefined(); // boolean dropped
  expect(process.env.RODIN_API_KEY).toBeUndefined(); // object dropped
  const text = readFileSync(envPath, 'utf8');
  expect(text).toContain('GEN3D_ENABLE_REAL_PROVIDERS=1');
  expect(text).not.toContain('MESHY_API_KEY');
});

test('readCredentials: process.env wins over file (server env precedence)', () => {
  writeFileSync(envPath, 'MESHY_API_KEY=file-value-123456', 'utf8');
  process.env.MESHY_API_KEY = 'proc-value-7890XY';
  const s = readCredentials(envPath);
  expect(s.credentials.MESHY_API_KEY).toBe('proc...90XY'); // process.env, not file
});

test('writeCredentials: atomic write leaves no .tmp leftover', () => {
  writeCredentials({ MESHY_API_KEY: 'meshy-12345678' }, envPath);
  expect(existsSync(`${envPath}.tmp`)).toBe(false);
  expect(existsSync(envPath)).toBe(true);
});
