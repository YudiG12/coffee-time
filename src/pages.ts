// Server-rendered pages. Visual reference: docs/design/ (dark, cozy; Onest; caramel accent).
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const COFFEE = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E0A35A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2v2M14 2v2M6 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/></svg>`;

const layout = (title: string, body: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;600;700;800&family=Oxanium:wght@600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
:root{--bg:#17120E;--surface:#221A14;--line:#3B2F25;--line2:#4A3A2C;--ink:#F4EADF;--ink2:#E8DCCD;--muted:#B8A491;--subtle:#8C7A69;--accent:#E0A35A;--on-accent:#17120E;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Onest,system-ui,sans-serif}
.wrap{max-width:1120px;margin:0 auto;padding:32px 20px}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;padding:16px;border-radius:4px;font-weight:700;font-size:16px;border:0;width:100%;cursor:pointer;font-family:inherit}
.btn.primary{background:var(--accent);color:var(--on-accent)}.btn.secondary{background:var(--surface);color:var(--ink2);border:1px solid var(--line2);font-weight:600}
.eyebrow{font-family:Oxanium,sans-serif;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--subtle)}
.pill{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;background:#2C221A;border:1px solid var(--line2);color:var(--ink2);margin-right:6px}
</style></head><body>${body}</body></html>`;

export const startPage = () => layout("Coffee Time", `<main class="wrap" style="max-width:520px">
<section style="display:flex;gap:14px;align-items:flex-start">
 <img src="/yudi.jpg" alt="Yudi Ganeko" width="96" height="96" style="border-radius:14px;box-shadow:0 0 48px 8px rgba(224,163,90,.35)">
 <div><h1 style="margin:0;font-size:24px;line-height:28px;font-weight:800;letter-spacing:-.03em">Envie uma mensagem para eu escutar nos vlogs! ${COFFEE}</h1>
 <p style="margin:6px 0 0;color:var(--muted);font-size:14px;line-height:20px">Uma história, uma pergunta, qualquer coisa. Abra seu coração <span style="color:#F2C94C">♥</span></p></div>
</section>
<p style="text-align:center;color:var(--subtle);font-size:13px;margin:24px 0 10px">Áudio ou vídeo de até 90 segundos.</p>
<div style="display:flex;flex-direction:column;gap:10px">
 <button class="btn primary" id="record">Gravar áudio</button>
 <button class="btn secondary" id="upload">Envie um arquivo</button>
</div>
</main>`);

type Row = { id: string; name: string | null; anonymous: number; kind: string; status: string; duration_s: number | null; transcript: string | null; tags: string };
const STATUS: Record<string, string> = { uploading: "Enviando", new: "Novo", favorite: "Favorito", used: "Usado", rejected: "Rejeitado" };
export const panelPage = (rows: Row[]) => layout("Coffee Time · Painel", `<main class="wrap">
<div class="eyebrow">Painel</div><h1 style="font-size:36px;font-weight:800;letter-spacing:-.03em;margin:4px 0 20px">Envios</h1>
<ul style="list-style:none;padding:0;margin:0" id="submissions">${rows.map((r) => `<li data-id="${esc(r.id)}" style="display:flex;gap:20px;padding:16px;border-bottom:1px solid var(--line)">
 <div style="width:200px;flex-shrink:0"><b>${esc(r.anonymous ? "Anônimo" : r.name || "Sem nome")}</b><div style="color:var(--subtle);font-size:13px">${esc(r.kind === "video" ? "vídeo" : "áudio")}</div></div>
 <div style="flex:1;color:var(--ink2)">${r.transcript ? `“${esc(r.transcript)}”` : `<i style="color:var(--subtle)">Transcrevendo…</i>`}
  <div style="margin-top:8px">${(JSON.parse(r.tags) as string[]).map((t) => `<span class="pill">${esc(t)}</span>`).join("")}</div></div>
 <div style="width:96px;flex-shrink:0;color:var(--accent);font-size:13px;font-weight:600">${esc(STATUS[r.status] || r.status)}</div></li>`).join("")}</ul>
</main>`);
