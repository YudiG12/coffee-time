// Real file type from the first bytes (ADR 0002 quarantine). The name and the Content-Type the browser sent are
// never trusted: a text file renamed to .mp4 has no container signature and is refused.
const ascii = (b: Uint8Array, at: number, s: string) => s.split("").every((c, i) => b[at + i] === c.charCodeAt(0));
const starts = (b: Uint8Array, bytes: number[]) => bytes.every((x, i) => b[i] === x);

// ISO base media (MP4, M4A, MOV, HEIC): a box size, then "ftyp" (or an old QuickTime atom) at offset 4.
const isoBrand = (b: Uint8Array) => (b.length >= 12 && ascii(b, 4, "ftyp") ? String.fromCharCode(...b.slice(8, 12)) : "");
const isQuickTime = (b: Uint8Array) => b.length >= 8 && ["moov", "mdat", "wide", "free", "skip"].some((a) => ascii(b, 4, a));
const isEbml = (b: Uint8Array) => starts(b, [0x1a, 0x45, 0xdf, 0xa3]); // WebM / Matroska
const isRiff = (b: Uint8Array, form: string) => b.length >= 12 && ascii(b, 0, "RIFF") && ascii(b, 8, form);

const HEIF = ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1", "avif"];

/** True when the bytes look like a file of this kind (audio, video or photo). */
export function sniff(kind: "audio" | "video" | "photo", b: Uint8Array): boolean {
  if (b.length < 4) return false;
  const brand = isoBrand(b);
  if (kind === "photo")
    return starts(b, [0xff, 0xd8, 0xff]) || starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || isRiff(b, "WEBP") || ascii(b, 0, "GIF8") || HEIF.includes(brand);
  if (kind === "video") return isEbml(b) || (!!brand && !HEIF.includes(brand)) || isQuickTime(b) || ascii(b, 0, "OggS");
  // Audio: WebM/Opus (MediaRecorder), Ogg, MP4/M4A, WAV, FLAC, MP3 (ID3 tag or a frame sync), AAC (ADTS).
  return isEbml(b) || ascii(b, 0, "OggS") || (!!brand && !HEIF.includes(brand)) || isRiff(b, "WAVE") || ascii(b, 0, "fLaC") || ascii(b, 0, "ID3")
    || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0) // MP3 frame (layer bits set)
    || (b[0] === 0xff && (b[1] & 0xf6) === 0xf0);                      // AAC ADTS
}

/** Pixel size of a photo from its first bytes (PNG, GIF, WebP, JPEG; null for anything else, HEIC included).
 *  The panel detail uses it to reserve each photo's space before it loads. JPEG needs the bytes up to its SOF marker. */
export function photoSize(b: Uint8Array): { w: number; h: number } | null {
  const u16be = (i: number) => (b[i] << 8) | b[i + 1], u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16), u32be = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const ok = (w: number, h: number) => (w > 0 && h > 0 ? { w, h } : null);
  if (b.length >= 24 && starts(b, [0x89, 0x50, 0x4e, 0x47]) && ascii(b, 12, "IHDR")) return ok(u32be(16), u32be(20));
  if (b.length >= 10 && ascii(b, 0, "GIF8")) return ok(u16le(6), u16le(8));
  if (b.length >= 30 && isRiff(b, "WEBP")) {
    if (ascii(b, 12, "VP8 ")) return ok(u16le(26) & 0x3fff, u16le(28) & 0x3fff);
    if (ascii(b, 12, "VP8L")) return ok(1 + (((b[22] & 0x3f) << 8) | b[21]), 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | (b[22] >> 6)));
    if (ascii(b, 12, "VP8X")) return ok(1 + u24le(24), 1 + u24le(27));
    return null;
  }
  if (starts(b, [0xff, 0xd8])) {
    // Walk the segments to the frame header (SOF0–SOF15, except DHT C4, JPG C8 and DAC CC).
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return ok(u16be(i + 7), u16be(i + 5));
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
      i += 2 + u16be(i + 2);
    }
  }
  return null;
}
