// Hourly sweep (ADR 0002, Cron Trigger in wrangler.jsonc). In this order:
// 1. Finishes sends the browser never confirmed: drafts with a saved `send_request` (Enviar was pressed) go through
//    the same `finishSend` as Send, so complete and valid files become a `new` message with its transcript job, junk
//    becomes `rejected`, and missing files or a storage/queue error leave it for the next hour. Sends never tried
//    go first, then the ones tried longest ago (`sweep_at`), so stuck sends can't starve the ones behind them.
// 2. Deletes drafts nobody sent after 24 h, and failed sends (rejected, or never finished) after 7 days: R2 objects
//    under incoming/<id>/ and media/<id>/ first, then the row, so a storage error only delays it to the next run.
import type { Env } from "../index";
import { CLAIMED, DELETING, finishSend, type Draft, type SendRequest } from "../api/send";

export const SEND_GRACE = "-10 minutes"; // leave a Send the browser is still running alone
export const BATCH = 25;                 // sends finished per run, to stay well inside a Worker invocation's limits
export const DELETE_BATCH = 100;         // rows deleted per run

export type SweepResult = { finished: Record<string, string[]>; deleted: string[] };

// Expired: a draft nobody sent after 24 h, or a failed send (rejected, or never finished) after 7 days.
const EXPIRED = `((status = 'uploading' AND send_request IS NULL AND created_at < datetime('now', '-24 hours'))
  OR (status IN ('uploading','rejected') AND COALESCE(send_at, created_at) < datetime('now', '-7 days')))`;

// Claim first, then files, then the row. The claim re-checks the expiry in the same statement, so a Send that got
// there first (it saves `send_request` or commits `new`) wins and the row is skipped; once claimed, Send refuses the
// draft (see CLAIMED in src/api/send.ts) and removes any copy it made, so no message can lose its files here.
const deleteMessage = async (env: Env, id: string) => {
  const claim = await env.DB.prepare(`UPDATE submissions SET sweep_at = '${DELETING}' WHERE id = ? AND ${EXPIRED}`).bind(id).run();
  if (!claim.meta.changes) return false;
  const keys: string[] = [];
  for (const prefix of [`incoming/${id}/`, `media/${id}/`]) keys.push(...(await env.MEDIA.list({ prefix })).objects.map((o) => o.key));
  if (keys.length) await env.MEDIA.delete(keys);
  await env.DB.prepare(`DELETE FROM submissions WHERE id = ? AND sweep_at = '${DELETING}'`).bind(id).run();
  return true;
};

export const sweep = async (env: Env): Promise<SweepResult> => {
  const batch = Number(env.SWEEP_BATCH) > 0 ? Math.floor(Number(env.SWEEP_BATCH)) : BATCH;
  const db = env.DB, out: SweepResult = { finished: {}, deleted: [] };
  await db.prepare("DELETE FROM draft_hits WHERE at < ?").bind(Date.now() - 60_000).run();

  const pending = await db.prepare(`SELECT id, kind, media_key, send_request FROM submissions
    WHERE status = 'uploading' AND ${CLAIMED} AND send_request IS NOT NULL AND send_at < datetime('now', ?) AND send_at >= datetime('now', '-7 days')
    ORDER BY sweep_at IS NOT NULL, sweep_at, send_at LIMIT ?`).bind(SEND_GRACE, batch).all<Draft & { send_request: string }>();
  for (const row of pending.results) {
    let outcome: string;
    try {
      const req = JSON.parse(row.send_request) as SendRequest;
      outcome = String((await finishSend(env, row, req)).status);
    } catch (e) { outcome = "error"; console.log(`sweep: finish ${row.id} failed: ${(e as Error)?.message || e}`); }
    // Still `uploading` (409, 503, error): to the back of the line for the next run.
    if (outcome !== "200" && outcome !== "422")
      await db.prepare(`UPDATE submissions SET sweep_at = datetime('now') WHERE id = ? AND status = 'uploading' AND ${CLAIMED}`).bind(row.id).run().catch(() => {});
    (out.finished[outcome] ??= []).push(row.id);
  }

  const old = await db.prepare(`SELECT id FROM submissions WHERE ${EXPIRED} ORDER BY created_at LIMIT ?`).bind(DELETE_BATCH).all<{ id: string }>();
  for (const { id } of old.results) {
    try { if (await deleteMessage(env, id)) out.deleted.push(id); }
    catch (e) { console.log(`sweep: delete ${id} failed: ${(e as Error)?.message || e}`); }
  }
  console.log(`sweep: ${JSON.stringify(out)}`);
  return out;
};

export const scheduled = (_: ScheduledController, env: Env, ctx: ExecutionContext) => { ctx.waitUntil(sweep(env)); };
