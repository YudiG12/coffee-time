// A streamed ZIP (stored, no compression: audio, video and WebP are already compressed). Each file is copied from
// R2 as it streams, its CRC computed on the way, and its sizes written in a data descriptor after it, so a 300 MB
// video never sits in memory. No ZIP64: every file is ≤ 300 MB and the whole message well under 4 GB.
export type ZipEntry = { name: string; open: () => Promise<ReadableStream<Uint8Array> | Uint8Array | null> };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (crc: number, b: Uint8Array) => {
  let c = ~crc;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
};

const bytes = (size: number, fill: (v: DataView) => void) => { const b = new Uint8Array(size); fill(new DataView(b.buffer)); return b; };
const FLAGS = 0x0808; // bit 3: sizes in a data descriptor; bit 11: UTF-8 names

/** DOS time and date for `d` (local fields read as UTC: good enough for a file stamp). */
const dos = (d: Date) => ({
  time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
  date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
});

export function zipStream(entries: ZipEntry[], when = new Date()): ReadableStream<Uint8Array> {
  const enc = new TextEncoder(), { time, date } = dos(when);
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  (async () => {
    const w = writable.getWriter(), central: Uint8Array[] = [];
    let offset = 0, count = 0;
    const put = async (b: Uint8Array) => { await w.write(b); offset += b.length; };
    try {
      for (const e of entries) {
        const src = await e.open();
        if (!src) continue; // a file missing in R2 is left out, not a broken zip
        const name = enc.encode(e.name), start = offset;
        await put(bytes(30 + name.length, (v) => {
          v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, FLAGS, true); v.setUint16(8, 0, true);
          v.setUint16(10, time, true); v.setUint16(12, date, true); v.setUint16(26, name.length, true);
          new Uint8Array(v.buffer).set(name, 30);
        }));
        let crc = 0, size = 0;
        if (src instanceof Uint8Array) { crc = crc32(0, src); size = src.length; await put(src); }
        else { const r = src.getReader(); for (;;) { const { done, value } = await r.read(); if (done) break; crc = crc32(crc, value); size += value.length; await put(value); } }
        await put(bytes(16, (v) => { v.setUint32(0, 0x08074b50, true); v.setUint32(4, crc, true); v.setUint32(8, size, true); v.setUint32(12, size, true); }));
        central.push(bytes(46 + name.length, (v) => {
          v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, FLAGS, true); v.setUint16(10, 0, true);
          v.setUint16(12, time, true); v.setUint16(14, date, true); v.setUint32(16, crc, true); v.setUint32(20, size, true); v.setUint32(24, size, true);
          v.setUint16(28, name.length, true); v.setUint32(42, start, true);
          new Uint8Array(v.buffer).set(name, 46);
        }));
        count++;
      }
      const cdStart = offset;
      for (const c of central) await put(c);
      await put(bytes(22, (v) => {
        v.setUint32(0, 0x06054b50, true); v.setUint16(8, count, true); v.setUint16(10, count, true);
        v.setUint32(12, offset - cdStart, true); v.setUint32(16, cdStart, true);
      }));
      await w.close();
    } catch (err) { await w.abort(err).catch(() => {}); }
  })();
  return readable;
}
