// Transcript and tags (ADR 0004). Send enqueues `{ id }` on JOBS; this consumer reads the audio from R2, transcribes
// it with Whisper (pt-BR), asks a text model for free-form tags (a type such as "Dúvida"/"História" plus topics) and
// saves both in D1. A failing job throws: the queue retries it with backoff and, after max_retries, moves it to the
// dead-letter queue, whose consumer only notes `transcript_error`. The message itself is never touched.
import type { Env } from "../index";

export const JOBS_QUEUE = "coffee-time-jobs", DLQ = "coffee-time-jobs-dlq";
export const WHISPER = "@cf/openai/whisper-large-v3-turbo", TAGGER = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // a 90 s message is ~1–2 MB; larger means a video with no audio track
export const MAX_TAGS = 6, MAX_TAG = 30;
export type Job = { id: string };

const TAG_PROMPT = `Você organiza mensagens de inscritos de um canal de vlogs. Leia a transcrição e responda só em JSON:
{"type": "...", "topics": ["...", "..."]}
- type: uma palavra ou duas que dizem o que é a mensagem, por exemplo "Dúvida", "História", "Sugestão", "Elogio", "Crítica".
- topics: de 1 a 4 temas curtos e específicos, por exemplo "Carreira", "Kafka", "Lisboa", "Entrevista".
Tudo em português, com inicial maiúscula.`;
const TAG_SCHEMA = { type: "object", properties: { type: { type: "string" }, topics: { type: "array", items: { type: "string" } } }, required: ["type", "topics"] };

// Base64 in chunks (String.fromCharCode on a whole file overflows the stack).
const base64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

// Model output → clean tag list: type first, then topics; trimmed, ≤ 30 chars on a word boundary, no duplicates (case-insensitive).
export const cleanTags = (out: unknown): string[] => {
  let v: any = out;
  if (typeof v === "string") { try { v = JSON.parse(v.slice(v.indexOf("{"), v.lastIndexOf("}") + 1)); } catch { v = null; } }
  const raw = [v?.type, ...(Array.isArray(v?.topics) ? v.topics : [])];
  const seen = new Set<string>(), tags: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    let tag = t.replace(/\s+/g, " ").trim();
    if (tag.length > MAX_TAG) { const cut = tag.slice(0, MAX_TAG + 1); tag = (cut.includes(" ") ? cut.slice(0, cut.lastIndexOf(" ")) : cut.slice(0, MAX_TAG)).trim(); } // whole words
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase()); tags.push(tag);
    if (tags.length === MAX_TAGS) break;
  }
  return tags;
};

export const transcribe = async (env: Env, id: string) => {
  const row = await env.DB.prepare("SELECT status, kind, media_key, audio_key, transcript FROM submissions WHERE id = ? AND status != 'rejected'")
    .bind(id).first<{ status: string; kind: string; media_key: string | null; audio_key: string | null; transcript: string | null }>();
  if (!row || row.transcript != null) return; // deleted, or already done (a queue may deliver twice)
  // Send enqueues just before it commits: a job that beats the commit is retried, never dropped.
  if (row.status === "uploading") throw new Error(`${id} not committed yet`);
  // Audio: the message itself. Video: its audio track from the browser (ADR 0003), else the video file.
  const key = row.audio_key || row.media_key;
  const obj = key ? await env.MEDIA.get(key) : null;
  if (!obj) throw new Error(`no media for ${id}`);
  if (obj.size > MAX_AUDIO_BYTES) throw new Error(`media too large to transcribe (${obj.size} bytes)`);
  const audio = base64(new Uint8Array(await obj.arrayBuffer()));
  const w = await env.AI.run(WHISPER as any, { audio, language: "pt", task: "transcribe", vad_filter: true } as any) as { text?: string };
  if (typeof w?.text !== "string") throw new Error("whisper: no text");
  const transcript = w.text.replace(/\s+/g, " ").trim();
  let tags: string[] = [];
  if (transcript) {
    const t = await env.AI.run(TAGGER as any, {
      messages: [{ role: "system", content: TAG_PROMPT }, { role: "user", content: transcript.slice(0, 6000) }],
      response_format: { type: "json_schema", json_schema: TAG_SCHEMA }, max_tokens: 200,
    } as any) as { response?: unknown };
    tags = cleanTags(t?.response);
  }
  await env.DB.prepare("UPDATE submissions SET transcript = ?, tags = ?, transcript_error = NULL WHERE id = ? AND transcript IS NULL")
    .bind(transcript, JSON.stringify(tags), id).run();
};

// Backoff: 30 s, 60 s, 120 s … capped at 15 min. JOBS_RETRY_BASE_S overrides the base (verify sets 0).
const backoff = (env: Env, attempts: number) => {
  const base = Number(env.JOBS_RETRY_BASE_S ?? 30);
  return Math.min(900, (Number.isFinite(base) && base >= 0 ? base : 30) * 2 ** Math.max(0, attempts - 1));
};

export const queue = async (batch: MessageBatch<Job>, env: Env) => {
  for (const msg of batch.messages) {
    const id = typeof msg.body?.id === "string" ? msg.body.id : null;
    if (!id) { msg.ack(); continue; }
    if (batch.queue === DLQ) {
      // Gave up: keep the message, note the failure so the panel stops saying "Transcrevendo…".
      await env.DB.prepare("UPDATE submissions SET transcript_error = datetime('now') WHERE id = ? AND transcript IS NULL").bind(id).run();
      msg.ack(); continue;
    }
    try { await transcribe(env, id); msg.ack(); }
    catch (e) { console.log(`transcribe ${id} attempt ${msg.attempts} failed: ${(e as Error).message}`); msg.retry({ delaySeconds: backoff(env, msg.attempts) }); }
  }
};
