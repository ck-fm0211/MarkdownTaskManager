// Minimal dependency-free ZIP writer/reader (deflate, UTF-8 names, no ZIP64).
// Used for source backups / release packages and to verify them by reading them back.
// Readable by Windows Explorer, 7-Zip and `unzip`.
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import * as zlib from 'node:zlib';
import { openSync, writeSync, closeSync, readFileSync } from 'node:fs';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const year = Math.max(1980, d.getFullYear());
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

// entries: [{ name: 'dir/file.txt', data: Buffer, mtime?: Date }]
export function writeZip(file, entries) {
  if (entries.length > 0xffff) throw new Error('too many entries for a non-ZIP64 archive');
  const fd = openSync(file, 'wx'); // never overwrite
  let offset = 0;
  const central = [];
  const write = (buf) => { writeSync(fd, buf); offset += buf.length; };
  try {
    for (const e of entries) {
      const name = Buffer.from(e.name.split('\\').join('/'), 'utf8');
      const data = e.data;
      const crc = crc32(data);
      let method = 8;
      let comp = deflateRawSync(data, { level: 9 });
      if (comp.length >= data.length) { method = 0; comp = data; }
      if (offset + comp.length > 0xfffffff0) throw new Error('archive too large (> 4 GB)');
      const { time, date } = dosDateTime(e.mtime || new Date());
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x0800, 6); // UTF-8 file names
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(comp.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(name.length, 26);
      local.writeUInt16LE(0, 28);
      const localOffset = offset;
      write(local); write(name); write(comp);
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(20, 4);
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(method, 10);
      c.writeUInt16LE(time, 12);
      c.writeUInt16LE(date, 14);
      c.writeUInt32LE(crc, 16);
      c.writeUInt32LE(comp.length, 20);
      c.writeUInt32LE(data.length, 24);
      c.writeUInt16LE(name.length, 28);
      c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32); c.writeUInt16LE(0, 34); c.writeUInt16LE(0, 36);
      c.writeUInt32LE(0, 38);
      c.writeUInt32LE(localOffset, 42);
      central.push(Buffer.concat([c, name]));
    }
    const cdStart = offset;
    for (const c of central) write(c);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(offset - cdStart, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20);
    write(eocd);
  } finally {
    closeSync(fd);
  }
}

// Read and fully verify a ZIP (CRC + sizes of every entry). Returns [{ name, data }].
export function readZip(file) {
  const buf = readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP file (end of central directory not found)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`bad central directory entry #${i}`);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error(`bad local header: ${name}`);
    const lnlen = buf.readUInt16LE(lho + 26);
    const lxlen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lnlen + lxlen;
    const comp = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = Buffer.from(comp);
    else if (method === 8) data = inflateRawSync(comp);
    else throw new Error(`unsupported compression method ${method}: ${name}`);
    if (data.length !== usize) throw new Error(`size mismatch: ${name}`);
    if (crc32(data) !== crc) throw new Error(`CRC mismatch: ${name}`);
    out.push({ name, data });
  }
  return out;
}
