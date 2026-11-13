// Panel detail (docs/design/panel-detail.png): one message with its player, transcript, photos, status and tags,
// "Baixar arquivos (.zip)" and "Apagar envio". Everything here sits behind the panel guard (src/index.ts).
//   GET    /painel/envio/:id                  the page
//   GET    /painel/arquivo/:id/:file          media | audio | photo-N, streamed from R2 (Range for the player)
//   GET    /painel/envio/:id/arquivos.zip     media, audio track, photos and transcript in one streamed zip
//   POST   /api/panel/submissions/:id         { status?, tags? }
//   DELETE /api/panel/submissions/:id         deletes the R2 objects, then the row
// MCP get_submission adds `downloads` (see downloadUrls): signed R2 GET URLs (15 min) when the S3 keys are set.
import type { Hono } from "hono";
import type { Env } from "../index";
import { BUCKET, s3Of, URL_TTL } from "../api/drafts";
import { presign } from "../api/s3";
import { cleanTagList } from "../jobs/transcribe";
import { detailPage } from "../pages";
import { zipStream, type ZipEntry } from "./zip";

export const STATUSES = ["new", "favorite", "used"];
export const MAX_OWNER_TAGS = 10;

export type Row = {
  id: string; created_at: string; status: string; kind: "audio" | "video"; name: string | null; anonymous: number;
  duration_s: number | null; media_key: string | null; audio_key: string | null; photo_keys: string; transcript: string | null;
  transcript_error: string | null; tags: string;
};
const getRow = (db: D1Database, id: string) =>
  db.prepare("SELECT * FROM submissions WHERE id = ? AND status != 'uploading'").bind(id).first<Row>();

/** The message's files by name (media, audio, photo-N) → R2 key. Only keys saved in the row are ever read. */
export const filesOf = (r: Row) => {
  const out: [string, string][] = [];
  if (r.media_key && r.status !== "rejected") out.push(["media", r.media_key]);
  if (r.audio_key && r.status !== "rejected") out.push(["audio", r.audio_key]);
  for (const k of JSON.parse(r.photo_keys || "[]") as string[]) out.push([k.split("/").pop()!, k]);
  return out;
};

// Real type from the bytes (Send already checked them), never the Content-Type the browser sent.
const ascii = (b: Uint8Array, at: number, s: string) => [...s].every((ch, i) => b[at + i] === ch.charCodeAt(0));
export const typeOf = (b: Uint8Array, kind: "audio" | "video" | "photo"): { type: string; ext: string } => {
  if (kind === "photo") {
    if (ascii(b, 0, "\x89PNG")) return { type: "image/png", ext: "png" };
    if (b[0] === 0xff && b[1] === 0xd8) return { type: "image/jpeg", ext: "jpg" };
    if (ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return { type: "image/webp", ext: "webp" };
    if (ascii(b, 0, "GIF8")) return { type: "image/gif", ext: "gif" };
    if (ascii(b, 4, "ftyp")) return { type: "image/heic", ext: "heic" };
    return { type: "application/octet-stream", ext: "bin" };
  }
  const video = kind === "video";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { type: video ? "video/webm" : "audio/webm", ext: "webm" };
  if (ascii(b, 4, "ftyp")) return ascii(b, 8, "qt  ") ? { type: "video/quicktime", ext: "mov" } : video ? { type: "video/mp4", ext: "mp4" } : { type: "audio/mp4", ext: "m4a" };
  if (["moov", "mdat", "wide", "free", "skip"].some((a) => ascii(b, 4, a))) return { type: "video/quicktime", ext: "mov" };
  if (ascii(b, 0, "OggS")) return { type: video ? "video/ogg" : "audio/ogg", ext: "ogg" };
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE")) return { type: "audio/wav", ext: "wav" };
  if (ascii(b, 0, "fLaC")) return { type: "audio/flac", ext: "flac" };
  if (ascii(b, 0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0)) return { type: "audio/mpeg", ext: "mp3" };
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return { type: "audio/aac", ext: "aac" };
  return { type: "application/octet-stream", ext: "bin" };
};
const kindOf = (r: Row, file: string): "audio" | "video" | "photo" => (file === "media" ? r.kind : file === "audio" ? "audio" : "photo");
const firstBytes = async (bucket: R2Bucket, key: string) => {
  const o = await bucket.get(key, { range: { offset: 0, length: 16 } });
  return o ? new Uint8Array(await o.arrayBuffer()) : null;
};

/** Download URLs for the agent: signed R2 GETs (15 min) in production; the guarded panel route when there are no S3 keys (local dev). */
export const downloadUrls = async (env: Env, r: Row, origin: string) => {
  const s3 = s3Of(env), out: { expires_in: number | null; media?: string; audio?: string; photos: string[] } = { expires_in: s3 ? URL_TTL : null, photos: [] };
  for (const [file, key] of filesOf(r)) {
    const url = s3 ? await presign(s3, "GET", `/${BUCKET}/${key}`, { expires: URL_TTL }) : `${origin}/painel/arquivo/${encodeURIComponent(r.id)}/${file}`;
    if (file === "media" || file === "audio") out[file] = url; else out.photos.push(url);
  }
  return out;
};

// A browser on another site can't send JSON or DELETE here without CORS, which this Worker never grants;
// an explicit Origin from elsewhere is refused anyway.
const sameOrigin = (c: any) => { const o = c.req.header("origin"); return !o || o === new URL(c.req.url).origin; };

export const registerPanel = (app: Hono<{ Bindings: Env }>) => {
  app.get("/painel/envio/:id", async (c) => {
    const r = await getRow(c.env.DB, c.req.param("id"));
    if (!r) return c.html(detailPage(null, { user: "" }), 404);
    return c.html(detailPage(r, { user: c.req.header("cf-access-authenticated-user-email") || "" }));
  });

  app.get("/painel/arquivo/:id/:file{media|audio|photo-(?:[1-9]|10)}", async (c) => {
    const r = await getRow(c.env.DB, c.req.param("id")), file = c.req.param("file");
    const key = r && filesOf(r).find(([f]) => f === file)?.[1];
    const head = key ? await firstBytes(c.env.MEDIA, key) : null;
    if (!r || !key || !head) return c.text("not found", 404);
    const range = c.req.header("range");
    const obj = (range ? await c.env.MEDIA.get(key, { range: c.req.raw.headers }).catch(() => null) : null) ?? await c.env.MEDIA.get(key);
    if (!obj) return c.text("not found", 404);
    const { type, ext } = typeOf(head, kindOf(r, file));
    const h = new Headers({ "content-type": type, "accept-ranges": "bytes", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox", "content-disposition": `inline; filename="${file}.${ext}"` });
    const rg = obj.range as { offset?: number; length?: number } | undefined;
    if (range && rg && rg.offset != null) {
      const len = rg.length ?? obj.size - rg.offset;
      h.set("content-range", `bytes ${rg.offset}-${rg.offset + len - 1}/${obj.size}`); h.set("content-length", String(len));
      return new Response(obj.body, { status: 206, headers: h });
    }
    h.set("content-length", String(obj.size));
    return new Response(obj.body, { headers: h });
  });

  app.get("/painel/envio/:id/arquivos.zip", async (c) => {
    const r = await getRow(c.env.DB, c.req.param("id"));
    if (!r) return c.text("not found", 404);
    const bucket = c.env.MEDIA, entries: ZipEntry[] = [];
    for (const [file, key] of filesOf(r)) {
      const head = await firstBytes(bucket, key);
      if (!head) continue;
      const { ext } = typeOf(head, kindOf(r, file));
      const name = file === "media" ? `${r.kind === "video" ? "video" : "audio"}.${ext}` : file === "audio" ? `audio-do-video.${ext}` : `${file.replace("photo", "foto")}.${ext}`;
      entries.push({ name, open: async () => (await bucket.get(key))?.body ?? null });
    }
    const who = r.anonymous ? "Anônimo" : r.name || "Sem nome";
    const text = `${who}\n${r.created_at} UTC\n\n${r.transcript ?? "(sem transcrição)"}\n\nTags: ${(JSON.parse(r.tags || "[]") as string[]).join(", ")}\n`;
    entries.push({ name: "transcricao.txt", open: async () => new TextEncoder().encode(text) });
    return new Response(zipStream(entries), { headers: {
      "content-type": "application/zip", "content-disposition": `attachment; filename="coffee-time-${r.id.slice(0, 8).replace(/[^\w-]/g, "")}.zip"`,
      "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  });

  app.post("/api/panel/submissions/:id", async (c) => {
    if (!sameOrigin(c)) return c.json({ error: "forbidden" }, 403);
    const b = await c.req.json<any>().catch(() => null);
    if (!b || (b.status === undefined && b.tags === undefined)) return c.json({ error: "nothing to change" }, 400);
    if (b.status !== undefined && !STATUSES.includes(b.status)) return c.json({ error: "invalid status" }, 400);
    if (b.tags !== undefined && (!Array.isArray(b.tags) || b.tags.length > 50)) return c.json({ error: "invalid tags" }, 400);
    const r = await getRow(c.env.DB, c.req.param("id"));
    if (!r || r.status === "rejected") return c.json({ error: "not found" }, 404);
    const status = b.status ?? r.status, tags = b.tags !== undefined ? cleanTagList(b.tags, MAX_OWNER_TAGS) : JSON.parse(r.tags || "[]");
    await c.env.DB.prepare("UPDATE submissions SET status = ?, tags = ? WHERE id = ?").bind(status, JSON.stringify(tags), r.id).run();
    return c.json({ id: r.id, status, tags });
  });

  app.delete("/api/panel/submissions/:id", async (c) => {
    if (!sameOrigin(c)) return c.json({ error: "forbidden" }, 403);
    const r = await getRow(c.env.DB, c.req.param("id"));
    if (!r) return c.json({ error: "not found" }, 404);
    // Files first: if R2 fails, the row stays and the owner can try again. Strays under the message's prefixes go too.
    const keys = new Set(filesOf(r).map(([, k]) => k));
    for (const k of [r.media_key, r.audio_key]) if (k) keys.add(k);
    for (const prefix of [`media/${r.id}/`, `incoming/${r.id}/`]) for (const o of (await c.env.MEDIA.list({ prefix })).objects) keys.add(o.key);
    if (keys.size) await c.env.MEDIA.delete([...keys]);
    await c.env.DB.prepare("DELETE FROM submissions WHERE id = ?").bind(r.id).run();
    return c.json({ ok: true, deleted: keys.size });
  });
};
