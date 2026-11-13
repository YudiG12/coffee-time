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
console.log("migrate + seed (isolated local D1)…");
sh(`npx wrangler d1 migrations apply coffee-time --local --persist-to ${STATE}`);
sh(`npx wrangler d1 execute coffee-time --local --persist-to ${STATE} --file scripts/demo-seed.sql`);

let log = "";
const serve = (port, vars) => {
  const args = ["wrangler", "dev", "--port", String(port), "--persist-to", STATE, ...vars.flatMap((v) => ["--var", v])];
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
});
// Signing and Turnstile, tested directly on src/api/ (AWS's published SigV4 example; Turnstile siteverify stubbed).
{
  const js = execSync("npx esbuild --bundle --format=esm --log-level=error", { input: 'export * from "./src/api/drafts.ts"; export * from "./src/api/s3.ts";' }).toString();
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
const wav = (sec, rate = 8000) => {
  const n = Math.round(sec * rate), b = Buffer.alloc(44 + n);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write("data", 36); b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(40 * Math.sin((2 * Math.PI * 440 * i) / rate));
  return b;
};
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
await check("ui: panel lists messages with tags", async () => {
  const t = await shot("panel", "/painel", { width: 1440, height: 900 });
  assert(t.includes("Marina Souza") && t.includes("Kafka") && t.includes("Anônimo"), "rows missing");
});
await check("ui: no console errors", async () => assert(errors.length === 0, errors.slice(0, 3).join(" | ")));
await check("ui: record main flow", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["microphone"], recordVideo: { dir: `${OUT}/video`, size: { width: 1280, height: 800 } } });
  await offline(ctx); const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(1000);
  await p.click("#tab-video"); await p.waitForTimeout(800); await p.click("#tab-audio"); await p.waitForTimeout(600);
  await p.click("#record"); await p.waitForTimeout(2500); await p.click("#stop"); await p.waitForTimeout(1500);
  await p.click("#tab-video"); await p.waitForTimeout(600); await p.setInputFiles("#file", FX.video); await p.waitForTimeout(1800);
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
