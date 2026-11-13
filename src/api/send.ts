// Send (ADR 0002): POST /api/drafts/:id/send turns an `uploading` draft into a message.
// For every file in `incoming/<id>/` it checks the size (HEAD) and the real type (magic bytes of the first 4 KB),
// (media, the audio track of a video when the browser sent one, photos), then copies the files to `media/<id>/` (originals deleted once committed), saves name, anonymous flag and consent, and sets status `new`.
// It enqueues the transcript job on JOBS just before committing (a queue error → 503, nothing committed).
// A file that fails the check deletes the draft's files and marks it `rejected`. A file not uploaded yet → 409.
// What the subscriber chose is saved first (`send_request`), so the hourly sweep (src/jobs/sweep.ts) can finish a
// send the browser never confirmed through the same `finishSend`.
import type { Hono } from "hono";
import type { Env } from "../index";
import { MAX_BYTES, MAX_PHOTOS, MAX_PHOTO_BYTES, MAX_TRACK_BYTES } from "./drafts";
import { sniff } from "./sniff";

export const MAX_NAME = 60;
const HEAD_BYTES = 4096;

export type Draft = { id: string; kind: "audio" | "video"; media_key: string };
// The choices made on the form, already cleaned (consent is implied: no request is saved without it).
export type SendRequest = { name: string | null; anonymous: boolean; track: boolean; photos: number[] };
type File = { from: string; to: string; kind: "audio" | "video" | "photo"; max: number };

// Size from HEAD; real type from the first 4 KB only (never the whole file).
const head = async (bucket: R2Bucket, key: string) => {
  const meta = await bucket.head(key);
  if (!meta) return null;
  if (!meta.size) return { size: 0, bytes: new Uint8Array() };
  const obj = await bucket.get(key, { range: { offset: 0, length: Math.min(HEAD_BYTES, meta.size) } });
  return { size: meta.size, bytes: obj ? new Uint8Array(await obj.arrayBuffer()) : new Uint8Array() };
};

// R2 has no rename: copy (streamed, so a 300 MB video never sits in memory). The incoming/ originals are deleted
// only after D1 says `new`, so a storage error halfway leaves the draft whole and Send can simply be retried.
const copy = async (bucket: R2Bucket, from: string, to: string) => {
  const obj = await bucket.get(from);
  if (!obj) throw new Error(`missing ${from}`);
  const { readable, writable } = new FixedLengthStream(obj.size);
  const [, put] = await Promise.all([obj.body.pipeTo(writable), bucket.put(to, readable, { httpMetadata: obj.httpMetadata })]);
  if (!put) throw new Error(`copy failed ${to}`);
};

export const deleteIncoming = async (bucket: R2Bucket, id: string) => {
  const list = await bucket.list({ prefix: `incoming/${id}/` });
  if (list.objects.length) await bucket.delete(list.objects.map((o) => o.key));
};

type SendEnv = Pick<Env, "DB" | "MEDIA" | "JOBS">;
type Result = { status: 200 | 404 | 409 | 422 | 503; body: Record<string, unknown> };

// Check, move, enqueue, commit. Shared by the Send route and the hourly sweep; every outcome but 200/422 leaves the
// draft `uploading` with its files in incoming/, so it can be tried again.
export const finishSend = async (env: SendEnv, draft: Draft, req: SendRequest): Promise<Result> => {
  const db = env.DB, bucket = env.MEDIA, id = draft.id, { name, anonymous, track } = req;
  const files: File[] = [
    { from: draft.media_key, to: `media/${id}/media`, kind: draft.kind, max: MAX_BYTES },
    ...(track ? [{ from: `incoming/${id}/audio`, to: `media/${id}/audio`, kind: "audio" as const, max: MAX_TRACK_BYTES }] : []),
    ...[...req.photos].sort((x, y) => x - y).map((n) => ({ from: `incoming/${id}/photo-${n}`, to: `media/${id}/photo-${n}`, kind: "photo" as const, max: MAX_PHOTO_BYTES })),
  ];
  const heads = await Promise.all(files.map((f) => head(bucket, f.from)));
  if (heads.some((h) => !h)) return { status: 409, body: { error: "not uploaded" } };
  const bad = files.filter((f, i) => { const h = heads[i]!; return h.size < 1 || h.size > f.max || !sniff(f.kind, h.bytes); });
  if (bad.length) {
    await deleteIncoming(bucket, id);
    await db.prepare("UPDATE submissions SET status = 'rejected', send_request = NULL WHERE id = ? AND status = 'uploading'").bind(id).run();
    return { status: 422, body: { error: "invalid file", files: bad.map((f) => f.from.split("/").pop()) } };
  }

  try { for (const f of files) await copy(bucket, f.from, f.to); }
  catch { return { status: 503, body: { error: "storage" } }; } // nothing committed: the browser (or the sweep) can send again
  // Transcript and tags in the background (ADR 0004). Enqueued before the commit so a queue outage can't lose
  // the job: Send answers 503 and stays retryable. A job that arrives before the commit is retried by the consumer.
  try { await env.JOBS.send({ id }); }
  catch (e) { console.log(`enqueue ${id} failed: ${(e as Error)?.message || e}`); return { status: 503, body: { error: "queue" } }; }
  const photoKeys = files.filter((f) => f.kind === "photo").map((f) => f.to);
  const r = await db.prepare("UPDATE submissions SET status = 'new', consent_at = datetime('now'), name = ?, anonymous = ?, media_key = ?, audio_key = ?, photo_keys = ?, send_request = NULL WHERE id = ? AND status = 'uploading'")
    .bind(name, anonymous ? 1 : 0, files[0].to, track ? `media/${id}/audio` : null, JSON.stringify(photoKeys), id).run();
  if (!r.meta.changes) return { status: 404, body: { error: "not found" } };
  // Committed: now drop the originals (and photos removed before Send). A failure here only leaves junk in
  // incoming/, never a broken message.
  await deleteIncoming(bucket, id).catch(() => {});
  return { status: 200, body: { id, status: "new", name } };
};

export const registerSend = (app: Hono<{ Bindings: Env }>) => {
  app.post("/api/drafts/:id/send", async (c) => {
    const b = await c.req.json<any>().catch(() => null);
    if (b?.consent !== true) return c.json({ error: "consent required" }, 400);
    const photos: unknown = b.photos ?? [];
    if (!Array.isArray(photos) || photos.length > MAX_PHOTOS || new Set(photos).size !== photos.length
      || !photos.every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_PHOTOS))
      return c.json({ error: "invalid photos" }, 400);
    if (b.name != null && typeof b.name !== "string") return c.json({ error: "invalid name" }, 400);

    const db = c.env.DB, id = c.req.param("id");
    const draft = await db.prepare("SELECT id, kind, media_key FROM submissions WHERE id = ? AND status = 'uploading'").bind(id).first<Draft>();
    if (!draft) return c.json({ error: "not found" }, 404);
    // Anonymous is audio only, and hides the name: an anonymous message never stores one.
    const anonymous = draft.kind === "audio" && b.anonymous === true;
    const name = anonymous ? null : String(b.name || "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME) || null;
    // `track: true`: the browser uploaded the audio track of the video (ADR 0003) and it must be there too.
    const req: SendRequest = { name, anonymous, track: draft.kind === "video" && b.track === true, photos: photos as number[] };
    // Saved before anything can fail, so the sweep can finish this send if the browser never hears back.
    await db.prepare("UPDATE submissions SET send_request = ?, send_at = datetime('now') WHERE id = ? AND status = 'uploading'").bind(JSON.stringify(req), id).run();
    const r = await finishSend(c.env, draft, req);
    return c.json(r.body, r.status);
  });
};
