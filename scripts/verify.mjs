#!/usr/bin/env node
// Verification CLI for agents (Claude builds, Codex verifies). See AGENTS.md "Verify a change".
// Runs the Worker locally on an isolated, throwaway D1 with fake data, checks the API, the MCP and auth,
// and saves screenshots (and a GIF if ffmpeg exists) to verify-out/. Never touches production.
//   npm run verify            -> all checks + screenshots
//   npm run verify -- --keep  -> leave the dev server running to explore
import { spawn, execSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
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

const stop = serve(PORT, ["DEV_OPEN:1"]);
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

// ---- Screens ----
const { chromium } = await import("playwright");
// Fake microphone/camera with auto-accepted permission prompts, so recording can be tested headless.
const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
// Offline-safe: external requests (Google Fonts) get an empty reply, so sandboxes without internet behave the same
const offline = (ctx) => ctx.route((url) => !url.href.startsWith(BASE), (r) => r.fulfill({ status: 200, body: "" }));
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
