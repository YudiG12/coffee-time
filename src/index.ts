// Coffee Time Worker: public site, panel (Cloudflare Access), MCP (Bearer token), the transcript queue consumer and the hourly sweep. See ARCHITECTURE.md.
import { Hono } from "hono";
import { safeEqual, verifyAccess } from "./auth";
import { panelPage, privacyPage, startPage } from "./pages";
import { registerDrafts } from "./api/drafts";
import { registerSend } from "./api/send";
import { queue, type Job } from "./jobs/transcribe";
import { scheduled } from "./jobs/sweep";
import { downloadUrls, registerPanel, type Row } from "./panel/detail";

export type Env = {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  AGENT_TOKEN?: string;        // MCP Bearer token (secret)
  ACCESS_TEAM_DOMAIN?: string; // e.g. yourteam.cloudflareaccess.com
  ACCESS_AUD?: string;         // Access application AUD tag
  DEV_OPEN?: string;           // "1" only in local .dev.vars
  TURNSTILE_SITE_KEY?: string; // public var (wrangler.jsonc)
  TURNSTILE_SECRET?: string;   // secret
  R2_ACCOUNT_ID?: string;      // public var (wrangler.jsonc)
  R2_ACCESS_KEY_ID?: string;   // secret: R2 S3 API token, used only to sign upload URLs
  R2_SECRET_ACCESS_KEY?: string; // secret
  AI: Ai;                      // Workers AI: Whisper + tags (ADR 0004)
  JOBS: Queue<Job>;            // coffee-time-jobs: one transcript job per submission
  JOBS_RETRY_BASE_S?: string;  // retry backoff base in seconds (default 30; verify sets 0)
  SWEEP_BATCH?: string;        // sends the hourly sweep finishes per run (default 25; verify sets 1)
};

const app = new Hono<{ Bindings: Env }>();

// Public
// Recording limit is 90 s. Local dev only (DEV_OPEN=1 on localhost) may shorten it with ?max=N so verify can test the auto-stop.
app.get("/", (c) => {
  const host = new URL(c.req.url).hostname, dev = c.env.DEV_OPEN === "1" && (host === "localhost" || host === "127.0.0.1");
  const max = Number(c.req.query("max"));
  return c.html(startPage(dev && Number.isInteger(max) && max >= 1 && max < 90 ? max : 90, c.env.TURNSTILE_SITE_KEY));
});
// Every secret production needs. The deep health reports any that is missing; add new ones here.
export const REQUIRED_SECRETS = ["AGENT_TOKEN", "TURNSTILE_SECRET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "ACCESS_TEAM_DOMAIN", "ACCESS_AUD"] as const;
// ?deep=1: checks the bindings production needs (D1 query, R2 read, queue binding, upload signing secrets).
// deploy.yml calls it right after deploying; a failure opens a `deploy-failed` issue.
app.get("/api/health", async (c) => {
  if (!c.req.query("deep")) return c.json({ ok: true });
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); return true; } catch { return false; } };
  const checks = {
    db: await run(() => c.env.DB.prepare("SELECT 1").first()),
    media: await run(() => c.env.MEDIA.head("health-probe")),
    jobs: typeof c.env.JOBS?.send === "function",
    ai: typeof c.env.AI?.run === "function",
    signing: Boolean(c.env.R2_ACCESS_KEY_ID && c.env.R2_SECRET_ACCESS_KEY && c.env.R2_ACCOUNT_ID),
    // names only, never values: which required secret is missing in production
    missing: REQUIRED_SECRETS.filter((k) => !(c.env as unknown as Record<string, unknown>)[k]),
  };
  const ok = Object.entries(checks).every(([k, v]) => (k === "missing" ? !(v as string[]).length : Boolean(v)));
  // deep: true lets the deploy tell this answer from an old version's shallow one
  return c.json({ deep: true, ok, ...checks }, ok ? 200 : 503);
});
registerDrafts(app);
registerSend(app);
app.get("/privacidade", (c) => c.html(privacyPage()));

// Owner and agent only.
// - Agent: Authorization: Bearer AGENT_TOKEN.
// - Owner: Cloudflare Access in front of /painel; the JWT (Cf-Access-Jwt-Assertion) is verified here too.
// - Dev: DEV_OPEN=1, nothing configured, localhost only. In production, no secrets = locked.
const guard = async (c: any, next: () => Promise<void>) => {
  const { AGENT_TOKEN: token, ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud } = c.env as Env;
  const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") || "";
  let ok = !!token && !!bearer && safeEqual(bearer, token);
  if (!ok && team && aud) {
    const jwt = c.req.header("cf-access-jwt-assertion");
    ok = !!jwt && (await verifyAccess(jwt, team, aud).catch(() => false));
  }
  const host = new URL(c.req.url).hostname;
  if (!ok && c.env.DEV_OPEN === "1" && !token && !team && !aud && (host === "localhost" || host === "127.0.0.1")) ok = true;
  if (!ok) return c.json({ error: "unauthorized" }, 401);
  await next();
};
app.use("/painel/*", guard); app.use("/painel", guard); app.use("/api/panel/*", guard); app.use("/mcp", guard);

// Lowercase without accents: "João" → "joao", "CARREIRA" → "carreira". SQLite's LIKE folds ASCII only, so search runs here.
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const LIST = 200, SCAN = 5000;
const listSubmissions = async (db: D1Database, f: { status?: string; tag?: string; q?: string } = {}) => {
  const where = ["status != 'uploading'"], args: string[] = [];
  if (f.status) { where.push("status = ?"); args.push(f.status); }
  if (f.tag) { where.push("EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)"); args.push(f.tag); }
  const q = fold((f.q || "").trim().slice(0, 100));
  const rows = (await db.prepare(`SELECT id, created_at, status, kind, name, anonymous, duration_s, transcript, transcript_error, tags, json_array_length(photo_keys) AS photos, (thumb_key IS NOT NULL) AS thumb FROM submissions WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ${q ? SCAN : LIST}`).bind(...args).all<any>()).results;
  if (!q) return rows;
  // Search (#31): the name the panel shows, as who() in pages.ts ("Anônimo" hides an anonymous sender's name, "Sem nome"
  // when none was given), the transcript and the tags.
  const hay = (r: any) => fold([r.anonymous ? "Anônimo" : r.name || "Sem nome", r.transcript || "", ...(JSON.parse(r.tags || "[]") as string[])].join("\n"));
  return rows.filter((r) => hay(r).includes(q)).slice(0, LIST);
};

// Panel list (docs/design/panel-list.png): status tabs with counts, the most used tags, search (name, transcript, tags).
// Filters come from the query string (?status=&tag=&q=), so every view is a plain link.
const PANEL_STATUS = ["new", "favorite", "used"];
app.get("/painel", async (c) => {
  const db = c.env.DB, q = c.req.query();
  const f = { status: PANEL_STATUS.includes(q.status) ? q.status : "", tag: (q.tag || "").slice(0, 60), q: (q.q || "").trim().slice(0, 100) };
  const [rows, counts, tags] = await Promise.all([
    listSubmissions(db, f),
    db.prepare("SELECT status, COUNT(*) AS n FROM submissions GROUP BY status").all<{ status: string; n: number }>().then((r) => Object.fromEntries(r.results.map((x) => [x.status, x.n]))),
    db.prepare("SELECT j.value AS tag, COUNT(*) AS n FROM submissions, json_each(submissions.tags) j WHERE status IN ('new','favorite','used') GROUP BY j.value ORDER BY n DESC, j.value LIMIT 8").all<{ tag: string }>().then((r) => r.results.map((x) => x.tag)),
  ]);
  if (f.tag && !tags.includes(f.tag)) tags.push(f.tag);
  return c.html(panelPage(rows, { counts, tags, filter: f, user: c.req.header("cf-access-authenticated-user-email") || "" }));
});
// List thumbnails: the first photo of a message, or a frame of a video without photos (#50). Only keys saved in the
// row (photo_keys, thumb_key) are ever read. The type comes from the bytes (Send already checked them), not from the
// header the browser sent.
const image = async (bucket: R2Bucket, key: string | null | undefined) => {
  const obj = key ? await bucket.get(key) : null;
  if (!obj) return new Response("not found", { status: 404 });
  const b = new Uint8Array(await obj.arrayBuffer()), at = (i: number, s: string) => [...s].every((ch, k) => b[i + k] === ch.charCodeAt(0));
  const type = at(0, "\x89PNG") ? "image/png" : b[0] === 0xff && b[1] === 0xd8 ? "image/jpeg" : at(0, "RIFF") && at(8, "WEBP") ? "image/webp" : at(0, "GIF8") ? "image/gif" : "application/octet-stream";
  return new Response(b, { headers: { "content-type": type, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
};
app.get("/painel/foto/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT photo_keys FROM submissions WHERE id = ?").bind(c.req.param("id")).first<{ photo_keys: string }>();
  return image(c.env.MEDIA, row ? (JSON.parse(row.photo_keys) as string[])[0] : undefined);
});
app.get("/painel/miniatura/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT thumb_key FROM submissions WHERE id = ? AND kind = 'video' AND status != 'uploading'").bind(c.req.param("id")).first<{ thumb_key: string | null }>();
  return image(c.env.MEDIA, row?.thumb_key);
});
app.get("/api/panel/submissions", async (c) => c.json(await listSubmissions(c.env.DB, c.req.query())));
registerPanel(app); // detail page, files, zip, status/tags, delete (src/panel/detail.ts)

// MCP (JSON-RPC over HTTP)
const TOOLS = [
  { name: "list_submissions", description: "List messages; filter by status (new, favorite, used), tag, or text in the name, transcript or tags (case- and accent-insensitive).", inputSchema: { type: "object", properties: { status: { type: "string" }, tag: { type: "string" }, q: { type: "string" } } } },
  { name: "get_submission", description: "One message with transcript, tags, media keys and `downloads`: short-lived URLs (15 min) for the media, the audio track of a video and the photos.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "set_status", description: "Set status to new, favorite or used.", inputSchema: { type: "object", properties: { id: { type: "string" }, status: { type: "string", enum: ["new", "favorite", "used"] } }, required: ["id", "status"] } },
];
app.post("/mcp", async (c) => {
  const msg = await c.req.json<any>().catch(() => null);
  if (!msg) return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, 400);
  const reply = (result: unknown) => c.json({ jsonrpc: "2.0", id: msg.id, result });
  const text = (v: unknown, isError = false) => reply({ content: [{ type: "text", text: JSON.stringify(v) }], isError });
  if (msg.method === "initialize") return reply({ protocolVersion: "2025-03-26", serverInfo: { name: "coffee-time", version: "0.1.0" }, capabilities: { tools: {} } });
  if (msg.method === "tools/list") return reply({ tools: TOOLS });
  if (msg.method !== "tools/call") return c.json({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "method not found" } });
  const { name, arguments: a = {} } = msg.params || {};
  if (name === "list_submissions") return text(await listSubmissions(c.env.DB, a));
  if (name === "get_submission") {
    const row = await c.env.DB.prepare("SELECT * FROM submissions WHERE id = ?").bind(a.id).first<Row>();
    if (!row) return text({ error: "not found" }, true);
    return text({ ...row, downloads: row.status === "uploading" ? null : await downloadUrls(c.env, row, new URL(c.req.url).origin) });
  }
  if (name === "set_status") {
    if (!["new", "favorite", "used"].includes(a.status)) return text({ error: "invalid status" }, true);
    const r = await c.env.DB.prepare("UPDATE submissions SET status = ? WHERE id = ?").bind(a.status, a.id).run();
    return r.meta.changes ? text({ ok: true }) : text({ error: "not found" }, true);
  }
  return text({ error: `unknown tool ${name}` }, true);
});

export default { fetch: app.fetch, queue, scheduled } satisfies ExportedHandler<Env, Job>;
