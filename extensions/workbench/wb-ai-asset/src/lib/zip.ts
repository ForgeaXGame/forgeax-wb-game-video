// Zero-dependency, store-only (no compression) ZIP writer. Used to bundle one
// asset's files (main GLB + textures + preview + manifest) into a single .zip
// for handoff. Store (method 0) is intentional: GLB and PNG/WebP are already
// compressed, so deflate buys almost nothing and store keeps this tiny and
// dependency-free. Not ZIP64 — guarded below (a prop bundle is far under the
// 4GB / 65535-entry limits).

export interface ZipEntry {
  // Path inside the archive (forward slashes), e.g. "barrel/barrel.glb".
  name: string;
  data: Uint8Array;
}

let CRC_TABLE: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  CRC_TABLE = table;
  return table;
}

export function crc32(data: Uint8Array): number {
  const table = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    c = table[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const EOCD = 22;
// UTF-8 filename flag (general-purpose bit 11) so non-ASCII names round-trip.
const FLAG_UTF8 = 0x0800;
// Fixed valid DOS datetime (1980-01-01 00:00) — a zero date is rejected by some
// tools, and the real mtime is irrelevant for a handoff bundle.
const DOS_TIME = 0;
const DOS_DATE = 0x21;

export function createZip(entries: ReadonlyArray<ZipEntry>): Uint8Array<ArrayBuffer> {
  if (entries.length > 0xffff) {
    throw new Error('zip: too many entries (>65535)');
  }
  const enc = new TextEncoder();
  const prepared = entries.map((e) => {
    const data = e.data;
    if (data.length > 0xffffffff) {
      throw new Error(`zip: file too large for store zip: ${e.name}`);
    }
    return { nameBytes: enc.encode(e.name), data, crc: crc32(data) };
  });

  let total = EOCD;
  for (const p of prepared) {
    total += LOCAL_HEADER + p.nameBytes.length + p.data.length;
    total += CENTRAL_HEADER + p.nameBytes.length;
  }
  if (total > 0xffffffff) {
    throw new Error('zip: archive too large for store zip (>4GB)');
  }

  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);
  let off = 0;
  const localOffsets: number[] = [];

  for (const p of prepared) {
    localOffsets.push(off);
    view.setUint32(off, 0x04034b50, true); // local file header signature
    view.setUint16(off + 4, 20, true); // version needed (2.0)
    view.setUint16(off + 6, FLAG_UTF8, true);
    view.setUint16(off + 8, 0, true); // method: store
    view.setUint16(off + 10, DOS_TIME, true);
    view.setUint16(off + 12, DOS_DATE, true);
    view.setUint32(off + 14, p.crc, true);
    view.setUint32(off + 18, p.data.length, true); // compressed size
    view.setUint32(off + 22, p.data.length, true); // uncompressed size
    view.setUint16(off + 26, p.nameBytes.length, true);
    view.setUint16(off + 28, 0, true); // extra length
    off += LOCAL_HEADER;
    buf.set(p.nameBytes, off);
    off += p.nameBytes.length;
    buf.set(p.data, off);
    off += p.data.length;
  }

  const cdStart = off;
  for (let i = 0; i < prepared.length; i += 1) {
    const p = prepared[i]!;
    view.setUint32(off, 0x02014b50, true); // central directory header signature
    view.setUint16(off + 4, 20, true); // version made by
    view.setUint16(off + 6, 20, true); // version needed
    view.setUint16(off + 8, FLAG_UTF8, true);
    view.setUint16(off + 10, 0, true); // method: store
    view.setUint16(off + 12, DOS_TIME, true);
    view.setUint16(off + 14, DOS_DATE, true);
    view.setUint32(off + 16, p.crc, true);
    view.setUint32(off + 20, p.data.length, true); // compressed size
    view.setUint32(off + 24, p.data.length, true); // uncompressed size
    view.setUint16(off + 28, p.nameBytes.length, true);
    view.setUint16(off + 30, 0, true); // extra length
    view.setUint16(off + 32, 0, true); // comment length
    view.setUint16(off + 34, 0, true); // disk number start
    view.setUint16(off + 36, 0, true); // internal attributes
    view.setUint32(off + 38, 0, true); // external attributes
    view.setUint32(off + 42, localOffsets[i]!, true); // local header offset
    off += CENTRAL_HEADER;
    buf.set(p.nameBytes, off);
    off += p.nameBytes.length;
  }
  const cdSize = off - cdStart;

  view.setUint32(off, 0x06054b50, true); // end of central directory signature
  view.setUint16(off + 4, 0, true); // disk number
  view.setUint16(off + 6, 0, true); // disk with central directory
  view.setUint16(off + 8, prepared.length, true); // entries on this disk
  view.setUint16(off + 10, prepared.length, true); // total entries
  view.setUint32(off + 12, cdSize, true);
  view.setUint32(off + 16, cdStart, true);
  view.setUint16(off + 20, 0, true); // comment length

  return buf;
}
