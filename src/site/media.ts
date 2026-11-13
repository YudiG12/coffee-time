// Browser-side media work (ADR 0003), bundled to public/media.js by scripts/build-site.mjs and loaded by the start page
// with import("/media.js"). Nothing here runs on the server.
// - distortVoice: anonymous audio, pitch and formants shifted before upload, so the original voice never leaves the device.
// - compressVideo: 1080p at ~5 Mbps with WebCodecs (Mediabunny), plus its audio track as a separate file for transcription.
// - toWebp: photos resized to ≤ 2000 px WebP.
// Without WebCodecs (old browsers) compressVideo returns null and the page uploads the original with a warning.
import {
  ADTS, FLAC, MATROSKA, MP3, MP4, OGG, QTFF, WAVE, WEBM, AudioBufferSource, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, WebMOutputFormat,
  canEncodeAudio, canEncodeVideo,
} from "mediabunny";

export const VIDEO_BITRATE = 5_000_000;
export const VIDEO_SHORT_SIDE = 1080, VIDEO_LONG_SIDE = 1920;
export const PHOTO_MAX = 2000, PHOTO_QUALITY = 0.85;
// Voice: pitch ×0.78 (about 4 semitones down) and formants ×0.88, shifted independently so the voice sounds like
// another person. Needs an ear test before launch (ADR 0003).
export const PITCH = 0.78, FORMANT = 0.88;
const SR = 24000; // speech needs no more; also what Whisper resamples to (16 kHz) comfortably

// Every container a phone or a recorder produces; not HLS or MPEG-TS (keeps public/media.js small).
const FORMATS = [MP4, QTFF, WEBM, MATROSKA, OGG, WAVE, MP3, ADTS, FLAC];

export const hasWebCodecs = () => typeof VideoEncoder === "function" && typeof AudioEncoder === "function" && typeof VideoDecoder === "function";

// ---- Voice distortion: phase vocoder with a spectral envelope, so pitch and formants move by different factors.

// In-place radix-2 FFT (n a power of two). `inv` gives the unscaled inverse.
const fft = (re: Float64Array, im: Float64Array, inv: boolean) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = ((inv ? 2 : -2) * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
};

/** Shifts the pitch by `pitch` and the formants by `formant`, keeping the duration. Mono samples in, same length out. */
export function shiftVoice(x: Float32Array, pitch = PITCH, formant = FORMANT): Float32Array<ArrayBuffer> {
  const N = 1024, OS = 4, hop = N / OS, half = N / 2, W = 8; // W: envelope smoothing, ±8 bins (~±190 Hz at 24 kHz)
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const len = x.length, padded = new Float32Array(len + 2 * N); padded.set(x, N);
  const out = new Float64Array(padded.length + N);
  const lastPh = new Float64Array(half + 1), sumPh = new Float64Array(half + 1), expct = (2 * Math.PI * hop) / N;
  const re = new Float64Array(N), im = new Float64Array(N);
  const mag = new Float64Array(half + 1), bin = new Float64Array(half + 1), logm = new Float64Array(half + 1), env = new Float64Array(half + 1);
  const sMag = new Float64Array(half + 1), sBin = new Float64Array(half + 1);
  const envAt = (b: number) => { const i = Math.min(half - 1, Math.max(0, Math.floor(b))), f = Math.min(1, Math.max(0, b - i)); return env[i] * (1 - f) + env[i + 1] * f; };
  for (let pos = 0; pos + N <= padded.length; pos += hop) {
    for (let i = 0; i < N; i++) { re[i] = padded[pos + i] * win[i]; im[i] = 0; }
    fft(re, im, false);
    for (let k = 0; k <= half; k++) {
      mag[k] = Math.hypot(re[k], im[k]);
      const ph = Math.atan2(im[k], re[k]);
      let d = ph - lastPh[k] - k * expct; lastPh[k] = ph;
      d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      bin[k] = k + (d * OS) / (2 * Math.PI);
      logm[k] = Math.log(mag[k] + 1e-9);
    }
    // Spectral envelope (formants): moving average of the log magnitude.
    let acc = 0, cnt = 0;
    for (let k = 0; k <= Math.min(W, half); k++) { acc += logm[k]; cnt++; }
    for (let k = 0; k <= half; k++) {
      env[k] = Math.exp(acc / cnt);
      if (k + W + 1 <= half) { acc += logm[k + W + 1]; cnt++; }
      if (k - W >= 0) { acc -= logm[k - W]; cnt--; }
    }
    sMag.fill(0); sBin.fill(0);
    for (let k = 0; k <= half; k++) {
      const j = Math.round(k * pitch);
      if (j > half) break;
      sMag[j] += mag[k] / env[k]; // excitation (harmonics) moves with the pitch…
      sBin[j] = bin[k] * pitch;
    }
    for (let j = 0; j <= half; j++) {
      sMag[j] *= envAt(j / formant);  // …and the envelope with the formant factor
      sumPh[j] += (sBin[j] - j) * (2 * Math.PI / OS) + j * expct;
      re[j] = sMag[j] * Math.cos(sumPh[j]); im[j] = sMag[j] * Math.sin(sumPh[j]);
    }
    for (let j = 1; j < half; j++) { re[N - j] = re[j]; im[N - j] = -im[j]; }
    im[0] = 0; im[half] = 0;
    fft(re, im, true);
    for (let i = 0; i < N; i++) out[pos + i] += (re[i] / N) * win[i];
  }
  // Same loudness as the input, never clipping.
  const y = new Float32Array(len);
  let ein = 0, eout = 0, peak = 0;
  for (let i = 0; i < len; i++) { const v = out[N + i]; ein += x[i] * x[i]; eout += v * v; }
  const g = eout > 0 ? Math.sqrt(ein / eout) : 0;
  for (let i = 0; i < len; i++) { y[i] = out[N + i] * g; peak = Math.max(peak, Math.abs(y[i])); }
  if (peak > 0.99) for (let i = 0; i < len; i++) y[i] *= 0.99 / peak;
  return y;
}

const wav = (x: Float32Array, rate: number) => {
  const b = new DataView(new ArrayBuffer(44 + x.length * 2)), s = (o: number, t: string) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); b.setUint32(4, 36 + x.length * 2, true); s(8, "WAVE"); s(12, "fmt "); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, rate, true); b.setUint32(28, rate * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); s(36, "data"); b.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 0x7fff, true);
  return new Blob([b.buffer], { type: "audio/wav" });
};

/** Anonymous audio: decoded, distorted and re-encoded (Opus in WebM; WAV where the browser can't encode Opus). */
export async function distortVoice(blob: Blob): Promise<Blob> {
  const decoded = await new OfflineAudioContext(1, 1, SR).decodeAudioData(await blob.arrayBuffer());
  const x = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) { const ch = decoded.getChannelData(c); for (let i = 0; i < x.length; i++) x[i] += ch[i] / decoded.numberOfChannels; }
  const y = shiftVoice(x);
  if (hasWebCodecs() && (await canEncodeAudio("opus", { numberOfChannels: 1, sampleRate: SR }).catch(() => false))) {
    const buf = new AudioBuffer({ length: y.length, numberOfChannels: 1, sampleRate: SR }); buf.copyToChannel(y, 0);
    const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
    const src = new AudioBufferSource({ codec: "opus", bitrate: 64_000 });
    output.addAudioTrack(src); await output.start(); await src.add(buf); src.close(); await output.finalize();
    return new Blob([output.target.buffer!], { type: "audio/webm" });
  }
  return wav(y, SR);
}

// ---- Video: 1080p ~5 Mbps, and the audio track alone.

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
/** Output size for a video of w×h: short side ≤ 1080 and long side ≤ 1920, never upscaled. */
export const fit1080 = (w: number, h: number) => {
  const s = Math.min(1, VIDEO_SHORT_SIDE / Math.min(w, h), VIDEO_LONG_SIDE / Math.max(w, h));
  return { width: even(w * s), height: even(h * s) };
};

export type Compressed = { video: Blob; width: number; height: number; track: Blob | null };

/** Re-encodes a picked video. Returns null when the browser has no WebCodecs or can't decode it (upload the original). */
export async function compressVideo(file: Blob, onProgress?: (p: number) => void): Promise<Compressed | null> {
  if (!hasWebCodecs()) return null;
  const input = new Input({ source: new BlobSource(file), formats: FORMATS });
  const vt = await input.getPrimaryVideoTrack();
  if (!vt) return null;
  const { width, height } = fit1080(vt.displayWidth, vt.displayHeight);
  const mp4 = await canEncodeVideo("avc", { width, height, bitrate: VIDEO_BITRATE }).catch(() => false);
  const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target: new BufferTarget() });
  const conv = await Conversion.init({
    input, output, showWarnings: false,
    video: { width, height, fit: "contain", bitrate: VIDEO_BITRATE, codec: mp4 ? "avc" : undefined, forceTranscode: true },
  });
  if (!conv.isValid) return null;
  let track: Blob | null = null;
  conv.onProgress = (p) => onProgress?.(p * 0.85);
  await conv.execute();
  const video = new Blob([output.target.buffer!], { type: mp4 ? "video/mp4" : "video/webm" });
  track = await extractAudio(file).catch(() => null);
  onProgress?.(1);
  // A video already ≤ 1080p that only grew (already well compressed): keep the original.
  const scaled = width < vt.displayWidth || height < vt.displayHeight;
  return !scaled && video.size >= file.size ? { video: file, width: vt.displayWidth, height: vt.displayHeight, track } : { video, width, height, track };
}

/** The audio track alone, for transcription: Opus in WebM (or AAC in MP4). Null when the video has no audio. */
export async function extractAudio(file: Blob): Promise<Blob | null> {
  const input = new Input({ source: new BlobSource(file), formats: FORMATS });
  if (!(await input.getPrimaryAudioTrack())) return null;
  const webm = await canEncodeAudio("opus").catch(() => false);
  const output = new Output({ format: webm ? new WebMOutputFormat() : new Mp4OutputFormat(), target: new BufferTarget() });
  const conv = await Conversion.init({ input, output, showWarnings: false, video: { discard: true }, audio: { codec: webm ? "opus" : "aac", bitrate: 96_000 } });
  if (!conv.isValid) return null;
  await conv.execute();
  return new Blob([output.target.buffer!], { type: webm ? "audio/webm" : "audio/mp4" });
}

// ---- Photos: ≤ 2000 px WebP (JPEG where the browser can't encode WebP, e.g. Safari).

/** Resized photo, or null when the browser can't decode it (e.g. HEIC outside Safari): then the original goes up. */
export async function toWebp(file: Blob): Promise<Blob | null> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bmp) return null;
  const s = Math.min(1, PHOTO_MAX / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const canvas = new OffscreenCanvas(w, h), g = canvas.getContext("2d")!;
  g.drawImage(bmp, 0, 0, w, h); bmp.close();
  const webp = await canvas.convertToBlob({ type: "image/webp", quality: PHOTO_QUALITY });
  return webp.type === "image/webp" ? webp : canvas.convertToBlob({ type: "image/jpeg", quality: PHOTO_QUALITY });
}
