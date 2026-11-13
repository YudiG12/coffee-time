// Coffee Time Worker: public site, panel (Cloudflare Access) and MCP (Bearer token). See ARCHITECTURE.md.
import { Hono } from "hono";
import { safeEqual, verifyAccess } from "./auth";
import { panelPage, privacyPage, startPage } from "./pages";
import { registerDrafts } from "./api/drafts";
import { registerSend } from "./api/send";

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
};

const app = new Hono<{ Bindings: Env }>();

// Public
// Recording limit is 90 s. Local dev only (DEV_OPEN=1 on localhost) may shorten it with ?max=N so verify can test the auto-stop.
app.get("/", (c) => {
  const host = new URL(c.req.url).hostname, dev = c.env.DEV_OPEN === "1" && (host === "localhost" || host === "127.0.0.1");
  const max = Number(c.req.query("max"));
  // Dev only: ?anon=1 shows "Anonimizar voz" before the voice distortion (#9) exists, so verify can test the switch.
  return c.html(startPage(dev && Number.isInteger(max) && max >= 1 && max < 90 ? max : 90, c.env.TURNSTILE_SITE_KEY, dev && c.req.query("anon") === "1"));
});
app.get("/api/health", (c) => c.json({ ok: true }));
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

const listSubmissions = (db: D1Database, f: { status?: string; tag?: string; q?: string } = {}) => {
  const where = ["status != 'uploading'"], args: string[] = [];
  if (f.status) { where.push("status = ?"); args.push(f.status); }
  if (f.tag) { where.push("EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)"); args.push(f.tag); }
  if (f.q) { where.push("transcript LIKE ?"); args.push(`%${f.q}%`); }
  return db.prepare(`SELECT id, created_at, status, kind, name, anonymous, duration_s, transcript, tags FROM submissions WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 200`).bind(...args).all<any>().then((r) => r.results);
};

app.get("/painel", async (c) => c.html(panelPage(await listSubmissions(c.env.DB))));
app.get("/api/panel/submissions", async (c) => c.json(await listSubmissions(c.env.DB, c.req.query())));

// MCP (JSON-RPC over HTTP)
const TOOLS = [
  { name: "list_submissions", description: "List messages; filter by status (new, favorite, used), tag, or text in the transcript.", inputSchema: { type: "object", properties: { status: { type: "string" }, tag: { type: "string" }, q: { type: "string" } } } },
  { name: "get_submission", description: "One message with transcript, tags and media keys.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
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
    const row = await c.env.DB.prepare("SELECT * FROM submissions WHERE id = ?").bind(a.id).first();
    return row ? text(row) : text({ error: "not found" }, true);
  }
  if (name === "set_status") {
    if (!["new", "favorite", "used"].includes(a.status)) return text({ error: "invalid status" }, true);
    const r = await c.env.DB.prepare("UPDATE submissions SET status = ? WHERE id = ?").bind(a.status, a.id).run();
    return r.meta.changes ? text({ ok: true }) : text({ error: "not found" }, true);
  }
  return text({ error: `unknown tool ${name}` }, true);
});

export default app;
