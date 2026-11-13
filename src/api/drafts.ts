// Drafts (ADR 0002): as soon as there is media, the browser asks for a draft and uploads straight to R2 `incoming/<id>/`.
// POST /api/drafts checks Turnstile and a per-IP rate limit, inserts the submission as `uploading` and returns
// short-lived signed URLs. Locally (no S3 secrets, DEV_OPEN on localhost) the upload goes through a Worker route instead.
import type { Hono } from "hono";
import type { Env } from "../index";
import { createMultipart, multipartUrls, presign, type S3 } from "./s3";

export const URL_TTL = 900;                    // signed URLs live 15 min
export const PART_SIZE = 10 * 1024 * 1024;     // multipart above 10 MB, in 10 MB parts
export const MAX_BYTES = 300 * 1024 * 1024;    // browsers without WebCodecs upload the original, up to 300 MB
export const RATE_LIMIT = 5;                   // drafts per IP per minute
export const MAX_PHOTOS = 10;                  // photos per message
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024; // one photo, as picked (compression to WebP comes later)
const BUCKET = "coffee-time-media";            // same bucket as the MEDIA binding in wrangler.jsonc

// Cloudflare's documented Turnstile test secrets (always pass / always fail / token already spent).
// Answered without a network call only in local dev, so `npm run verify` works offline.
const TEST_SECRETS: Record<string, boolean> = {
  "1x0000000000000000000000000000000AA": true,
  "2x0000000000000000000000000000000AA": false,
  "3x0000000000000000000000000000000AA": false,
};
export async function checkTurnstile(token: unknown, secret: string | undefined, ip: string, offlineTestKeys = false) {
  if (typeof token !== "string" || !token || token.length > 2048 || !secret) return false;
  if (offlineTestKeys && secret in TEST_SECRETS) return TEST_SECRETS[secret];
  const body = new FormData();
  body.append("secret", secret); body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body }).catch(() => null);
  const data = await r?.json<{ success?: boolean }>().catch(() => null);
  return data?.success === true;
}

export const isLocalDev = (env: Env, url: string) => {
  const host = new URL(url).hostname;
  return env.DEV_OPEN === "1" && (host === "localhost" || host === "127.0.0.1");
};
const s3Of = (env: Env): S3 | null =>
  env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ACCOUNT_ID
    ? { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, host: `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region: "auto" }
    : null;

// The IP is only kept, hashed, for one minute.
const ipHash = async (ip: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("coffee-time:" + ip)))].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");

export const registerDrafts = (app: Hono<{ Bindings: Env }>) => {
  app.post("/api/drafts", async (c) => {
    const b = await c.req.json<any>().catch(() => null);
    const kind = b?.kind, type = String(b?.type || ""), size = b?.size, duration = Number(b?.duration);
    if ((kind !== "audio" && kind !== "video") || !type.startsWith(kind + "/") || type.length > 100 || !Number.isInteger(size) || size < 1 || size > MAX_BYTES)
      return c.json({ error: "invalid draft" }, 400);

    const dev = isLocalDev(c.env, c.req.url), ip = c.req.header("cf-connecting-ip") || "local";
    if (!(await checkTurnstile(b.token, c.env.TURNSTILE_SECRET, ip, dev))) return c.json({ error: "turnstile" }, 403);

    // Count and take a slot in one statement (atomic in SQLite), so concurrent requests can't all slip under the limit.
    const db = c.env.DB, hash = await ipHash(ip), now = Date.now();
    const [, slot] = await db.batch([
      db.prepare("DELETE FROM draft_hits WHERE at < ?").bind(now - 60_000),
      db.prepare("INSERT INTO draft_hits (ip_hash, at) SELECT ?1, ?2 WHERE (SELECT COUNT(*) FROM draft_hits WHERE ip_hash = ?1 AND at >= ?3) < ?4")
        .bind(hash, now, now - 60_000, RATE_LIMIT),
    ]);
    if (slot.meta.changes !== 1) return c.json({ error: "rate limit" }, 429);

    const s3 = s3Of(c.env);
    if (!s3 && !dev) return c.json({ error: "uploads not configured" }, 503);
    const id = crypto.randomUUID(), key = `incoming/${id}/media`, path = `/${BUCKET}/${key}`;
    let upload: Record<string, unknown>;
    if (!s3) upload = { mode: "local", url: `/api/drafts/${id}/media` };
    else if (size > PART_SIZE) {
      const parts = Math.ceil(size / PART_SIZE), uploadId = await createMultipart(s3, path, type);
      upload = { mode: "multipart", part_size: PART_SIZE, ...(await multipartUrls(s3, path, uploadId, parts, URL_TTL)) };
    } else upload = { mode: "single", url: await presign(s3, "PUT", path, { expires: URL_TTL }) };

    await db.prepare("INSERT INTO submissions (id, status, kind, duration_s, media_key) VALUES (?, 'uploading', ?, ?, ?)")
      .bind(id, kind, Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null, key).run();
    return c.json({ id, key, expires_in: URL_TTL, upload }, 201);
  });

  // Photos (up to 10): the browser picks a slot 1–10 and gets one signed URL for `incoming/<id>/photo-<n>`.
  // The draft id (random, only known to the sender) is the capability; Send checks every file before it counts.
  app.post("/api/drafts/:id/photos", async (c) => {
    const b = await c.req.json<any>().catch(() => null);
    const n = b?.n, type = String(b?.type || ""), size = b?.size;
    if (!Number.isInteger(n) || n < 1 || n > MAX_PHOTOS || !type.startsWith("image/") || type.length > 100 || !Number.isInteger(size) || size < 1 || size > MAX_PHOTO_BYTES)
      return c.json({ error: "invalid photo" }, 400);
    const id = c.req.param("id");
    const row = await c.env.DB.prepare("SELECT id FROM submissions WHERE id = ? AND status = 'uploading' AND created_at >= datetime('now', '-24 hours')").bind(id).first();
    if (!row) return c.json({ error: "not found" }, 404);
    const s3 = s3Of(c.env), dev = isLocalDev(c.env, c.req.url);
    if (!s3 && !dev) return c.json({ error: "uploads not configured" }, 503);
    const key = `incoming/${id}/photo-${n}`;
    const upload = s3 ? { mode: "single", url: await presign(s3, "PUT", `/${BUCKET}/${key}`, { expires: URL_TTL }) } : { mode: "local", url: `/api/drafts/${id}/photo-${n}` };
    return c.json({ key, expires_in: URL_TTL, upload }, 201);
  });

  // Local dev only: stands in for the signed URLs when the S3 secrets are absent. Never active in production.
  // The media must arrive within 15 min of the draft (like its signed URL); photos while the draft is open.
  app.put("/api/drafts/:id/:file{media|photo-(?:[1-9]|10)}", async (c) => {
    if (s3Of(c.env) || !isLocalDev(c.env, c.req.url)) return c.json({ error: "not found" }, 404);
    const id = c.req.param("id"), file = c.req.param("file"), photo = file !== "media";
    const row = await c.env.DB.prepare(`SELECT id FROM submissions WHERE id = ? AND status = 'uploading' AND created_at >= datetime('now', ?)`)
      .bind(id, photo ? "-24 hours" : "-15 minutes").first();
    if (!row) return c.json({ error: "not found" }, 404);
    const body = await c.req.arrayBuffer();
    if (!body.byteLength || body.byteLength > (photo ? MAX_PHOTO_BYTES : MAX_BYTES)) return c.json({ error: "invalid size" }, 400);
    await c.env.MEDIA.put(`incoming/${id}/${file}`, body, { httpMetadata: { contentType: c.req.header("content-type") || "application/octet-stream" } });
    return c.body(null, 200);
  });
};
