import { test, expect } from 'bun:test';
import { crc32, createZip, type ZipEntry } from './zip';

// Minimal store-only reader, independent of the writer's layout assumptions, so
// the round-trip test actually exercises the central-directory + local-header
// offsets rather than trusting the writer.
function readStoreZip(buf: Uint8Array): { name: string; data: Uint8Array }[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = buf.length - 22; // no archive comment
  if (view.getUint32(eocd, true) !== 0x06054b50) throw new Error('no EOCD');
  const count = view.getUint16(eocd + 10, true);
  let cd = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(cd, true) !== 0x02014b50) throw new Error('bad central header');
    const nameLen = view.getUint16(cd + 28, true);
    const extraLen = view.getUint16(cd + 30, true);
    const commentLen = view.getUint16(cd + 32, true);
    const lho = view.getUint32(cd + 42, true);
    const name = dec.decode(buf.subarray(cd + 46, cd + 46 + nameLen));
    if (view.getUint32(lho, true) !== 0x04034b50) throw new Error('bad local header');
    const compSize = view.getUint32(lho + 18, true);
    const lNameLen = view.getUint16(lho + 26, true);
    const lExtraLen = view.getUint16(lho + 28, true);
    const start = lho + 30 + lNameLen + lExtraLen;
    out.push({ name, data: new Uint8Array(buf.subarray(start, start + compSize)) });
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const enc = (s: string) => new TextEncoder().encode(s);

test('crc32 matches known vectors', () => {
  expect(crc32(new Uint8Array(0))).toBe(0);
  // The canonical CRC-32/ISO-HDLC "check" value for "123456789".
  expect(crc32(enc('123456789'))).toBe(0xcbf43926);
  expect(crc32(enc('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
});

test('createZip emits a valid local-header + EOCD signature', () => {
  const buf = createZip([{ name: 'a.txt', data: enc('hi') }]);
  const view = new DataView(buf.buffer);
  expect(view.getUint32(0, true)).toBe(0x04034b50); // PK\x03\x04
  expect(view.getUint32(buf.length - 22, true)).toBe(0x06054b50); // PK\x05\x06
  expect(view.getUint16(buf.length - 12, true)).toBe(1); // total entry count
});

test('createZip round-trips text + binary entries byte-for-byte', () => {
  const binary = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) binary[i] = i;
  const entries: ZipEntry[] = [
    { name: 'knight/knight.glb', data: binary },
    { name: 'knight/knight.animated_model.motion-14.fbx', data: enc('fbx-bytes') },
    { name: 'knight/manifest.json', data: enc('{"ok":true}') },
  ];
  const zip = createZip(entries);
  const back = readStoreZip(zip);
  expect(back.map((e) => e.name)).toEqual(entries.map((e) => e.name));
  for (let i = 0; i < entries.length; i += 1) {
    expect(back[i]!.data).toEqual(entries[i]!.data);
  }
});

test('createZip handles an empty file entry', () => {
  const zip = createZip([{ name: 'empty.bin', data: new Uint8Array(0) }]);
  const back = readStoreZip(zip);
  expect(back).toHaveLength(1);
  expect(back[0]!.name).toBe('empty.bin');
  expect(back[0]!.data).toHaveLength(0);
});
