// Hourly watchdog: turns every silent stall of the pipeline into a fix or a notice. See AGENTS.md "Pipeline".
// Runs from main. Each notice is posted once (an HTML marker in the comment), so it never spams.
const { GITHUB_REPOSITORY: R, GH_TOKEN, PROD_URL, DRY_RUN } = process.env;
const OWNER = R.split("/")[0];
const CODEX = "chatgpt-codex-connector[bot]";
const H = 3600e3, now = Date.now();
const CLAIM_TTL = 3 * H, CODEX_RETRY = 2 * H, OWNER_AFTER = 12 * H;

const api = async (path, init = {}) => {
  if (DRY_RUN && init.method && init.method !== "GET") { console.log(`[dry-run] ${init.method} ${path} ${init.body || ""}`); return null; }
  const r = await fetch(`https://api.github.com/repos/${R}${path}`, { ...init, headers: { authorization: `Bearer ${GH_TOKEN}`, accept: "application/vnd.github+json", ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${init.method || "GET"} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
};
const all = async (path) => { let out = [], page = 1, got; do { got = await api(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page++}`); out = out.concat(got); } while (got.length === 100); return out; };
const once = async (n, key, body) => {
  const mark = `<!-- watchdog ${key} -->`;
  if ((await all(`/issues/${n}/comments`)).some((c) => c.body?.includes(mark))) return false;
  await api(`/issues/${n}/comments`, { method: "POST", body: JSON.stringify({ body: `${mark}\n${body}` }) });
  return true;
};
const age = (t) => now - new Date(t).getTime();

const prs = await all(`/pulls?state=open`);
const issues = (await all(`/issues?state=open`)).filter((i) => !i.pull_request);

// 1. A claimed issue with no PR after CLAIM_TTL: the routine died mid-run. Free it so the queue moves.
for (const i of issues.filter((i) => i.labels.some((l) => l.name === "in-progress"))) {
  const linked = prs.some((p) => new RegExp(`#${i.number}\\b`).test(p.body || ""));
  const claimed = (await all(`/issues/${i.number}/events`)).filter((e) => e.event === "labeled" && e.label?.name === "in-progress").at(-1);
  if (!linked && claimed && age(claimed.created_at) > CLAIM_TTL) {
    await api(`/issues/${i.number}/labels/in-progress`, { method: "DELETE" }).catch(() => {});
    await api(`/issues/${i.number}/comments`, { method: "POST", body: JSON.stringify({ body: "⏱️ Watchdog: claimed for 3 h with no PR, so the run probably died. Freed it for the next run." }) });
    console.log(`freed #${i.number}`);
  }
}

// 2. The open PR: Codex silent, draft, circuit breaker, or simply waiting too long.
for (const p of prs) {
  const labels = p.labels.map((l) => l.name);
  const head = p.head.sha;
  const pushedAt = (await api(`/commits/${head}`)).commit.committer.date;
  const reviews = (await all(`/pulls/${p.number}/reviews`)).filter((r) => r.user?.login === CODEX && r.commit_id === head);
  const comments = (await all(`/issues/${p.number}/comments`)).filter((c) => c.user?.login === CODEX && c.body?.includes(head.slice(0, 7)));
  const verdict = reviews.length || comments.length;
  if (p.draft) await once(p.number, `draft-${head}`, `📝 @${OWNER}: this PR is a draft — the builder couldn't make verify pass. The queue is paused until you look (see Attention).`);
  else if (labels.includes("circuit-breaker")) await once(p.number, `breaker-${head}`, `🛑 @${OWNER}: circuit breaker is on; the queue is paused until you look.`);
  else if (!verdict && age(pushedAt) > CODEX_RETRY && !labels.includes("needs-owner"))
    await once(p.number, `codex-${head}`, `@codex Verify this PR per AGENTS.md "Verify a change": run npm run verify and reply VERDICT: PASS or VERDICT: FAIL with the check counts and a screenshot.`);
  if (age(pushedAt) > OWNER_AFTER) await once(p.number, `stale-${head}`, `⏳ @${OWNER}: this PR has been open for 12 h at the same commit (no Codex verdict, a hold or a red CI nobody fixed). The queue is waiting on it.`);
}

// 3. Production between deploys: the same deep health the deploy checks.
if (PROD_URL) {
  let ok = false, body = "";
  for (let t = 0; t < 3 && !ok; t++) {
    try { const r = await fetch(`${PROD_URL}/api/health?deep=1`); body = await r.text(); ok = r.ok; } catch (e) { body = String(e); }
    if (!ok) await new Promise((r) => setTimeout(r, 10e3));
  }
  if (!ok) {
    const open = issues.find((i) => i.labels.some((l) => l.name === "deploy-failed"));
    const text = `Production health failed outside a deploy: \`${body.slice(0, 300)}\``;
    if (open) await once(open.number, `health-${new Date().toISOString().slice(0, 13)}`, text);
    else await api(`/issues`, { method: "POST", body: JSON.stringify({ title: "Production health is failing", labels: ["agent", "deploy-failed"],
      body: `## What\n${text}\n\nFind the cause (binding, secret, quota, a code path) and fix it from the repo. If it needs credentials or the Cloudflare dashboard, label \`needs-owner\` and mention @${OWNER}.\n## Done when…\n- [ ] \`/api/health?deep=1\` is 200 in production\n- [ ] the cause is covered by a check so it can't come back\n## Out of scope\nUnrelated features.` }) });
  }
  console.log(`health: ${ok ? "ok" : "FAILED"}`);
}
