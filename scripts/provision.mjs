#!/usr/bin/env node
// Creates the Cloudflare resources wrangler.jsonc names but that don't exist yet (queues, R2 buckets).
// deploy.yml runs it before `wrangler deploy`, so a PR that adds a binding can't break production by pointing at a
// resource nobody created. `--check` (CI, no network) fails on any binding type this script can't create, so
// the gap shows up before the merge instead of in a failed deploy.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const cfg = JSON.parse(readFileSync("wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"));

// Binding types and how production gets them. Anything not listed fails --check.
const HANDLED = {
  queues: "created here", r2_buckets: "created here",
  d1_databases: "one database, id injected by deploy.yml (D1_DATABASE_ID)",
  ai: "no resource needed", assets: "uploaded by wrangler deploy", vars: "in wrangler.jsonc", triggers: "applied by wrangler deploy",
  durable_objects: "created by wrangler deploy; needs a `migrations` entry (checked below)",
};
const BINDING_KEYS = ["kv_namespaces", "d1_databases", "r2_buckets", "queues", "durable_objects", "vectorize", "hyperdrive", "services", "ai", "analytics_engine_datasets", "browser", "workflows", "send_email", "mtls_certificates", "dispatch_namespaces", "assets"];

if (process.argv.includes("--check")) {
  const problems = BINDING_KEYS.filter((k) => cfg[k] && !HANDLED[k]).map((k) => `${k}: provision.mjs doesn't create it — add it here (and to the deploy token's permissions) before using it`);
  if ((cfg.d1_databases || []).length > 1) problems.push("d1_databases: more than one database; deploy.yml injects only one id");
  const classes = (cfg.durable_objects?.bindings || []).map((b) => b.class_name);
  const migrated = new Set((cfg.migrations || []).flatMap((m) => [...(m.new_classes || []), ...(m.new_sqlite_classes || [])]));
  for (const c of classes) if (!migrated.has(c)) problems.push(`durable_objects: class ${c} has no "migrations" entry (new_sqlite_classes)`);
  for (const p of problems) console.error(`::error::${p}`);
  if (!problems.length) console.log(`bindings ok: ${BINDING_KEYS.filter((k) => cfg[k]).join(", ") || "none"}`);
  process.exit(problems.length ? 1 : 0);
}

// Keeps wrangler's own error text: deploy.yml reads it to tell a credential failure (owner) from a code one (builder).
let lastError = "";
const sh = (args) => {
  try { execFileSync("npx", ["wrangler", ...args], { stdio: "pipe" }); return true; }
  catch (e) {
    lastError = `${e.stdout || ""}\n${e.stderr || ""}`.split("\n").filter((l) => /\[code: \d+\]|error|denied|unauthori[sz]ed|forbidden|permission/i.test(l)).slice(0, 6).join("\n");
    // A stable marker deploy.yml looks for: the owner must fix the token, the builder can't
    if (/\[code: (6111|9106|9109|10000|10001)\]|authentication error|unauthori[sz]ed|forbidden|\b40[13]\b/i.test(lastError)) lastError += "\nCREDENTIAL FAILURE: the Cloudflare token is invalid or lacks a permission";
    return false;
  }
};
const queues = new Set([
  ...(cfg.queues?.producers ?? []).map((q) => q.queue),
  ...(cfg.queues?.consumers ?? []).flatMap((q) => [q.queue, q.dead_letter_queue]),
].filter(Boolean));
for (const q of queues) {
  if (sh(["queues", "info", q])) console.log(`queue ${q}: ok`);
  else if (sh(["queues", "create", q])) console.log(`queue ${q}: created`);
  else { console.error(`queue ${q}: missing and could not be created (token needs Queues Write)\n${lastError}`); process.exitCode = 1; }
}
for (const b of (cfg.r2_buckets ?? []).map((b) => b.bucket_name)) {
  if (sh(["r2", "bucket", "info", b])) console.log(`bucket ${b}: ok`);
  else if (sh(["r2", "bucket", "create", b])) console.log(`bucket ${b}: created`);
  else { console.error(`bucket ${b}: missing and could not be created (token needs R2 Write)\n${lastError}`); process.exitCode = 1; }
}
