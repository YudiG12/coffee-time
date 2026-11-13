// Server-rendered pages. Visual reference: docs/design/ (dark, cozy; Onest; caramel accent).
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const COFFEE = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E0A35A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2v2M14 2v2M6 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/></svg>`;

const layout = (title: string, body: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;600;700;800&family=Oxanium:wght@600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
:root{--bg:#17120E;--surface:#221A14;--line:#3B2F25;--line2:#4A3A2C;--ink:#F4EADF;--ink2:#E8DCCD;--muted:#B8A491;--subtle:#8C7A69;--accent:#E0A35A;--on-accent:#17120E;--rec:#D97B6C;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Onest,system-ui,sans-serif}
.wrap{max-width:1120px;margin:0 auto;padding:32px 20px}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;padding:16px;border-radius:4px;font-weight:700;font-size:16px;border:0;width:100%;cursor:pointer;font-family:inherit}
.btn.primary{background:var(--accent);color:var(--on-accent)}.btn.secondary{background:var(--surface);color:var(--ink2);border:1px solid var(--line2);font-weight:600}
.eyebrow{font-family:Oxanium,sans-serif;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--subtle)}
.pill{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;background:#2C221A;border:1px solid var(--line2);color:var(--ink2);margin-right:6px}
</style></head><body>${body}</body></html>`;

// Inline SVG icons (Lucide-style, stroke = currentColor). Never emojis.
const icon = (d: string, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const MIC = `<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>`;
const VIDEO = `<path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>`;
const UPLOAD = `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>`;
const HEART = `<svg class="heart" width="16" height="16" viewBox="0 0 24 24" fill="#F2C94C" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.6 2.3 4.5 6.2 4.5c2.3 0 3.8 1.3 4.8 2.8 1-1.5 2.5-2.8 4.8-2.8 3.9 0 5.8 4.1 4.2 7.2C19.5 16.4 12 21 12 21Z"/></svg>`;
const STOP = `<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor"/></svg>`;
const PAUSE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>`;
const PLAY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z"/></svg>`;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Start page: docs/design/mobile-1a-start.png and desktop-1a-start.png.
// Mobile stacks hero, card, vlog; desktop puts the hero and vlog on the left and the card on the right.
// Audio recording (MediaRecorder, Opus): *-1b-recording.png, then *-1-audio-ready.png. `max` is the limit in seconds (90; shorter only in local dev).
export const startPage = (max = 90) => layout("Coffee Time", `<style>
.start{min-height:100vh;display:grid;grid-template-areas:"hero" "card" "vlog";gap:24px;padding:24px 20px 40px;max-width:520px;margin:0 auto;align-content:start}
.hero{grid-area:hero;display:flex;gap:14px;align-items:flex-start}
.hero img{width:96px;height:96px;flex-shrink:0;border-radius:14px;object-fit:cover;box-shadow:0 0 56px 14px rgba(224,163,90,.22)}
.hero h1{margin:4px 0 0;font-size:24px;line-height:26px;font-weight:800;letter-spacing:-.03em}
.hero h1 svg{vertical-align:-3px;color:var(--accent)}
.hero p{margin:10px 0 0;color:var(--muted);font-size:14px;line-height:22px}
.heart{vertical-align:-2px}
.card{grid-area:card}
.tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:3px;border:1px solid var(--line2);border-radius:4px;background:var(--surface)}
.tab{display:flex;align-items:center;justify-content:center;gap:8px;padding:9px;border:0;border-radius:3px;background:transparent;color:var(--muted);font:600 16px/20px Onest,system-ui,sans-serif;cursor:pointer}
.tab[aria-selected="true"]{background:var(--ink);color:var(--on-accent)}
.hint{text-align:center;color:var(--subtle);font-size:13px;margin:8px 0 18px}
.actions{display:flex;flex-direction:column;gap:10px}
.btn.primary{padding:18px;font-size:17px}.btn.secondary{padding:13px;font-size:15px}
.vlog{grid-area:vlog;margin-top:12px}
.vlog .row{display:flex;gap:14px;align-items:center;margin-top:12px}
.thumb{position:relative;width:150px;aspect-ratio:16/10;flex-shrink:0;border:1px solid var(--line2);border-radius:4px;background:linear-gradient(135deg,#5A3F28 0%,#3A2A1D 50%,#241B14 100%);display:flex;align-items:center;justify-content:center}
.play{width:36px;height:36px;border-radius:50%;background:var(--accent);color:var(--on-accent);display:flex;align-items:center;justify-content:center}
.vlog p{margin:0;color:var(--muted);font-size:14px;line-height:21px}
.hero > div{min-width:0}
.panel{border:1px solid var(--line2);border-radius:4px;background:var(--surface)}
.rec,.ready,.rec-error{display:none}
.start[data-state="recording"] .rec{display:flex}.start[data-state="ready"] .ready{display:block}
.start:not([data-state="idle"]) .actions,.start:not([data-state="idle"]) .vlog{display:none}
.rec{flex-direction:column;align-items:center;padding:36px 20px 44px;border-color:#5C4330}
.rec-mic{width:72px;height:72px;border-radius:50%;background:rgba(217,123,108,.1);display:flex;align-items:center;justify-content:center;animation:pulse 1.6s ease-in-out infinite}
.rec-mic span{width:52px;height:52px;border-radius:50%;background:rgba(217,123,108,.3);color:var(--rec);display:flex;align-items:center;justify-content:center}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(217,123,108,.25)}50%{box-shadow:0 0 0 12px rgba(217,123,108,0)}}
@media (prefers-reduced-motion:reduce){.rec-mic{animation:none}}
.timer{font:500 56px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.04em;margin-top:22px;font-variant-numeric:tabular-nums}
.rec .max{color:var(--subtle);font-size:13px;margin:8px 0 18px}
.stop{width:72px;height:72px;border-radius:50%;border:3px solid var(--rec);background:transparent;color:var(--rec);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.stop-label{margin-top:12px;color:var(--ink2);font-size:15px}.stop-label .d{display:none}
.ready{padding:18px 20px}
.ready .row{display:flex;align-items:center;gap:14px}
.play-btn{width:56px;height:56px;flex-shrink:0;border-radius:50%;border:0;background:var(--accent);color:var(--on-accent);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.ready .info{flex:1;min-width:0}
.ready .time{font:500 22px/1.1 "JetBrains Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}.ready .time small{font-size:13px;color:var(--subtle);margin-left:6px}
.ready .status{color:var(--muted);font-size:14px;margin-top:4px}
.redo{background:none;border:0;color:var(--accent);font:600 15px Onest,system-ui,sans-serif;cursor:pointer;padding:8px 0}
.bar{height:6px;border-radius:3px;background:#3A2E24;margin-top:16px;overflow:hidden}.bar span{display:block;height:100%;width:0;background:var(--accent);border-radius:3px}
.rec-error{color:var(--rec);font-size:14px;text-align:center;margin:12px 0 0}.rec-error.show{display:block}
@media (min-width:1024px){
 .start{max-width:1292px;grid-template-columns:minmax(0,1fr) minmax(360px,460px);grid-template-areas:"hero card" "vlog card";column-gap:clamp(40px,5.5vw,80px);row-gap:40px;align-content:center;padding:48px 40px}
 .hero{gap:clamp(16px,1.7vw,24px)}.hero img{width:clamp(120px,11.8vw,170px);height:clamp(120px,11.8vw,170px);border-radius:18px;box-shadow:0 0 90px 24px rgba(224,163,90,.2)}
 .hero h1{font-size:clamp(32px,3.06vw,44px);line-height:1.1}.hero h1 svg{width:.86em;height:.86em;vertical-align:-.1em}
 .hero p{font-size:18px;line-height:28px;margin-top:14px;max-width:460px}
 .card{align-self:center;padding:24px;border:1px solid var(--line2);border-radius:4px;background:#1C1611}
 .tab{font-size:15px;padding:8px}.hint{margin:6px 0 14px}
 .btn.primary{padding:15px;font-size:17px}.btn.secondary{padding:12px;font-size:15px}
 .rec{padding:28px 20px 32px}.timer{font-size:48px;margin-top:16px}.stop-label{font-size:14px}.stop-label .m{display:none}.stop-label .d{display:inline}
 .ready{padding:16px 18px}.play-btn{width:48px;height:48px}.ready .time{font-size:20px}.ready .status{font-size:13px}.bar{margin-top:14px}
 .vlog{margin-top:0}.thumb{width:clamp(180px,16.7vw,240px)}.play{width:44px;height:44px}.vlog .row{gap:18px}.vlog p{font-size:16px;line-height:24px;max-width:240px}
}
</style>
<main class="start" data-state="idle">
<section class="hero">
 <img src="/yudi.jpg" alt="Yudi Ganeko" width="170" height="170">
 <div><h1>Envie uma mensagem<br>para eu escutar<br>nos vlogs! ${COFFEE}</h1>
 <p>Uma história, uma pergunta, qualquer coisa. Abra seu <span style="white-space:nowrap">coração ${HEART}</span></p></div>
</section>
<section class="card" aria-label="Enviar mensagem">
 <div class="tabs" role="tablist">
  <button class="tab" role="tab" id="tab-audio" data-kind="audio" aria-selected="true">${icon(MIC, 18)}Áudio</button>
  <button class="tab" role="tab" id="tab-video" data-kind="video" aria-selected="false">${icon(VIDEO, 18)}Vídeo</button>
 </div>
 <p class="hint">Áudio ou vídeo de até 90 segundos.</p>
 <div class="actions">
  <button class="btn primary" id="record" data-kind="audio"><span id="record-icon">${icon(MIC, 22)}</span><span id="record-label">Gravar áudio</span></button>
  <button class="btn secondary" id="upload">${icon(UPLOAD, 18)}Envie um arquivo</button>
 </div>
 <p class="rec-error" id="rec-error" role="alert"></p>
 <div class="panel rec" id="recorder" aria-live="polite">
  <div class="rec-mic"><span>${icon(MIC, 24)}</span></div>
  <div class="timer" id="timer" role="timer">0:00</div>
  <div class="max">máximo de ${max} segundos</div>
  <button class="stop" id="stop" aria-label="Parar gravação">${STOP}</button>
  <div class="stop-label"><span class="m">Toque para parar</span><span class="d">Clique para parar</span></div>
 </div>
 <div class="panel ready" id="ready">
  <div class="row">
   <button class="play-btn" id="play" aria-label="Ouvir gravação">${PLAY.replace('width="14" height="14"', 'width="18" height="18"')}</button>
   <div class="info"><div class="time"><span id="ready-time">0:00</span><small>/ ${fmt(max)}</small></div><div class="status">Gravação pronta</div></div>
   <button class="redo" id="redo">Regravar</button>
  </div>
  <div class="bar"><span id="ready-bar"></span></div>
  <audio id="player" preload="metadata" hidden></audio>
 </div>
</section>
<section class="vlog">
 <div class="eyebrow">Como fica no vlog</div>
 <div class="row">
  <div class="thumb" role="img" aria-label="Prévia do vlog"><span class="play">${PLAY}</span></div>
  <p>Eu ouço a mensagem no café e respondo ali mesmo.</p>
 </div>
</section>
</main>
<script>
(() => {
 const MAX = ${max};
 const icons = { audio: ${JSON.stringify(icon(MIC, 22))}, video: ${JSON.stringify(icon(VIDEO, 22))}, play: ${JSON.stringify(PLAY.replace('width="14" height="14"', 'width="18" height="18"'))}, pause: ${JSON.stringify(PAUSE)} };
 const labels = { audio: "Gravar áudio", video: "Gravar vídeo" };
 const $ = (id) => document.getElementById(id);
 const main = document.querySelector(".start"), tabs = document.querySelectorAll(".tab"), rec = $("record"), err = $("rec-error"), player = $("player");
 const fmt = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
 let recorder = null, stream = null, chunks = [], started = 0, tick = 0, duration = 0, url = "";
 const setState = (s) => { main.dataset.state = s; tabs.forEach((t) => (t.disabled = s === "recording")); };
 const discard = () => { player.pause(); if (url) URL.revokeObjectURL(url); url = ""; $("ready").removeAttribute("data-duration"); setState("idle"); };

 tabs.forEach((t) => t.addEventListener("click", () => {
  const kind = t.dataset.kind;
  if (main.dataset.state === "ready") discard();
  tabs.forEach((x) => x.setAttribute("aria-selected", String(x === t)));
  rec.dataset.kind = kind;
  $("record-icon").innerHTML = icons[kind];
  $("record-label").textContent = labels[kind];
 }));

 const elapsed = () => Math.min((performance.now() - started) / 1000, MAX);
 const start = async () => {
  err.classList.remove("show");
  try {
   stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
   err.textContent = "Não foi possível usar o microfone. Verifique a permissão do navegador.";
   err.classList.add("show"); setState("idle"); return;
  }
  const type = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
  recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 64000 } : undefined);
  chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
   stream.getTracks().forEach((t) => t.stop());
   const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
   url = URL.createObjectURL(blob); player.src = url;
   $("ready-time").textContent = fmt(Math.max(1, Math.round(duration)));
   $("ready-bar").style.width = (duration / MAX) * 100 + "%";
   Object.assign($("ready").dataset, { duration: duration.toFixed(2), bytes: String(blob.size), type: blob.type });
   setState("ready");
  };
  recorder.start(250);
  started = performance.now(); $("timer").textContent = "0:00"; setState("recording");
  tick = setInterval(() => { const s = elapsed(); $("timer").textContent = fmt(s); if (s >= MAX) stop(); }, 100);
 };
 const stop = () => {
  if (!recorder || recorder.state === "inactive") return;
  clearInterval(tick); duration = elapsed(); recorder.stop();
 };

 rec.addEventListener("click", () => { if (rec.dataset.kind === "audio") start(); });
 $("stop").addEventListener("click", stop);
 $("redo").addEventListener("click", () => { discard(); start(); });
 $("play").addEventListener("click", () => (player.paused ? player.play() : player.pause()));
 player.addEventListener("play", () => { $("play").innerHTML = icons.pause; $("play").setAttribute("aria-label", "Pausar"); });
 player.addEventListener("pause", () => { $("play").innerHTML = icons.play; $("play").setAttribute("aria-label", "Ouvir gravação"); });
 player.addEventListener("timeupdate", () => { $("ready-bar").style.width = (Math.min(player.currentTime, duration) / MAX) * 100 + "%"; });
 player.addEventListener("ended", () => { $("ready-bar").style.width = (duration / MAX) * 100 + "%"; });
})();
</script>`);

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
