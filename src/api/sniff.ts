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
