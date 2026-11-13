#!/usr/bin/env node
// Verification CLI for agents (Claude builds, Codex verifies). See AGENTS.md "Verify a change".
// Runs the Worker locally on an isolated, throwaway D1 with fake data, checks the API, the MCP and auth,
// and saves screenshots (and a GIF if ffmpeg exists) to verify-out/. Never touches production.
//   npm run verify            -> all checks + screenshots
//   npm run verify -- --keep  -> leave the dev server running to explore
import { spawn, execSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";

const freePort = () => new Promise((r) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const PORT = await freePort();
const BASE = `http://localhost:${PORT}`, STATE = ".verify/state", OUT = "verify-out";
const keep = process.argv.includes("--keep");
const sh = (cmd) => execSync(cmd, { stdio: ["ignore", "pipe", "inherit"] }).toString();
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push({ name, ok: true }); console.log(`PASS  ${name}`); }
  catch (e) { results.push({ name, ok: false, error: String(e.message || e) }); console.log(`FAIL  ${name}: ${e.message || e}`); }
};
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(".verify", { recursive: true, force: true }); rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
console.log("build public/media.js (browser-side media work)…");
sh("node scripts/build-site.mjs");
console.log("migrate + seed (isolated local D1)…");
sh(`npx wrangler d1 migrations apply coffee-time --local --persist-to ${STATE}`);
sh(`npx wrangler d1 execute coffee-time --local --persist-to ${STATE} --file scripts/demo-seed.sql`);

// The Worker runs from a copy of wrangler.jsonc where Workers AI (remote only, needs an account) is replaced by a
// service binding to scripts/fixtures/ai-stub.js, and queue retries are immediate (JOBS_RETRY_BASE_S=0).
const prod = JSON.parse(readFileSync("wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, ""));
assert(prod.ai?.binding === "AI" && prod.queues?.producers?.[0]?.binding === "JOBS", "wrangler.jsonc: AI or JOBS binding missing");
const { ai, ...rest } = prod;
const VCONF = ".verify/wrangler.jsonc", STUBCONF = ".verify/ai-stub.jsonc";
writeFileSync(VCONF, JSON.stringify({
  ...rest, main: "../src/index.ts", assets: { ...prod.assets, directory: "../public" },
  d1_databases: prod.d1_databases.map((d) => ({ ...d, migrations_dir: "../migrations" })),
  services: [{ binding: "AI", service: "coffee-time-ai-stub", entrypoint: "AiStub" }],
  queues: { ...prod.queues, consumers: prod.queues.consumers.map((q) => ({ ...q, max_batch_timeout: 1 })) },
}, null, 2));
writeFileSync(STUBCONF, JSON.stringify({ name: "coffee-time-ai-stub", main: "../scripts/fixtures/ai-stub.js", compatibility_date: prod.compatibility_date }));

let log = "";
const serve = (port, vars) => {
  const args = ["wrangler", "dev", "-c", VCONF, "-c", STUBCONF, "--port", String(port), "--persist-to", STATE, ...["JOBS_RETRY_BASE_S:0", ...vars].flatMap((v) => ["--var", v])];
  const p = spawn("npx", args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
  p.stdout.on("data", (d) => (log += d)); p.stderr.on("data", (d) => (log += d));
  const kill = () => { try { process.kill(-p.pid, "SIGTERM"); } catch {} };
  process.on("exit", kill);
  return kill;
};
const up = async (base) => { for (let i = 0; i < 60; i++) { try { if ((await fetch(base + "/api/health")).ok) return; } catch {} await wait(1000); } throw new Error("server did not start"); };

// Cloudflare's Turnstile test keys (always pass); the Worker answers them offline in local dev.
const TS_SITE = "1x00000000000000000000AA", TS_PASS = "1x0000000000000000000000000000000AA";
const stop = serve(PORT, ["DEV_OPEN:1", `TURNSTILE_SITE_KEY:${TS_SITE}`, `TURNSTILE_SECRET:${TS_PASS}`]);
await up(BASE);

const api = async (path, init) => { const r = await fetch(BASE + path, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } }); return { status: r.status, body: await r.json().catch(() => null) }; };
const mcp = (name, args) => api("/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
const mcpData = async (name, args) => { const r = await mcp(name, args); assert(r.body?.result && !r.body.result.isError, JSON.stringify(r.body).slice(0, 200)); return JSON.parse(r.body.result.content[0].text); };

// ---- API / MCP ----
await check("api: health", async () => { const r = await api("/api/health"); assert(r.status === 200 && r.body.ok, `status ${r.status}`); });
await check("api: panel lists the demo messages", async () => {
  const r = await api("/api/panel/submissions"); assert(r.status === 200 && r.body.length === 3, `got ${r.status} ${r.body?.length}`);
});
await check("api: panel filters by tag and text", async () => {
  const t = await api("/api/panel/submissions?tag=Kafka"); assert(t.body.length === 1, `tag → ${t.body.length}`);
  const q = await api("/api/panel/submissions?q=Lisboa"); assert(q.body.length === 1, `q → ${q.body.length}`);
});
await check("mcp: tools/list has the three tools", async () => {
  const r = await api("/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  const names = (r.body?.result?.tools || []).map((t) => t.name).sort().join(",");
  assert(names === "get_submission,list_submissions,set_status", names);
});
await check("mcp: list_submissions filters favorites", async () => { const d = await mcpData("list_submissions", { status: "favorite" }); assert(d.length === 1 && d[0].id === "demo-2", JSON.stringify(d).slice(0, 120)); });
await check("mcp: get_submission returns transcript and tags", async () => { const d = await mcpData("get_submission", { id: "demo-1" }); assert(d.transcript && JSON.parse(d.tags).includes("Kafka"), "missing fields"); });
await check("mcp: set_status updates and rejects bad values", async () => {
  await mcpData("set_status", { id: "demo-3", status: "used" });
  assert((await mcpData("get_submission", { id: "demo-3" })).status === "used", "not updated");
  const bad = await mcp("set_status", { id: "demo-3", status: "deleted" }); assert(bad.body?.result?.isError, "accepted invalid status");
});

// ---- Drafts and upload (ADR 0002). Each caller gets its own fake IP so the per-IP rate limit is tested in isolation.
let ipN = 0; const fakeIp = () => (++ipN, `10.${(ipN >> 16) & 255}.${(ipN >> 8) & 255}.${ipN & 255}`);
const draft = (body, ip = fakeIp(), base = BASE) => fetch(base + "/api/drafts", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const r2get = (key) => { const f = `.verify/r2-${Date.now()}`; sh(`npx wrangler r2 object get "coffee-time-media/${key}" --local --persist-to ${STATE} --file ${f}`); return readFileSync(f); };
const VIDEO_FX = readFileSync("scripts/fixtures/video-3s-1080p.webm");
// A WAV generated here (fake tone) and a 1×1 PNG, for audio and photo uploads.
const wav = (sec, rate = 8000) => {
  const n = Math.round(sec * rate), b = Buffer.alloc(44 + n);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write("data", 36); b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(40 * Math.sin((2 * Math.PI * 440 * i) / rate));
  return b;
};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const r2has = (key) => { try { execSync(`npx wrangler r2 object get "coffee-time-media/${key}" --local --persist-to ${STATE} --pipe`, { stdio: "ignore" }); return true; } catch { return false; } };
await check("api: draft + upload of a fixture lands in R2 incoming/<id>/ as `uploading`", async () => {
  const d = await draft({ kind: "video", type: "video/webm", size: VIDEO_FX.length, duration: 3, token: "XXXX.DUMMY.TOKEN.XXXX" });
  assert(d.status === 201 && d.body.upload.mode === "local", `draft → ${d.status} ${JSON.stringify(d.body)}`);
  assert(d.body.key === `incoming/${d.body.id}/media` && d.body.expires_in <= 900, `key ${d.body.key}, expires ${d.body.expires_in}`);
  const put = await fetch(BASE + d.body.upload.url, { method: "PUT", headers: { "content-type": "video/webm" }, body: VIDEO_FX });
  assert(put.status === 200, `upload → ${put.status}`);
  assert(r2get(d.body.key).equals(VIDEO_FX), "object in incoming/ differs from the fixture");
  const row = await mcpData("get_submission", { id: d.body.id });
  assert(row.status === "uploading" && row.kind === "video" && row.media_key === d.body.key && row.duration_s === 3, JSON.stringify(row));
  assert(!(await api("/api/panel/submissions")).body.some((x) => x.id === d.body.id), "draft shows in the panel list");
  assert((await fetch(BASE + "/api/drafts/nope/media", { method: "PUT", body: "x" })).status === 404, "upload to an unknown draft accepted");
});
await check("api: invalid drafts → 400 (kind, type, size 0, over 300 MB)", async () => {
  for (const b of [{ kind: "photo", type: "image/png", size: 10 }, { kind: "audio", type: "video/webm", size: 10 }, { kind: "audio", type: "audio/wav", size: 0 }, { kind: "video", type: "video/mp4", size: 300 * 1024 * 1024 + 1 }]) {
    const r = await draft({ ...b, token: "x" }); assert(r.status === 400, `${JSON.stringify(b)} → ${r.status}`);
  }
});
await check("api: draft without a valid Turnstile token → 403", async () => {
  for (const token of [undefined, "", 42]) { const r = await draft({ kind: "audio", type: "audio/wav", size: 10, token }); assert(r.status === 403, `token ${JSON.stringify(token)} → ${r.status}`); }
});
await check("api: the 6th draft in a minute from one IP → 429, other IPs unaffected", async () => {
  const ip = fakeIp(), b = { kind: "audio", type: "audio/wav", size: 10, token: "x" };
  for (let i = 1; i <= 5; i++) { const r = await draft(b, ip); assert(r.status === 201, `draft ${i} → ${r.status}`); }
  const sixth = await draft(b, ip); assert(sixth.status === 429, `6th → ${sixth.status}`);
  const other = await draft(b); assert(other.status === 201, `other IP → ${other.status}`);
  // Concurrent burst from a fresh IP: exactly 5 get through.
  const burstIp = fakeIp(), codes = (await Promise.all(Array.from({ length: 20 }, () => draft(b, burstIp)))).map((r) => r.status);
  assert(codes.filter((x) => x === 201).length === 5 && codes.filter((x) => x === 429).length === 15, `20 at once → ${codes.join(",")}`);
});
// ---- Send (ADR 0002): size + magic bytes for every file, move to media/, status `new` + consent; junk → `rejected`.
const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });
const putFile = (url, buf, type) => fetch(BASE + url, { method: "PUT", headers: { "content-type": type }, body: buf }).then((r) => r.status);
const newDraft = async (kind, buf, type) => {
  const d = await draft({ kind, type, size: buf.length, duration: 3, token: "x" }); assert(d.status === 201, `draft → ${d.status}`);
  return d.body;
};
const addPhoto = async (id, n, buf = PNG, type = "image/png") => {
  const r = await post(`/api/drafts/${id}/photos`, { n, type, size: buf.length }); assert(r.status === 201 && r.body.key === `incoming/${id}/photo-${n}`, `photo ${n} → ${r.status} ${JSON.stringify(r.body)}`);
  assert((await putFile(r.body.upload.url, buf, type)) === 200, `photo ${n} upload failed`);
};
let sentId = null;
await check("api: send a full submission (audio + photos) → `new` in /api/panel/submissions, files moved to media/", async () => {
  const AUDIO = wav(3), d = await newDraft("audio", AUDIO, "audio/wav"), id = d.id;
  assert((await putFile(d.upload.url, AUDIO, "audio/wav")) === 200, "media upload failed");
  await addPhoto(id, 1); await addPhoto(id, 3); await addPhoto(id, 5); // photo 5 is "removed" before Send
  for (const consent of [undefined, false, "yes"]) { const r = await post(`/api/drafts/${id}/send`, { consent, photos: [1, 3] }); assert(r.status === 400, `consent ${JSON.stringify(consent)} → ${r.status}`); }
  for (const photos of [[0], [11], [1, 1], "1"]) { const r = await post(`/api/drafts/${id}/send`, { consent: true, photos }); assert(r.status === 400, `photos ${JSON.stringify(photos)} → ${r.status}`); }
  const r = await post(`/api/drafts/${id}/send`, { consent: true, name: "  Ana    Teste ", photos: [3, 1] });
  assert(r.status === 200 && r.body.status === "new" && r.body.name === "Ana Teste", `send → ${r.status} ${JSON.stringify(r.body)}`);
  const listed = (await api("/api/panel/submissions")).body.find((x) => x.id === id);
  assert(listed && listed.status === "new" && listed.name === "Ana Teste", `panel row: ${JSON.stringify(listed)}`);
  const row = await mcpData("get_submission", { id });
  assert(row.media_key === `media/${id}/media` && row.consent_at && row.anonymous === 0, JSON.stringify(row));
  assert(JSON.stringify(JSON.parse(row.photo_keys)) === JSON.stringify([`media/${id}/photo-1`, `media/${id}/photo-3`]), `photo_keys ${row.photo_keys}`);
  assert(r2get(`media/${id}/media`).equals(AUDIO) && r2get(`media/${id}/photo-3`).equals(PNG), "moved files differ");
  for (const k of ["media", "photo-1", "photo-3", "photo-5"]) assert(!r2has(`incoming/${id}/${k}`), `incoming/${id}/${k} still there`);
  assert(!r2has(`media/${id}/photo-5`), "a removed photo was kept");
  const again = await post(`/api/drafts/${id}/send`, { consent: true }); assert(again.status === 404, `second send → ${again.status}`);
  sentId = id;
});
await check("api: a file renamed to .mp4 that is not a video is rejected and deleted (also a fake photo)", async () => {
  const FAKE = Buffer.from("isto não é um vídeo, só um texto com extensão .mp4\n".repeat(40));
  const d = await newDraft("video", FAKE, "video/mp4");
  assert((await putFile(d.upload.url, FAKE, "video/mp4")) === 200, "upload failed");
  const r = await post(`/api/drafts/${d.id}/send`, { consent: true, name: "Teste" });
  assert(r.status === 422, `send → ${r.status} ${JSON.stringify(r.body)}`);
  assert((await mcpData("get_submission", { id: d.id })).status === "rejected", "draft not rejected");
  assert(!r2has(`incoming/${d.id}/media`) && !r2has(`media/${d.id}/media`), "fake video not deleted");
  assert(!(await api("/api/panel/submissions?status=new")).body.some((x) => x.id === d.id), "rejected draft listed as new");
  // A real audio with a text file posing as a photo: the whole draft is refused and nothing is kept.
  const AUDIO = wav(2), d2 = await newDraft("audio", AUDIO, "audio/wav");
  await putFile(d2.upload.url, AUDIO, "audio/wav"); await addPhoto(d2.id, 2, FAKE.subarray(0, 200), "image/jpeg");
  const r2 = await post(`/api/drafts/${d2.id}/send`, { consent: true, photos: [2] });
  assert(r2.status === 422 && JSON.stringify(r2.body.files) === '["photo-2"]', `fake photo → ${r2.status} ${JSON.stringify(r2.body)}`);
  assert((await mcpData("get_submission", { id: d2.id })).status === "rejected" && !r2has(`incoming/${d2.id}/media`) && !r2has(`incoming/${d2.id}/photo-2`), "fake photo draft not cleaned");
});
await check("api: Send before the upload → 409 (draft stays open); anonymous audio drops the name; video can't be anonymous", async () => {
  const AUDIO = wav(2), d = await newDraft("audio", AUDIO, "audio/wav");
  const early = await post(`/api/drafts/${d.id}/send`, { consent: true }); assert(early.status === 409, `before upload → ${early.status}`);
  assert((await mcpData("get_submission", { id: d.id })).status === "uploading", "draft closed by an early Send");
  await putFile(d.upload.url, AUDIO, "audio/wav");
  const missing = await post(`/api/drafts/${d.id}/send`, { consent: true, photos: [4] }); assert(missing.status === 409, `photo not uploaded → ${missing.status}`);
  const r = await post(`/api/drafts/${d.id}/send`, { consent: true, anonymous: true, name: "Fulano" });
  const row = await mcpData("get_submission", { id: d.id });
  assert(r.status === 200 && row.anonymous === 1 && row.name === null && row.status === "new", `anonymous → ${r.status} ${JSON.stringify(row)}`);
  const v = await newDraft("video", VIDEO_FX, "video/webm"); await putFile(v.upload.url, VIDEO_FX, "video/webm");
  const rv = await post(`/api/drafts/${v.id}/send`, { consent: true, anonymous: true, name: "Rafa" });
  const vrow = await mcpData("get_submission", { id: v.id });
  assert(rv.status === 200 && vrow.anonymous === 0 && vrow.name === "Rafa", `video → ${rv.status} ${JSON.stringify(vrow)}`);
  assert((await post("/api/drafts/nope/send", { consent: true })).status === 404, "unknown draft accepted");
});
await check("api: photo URLs only for slots 1–10, images ≤ 20 MB, open drafts", async () => {
  const d = await newDraft("audio", wav(1), "audio/wav");
  for (const b of [{ n: 0 }, { n: 11 }, { n: 1.5 }, { n: 1, type: "text/plain" }, { n: 1, size: 20 * 1024 * 1024 + 1 }, { n: 1, size: 0 }]) {
    const r = await post(`/api/drafts/${d.id}/photos`, { type: "image/png", size: 100, ...b }); assert(r.status === 400, `${JSON.stringify(b)} → ${r.status}`);
  }
  assert((await post("/api/drafts/nope/photos", { n: 1, type: "image/png", size: 100 })).status === 404, "unknown draft");
  assert((await post(`/api/drafts/${sentId}/photos`, { n: 1, type: "image/png", size: 100 })).status === 404, "photo URL for a sent message");
  assert((await putFile(`/api/drafts/${sentId}/photo-2`, PNG, "image/png")) === 404, "upload to a sent message accepted");
  assert((await putFile(`/api/drafts/${d.id}/photo-11`, PNG, "image/png")) === 404, "slot 11 accepted");
});
await check("api: draft files — media again (same kind) and a video's audio track; Send with track moves it and saves audio_key", async () => {
  const a = await newDraft("audio", wav(1), "audio/wav"), v = await newDraft("video", VIDEO_FX, "video/webm");
  for (const [id, b] of [[a.id, { file: "photo-1", type: "audio/webm", size: 10 }], [a.id, { file: "media", type: "video/webm", size: 10 }], [a.id, { file: "audio", type: "audio/webm", size: 10 }],
    [a.id, { file: "media", type: "audio/webm", size: 300 * 1024 * 1024 + 1 }], [v.id, { file: "audio", type: "video/webm", size: 10 }], [v.id, { file: "audio", type: "audio/webm", size: 20 * 1024 * 1024 + 1 }], [v.id, { file: "audio", type: "audio/webm", size: 0 }]]) {
    const r = await post(`/api/drafts/${id}/files`, b); assert(r.status === 400, `${JSON.stringify(b)} → ${r.status}`);
  }
  assert((await post("/api/drafts/nope/files", { file: "media", type: "audio/wav", size: 10 })).status === 404, "unknown draft");
  assert((await post(`/api/drafts/${sentId}/files`, { file: "media", type: "audio/wav", size: 10 })).status === 404, "file URL for a sent message");
  // The media replaced in place: the second upload overwrites the first.
  const AUDIO = wav(2), AUDIO2 = wav(1.5);
  await putFile(a.upload.url, AUDIO, "audio/wav");
  const m = await post(`/api/drafts/${a.id}/files`, { file: "media", type: "audio/wav", size: AUDIO2.length });
  assert(m.status === 201 && m.body.key === `incoming/${a.id}/media`, `media again → ${m.status} ${JSON.stringify(m.body)}`);
  assert((await putFile(m.body.upload.url, AUDIO2, "audio/wav")) === 200 && r2get(`incoming/${a.id}/media`).equals(AUDIO2), "media not replaced");
  // A video with its audio track.
  await putFile(v.upload.url, VIDEO_FX, "video/webm");
  const early = await post(`/api/drafts/${v.id}/send`, { consent: true, track: true }); assert(early.status === 409, `track missing → ${early.status}`);
  const TRACK = wav(3), t = await post(`/api/drafts/${v.id}/files`, { file: "audio", type: "audio/wav", size: TRACK.length });
  assert(t.status === 201 && t.body.key === `incoming/${v.id}/audio`, `track → ${t.status} ${JSON.stringify(t.body)}`);
  assert((await putFile(t.body.upload.url, TRACK, "audio/wav")) === 200, "track upload failed");
  const r = await post(`/api/drafts/${v.id}/send`, { consent: true, track: true }); assert(r.status === 200, `send → ${r.status}`);
  const row = await mcpData("get_submission", { id: v.id });
  assert(row.audio_key === `media/${v.id}/audio` && r2get(`media/${v.id}/audio`).equals(TRACK) && !r2has(`incoming/${v.id}/audio`), `audio_key ${row.audio_key}`);
  // A text file posing as the track is refused like any other file.
  const v2 = await newDraft("video", VIDEO_FX, "video/webm"); await putFile(v2.upload.url, VIDEO_FX, "video/webm");
  const t2 = await post(`/api/drafts/${v2.id}/files`, { file: "audio", type: "audio/webm", size: 200 }); await putFile(t2.body.upload.url, Buffer.alloc(200, 65), "audio/webm");
  const r2 = await post(`/api/drafts/${v2.id}/send`, { consent: true, track: true });
  assert(r2.status === 422 && JSON.stringify(r2.body.files) === '["audio"]' && !r2has(`incoming/${v2.id}/audio`), `fake track → ${r2.status} ${JSON.stringify(r2.body)}`);
  // An audio message never gets a track, and a sent one without it keeps audio_key empty.
  assert((await mcpData("get_submission", { id: sentId })).audio_key === null, "audio message with audio_key");
});
// ---- Transcript and tags (ADR 0004): Send enqueues a job; the consumer (Whisper + tags, AI stubbed) fills them in.
const until = async (fn, ms = 30000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await wait(500); } };
const panelRow = async (id) => (await api("/api/panel/submissions")).body.find((x) => x.id === id);
const markedWav = (mark) => { const b = wav(1); b.write(mark, 100, "latin1"); return b; }; // still a valid WAV
const sendAudio = async (buf, name) => {
  const d = await newDraft("audio", buf, "audio/wav");
  assert((await putFile(d.upload.url, buf, "audio/wav")) === 200, "upload failed");
  const r = await post(`/api/drafts/${d.id}/send`, { consent: true, name, photos: [] }); assert(r.status === 200, `send → ${r.status}`);
  return d.id;
};
const STUB_TRANSCRIPT = "Oi Yudi, sou de Lisboa e queria saber como você organiza a semana entre trabalho e vlog.";
await check("api: Send enqueues a job; the consumer saves the transcript (pt) and free tags, shown in the panel API and MCP", async () => {
  const id = await sendAudio(wav(2), "Teste Transcrição");
  const row = await until(async () => { const r = await panelRow(id); return r?.transcript != null && r; });
  assert(row, `no transcript after 30 s: ${JSON.stringify(await panelRow(id))}`);
  assert(row.transcript === STUB_TRANSCRIPT, `transcript ${JSON.stringify(row.transcript)}`);
  const tags = JSON.parse(row.tags);
  assert(JSON.stringify(tags) === JSON.stringify(["Dúvida", "Rotina", "Lisboa", "Um tema comprido demais para"]), `tags ${row.tags}`);
  assert(row.status === "new" && row.transcript_error === null, JSON.stringify(row));
  assert((await api("/api/panel/submissions?tag=Rotina")).body.some((x) => x.id === id), "tag filter misses the new tags");
  assert((await api(`/api/panel/submissions?q=${encodeURIComponent("organiza a semana")}`)).body.some((x) => x.id === id), "text search misses the transcript");
  assert((await mcpData("get_submission", { id })).transcript === STUB_TRANSCRIPT, "MCP has no transcript");
});
await check("api: a failing job is retried, ends in the dead-letter queue, and the message stays (no transcript, marked)", async () => {
  const id = await sendAudio(markedWav("FAILJOB"), "Teste Falha");
  const row = await until(async () => { const r = await panelRow(id); return r?.transcript_error && r; }, 45000);
  assert(row, `not dead-lettered after 45 s: ${JSON.stringify(await panelRow(id))}`);
  assert(row.status === "new" && row.transcript === null && row.name === "Teste Falha" && JSON.parse(row.tags).length === 0, JSON.stringify(row));
  const attempts = (log.match(new RegExp(`transcribe ${id} attempt \\d+ failed`, "g")) || []).length;
  assert(attempts === 1 + prod.queues.consumers[0].max_retries, `attempts ${attempts}, want ${1 + prod.queues.consumers[0].max_retries}`);
  assert((await mcpData("get_submission", { id })).media_key === `media/${id}/media`, "media lost");
});
// Tag cleanup and the Worker's queue wiring, tested directly on src/jobs/transcribe.ts.
{
  const js = execSync("npx esbuild --bundle --format=esm --log-level=error", { input: 'export * from "./src/jobs/transcribe.ts";' }).toString();
  const t = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
  await check("api: tags from the model are cleaned (JSON text or object, type first, no duplicates, ≤ 6, ≤ 30 chars)", async () => {
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    assert(eq(t.cleanTags('Claro! {"type":"História","topics":["Entrevista"," Inglês ","entrevista"]}'), ["História", "Entrevista", "Inglês"]), "text JSON");
    assert(eq(t.cleanTags({ type: "Dúvida", topics: ["a", "b", "c", "d", "e", "f", "g"] }), ["Dúvida", "a", "b", "c", "d", "e"]), "limit 6");
    for (const bad of [null, "sem json", { type: 3, topics: "x" }]) assert(eq(t.cleanTags(bad), []), `bad ${JSON.stringify(bad)}`);
    assert(eq(t.cleanTags({ type: "Sugestão", topics: ["x".repeat(40)] }), ["Sugestão", "x".repeat(30)]), "one long word");
    assert(t.MAX_TAG === 30 && t.WHISPER.includes("whisper"), "constants");
  });
  await check("api: a job that arrives before Send commits is retried, not dropped; the dead-letter queue never marks a draft", async () => {
    let row = { status: "uploading", kind: "audio", media_key: "media/j1/media", audio_key: null, transcript: null }, updates = [];
    const DB = { prepare: (sql) => ({ bind: (...a) => ({ first: async () => (a[0] === "j1" ? row : null), run: async () => { updates.push(sql); return { meta: { changes: 1 } }; } }) }) };
    const out = []; const msg = (id) => ({ body: { id }, attempts: 1, ack: () => out.push("ack"), retry: (o) => out.push(`retry ${o?.delaySeconds}`) });
    const env = { DB, JOBS_RETRY_BASE_S: "0", MEDIA: { get: async () => null }, AI: { run: async () => { throw new Error("no AI here"); } } };
    await t.queue({ queue: t.JOBS_QUEUE, messages: [msg("j1")] }, env);
    assert(out.join() === "retry 0" && updates.length === 0, `uploading row → ${out.join()} ${updates.join()}`);
    out.length = 0; await t.queue({ queue: t.JOBS_QUEUE, messages: [msg("gone")] }, env);
    assert(out.join() === "ack", `deleted row → ${out.join()}`);
    out.length = 0; await t.queue({ queue: t.DLQ, messages: [msg("j1")] }, env);
    assert(out.join() === "ack" && /status != 'uploading'/.test(updates[0]), `dead-letter update: ${updates[0]}`);
  });
}
// Signing and Turnstile, tested directly on src/api/ (AWS's published SigV4 example; Turnstile siteverify stubbed).
{
  const js = execSync("npx esbuild --bundle --format=esm --log-level=error", { input: 'export * from "./src/api/drafts.ts"; export * from "./src/api/s3.ts"; export * from "./src/api/sniff.ts";' }).toString();
  const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
  await check("api: presigned URLs match AWS's SigV4 example; multipart URLs carry part, uploadId and ≤ 15 min", async () => {
    const aws = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", host: "examplebucket.s3.amazonaws.com", region: "us-east-1" };
    const u = new URL(await m.presign(aws, "GET", "/test.txt", { expires: 86400, now: new Date("2013-05-24T00:00:00Z") }));
    assert(u.searchParams.get("X-Amz-Signature") === "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404", `signature ${u.searchParams.get("X-Amz-Signature")}`);
    const mp = await m.multipartUrls({ ...aws, host: "acc.r2.cloudflarestorage.com", region: "auto" }, "/coffee-time-media/incoming/x/media", "UP1", 3, m.URL_TTL);
    assert(mp.parts.length === 3 && mp.parts.every((p, i) => { const q = new URL(p).searchParams; return q.get("partNumber") === String(i + 1) && q.get("uploadId") === "UP1" && Number(q.get("X-Amz-Expires")) <= 900; }), "part URLs");
    assert(new URL(mp.complete).searchParams.get("uploadId") === "UP1" && !new URL(mp.complete).searchParams.has("partNumber"), "complete URL");
    assert(m.PART_SIZE === 10 * 1024 * 1024 && m.URL_TTL <= 900, "part size / TTL");
  });
  await check("api: magic bytes — WAV, WebM, MP4, PNG, JPEG, HEIC pass; text and a PNG posing as media fail", async () => {
    const b = (x) => new Uint8Array(Buffer.from(x));
    const mp4 = new Uint8Array([0, 0, 0, 0x20, ...b("ftypisom"), 0, 0, 2, 0]), heic = new Uint8Array([0, 0, 0, 0x18, ...b("ftypheic"), 0, 0, 0, 0]);
    const text = b("isto não é um vídeo".repeat(10)), jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
    const cases = [["audio", wav(1), true], ["video", VIDEO_FX, true], ["audio", VIDEO_FX, true], ["video", mp4, true], ["audio", mp4, true], ["photo", PNG, true], ["photo", jpeg, true], ["photo", heic, true],
      ["video", text, false], ["audio", text, false], ["photo", text, false], ["video", PNG, false], ["video", heic, false], ["photo", mp4, false], ["audio", new Uint8Array(), false]];
    for (const [kind, bytes, want] of cases) assert(m.sniff(kind, new Uint8Array(bytes).subarray(0, 4096)) === want, `${kind} ${Buffer.from(bytes).subarray(0, 12).toString("hex")} → ${!want}`);
  });
  // Send with a storage error halfway (fake R2 + D1 in memory): nothing is lost and a retry finishes it.
  await check("api: Send survives a storage error halfway and a queue outage (originals kept until committed, retry enqueues + commits)", async () => {
    const sjs = execSync("npx esbuild --bundle --format=esm --platform=neutral --main-fields=module,main --log-level=error", { input: 'export { registerSend } from "./src/api/send.ts"; export { Hono } from "hono";' }).toString();
    const sm = await import("data:text/javascript;base64," + Buffer.from(sjs).toString("base64"));
    globalThis.FixedLengthStream ??= class { constructor() { const t = new TransformStream(); this.readable = t.readable; this.writable = t.writable; } };
    const store = new Map([["incoming/d1/media", wav(1)], ["incoming/d1/photo-1", PNG], ["incoming/d1/photo-2", PNG]]);
    let failPut = "media/d1/photo-2", row = { id: "d1", kind: "audio", media_key: "incoming/d1/media", status: "uploading" };
    const MEDIA = {
      head: async (k) => (store.has(k) ? { size: store.get(k).length } : null),
      get: async (k, o) => { if (!store.has(k)) return null; const b = store.get(k), r = o?.range ? b.subarray(o.range.offset, o.range.offset + o.range.length) : b;
        return { size: b.length, httpMetadata: {}, arrayBuffer: async () => r, body: new Blob([r]).stream() }; },
      put: async (k, body) => { const buf = Buffer.from(await new Response(body).arrayBuffer()); if (k === failPut) { failPut = null; throw new Error("R2 hiccup"); } store.set(k, buf); return { key: k }; },
      delete: async (k) => [].concat(k).forEach((x) => store.delete(x)),
      list: async ({ prefix }) => ({ objects: [...store.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
    };
    const DB = { prepare: (sql) => ({ bind: (...a) => ({
      first: async () => (row.status === "uploading" && a[0] === row.id ? row : null),
      run: async () => { if (/status = 'new'/.test(sql) && row.status === "uploading") { Object.assign(row, { status: "new", media_key: a[2] }); return { meta: { changes: 1 } }; } return { meta: { changes: 0 } }; },
    }) }) };
    const jobs = [], JOBS = { send: async (m) => { jobs.push(m); } };
    const app = new sm.Hono(); sm.registerSend(app);
    const send = () => app.request("/api/drafts/d1/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ consent: true, photos: [1, 2] }) }, { DB, MEDIA, JOBS });
    const first = await send();
    assert(first.status === 503 && row.status === "uploading", `failed send → ${first.status}, status ${row.status}`);
    assert(jobs.length === 0, "a failed send enqueued a transcript job");
    for (const k of ["media", "photo-1", "photo-2"]) assert(store.has(`incoming/d1/${k}`), `incoming/d1/${k} deleted by a failed send`);
    const retry = await send();
    assert(retry.status === 200 && row.status === "new" && row.media_key === "media/d1/media", `retry → ${retry.status}, status ${row.status}`);
    assert(jobs.length === 1 && jobs[0].id === "d1", `jobs after send: ${JSON.stringify(jobs)}`);
    // A queue outage never loses the job: Send answers 503 with nothing committed, and a retry enqueues and commits.
    Object.assign(row, { status: "uploading", media_key: "incoming/d1/media" }); for (const k of ["media", "photo-1", "photo-2"]) store.set(`incoming/d1/${k}`, store.get(`media/d1/${k}`));
    const realSend = JOBS.send; JOBS.send = async () => { throw new Error("queue down"); };
    const down = await send(); assert(down.status === 503 && row.status === "uploading", `send with the queue down → ${down.status}, status ${row.status}`);
    assert(["media", "photo-1", "photo-2"].every((k) => store.has(`incoming/d1/${k}`)), "queue error deleted the originals");
    JOBS.send = realSend; const back = await send();
    assert(back.status === 200 && row.status === "new" && jobs.length === 2, `retry after the queue is back → ${back.status}, status ${row.status}, jobs ${jobs.length}`);
    assert(["media", "photo-1", "photo-2"].every((k) => store.has(`media/d1/${k}`) && !store.has(`incoming/d1/${k}`)), [...store.keys()].join(","));
  });
  await check("api: Turnstile check rejects failing keys and asks siteverify with the real secret", async () => {
    assert(await m.checkTurnstile("tok", "2x0000000000000000000000000000000AA", "1.2.3.4", true) === false, "always-fail test key passed");
    assert(await m.checkTurnstile("", "1x0000000000000000000000000000000AA", "1.2.3.4", true) === false, "empty token passed");
    assert(await m.checkTurnstile("tok", undefined, "1.2.3.4", true) === false, "missing secret passed");
    const realFetch = globalThis.fetch; let seen = null, reply = { success: false };
    globalThis.fetch = async (u, init) => { seen = { u: String(u), f: Object.fromEntries(init.body) }; return new Response(JSON.stringify(reply)); };
    try {
      assert(await m.checkTurnstile("tok", "real-secret", "1.2.3.4", true) === false, "siteverify said no but passed");
      assert(seen.u === "https://challenges.cloudflare.com/turnstile/v0/siteverify" && seen.f.secret === "real-secret" && seen.f.response === "tok" && seen.f.remoteip === "1.2.3.4", JSON.stringify(seen));
      // Outside local dev even the test keys go to siteverify.
      seen = null; reply = { success: true };
      assert(await m.checkTurnstile("tok", "2x0000000000000000000000000000000AA", "1.2.3.4", false) === true && seen, "test key answered offline outside dev");
    } finally { globalThis.fetch = realFetch; }
  });
}

// ---- Screens ----
const { chromium } = await import("playwright");
// Fake microphone/camera with auto-accepted permission prompts, so recording can be tested headless.
const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
// Offline-safe: external requests (Google Fonts) get an empty reply, so sandboxes without internet behave the same
// Turnstile's script is replaced by a stub that hands out Cloudflare's dummy token. Each context gets its own fake IP.
const TS_STUB = `window.turnstile={render(el,o){window.__tsKey=o.sitekey;setTimeout(()=>o.callback("XXXX.DUMMY.TOKEN.XXXX"),50);return "w"},remove(){},reset(){}};`;
const offline = async (ctx) => {
  await ctx.route((url) => !url.href.startsWith(BASE), (r) => r.fulfill({ status: 200, body: "" }));
  await ctx.route("https://challenges.cloudflare.com/turnstile/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: TS_STUB }));
  await ctx.setExtraHTTPHeaders({ "cf-connecting-ip": fakeIp() });
};
const errors = [];
const shot = async (name, path, viewport) => {
  const ctx = await browser.newContext({ viewport }); await offline(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const text = await page.locator("body").innerText(); await ctx.close(); return text;
};
await check("ui: start page (mobile) shows the record and upload buttons", async () => {
  const t = await shot("start-mobile", "/", { width: 390, height: 844 });
  assert(t.includes("Gravar áudio") && t.includes("Envie um arquivo"), "buttons missing");
});
await check("ui: start page (desktop)", async () => { const t = await shot("start-desktop", "/", { width: 1440, height: 900 }); assert(t.includes("Envie uma mensagem"), "title missing"); });
// No overlap between hero, vlog and the send card at any width (two columns start at 1024 px).
// Also swept with a wide fallback font (DejaVu Sans), since sandboxes and CI render without Onest.
await check("ui: start page has no overlap at intermediate widths", async () => {
  const ctx = await browser.newContext(); await offline(ctx); const p = await ctx.newPage();
  for (const font of [null, "DejaVu Sans"]) for (const w of [320, 768, 960, 1023, 1024, 1100, 1280, 1360, 1440, 1920]) {
    const tag = `${w}px${font ? ` (${font})` : ""}`;
    await p.setViewportSize({ width: w, height: 900 }); await p.goto(BASE + "/", { waitUntil: "networkidle" });
    if (font) await p.addStyleTag({ content: `body,body *{font-family:"${font}",sans-serif !important}` });
    const r = await p.evaluate(() => {
      const b = (s) => document.querySelector(s).getBoundingClientRect();
      const over = (a, c) => a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom;
      const card = b(".card"), h1 = document.querySelector(".hero h1"), hb = h1.getBoundingClientRect();
      const rg = document.createRange(); rg.selectNodeContents(h1); const lines = [...rg.getClientRects()];
      return { hero: [b(".hero h1"), b(".hero p"), b(".hero img"), b(".vlog"), ...lines].some((x) => over(x, card)),
        clip: h1.scrollWidth > h1.clientWidth + 1 || lines.some((x) => x.right > hb.right + 1),
        scroll: document.documentElement.scrollWidth > innerWidth };
    });
    assert(!r.hero, `${tag}: send card overlaps the hero or vlog`); assert(!r.clip, `${tag}: title overflows`); assert(!r.scroll, `${tag}: horizontal scroll`);
    if (w === 1024 && !font) await p.screenshot({ path: `${OUT}/start-1024.png`, fullPage: true });
    if (w === 1440 && font) await p.screenshot({ path: `${OUT}/start-1440-fallback-font.png`, fullPage: true });
  }
  await ctx.close();
});
// Start page as in docs/design/*-1a-start.png: hero, tabs + hint, two buttons with icons, "Como fica no vlog".
await check("ui: start page layout, tabs and icons (mobile + desktop)", async () => {
  for (const [vp, desktop] of [[{ width: 390, height: 844 }, false], [{ width: 1440, height: 900 }, true]]) {
    const ctx = await browser.newContext({ viewport: vp }); await offline(ctx);
    const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    const t = await p.locator("body").innerText();
    for (const s of ["Envie uma mensagem", "Uma história, uma pergunta", "Áudio", "Vídeo", "Áudio ou vídeo de até 90 segundos.", "Gravar áudio", "Envie um arquivo", "Como fica no vlog", "Eu ouço a mensagem no café"]) assert(t.toLowerCase().includes(s.toLowerCase()), `${vp.width}px: missing "${s}"`);
    assert(!/\p{Extended_Pictographic}/u.test(t), `${vp.width}px: emoji in the page text`);
    for (const sel of ["#record", "#upload", "#tab-audio", "#tab-video"]) assert(await p.locator(`${sel} svg`).count() === 1, `${sel} has no inline SVG icon`);
    assert((await p.evaluate(() => document.documentElement.scrollWidth)) <= vp.width, `${vp.width}px: horizontal scroll`);
    const box = async (s) => p.locator(s).boundingBox();
    const [hero, card, vlog] = [await box(".hero"), await box(".card"), await box(".vlog")];
    if (desktop) assert(card.x > hero.x + hero.width && vlog.y > hero.y && Math.abs(vlog.x - hero.x) < 2, "desktop: hero/vlog left, card right expected");
    else assert(hero.y < card.y && card.y < vlog.y, "mobile: hero, card, vlog order expected");
    await p.click("#tab-video");
    assert((await p.locator("#record").innerText()).trim() === "Gravar vídeo", "Video tab did not switch the button");
    assert((await p.getAttribute("#tab-video", "aria-selected")) === "true", "Video tab not selected");
    await p.screenshot({ path: `${OUT}/start-${desktop ? "desktop" : "mobile"}-video.png`, fullPage: true });
    await p.click("#tab-audio");
    assert((await p.locator("#record").innerText()).trim() === "Gravar áudio", "Audio tab did not switch back");
    await ctx.close();
  }
});
// Audio recording as in docs/design/*-1b-recording.png and *-1-audio-ready.png, with Chromium's fake microphone.
await check("ui: record audio with a fake microphone, stop, ready, re-record (mobile + desktop)", async () => {
  for (const [vp, name, stopLabel] of [[{ width: 390, height: 844 }, "mobile", "Toque para parar"], [{ width: 1440, height: 900 }, "desktop", "Clique para parar"]]) {
    const ctx = await browser.newContext({ viewport: vp, permissions: ["microphone"] }); await offline(ctx);
    const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    await p.click("#record");
    await p.locator("#recorder").waitFor({ state: "visible", timeout: 5000 });
    const t = await p.locator("body").innerText();
    for (const s of ["máximo de 90 segundos", stopLabel]) assert(t.includes(s), `${name}: missing "${s}"`);
    assert(!/\p{Extended_Pictographic}/u.test(t), `${name}: emoji in the recording state`);
    assert(!(await p.locator("#record").isVisible()) && !(await p.locator(".vlog").isVisible()), `${name}: start buttons or vlog still visible while recording`);
    assert(await p.locator("#tab-video").isDisabled(), `${name}: tabs not locked while recording`);
    await p.waitForTimeout(3000);
    const timer = (await p.locator("#timer").innerText()).trim();
    assert(/^0:0[2-4]$/.test(timer), `${name}: timer shows ${timer} after ~3 s`);
    await p.screenshot({ path: `${OUT}/record-${name}.png`, fullPage: true });
    await p.click("#stop");
    await p.locator("#ready[data-duration]").waitFor({ state: "visible", timeout: 5000 });
    const ready = await p.locator("#ready").innerText();
    assert(ready.includes("Gravação pronta") && ready.includes("Regravar") && ready.includes("/ 1:30"), `${name}: ready state text: ${ready.replace(/\s+/g, " ")}`);
    const d = await p.evaluate(() => ({ ...document.getElementById("ready").dataset }));
    assert(Number(d.duration) > 2.5 && Number(d.duration) < 5, `${name}: duration ${d.duration}`);
    assert(Number(d.bytes) > 1000 && /opus|webm|ogg|mp4/.test(d.type), `${name}: recording is empty (${d.bytes} bytes, ${d.type})`);
    assert((await p.locator("#ready-time").innerText()).trim() === "0:03", `${name}: ready time ${await p.locator("#ready-time").innerText()}`);
    await p.screenshot({ path: `${OUT}/ready-${name}.png`, fullPage: true });
    await p.click("#tab-audio");
    assert(await p.locator("#ready[data-duration]").isVisible(), `${name}: clicking the selected Áudio tab discarded the recording`);
    await p.click("#play"); await p.waitForTimeout(600);
    assert(await p.evaluate(() => { const a = document.getElementById("player"); return !a.paused && a.currentTime > 0; }), `${name}: playback did not start`);
    await p.click("#play");
    await p.click("#redo");
    await p.locator("#recorder").waitFor({ state: "visible", timeout: 5000 });
    await p.waitForTimeout(1200); await p.click("#stop");
    await p.locator("#ready[data-duration]").waitFor({ state: "visible", timeout: 5000 });
    assert(Number(await p.getAttribute("#ready", "data-duration")) < 2.5, `${name}: re-record kept the old take`);
    await ctx.close();
  }
});
await check("ui: recording stops by itself at the limit (dev-only ?max=3)", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["microphone"] }); await offline(ctx);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/?max=500", { waitUntil: "networkidle" });
  assert((await p.content()).includes("máximo de 90 segundos"), "?max outside 1–89 must keep 90 s");
  await p.goto(BASE + "/?max=3", { waitUntil: "networkidle" });
  assert((await p.content()).includes("máximo de 3 segundos"), "dev ?max=3 not applied");
  await p.click("#record");
  await p.locator("#recorder").waitFor({ state: "visible", timeout: 5000 });
  await p.locator("#ready[data-duration]").waitFor({ state: "visible", timeout: 7000 }); // no click on stop
  const d = Number(await p.getAttribute("#ready", "data-duration"));
  assert(Math.abs(d - 3) < 0.3, `auto-stop duration ${d}`);
  assert((await p.locator("#ready-bar").evaluate((e) => e.style.width)) === "100%", "bar not full at the limit");
  await ctx.close();
});
// Double click while the microphone prompt is open must start one recorder only, and Stop must release the mic.
await check("ui: double click on record starts one recording, tabs lock, stop releases the microphone, mic loss keeps the length", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["microphone"] }); await offline(ctx);
  await ctx.addInitScript(() => {
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__calls = 0; window.__streams = [];
    navigator.mediaDevices.getUserMedia = async (c) => { window.__calls++; await new Promise((r) => setTimeout(r, 800)); const s = await gum(c); window.__streams.push(s); return s; };
  });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.evaluate(() => { const b = document.getElementById("record"); b.click(); b.click(); b.click(); });
  assert(await p.locator("#tab-video").isDisabled(), "tabs not locked while the microphone prompt is open");
  await p.locator("#recorder").waitFor({ state: "visible", timeout: 5000 });
  await p.waitForTimeout(1200); await p.click("#stop");
  await p.locator("#ready[data-duration]").waitFor({ state: "visible", timeout: 5000 });
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({ calls: window.__calls, live: window.__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === "live").length }));
  assert(r.calls === 1, `getUserMedia called ${r.calls} times`);
  assert(r.live === 0, `${r.live} microphone track(s) still live after stop`);
  // Microphone goes away mid-recording (device unplugged): the take must still get its real length.
  await p.click("#redo"); await p.locator("#recorder").waitFor({ state: "visible", timeout: 5000 });
  await p.waitForTimeout(3000);
  await p.evaluate(() => window.__streams.at(-1).getTracks().forEach((t) => t.stop()));
  await p.locator("#ready[data-duration]").waitFor({ state: "visible", timeout: 5000 });
  const d = Number(await p.getAttribute("#ready", "data-duration"));
  assert(d > 2.5 && d < 4.5, `duration after the microphone ended: ${d}`);
  await ctx.close();
});
// "Envie um arquivo": a WAV generated here and WebM fixtures in scripts/fixtures/ (made with ffmpeg, see README there).
const FX = {
  audio: { name: "mensagem.wav", mimeType: "audio/wav", buffer: wav(3) },
  audioLong: { name: "longo.wav", mimeType: "audio/wav", buffer: wav(100) },
  video: { name: "video.webm", mimeType: "video/webm", buffer: readFileSync("scripts/fixtures/video-3s-1080p.webm") },
  videoLong: { name: "video-longo.webm", mimeType: "video/webm", buffer: readFileSync("scripts/fixtures/video-100s.webm") },
  text: { name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("oi") },
};
await check("ui: upload a short audio and a short video, see the ready state (mobile + desktop)", async () => {
  for (const [vp, name] of [[{ width: 390, height: 844 }, "mobile"], [{ width: 1440, height: 900 }, "desktop"]]) {
    const ctx = await browser.newContext({ viewport: vp }); await offline(ctx);
    const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    // The button opens the file picker.
    const [chooser] = await Promise.all([p.waitForEvent("filechooser", { timeout: 3000 }), p.click("#upload")]);
    assert(!chooser.isMultiple(), `${name}: picker accepts several files`);
    await chooser.setFiles(FX.audio);
    await p.locator("#ready[data-duration]").waitFor({ state: "visible", timeout: 5000 });
    const ready = await p.locator("#ready").innerText();
    assert(ready.includes("Áudio pronto") && ready.includes("Trocar áudio") && ready.includes("/ 1:30"), `${name}: audio ready text: ${ready.replace(/\s+/g, " ")}`);
    assert((await p.locator("#ready-time").innerText()).trim() === "0:03", `${name}: audio time ${await p.locator("#ready-time").innerText()}`);
    assert((await p.getAttribute("#ready", "data-source")) === "file", `${name}: audio not marked as a file`);
    assert(!(await p.locator("#upload").isVisible()) && !(await p.locator(".vlog").isVisible()), `${name}: start buttons still visible`);
    await p.click("#play"); await p.waitForTimeout(500);
    assert(await p.evaluate(() => !document.getElementById("player").paused), `${name}: uploaded audio does not play`);
    await p.click("#play"); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/upload-audio-${name}.png`, fullPage: true });
    // "Trocar áudio" picks another file; a video switches to the Video tab and its preview.
    const [c2] = await Promise.all([p.waitForEvent("filechooser", { timeout: 3000 }), p.click("#redo")]);
    await c2.setFiles(FX.video);
    await p.locator("#vready[data-duration]").waitFor({ state: "visible", timeout: 8000 });
    assert(!(await p.locator("#ready").isVisible()), `${name}: audio panel still visible with a video`);
    const v = await p.locator("#vready").innerText();
    assert(v.includes("Vídeo pronto · 1080p") && v.includes("Trocar vídeo"), `${name}: video ready text: ${v.replace(/\s+/g, " ")}`);
    assert((await p.locator("#vdur").innerText()).trim() === "0:03", `${name}: video duration ${await p.locator("#vdur").innerText()}`);
    assert((await p.getAttribute("#tab-video", "aria-selected")) === "true", `${name}: Video tab not selected for a video`);
    const body = await p.locator("body").innerText();
    assert(!/anonimiz/i.test(body), `${name}: anonymize option shown for a video`);
    assert(!/\p{Extended_Pictographic}/u.test(body), `${name}: emoji in the video state`);
    assert((await p.evaluate(() => document.documentElement.scrollWidth)) <= vp.width, `${name}: horizontal scroll`);
    await p.screenshot({ path: `${OUT}/upload-video-${name}.png`, fullPage: true });
    await p.click("#vplay"); await p.waitForTimeout(500);
    assert(await p.evaluate(() => { const x = document.getElementById("vplayer"); return !x.paused && x.currentTime > 0; }), `${name}: video does not play`);
    await p.click("#vplayer");
    assert(await p.evaluate(() => document.getElementById("vplayer").paused), `${name}: click on the video did not pause`);
    // Switching to the Audio tab drops the video.
    await p.click("#tab-audio");
    assert(!(await p.locator("#vready").isVisible()) && (await p.locator("#upload").isVisible()), `${name}: Audio tab kept the video`);
    await ctx.close();
  }
});
await check("ui: a file longer than 90 s (or not audio/video) is refused with a message", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await offline(ctx);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  const msg = "O arquivo tem mais de 90 segundos. Escolha um mais curto.";
  for (const f of [FX.audioLong, FX.videoLong]) {
    await p.setInputFiles("#file", f);
    await p.locator("#rec-error.show").waitFor({ state: "visible", timeout: 8000 });
    assert((await p.locator("#rec-error").innerText()).trim() === msg, `${f.name}: message "${await p.locator("#rec-error").innerText()}"`);
    assert((await p.getAttribute("main", "data-state")) === "idle", `${f.name}: long file was accepted`);
    if (f === FX.videoLong) await p.screenshot({ path: `${OUT}/upload-too-long-mobile.png`, fullPage: true });
    await p.evaluate(() => document.getElementById("rec-error").classList.remove("show"));
  }
  await p.setInputFiles("#file", FX.text);
  await p.locator("#rec-error.show").waitFor({ state: "visible", timeout: 3000 });
  assert((await p.locator("#rec-error").innerText()).includes("áudio ou vídeo"), "text file not refused");
  // A valid file clears the message; a refused file keeps the file already chosen.
  await p.setInputFiles("#file", FX.video);
  await p.locator("#vready[data-duration]").waitFor({ state: "visible", timeout: 8000 });
  assert(!(await p.locator("#rec-error").isVisible()), "error still shown after a valid file");
  await p.setInputFiles("#file", FX.videoLong);
  await p.locator("#rec-error.show").waitFor({ state: "visible", timeout: 8000 });
  assert(await p.locator("#vready[data-duration]").isVisible(), "a refused file discarded the video already chosen");
  await ctx.close();
});
// Background upload as in docs/design/*-1c-video-ready.png: "Carregando vídeo NN%", then "Arquivo carregado".
await check("ui: a picked file uploads in the background (progress, Arquivo carregado, object in incoming/) (mobile + desktop)", async () => {
  for (const [vp, name] of [[{ width: 390, height: 844 }, "mobile"], [{ width: 1440, height: 900 }, "desktop"]]) {
    const ctx = await browser.newContext({ viewport: vp }); await offline(ctx);
    const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    let release; const held = new Promise((r) => (release = r));
    await p.route("**/api/drafts/*/media", async (r) => { await held; await r.continue(); });
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    assert((await p.content()).includes("challenges.cloudflare.com/turnstile/v0/api.js"), `${name}: Turnstile script missing`);
    await p.setInputFiles("#file", FX.video);
    await p.locator("#up[data-state=uploading][data-draft]").waitFor({ state: "visible", timeout: 8000 });
    assert(await p.evaluate(() => window.__tsKey) === TS_SITE, `${name}: Turnstile rendered with ${await p.evaluate(() => window.__tsKey)}`);
    const row = (await p.locator("#up").innerText()).replace(/\s+/g, " ");
    assert(/Carregando vídeo \d+%/.test(row), `${name}: progress row: ${row}`);
    await p.screenshot({ path: `${OUT}/upload-progress-${name}.png`, fullPage: true });
    release();
    await p.locator("#up[data-state=done]").waitFor({ state: "visible", timeout: 8000 });
    assert((await p.locator("#up").innerText()).trim() === "Arquivo carregado", `${name}: done text: ${await p.locator("#up").innerText()}`);
    assert(!/\p{Extended_Pictographic}/u.test(await p.locator("body").innerText()), `${name}: emoji in the upload state`);
    const id = await p.getAttribute("#up", "data-draft");
    assert(r2get(`incoming/${id}/media`).equals(FX.video.buffer), `${name}: uploaded object differs from the file`);
    await p.screenshot({ path: `${OUT}/upload-done-${name}.png`, fullPage: true });
    // A recording uploads too, as a new draft.
    await ctx.grantPermissions(["microphone"]);
    await p.click("#tab-audio"); assert(!(await p.locator("#up").isVisible()), `${name}: upload row kept after discarding the video`);
    await p.click("#record"); await p.locator("#recorder").waitFor({ state: "visible", timeout: 5000 }); await p.waitForTimeout(1200); await p.click("#stop");
    await p.locator("#up[data-state=done]").waitFor({ state: "visible", timeout: 8000 });
    const id2 = await p.getAttribute("#up", "data-draft");
    assert(id2 !== id && r2get(`incoming/${id2}/media`).length === Number(await p.getAttribute("#ready", "data-bytes")), `${name}: recording not uploaded`);
    await ctx.close();
  }
});
await check("ui: a failed upload says so and \"Tentar de novo\" finishes it", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await offline(ctx);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); // the 503s below log console errors on purpose
  let fail = true; await p.route("**/api/drafts/*/media", (r) => (fail ? r.fulfill({ status: 503, body: "" }) : r.continue()));
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.setInputFiles("#file", FX.audio);
  await p.locator("#up[data-state=error]").waitFor({ state: "visible", timeout: 15000 });
  const t = (await p.locator("#up").innerText()).replace(/\s+/g, " ");
  assert(t.includes("Não foi possível carregar o arquivo.") && t.includes("Tentar de novo"), `error text: ${t}`);
  await p.screenshot({ path: `${OUT}/upload-error-mobile.png`, fullPage: true });
  fail = false; await p.click("#up-retry");
  await p.locator("#up[data-state=done]").waitFor({ state: "visible", timeout: 8000 });
  await ctx.close();
});
await check("ui: swapping the file during a retry wait cancels the old upload for good", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await offline(ctx);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); // the 503 below logs a console error on purpose
  let first = null; const hits = {};
  await p.route("**/api/drafts/*/media", (r) => {
    const id = r.request().url().split("/").at(-2); first ??= id; hits[id] = (hits[id] || 0) + 1;
    return id === first ? r.fulfill({ status: 503, body: "" }) : r.continue();
  });
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.setInputFiles("#file", FX.audio);
  await p.waitForFunction(() => document.getElementById("up").dataset.draft); await p.waitForTimeout(300); // first attempt failed, now waiting to retry
  await p.setInputFiles("#file", FX.video);
  await p.locator("#up[data-state=done]").waitFor({ state: "visible", timeout: 8000 });
  await p.waitForTimeout(3500); // past both retry delays of the old upload
  assert(hits[first] === 1, `canceled upload retried ${hits[first] - 1} time(s)`);
  assert((await p.getAttribute("#up", "data-state")) === "done" && (await p.getAttribute("#up", "data-draft")) !== first, "replacement upload was disturbed");
  await ctx.close();
});
// Ready form and thanks as in docs/design/*-1-audio-ready.png and *-2-thanks.png.
const PHOTOS = [{ name: "eu.png", mimeType: "image/png", buffer: PNG }, { name: "setup.png", mimeType: "image/png", buffer: PNG }];
await check("ui: Enviar needs consent, Anonimizar voz hides the name, photos, send, thanks (mobile + desktop)", async () => {
  for (const [vp, name, desktop] of [[{ width: 390, height: 844 }, "mobile", false], [{ width: 1440, height: 900 }, "desktop", true]]) {
    const ctx = await browser.newContext({ viewport: vp }); await offline(ctx);
    const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    assert(!(await p.locator("#form").isVisible()), `${name}: form shown before there is media`);
    await p.setInputFiles("#file", FX.audio);
    await p.locator("#up[data-state=done]").waitFor({ state: "visible", timeout: 8000 });
    const t = (await p.locator("#form").innerText()).replace(/\s+/g, " ");
    for (const x of ["Anonimizar voz", "O áudio fica distorcido e sua voz não é reconhecida.", "Nome · opcional", "0 / 10 fotos", "Manda uma foto sua! Se sua mensagem entrar no vlog, eu mostro você no vídeo.", "Autorizo o uso deste envio nos vídeos do canal, conforme a política de privacidade.", "Enviar"])
      assert(t.includes(x), `${name}: missing "${x}" in: ${t}`);
    assert(!/\p{Extended_Pictographic}/u.test(t), `${name}: emoji in the form`);
    for (const sel of [".anon-icon", ".nudge", "#photo-add"]) assert(await p.locator(`${sel} svg`).count() === 1, `${sel} has no SVG icon`);
    const link = p.locator(".consent a"); assert((await link.getAttribute("href")) === "/privacidade" && (await link.getAttribute("target")) === "_blank", `${name}: privacy link`);
    // Enviar only with consent.
    assert(await p.locator("#send").isDisabled(), `${name}: Enviar enabled without consent`);
    await p.click("#consent"); assert(await p.locator("#send").isEnabled(), `${name}: Enviar disabled with media + consent`);
    await p.click("#consent"); assert(await p.locator("#send").isDisabled(), `${name}: Enviar enabled after unchecking consent`);
    // Anonimizar voz hides the name field and is sent as anonymous; off again brings it back.
    await p.click("#anon");
    assert((await p.getAttribute("#anon", "aria-checked")) === "true" && !(await p.locator("#name").isVisible()), `${name}: name still visible with Anonimizar voz on`);
    await p.click("#anon"); assert(await p.locator("#name").isVisible(), `${name}: name hidden with Anonimizar voz off`);
    await p.fill("#name", "Marina Souza");
    await p.setInputFiles("#photo-file", PHOTOS);
    await p.waitForFunction(() => document.querySelectorAll("#photo-list img").length === 2);
    assert((await p.locator("#photo-count").innerText()).trim() === "2 / 10 fotos", `${name}: count ${await p.locator("#photo-count").innerText()}`);
    await p.click("#consent");
    assert((await p.evaluate(() => document.documentElement.scrollWidth)) <= vp.width, `${name}: horizontal scroll`);
    await p.screenshot({ path: `${OUT}/form-${name}.png`, fullPage: true });
    const id = await p.getAttribute("#up", "data-draft");
    await p.click("#send");
    await p.locator("#thanks").waitFor({ state: "visible", timeout: 10000 });
    const th = (await p.locator("#thanks").innerText()).replace(/\s+/g, " ");
    for (const x of ["Valeu demais!", "Obrigado por mandar sua mensagem, Marina.", "Quer remover seu envio?", "Escreva para contato@yudiganeko.com.", "Enviar outro"]) assert(th.toLowerCase().includes(x.toLowerCase()), `${name}: thanks missing "${x}" in: ${th}`);
    assert(await p.locator("#thanks h2 svg").count() === 1 && !/\p{Extended_Pictographic}/u.test(th), `${name}: thanks icon / emoji`);
    assert((await p.locator(".hero").isVisible()) === desktop, `${name}: hero ${desktop ? "hidden" : "shown"} on the thanks screen`);
    assert(!(await p.locator("#form").isVisible()) && !(await p.locator(".tabs").isVisible()), `${name}: form or tabs still visible after Send`);
    await p.screenshot({ path: `${OUT}/thanks-${name}.png`, fullPage: true });
    const row = await mcpData("get_submission", { id });
    assert(row.status === "new" && row.name === "Marina Souza" && row.anonymous === 0 && JSON.parse(row.photo_keys).length === 2 && row.consent_at, `${name}: saved ${JSON.stringify(row)}`);
    assert((await api("/api/panel/submissions?status=new")).body.some((x) => x.id === id), `${name}: not in the panel as new`);
    await p.click("#again"); await p.locator("#upload").waitFor({ state: "visible", timeout: 5000 });
    await ctx.close();
  }
});
await check("ui: anonymous audio is saved without a name; a video has no Anonimizar voz and keeps the name", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await offline(ctx);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.setInputFiles("#file", FX.video);
  await p.locator("#vready[data-duration]").waitFor({ state: "visible", timeout: 8000 });
  assert(!(await p.locator("#anon").isVisible()) && (await p.locator("#name").isVisible()), "video: Anonimizar voz shown or name hidden");
  await p.screenshot({ path: `${OUT}/form-video-mobile.png`, fullPage: true });
  await p.click("#tab-audio"); await p.setInputFiles("#file", FX.audio);
  await p.locator("#up[data-state=done]").waitFor({ state: "visible", timeout: 8000 });
  await p.fill("#name", "Fulano"); await p.click("#anon"); await p.click("#consent");
  const id = await p.getAttribute("#up", "data-draft");
  await p.click("#send"); await p.locator("#thanks").waitFor({ state: "visible", timeout: 10000 });
  assert((await p.locator("#thanks-text").innerText()).startsWith("Obrigado por mandar sua mensagem. "), `thanks text: ${await p.locator("#thanks-text").innerText()}`);
  const row = await mcpData("get_submission", { id });
  assert(row.anonymous === 1 && row.name === null && row.status === "new", JSON.stringify(row));
  await ctx.close();
});
// ---- Media work in the browser (ADR 0003). Stored files are inspected in a page (Web Audio, <video>, ImageBitmap).
const FX4K = { name: "video-4k.webm", mimeType: "video/webm", buffer: readFileSync("scripts/fixtures/video-2s-4k.webm") };
// A "voice": 220 Hz with 10 harmonics, 16-bit 24 kHz. The distortion moves the pitch to ~172 Hz (×0.78).
const voiceWav = (sec, f0 = 220, rate = 24000) => {
  const n = Math.round(sec * rate), b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { let x = 0; for (let h = 1; h <= 10; h++) x += (0.3 / h) * Math.sin((2 * Math.PI * f0 * h * i) / rate); b.writeInt16LE(Math.round(x * 0x7fff), 44 + i * 2); }
  return b;
};
const VOICE = { name: "voz.wav", mimeType: "audio/wav", buffer: voiceWav(3) };
// Pitch (autocorrelation, 60–600 Hz) and duration of an audio file, decoded by the browser.
const pitchOf = (p, buf) => p.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), SR = 24000;
  const a = await new OfflineAudioContext(1, 1, SR).decodeAudioData(bytes.buffer), y = a.getChannelData(0);
  let best = 0, lag = 0; const from = Math.floor(y.length / 3);
  for (let l = 40; l < 400; l++) { let s = 0; for (let i = from; i < from + 8000; i++) s += y[i] * y[i + l]; if (s > best) { best = s; lag = l; } }
  return { f0: SR / lag, duration: a.duration };
}, buf.toString("base64"));
const mediaSize = (p, buf, type) => p.evaluate(async ([b64, type]) => {
  const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type });
  if (type.startsWith("image/")) { const i = await createImageBitmap(blob); return { width: i.width, height: i.height }; }
  const v = document.createElement("video"); v.muted = true; v.src = URL.createObjectURL(blob);
  await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error("video does not decode")); });
  return { width: v.videoWidth, height: v.videoHeight };
}, [buf.toString("base64"), type]);
const newPage = async (vp = { width: 390, height: 844 }) => {
  const ctx = await browser.newContext({ viewport: vp }); await offline(ctx);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { ctx, p };
};
const sendForm = async (p) => {
  if (!(await p.locator("#consent").isChecked())) await p.click("#consent");
  const id = await p.getAttribute("#up", "data-draft");
  await p.click("#send"); await p.locator("#thanks").waitFor({ state: "visible", timeout: 20000 });
  return mcpData("get_submission", { id });
};
await check("ui: anonymous audio is distorted in the browser (pitch 220 → ~172 Hz) and the original never reaches media/", async () => {
  const { ctx, p } = await newPage();
  const puts = []; await p.route("**/api/drafts/*/media", (r) => { if (r.request().method() === "PUT") puts.push(r.request().postDataBuffer()); return r.continue(); });
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  const t = (await p.locator("body").innerText()); assert(!/\p{Extended_Pictographic}/u.test(t), "emoji");
  await p.setInputFiles("#file", VOICE);
  await p.locator("#up[data-state=done]").waitFor({ state: "visible", timeout: 10000 });
  const id = await p.getAttribute("#up", "data-draft");
  assert(r2get(`incoming/${id}/media`).equals(VOICE.buffer), "not anonymous yet: the file should go up as picked");
  assert((await pitchOf(p, VOICE.buffer)).f0 > 210, "fixture pitch");
  // On: the distorted voice replaces the file in the same draft.
  await p.click("#anon");
  await p.locator("#up[data-state=done][data-anon=true]").waitFor({ state: "visible", timeout: 15000 });
  assert((await p.getAttribute("#up", "data-draft")) === id, "a new draft was created instead of replacing the file");
  const stored = r2get(`incoming/${id}/media`), { f0, duration } = await pitchOf(p, stored);
  assert(!stored.equals(VOICE.buffer) && f0 > 150 && f0 < 190 && Math.abs(duration - 3) < 0.2, `distorted: f0 ${f0.toFixed(1)} Hz, ${duration.toFixed(2)} s, ${stored.length} bytes`);
  await p.screenshot({ path: `${OUT}/anon-distorted-mobile.png`, fullPage: true });
  // With the switch on, a new file is distorted before its first upload: the original never goes up.
  const before = puts.length, OTHER = { ...VOICE, name: "outra.wav", buffer: voiceWav(2.5, 200) };
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), p.click("#redo")]); await chooser.setFiles(OTHER);
  await p.waitForFunction((old) => { const u = document.getElementById("up").dataset; return u.draft && u.draft !== old && u.state === "done" && u.anon === "true"; }, id, { timeout: 15000 });
  assert(puts.length > before, `no upload seen after the swap (${puts.length})`);
  assert(puts.slice(before).every((b) => b && !b.equals(OTHER.buffer)), `the original of an anonymous audio was uploaded (${puts.slice(before).map((b) => b?.length)}, original ${OTHER.buffer.length})`);
  const row = await sendForm(p);
  const kept = r2get(row.media_key), k = await pitchOf(p, kept);
  assert(row.anonymous === 1 && row.name === null && !kept.equals(OTHER.buffer) && k.f0 > 140 && k.f0 < 170, `saved: ${JSON.stringify(row)} f0 ${k.f0.toFixed(1)}`);
  await ctx.close();
});
await check("ui: a 4K video is re-encoded to ≤ 1920 px wide and its audio track goes up as a separate file", async () => {
  const { ctx, p } = await newPage({ width: 1440, height: 900 });
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.setInputFiles("#file", FX4K);
  await p.locator("#up[data-state=done]").waitFor({ state: "visible", timeout: 60000 });
  assert((await p.locator("#vstatus").innerText()).trim() === "Vídeo pronto · 1080p", `status ${await p.locator("#vstatus").innerText()}`);
  assert(!(await p.locator("#up-note").isVisible()), "warning shown with WebCodecs");
  await p.screenshot({ path: `${OUT}/video-4k-compressed-desktop.png`, fullPage: true });
  await p.fill("#name", "Teste 4K");
  const row = await sendForm(p);
  const video = r2get(row.media_key), size = await mediaSize(p, video, "video/mp4");
  assert(size.width <= 1920 && size.height <= 1080 && size.width >= 1900, `stored ${size.width}×${size.height}`);
  assert(!video.equals(FX4K.buffer), "4K original stored");
  assert(row.audio_key === `media/${row.id}/audio`, `audio_key ${row.audio_key}`);
  const track = await pitchOf(p, r2get(row.audio_key));
  assert(Math.abs(track.duration - 2) < 0.3, `track duration ${track.duration}`);
  await ctx.close();
});
await check("ui: photos are stored as WebP ≤ 2000 px", async () => {
  const { ctx, p } = await newPage();
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  const big = Buffer.from(await p.evaluate(async () => {
    const c = new OffscreenCanvas(3000, 2000), g = c.getContext("2d"); g.fillStyle = "#6B4A2E"; g.fillRect(0, 0, 3000, 2000); g.fillStyle = "#E0A35A"; g.fillRect(300, 300, 1200, 900);
    const b = await (await c.convertToBlob({ type: "image/png" })).arrayBuffer(); return btoa(String.fromCharCode(...new Uint8Array(b)));
  }), "base64");
  await p.setInputFiles("#file", FX.audio); await p.locator("#up[data-state=done]").waitFor({ state: "visible", timeout: 8000 });
  await p.setInputFiles("#photo-file", [{ name: "grande.png", mimeType: "image/png", buffer: big }]);
  const row = await sendForm(p), keys = JSON.parse(row.photo_keys);
  assert(keys.length === 1, `photo_keys ${row.photo_keys}`);
  const photo = r2get(keys[0]), s = await mediaSize(p, photo, "image/webp");
  assert(photo.subarray(0, 4).toString() === "RIFF" && photo.subarray(8, 12).toString() === "WEBP", "stored photo is not WebP");
  assert(Math.max(s.width, s.height) === 2000 && s.height === 1333 && photo.length < big.length, `stored ${s.width}×${s.height}, ${photo.length} bytes`);
  await ctx.close();
});
await check("ui: without WebCodecs a video goes up as picked with a short warning; anonymous audio is still distorted", async () => {
  const { ctx, p } = await newPage();
  await ctx.addInitScript(() => { delete window.VideoEncoder; delete window.VideoDecoder; delete window.AudioEncoder; delete window.AudioDecoder; });
  let release; const held = new Promise((r) => (release = r));
  await p.route("**/api/drafts/*/media", async (r) => { await held; await r.continue(); });
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.setInputFiles("#file", FX4K);
  await p.locator("#up[data-state=uploading][data-draft]").waitFor({ state: "visible", timeout: 10000 });
  assert((await p.locator("#up-note").innerText()).trim() === "Seu navegador não comprime vídeos. O envio pode demorar mais.", `note: ${await p.locator("#up-note").innerText()}`);
  await p.screenshot({ path: `${OUT}/video-no-webcodecs-mobile.png`, fullPage: true });
  release();
  await p.locator("#up[data-state=done]").waitFor({ state: "visible", timeout: 10000 });
  const row = await sendForm(p);
  assert(r2get(row.media_key).equals(FX4K.buffer) && row.audio_key === null, `stored: ${JSON.stringify(row)}`);
  // The voice distortion needs only Web Audio: without WebCodecs it goes up as WAV.
  await p.click("#again"); await p.locator("#upload").waitFor({ state: "visible" });
  await p.setInputFiles("#file", VOICE); await p.locator("#up[data-state=done]").waitFor({ state: "visible", timeout: 8000 });
  await p.click("#anon"); await p.locator("#up[data-state=done][data-anon=true]").waitFor({ state: "visible", timeout: 15000 });
  const a = await sendForm(p), stored = r2get(a.media_key), { f0 } = await pitchOf(p, stored);
  assert(stored.subarray(0, 4).toString() === "RIFF" && f0 > 150 && f0 < 190, `anonymous without WebCodecs: f0 ${f0}`);
  await ctx.close();
});
await check("ui: Enviar waits for an upload still running, then sends", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await offline(ctx);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
  let release; const held = new Promise((r) => (release = r));
  await p.route("**/api/drafts/*/media", async (r) => { await held; await r.continue(); });
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.setInputFiles("#file", FX.video);
  await p.locator("#up[data-state=uploading][data-draft]").waitFor({ state: "visible", timeout: 8000 });
  await p.click("#consent"); await p.click("#send");
  await p.waitForTimeout(500);
  assert((await p.locator("#send").innerText()).trim() === "Enviando…" && !(await p.locator("#thanks").isVisible()), "sent before the upload finished");
  release();
  await p.locator("#thanks").waitFor({ state: "visible", timeout: 10000 });
  await ctx.close();
});
await check("ui: privacy page explains deletion by e-mail and that published videos stay online", async () => {
  const t = await shot("privacy-mobile", "/privacidade", { width: 390, height: 844 });
  for (const x of ["Política de privacidade", "contato@yudiganeko.com", "Vídeos já publicados no canal continuam no ar."]) assert(t.includes(x), `missing "${x}"`);
  assert(!/\p{Extended_Pictographic}/u.test(t), "emoji in the privacy page");
});
await check("ui: panel lists messages with tags", async () => {
  const t = await shot("panel", "/painel", { width: 1440, height: 900 });
  assert(t.includes("Marina Souza") && t.includes("Kafka") && t.includes("Anônimo"), "rows missing");
});
await check("ui: panel says \"Transcrevendo…\" before the job runs, then the transcript and tags; dead-lettered or rejected says \"Sem transcrição\"", async () => {
  const id = await sendAudio(markedWav("SLOWJOB"), "Paula Teste");
  const t = await shot("panel-transcribing", "/painel", { width: 1440, height: 900 });
  const rowText = async (rid) => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await offline(ctx); const p = await ctx.newPage();
    await p.goto(BASE + "/painel", { waitUntil: "networkidle" }); const x = await p.locator(`li[data-id="${rid}"]`).innerText(); await ctx.close(); return x; };
  assert(t.includes("Paula Teste"), "new message missing");
  const before = await rowText(id); assert(before.includes("Transcrevendo…"), `row before the job: ${before}`);
  assert(await until(async () => (await panelRow(id))?.transcript != null, 30000), "never transcribed");
  const after = await rowText(id); assert(after.includes("organiza a semana") && after.includes("Rotina") && !after.includes("Transcrevendo"), `row after the job: ${after}`);
  const failed = (await api("/api/panel/submissions")).body.find((x) => x.transcript_error);
  assert(failed && (await rowText(failed.id)).includes("Sem transcrição"), "dead-lettered row text");
  const rejected = (await api("/api/panel/submissions?status=rejected")).body[0];
  assert(rejected && (await rowText(rejected.id)).includes("Sem transcrição"), "a rejected message says Transcrevendo…");
  await shot("panel-transcribed", "/painel", { width: 1440, height: 900 });
});
await check("ui: no console errors", async () => assert(errors.length === 0, errors.slice(0, 3).join(" | ")));
await check("ui: record main flow", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["microphone"], recordVideo: { dir: `${OUT}/video`, size: { width: 1280, height: 800 } } });
  await offline(ctx); const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(1000);
  await p.click("#tab-video"); await p.waitForTimeout(800); await p.click("#tab-audio"); await p.waitForTimeout(600);
  await p.click("#record"); await p.waitForTimeout(2500); await p.click("#stop"); await p.waitForTimeout(1500);
  await p.click("#tab-video"); await p.waitForTimeout(600); await p.setInputFiles("#file", FX.video); await p.waitForTimeout(1800);
  await p.fill("#name", "Rafael Lima"); await p.setInputFiles("#photo-file", PHOTOS[0]); await p.click("#consent"); await p.waitForTimeout(800);
  await p.click("#send"); await p.locator("#thanks").waitFor({ state: "visible", timeout: 10000 }); await p.waitForTimeout(1800);
  await p.goto(BASE + "/painel", { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
  const vid = await p.video().path(); await ctx.close();
  try { execSync(`ffmpeg -y -loglevel error -i ${vid} -vf "fps=8,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" ${OUT}/flow.gif`); }
  catch { console.log("      (ffmpeg not found: kept webm only)"); }
});
await browser.close();

// ---- Auth: a second server configured like production (agent token set). Guards the "no human review" pipeline:
// a PR that loosens auth fails here instead of merging.
{
  const P2 = await freePort(), B2 = `http://localhost:${P2}`, TOKEN = randomBytes(24).toString("hex"); // throwaway, never deployed
  const kill2 = serve(P2, [`AGENT_TOKEN:${TOKEN}`, "DEV_OPEN:1"]);
  await up(B2);
  const get = (path, headers = {}) => fetch(B2 + path, { headers }).then((r) => r.status).catch(() => 0);
  const post = (path, headers = {}) => fetch(B2 + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' }).then((r) => r.status).catch(() => 0);
  await check("auth: the public page stays public", async () => { const st = await get("/"); assert(st === 200, `${st}`); });
  await check("auth: no credentials → 401 even on localhost with DEV_OPEN once a token is configured", async () => {
    for (const p of ["/painel", "/api/panel/submissions"]) { const st = await get(p); assert(st === 401, `${p} → ${st}`); }
    const st = await post("/mcp"); assert(st === 401, `/mcp → ${st}`);
  });
  await check("auth: wrong / empty Bearer → 401", async () => {
    for (const h of ["Bearer wrong", "Bearer ", `Bearer ${TOKEN}x`]) { const st = await post("/mcp", { authorization: h }); assert(st === 401, `"${h}" → ${st}`); }
  });
  await check("auth: forged Access JWT header → 401", async () => {
    const jwt = [{ alg: "RS256" }, { sub: "x" }].map((o) => Buffer.from(JSON.stringify(o)).toString("base64url")).join(".") + ".c2ln";
    const st = await get("/api/panel/submissions", { "cf-access-jwt-assertion": jwt }); assert(st === 401, `${st}`);
  });
  await check("auth: correct Bearer → 200", async () => {
    assert((await post("/mcp", { authorization: `Bearer ${TOKEN}` })) === 200, "mcp");
    assert((await get("/api/panel/submissions", { authorization: `Bearer ${TOKEN}` })) === 200, "panel api");
  });
  kill2();
}
// ---- Signed URLs: a third server with (fake) R2 S3 keys, so drafts get real presigned URLs. No request reaches R2.
{
  const P3 = await freePort(), B3 = `http://localhost:${P3}`;
  const kill3 = serve(P3, ["DEV_OPEN:1", `TURNSTILE_SECRET:${TS_PASS}`, "R2_ACCESS_KEY_ID:verify-fake-key", `R2_SECRET_ACCESS_KEY:${randomBytes(16).toString("hex")}`]);
  await up(B3);
  await check("api: signed upload URL points at R2 incoming/<id>/ and expires in ≤ 15 min", async () => {
    const t0 = Date.now(), d = await draft({ kind: "audio", type: "audio/webm", size: 50_000, token: "x" }, fakeIp(), B3);
    assert(d.status === 201 && d.body.upload.mode === "single", `draft → ${d.status} ${JSON.stringify(d.body)}`);
    const u = new URL(d.body.upload.url), q = u.searchParams;
    assert(u.host === "337de6b8e4de301a53ecae0c06afcc72.r2.cloudflarestorage.com" && u.pathname === `/coffee-time-media/incoming/${d.body.id}/media`, `url ${u.host}${u.pathname}`);
    const exp = Number(q.get("X-Amz-Expires")), at = Date.parse(q.get("X-Amz-Date").replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/, "$1-$2-$3T$4:$5:$6Z"));
    assert(exp > 0 && exp <= 900, `X-Amz-Expires ${exp}`);
    assert(Math.abs(at - t0) < 60_000, `X-Amz-Date ${q.get("X-Amz-Date")}`);
    assert(/^[0-9a-f]{64}$/.test(q.get("X-Amz-Signature") || "") && q.get("X-Amz-Credential").startsWith("verify-fake-key/"), "signature / credential");
    assert((await fetch(B3 + `/api/drafts/${d.body.id}/media`, { method: "PUT", body: "x" })).status === 404, "Worker upload route open while S3 keys are set");
    const ph = await fetch(B3 + `/api/drafts/${d.body.id}/photos`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ n: 2, type: "image/jpeg", size: 2_000_000 }) }).then((r) => r.json());
    const pu = new URL(ph.upload.url);
    assert(ph.upload.mode === "single" && pu.pathname === `/coffee-time-media/incoming/${d.body.id}/photo-2` && Number(pu.searchParams.get("X-Amz-Expires")) <= 900, `photo url ${ph.upload.url}`);
    assert((await fetch(B3 + `/api/drafts/${d.body.id}/photo-2`, { method: "PUT", body: "x" })).status === 404, "Worker photo route open while S3 keys are set");
  });
  kill3();
}
// Access JWT signature, tested directly on src/auth.ts with keys made here (the real JWKS fetch is stubbed).
{
  const js = execSync("npx esbuild src/auth.ts --format=esm --log-level=error").toString();
  const auth = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
  const { subtle } = globalThis.crypto, TEAM = "verify.cloudflareaccess.com", AUD = "verify-aud";
  const gen = () => subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const good = await gen(), evil = await gen();
  const jwk = { ...(await subtle.exportKey("jwk", good.publicKey)), kid: "k1" };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => { assert(String(u) === `https://${TEAM}/cdn-cgi/access/certs`, `fetched ${u}`); return new Response(JSON.stringify({ keys: [jwk] })); };
  const b64 = (x) => Buffer.from(typeof x === "string" ? x : new Uint8Array(x)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const sign = async (key, claims = {}, header = {}) => {
    const h = b64(JSON.stringify({ alg: "RS256", kid: "k1", ...header })), p = b64(JSON.stringify({ aud: [AUD], iss: `https://${TEAM}`, exp: now + 300, ...claims }));
    return `${h}.${p}.${b64(await subtle.sign("RSASSA-PKCS1-v1_5", key.privateKey, new TextEncoder().encode(`${h}.${p}`)))}`;
  };
  const ok = async (jwt) => { auth._resetCerts(); return auth.verifyAccess(jwt, TEAM, AUD).catch(() => false); };
  try {
    await check("auth: Access JWT signed by the team key is accepted", async () => assert(await ok(await sign(good)) === true, "rejected a valid JWT"));
    await check("auth: Access JWT with valid claims but a forged signature → rejected", async () => assert(await ok(await sign(evil)) === false, "accepted forged signature"));
    await check("auth: Access JWT tampered after signing → rejected", async () => {
      const [h, , sig] = (await sign(good)).split("."); const p = b64(JSON.stringify({ aud: [AUD], iss: `https://${TEAM}`, exp: now + 300, email: "attacker@x" }));
      assert(await ok(`${h}.${p}.${sig}`) === false, "accepted tampered payload");
    });
    await check("auth: Access JWT with wrong aud / iss / expired / alg none → rejected", async () => {
      for (const [c, h] of [[{ aud: ["other"] }], [{ iss: "https://evil.com" }], [{ exp: now - 10 }], [{}, { alg: "none" }]]) assert(await ok(await sign(good, c, h)) === false, `accepted ${JSON.stringify({ ...c, ...h })}`);
    });
  } finally { globalThis.fetch = realFetch; }
}

const failed = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/report.json`, JSON.stringify({ verdict: failed.length ? "FAIL" : "PASS", results }, null, 2));
if (failed.length) writeFileSync(`${OUT}/server.log`, log);
console.log(`\n${failed.length ? "FAIL" : "PASS"}  ${results.length - failed.length}/${results.length} checks · screenshots in ${OUT}/`);
if (keep) { console.log(`server running at ${BASE} (Ctrl+C to stop)`); } else { stop(); process.exit(failed.length ? 1 : 0); }
