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

const MASK = `<path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a8 8 0 0 0-5 2 8 8 0 0 0-5-2H2Z"/><path d="M6 11c1.5 0 3 .5 3 2-2 0-3 0-3-2Z"/><path d="M18 11c-1.5 0-3 .5-3 2 2 0 3 0 3-2Z"/>`;
const CAMERA = `<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>`;
const PLUS = `<path d="M5 12h14"/><path d="M12 5v14"/>`;
const X = `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`;
const PARTY = `<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/>`;
export const CONTACT = "contato@yudiganeko.com";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Start page: docs/design/mobile-1a-start.png and desktop-1a-start.png.
// Mobile stacks hero, card, vlog; desktop puts the hero and vlog on the left and the card on the right.
// Audio recording (MediaRecorder, Opus): *-1b-recording.png, then *-1-audio-ready.png. `max` is the limit in seconds (90; shorter only in local dev).
// "Envie um arquivo": one audio or video file up to `max` seconds; a video shows *-1c-video-ready.png (no anonymize option for video).
// Upload (ADR 0002): as soon as there is media, a draft is created (Turnstile token) and the file goes to R2 in the
// background, with the progress row of *-1c-video-ready.png ("Carregando vídeo 62%") and "Arquivo carregado" at the end.
// Ready form (*-1-audio-ready.png): Anonimizar voz (audio only, hides the name), optional name, up to 10 photos, consent,
// Enviar (only with media + consent). Send waits for the uploads, calls /api/drafts/:id/send, then shows *-2-thanks.png.
// Browser-side media work (ADR 0003, src/site/media.ts → /media.js, loaded on the first file): before each upload
// anonymous audio is distorted, a video is re-encoded to 1080p ~5 Mbps with its audio track uploaded alongside, and
// photos become ≤ 2000 px WebP. Turning "Anonimizar voz" on (or off) replaces the file in the same draft.
// Without WebCodecs a video goes up as picked, with a short warning.
export const startPage = (max = 90, siteKey = "") => layout("Coffee Time", `<style>
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
.rec,.ready,.vready,.rec-error{display:none}
.start[data-state="recording"] .rec{display:flex}.start[data-state="ready"]:not([data-media="video"]) .ready{display:block}.start[data-state="ready"][data-media="video"] .vready{display:block}
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
.vready{padding:12px 12px 6px}
.vframe{position:relative;aspect-ratio:16/9;border-radius:4px;overflow:hidden;background:linear-gradient(135deg,#4A3526 0%,#2C2018 55%,#1E1712 100%)}
.vframe video{width:100%;height:100%;object-fit:contain;display:block;cursor:pointer}
.vframe .play-btn{position:absolute;inset:0;margin:auto}.vframe.playing .play-btn{display:none}
.dur{position:absolute;right:8px;bottom:8px;padding:3px 6px;border-radius:4px;background:rgba(23,18,14,.8);color:var(--ink);font:500 13px/1 "JetBrains Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
.vmeta{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--muted);font-size:14px;padding:4px 0 0}
.rec-error{color:var(--rec);font-size:14px;text-align:center;margin:12px 0 0}.rec-error.show{display:block}
.up{display:none;margin-top:14px;font:500 13px/1.4 "JetBrains Mono",ui-monospace,monospace}.start[data-state="ready"] .up[data-state]{display:block}
.up .row{display:flex;justify-content:space-between;align-items:center;gap:12px}.up-label{color:var(--accent)}.up-pct{color:var(--muted);font-variant-numeric:tabular-nums}
.up .bar{margin-top:8px}.up .done,.up .failed{display:none}
.up[data-state="done"] .row,.up[data-state="done"] .bar,.up[data-state="error"] .row,.up[data-state="error"] .bar{display:none}
.up[data-state="done"] .done{display:flex;align-items:center;justify-content:center;gap:8px;color:#9DBF8A}.up .done i{width:7px;height:7px;border-radius:50%;background:#9DBF8A}
.up[data-state="error"] .failed{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--rec);font-family:Onest,system-ui,sans-serif;font-size:14px}
.up .failed .redo{padding:0;white-space:nowrap}
.up .up-note{margin:8px 0 0;color:var(--muted);font:400 13px/18px Onest,system-ui,sans-serif}.up[data-state="done"] .up-note,.up[data-state="error"] .up-note{display:none}
.ts:empty{display:none}.ts{margin-top:12px;display:flex;justify-content:center}
.form{display:none;margin-top:20px}.start[data-state="ready"] .form{display:block}
.anon{display:flex;align-items:center;gap:14px;padding:16px 14px;background:#2A2019;border-color:var(--line2)}.start[data-media="video"] .anon{display:none}
.anon-icon{width:36px;height:36px;flex-shrink:0;border-radius:4px;background:#3A2C21;color:var(--accent);display:flex;align-items:center;justify-content:center}
.anon-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.anon-text b{font-size:15px;font-weight:600;color:var(--ink)}.anon-text span{font-size:13px;line-height:18px;color:var(--muted)}
.switch{width:44px;height:26px;flex-shrink:0;border-radius:4px;border:0;padding:3px;background:#3B2F25;cursor:pointer;display:flex}.switch i{width:20px;height:20px;border-radius:3px;background:var(--muted);transition:transform .15s}
.switch[aria-checked="true"]{background:var(--accent)}.switch[aria-checked="true"] i{background:var(--on-accent);transform:translateX(18px)}
.field{margin-top:16px}.field label{display:block;font-size:14px;color:var(--subtle);margin-bottom:6px}.field label b{color:var(--ink);font-weight:600}
.start[data-media="audio"] .form[data-anon="true"] .field{display:none}
.field input{width:100%;padding:13px 14px;border-radius:4px;border:1px solid var(--line2);background:#1C1611;color:var(--ink);font:400 16px Onest,system-ui,sans-serif}
.field input:focus,.switch:focus-visible,.add:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.photos{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:12px}.photos ul{display:contents;list-style:none}
.photo{position:relative;width:52px;height:52px}.photo img{width:100%;height:100%;object-fit:cover;border-radius:4px;display:block}
.photo button{position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;border:1px solid var(--line2);background:var(--bg);color:var(--ink2);display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}
.add{width:52px;height:52px;border-radius:4px;border:1px dashed #5C4A3A;background:transparent;color:var(--ink2);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}.add[hidden]{display:none}
.count{margin-left:4px;color:var(--subtle);font:500 13px "JetBrains Mono",ui-monospace,monospace}
.nudge{display:flex;gap:8px;align-items:flex-start;margin:12px 0 0;color:var(--accent);font-size:14px;line-height:20px}.nudge svg{flex-shrink:0;margin-top:1px}
.consent{display:flex;gap:12px;align-items:flex-start;margin:20px 0 14px;font-size:14px;line-height:20px;color:var(--ink2);cursor:pointer}
.consent input{appearance:none;-webkit-appearance:none;width:20px;height:20px;flex-shrink:0;margin:0;border-radius:4px;border:1px solid var(--line2);background:#1C1611;cursor:pointer;display:grid;place-content:center}
.consent input:checked{background:var(--accent) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2317120E' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E") center no-repeat;border-color:var(--accent)}
.consent input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.consent a{color:var(--accent)}
#send:disabled{opacity:.45;cursor:not-allowed}
.form-error{display:none;color:var(--rec);font-size:14px;text-align:center;margin:10px 0 0}.form-error.show{display:block}
.thanks{display:none}
.start[data-state="sent"] .tabs,.start[data-state="sent"] .hint{display:none}
.start[data-state="sent"] .hero{display:none}
.start[data-state="sent"] .thanks{display:flex;flex-direction:column;min-height:calc(100vh - 64px)}
.thanks .head{display:flex;gap:14px;align-items:flex-start}
.thanks .head img{width:96px;height:96px;flex-shrink:0;border-radius:14px;object-fit:cover;box-shadow:0 0 56px 14px rgba(224,163,90,.22)}
.thanks h2{margin:4px 0 0;font-size:24px;line-height:28px;font-weight:800;letter-spacing:-.03em;display:flex;align-items:center;gap:10px}.thanks h2 svg{color:var(--accent)}
.thanks p{margin:8px 0 0;color:var(--muted);font-size:15px;line-height:22px}
.remove{margin-top:24px;padding:16px 16px;border:1px solid var(--line2);border-radius:4px;background:#2A2019}
.remove .eyebrow{color:var(--accent)}.remove p{margin:8px 0 0;color:var(--ink2)}.remove code{font:500 .95em "JetBrains Mono",ui-monospace,monospace}
.thanks .again{margin-top:auto;background:transparent;border:1px solid var(--line2);color:var(--ink);font-weight:600}
@media (min-width:1024px){
 .start[data-state="sent"] .hero{display:flex}
 .start[data-state="sent"] .thanks{min-height:0}.thanks .head img{display:none}.thanks h2{font-size:30px;line-height:36px;margin:0}
 .thanks p{font-size:15px;margin-top:16px}.remove{margin-top:20px;padding:14px 16px}.remove p{font-size:14px}.thanks .again{margin-top:20px;padding:12px;font-size:15px}
 .anon{padding:12px 14px}.field{margin-top:12px}.field input{padding:10px 12px;font-size:15px}.nudge{font-size:13px;line-height:18px}.consent{font-size:13px;line-height:18px;margin:16px 0 12px}
}
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
 <input type="file" id="file" accept="audio/*,video/*" hidden>
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
   <div class="info"><div class="time"><span id="ready-time">0:00</span><small>/ ${fmt(max)}</small></div><div class="status" id="ready-status">Gravação pronta</div></div>
   <button class="redo" id="redo">Regravar</button>
  </div>
  <div class="bar"><span id="ready-bar"></span></div>
  <audio id="player" preload="metadata" hidden></audio>
 </div>
 <div class="panel vready" id="vready">
  <div class="vframe" id="vframe">
   <video id="vplayer" preload="metadata" playsinline></video>
   <button class="play-btn" id="vplay" aria-label="Ver vídeo">${PLAY.replace('width="14" height="14"', 'width="18" height="18"')}</button>
   <span class="dur" id="vdur">0:00</span>
  </div>
  <div class="vmeta"><span id="vstatus">Vídeo pronto</span><button class="redo" id="vswap">Trocar vídeo</button></div>
 </div>
 <div class="form" id="form" data-anon="false">
  <div class="panel anon">
   <span class="anon-icon">${icon(MASK, 20)}</span>
   <div class="anon-text"><b id="anon-label">Anonimizar voz</b><span>O áudio fica distorcido e sua voz não é reconhecida.</span></div>
   <button class="switch" id="anon" role="switch" aria-checked="false" aria-labelledby="anon-label"><i></i></button>
  </div>
  <div class="field" id="name-field"><label for="name"><b>Nome</b> · opcional</label><input id="name" maxlength="60" autocomplete="name"></div>
  <div class="photos"><ul id="photo-list"></ul><button class="add" id="photo-add" aria-label="Adicionar fotos">${icon(PLUS, 18)}</button><span class="count" id="photo-count">0 / 10 fotos</span></div>
  <input type="file" id="photo-file" accept="image/*" multiple hidden>
  <p class="nudge">${icon(CAMERA, 18)}<span>Manda uma foto sua! Se sua mensagem entrar no vlog, eu mostro você no vídeo.</span></p>
  <label class="consent"><input type="checkbox" id="consent"><span>Autorizo o uso deste envio nos vídeos do canal, conforme a <a href="/privacidade" target="_blank" rel="noopener">política de privacidade</a>.</span></label>
  <button class="btn primary" id="send" disabled>Enviar</button>
  <p class="form-error" id="send-error" role="alert"></p>
 </div>
 <div class="ts" id="ts"></div>
 <div class="up" id="up" aria-live="polite">
  <div class="row"><span class="up-label" id="up-label">Carregando áudio</span><span class="up-pct" id="up-pct">0%</span></div>
  <div class="bar" role="progressbar" aria-label="Carregamento do arquivo" aria-valuemin="0" aria-valuemax="100"><span id="up-bar"></span></div>
  <div class="done"><i></i>Arquivo carregado</div>
  <div class="failed"><span id="up-error">Não foi possível carregar o arquivo.</span><button class="redo" id="up-retry">Tentar de novo</button></div>
  <p class="up-note" id="up-note" hidden>Seu navegador não comprime vídeos. O envio pode demorar mais.</p>
 </div>
 <div class="thanks" id="thanks" aria-live="polite">
  <div class="head"><img src="/yudi.jpg" alt="" width="96" height="96"><div><h2 tabindex="-1" id="thanks-title">Valeu demais! ${icon(PARTY, 26)}</h2><p id="thanks-text">Obrigado por mandar sua mensagem. Vou ouvir com calma, com um café do lado. Se ela entrar num vídeo, você vai ver no canal.</p></div></div>
  <div class="remove"><div class="eyebrow">Quer remover seu envio?</div><p>Escreva para <code>${CONTACT}</code>.</p></div>
  <button class="btn again" id="again">Enviar outro</button>
 </div>
</section>${siteKey ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>` : ""}
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
 const MAX = ${max}, SITE_KEY = ${JSON.stringify(siteKey).replace(/</g, "\\u003c")};
 const icons = { audio: ${JSON.stringify(icon(MIC, 22))}, video: ${JSON.stringify(icon(VIDEO, 22))}, play: ${JSON.stringify(PLAY.replace('width="14" height="14"', 'width="18" height="18"'))}, pause: ${JSON.stringify(PAUSE)}, x: ${JSON.stringify(icon(X, 12))} };
 const labels = { audio: "Gravar áudio", video: "Gravar vídeo" };
 const $ = (id) => document.getElementById(id);
 const main = document.querySelector(".start"), tabs = document.querySelectorAll(".tab"), rec = $("record"), err = $("rec-error"), player = $("player");
 const fmt = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
 const file = $("file"), vplayer = $("vplayer");
 let recorder = null, stream = null, chunks = [], started = 0, tick = 0, duration = 0, url = "", busy = false, source = "record";
 // One recording or file at a time: lock the start controls while the microphone prompt is open or a file is read.
 const lock = (on) => { busy = on; ["record", "redo", "upload", "vswap", "anon", "photo-add", "name", "consent"].forEach((id) => $(id) && ($(id).disabled = on)); tabs.forEach((t) => (t.disabled = on)); document.querySelectorAll(".photo button").forEach((b) => (b.disabled = on)); canSend(); };
 const setState = (s) => { main.dataset.state = s; tabs.forEach((t) => (t.disabled = s === "recording")); canSend(); };
 // Enviar only with media and consent (and not while a send is running).
 const canSend = () => { $("send").disabled = busy || main.dataset.state !== "ready" || !main.dataset.media || !$("consent").checked; };
 const discard = () => {
  player.pause(); vplayer.pause(); player.removeAttribute("src"); vplayer.removeAttribute("src");
  if (url) URL.revokeObjectURL(url); url = "";
  $("ready").removeAttribute("data-duration"); $("vready").removeAttribute("data-duration"); delete main.dataset.media; setState("idle");
  $("send-error").classList.remove("show");
  cancelUpload();
 };
 const fail = (msg) => { err.textContent = msg; err.classList.add("show"); };
 const select = (kind) => {
  tabs.forEach((x) => x.setAttribute("aria-selected", String(x.dataset.kind === kind)));
  rec.dataset.kind = kind;
  $("record-icon").innerHTML = icons[kind];
  $("record-label").textContent = labels[kind];
 };

 tabs.forEach((t) => t.addEventListener("click", () => {
  if (t.dataset.kind === rec.dataset.kind) return; // already selected: keep the recording or file
  if (main.dataset.state === "ready") discard();
  select(t.dataset.kind);
 }));

 const elapsed = () => Math.min((performance.now() - started) / 1000, MAX);
 const start = async () => {
  if (busy || (recorder && recorder.state !== "inactive")) return;
  lock(true); err.classList.remove("show"); source = "record";
  $("ready-status").textContent = "Gravação pronta"; $("redo").textContent = "Regravar";
  try {
   stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
   fail("Não foi possível usar o microfone. Verifique a permissão do navegador.");
   setState("idle"); lock(false); return;
  }
  const type = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
  recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 64000 } : undefined);
  chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  // Runs on Stop, on the time limit, and when the microphone goes away (device unplugged).
  recorder.onstop = () => {
   clearInterval(tick); duration = elapsed();
   stream.getTracks().forEach((t) => t.stop());
   const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
   url = URL.createObjectURL(blob); player.src = url;
   $("ready-time").textContent = fmt(Math.max(1, Math.round(duration)));
   $("ready-bar").style.width = (duration / MAX) * 100 + "%";
   Object.assign($("ready").dataset, { duration: duration.toFixed(2), bytes: String(blob.size), type: blob.type, source: "record" });
   main.dataset.media = "audio"; setState("ready");
   upload(blob, "audio", duration);
  };
  recorder.start(250); lock(false);
  started = performance.now(); $("timer").textContent = "0:00"; setState("recording");
  tick = setInterval(() => { const s = elapsed(); $("timer").textContent = fmt(s); if (s >= MAX) stop(); }, 100);
 };
 const stop = () => {
  if (!recorder || recorder.state === "inactive") return;
  recorder.stop();
 };

 // Reads duration (and height for video) from the file itself. Some WebM files (e.g. from MediaRecorder)
 // have no duration in the header: seeking to the end makes the browser compute it.
 const probe = (src, kind) => new Promise((ok, no) => {
  const m = document.createElement(kind); m.preload = "metadata"; m.muted = true;
  const done = () => ok({ duration: m.duration, height: m.videoHeight || 0 });
  const timer = setTimeout(no, 15000);
  m.onerror = () => { clearTimeout(timer); no(); };
  m.onloadedmetadata = () => {
   if (Number.isFinite(m.duration)) { clearTimeout(timer); return done(); }
   m.ondurationchange = () => { if (Number.isFinite(m.duration)) { clearTimeout(timer); m.ondurationchange = null; done(); } };
   m.currentTime = 1e9;
  };
  m.src = src;
 });
 const pick = async () => {
  const f = file.files[0]; file.value = "";
  if (!f || busy) return;
  err.classList.remove("show");
  const kind = f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "audio" : "";
  if (!kind) return fail("Escolha um arquivo de áudio ou vídeo.");
  const src = URL.createObjectURL(f);
  lock(true);
  const meta = await probe(src, kind).catch(() => null);
  lock(false);
  if (!meta || !(meta.duration > 0)) { URL.revokeObjectURL(src); return fail("Não foi possível abrir este arquivo. Tente outro."); }
  if (meta.duration > MAX + 0.5) { URL.revokeObjectURL(src); return fail("O arquivo tem mais de " + MAX + " segundos. Escolha um mais curto."); }
  discard(); select(kind); url = src; source = "file"; duration = Math.min(meta.duration, MAX);
  const data = { duration: meta.duration.toFixed(2), bytes: String(f.size), type: f.type, source: "file" };
  if (kind === "audio") {
   player.src = src;
   $("ready-time").textContent = fmt(Math.max(1, Math.round(duration)));
   $("ready-bar").style.width = (duration / MAX) * 100 + "%";
   $("ready-status").textContent = "Áudio pronto"; $("redo").textContent = "Trocar áudio";
   Object.assign($("ready").dataset, data);
  } else {
   vplayer.src = src;
   $("vdur").textContent = fmt(Math.max(1, Math.round(duration)));
   $("vstatus").textContent = "Vídeo pronto" + (meta.height ? " · " + meta.height + "p" : "");
   Object.assign($("vready").dataset, data, { height: String(meta.height) });
  }
  main.dataset.media = kind; setState("ready");
  upload(f, kind, duration);
 };

 // ---- Media work in the browser (ADR 0003): /media.js is loaded once, on the first file or photo.
 let mediaP = null;
 const media = () => (mediaP ??= import("/media.js").catch((e) => { mediaP = null; throw e; }));
 const anonOn = () => $("form").dataset.anon === "true";

 // ---- Background upload: draft (Turnstile) → signed URL(s) → R2 incoming/<id>/ ----
 const up = $("up");
 let job = 0, xhr = null, last = null, draft = null, track = false, uploadP = Promise.resolve(false);
 // keep: the file is replaced inside the same draft (Anonimizar voz, Tentar de novo), so the draft stays.
 const cancelUpload = (keep = false) => {
  job++; if (xhr) xhr.abort(); xhr = null; track = false; delete up.dataset.state; delete up.dataset.anon; $("up-note").hidden = true;
  if (!keep) { draft = null; delete up.dataset.draft; }
 };
 const progress = (p) => { const v = Math.max(0, Math.min(100, Math.floor(p * 100))); $("up-pct").textContent = v + "%"; $("up-bar").style.width = v + "%"; up.querySelector("[role=progressbar]").setAttribute("aria-valuenow", String(v)); };
 // One fresh Turnstile token per draft (tokens are single use). Interaction-only: the widget shows only if a check is needed.
 let widget = null;
 const turnstileToken = () => new Promise((ok, no) => {
  if (!SITE_KEY) return ok("");
  let waited = 0;
  const go = () => {
   if (!window.turnstile) return (waited += 200) > 15000 ? no(new Error("turnstile")) : setTimeout(go, 200);
   if (widget !== null) { try { window.turnstile.remove(widget); } catch {} }
   widget = window.turnstile.render("#ts", { sitekey: SITE_KEY, appearance: "interaction-only", callback: ok, "error-callback": () => no(new Error("turnstile")) });
  };
  go();
 });
 const send = (method, url, body, my, onp, type) => new Promise((ok, no) => {
  const x = (xhr = new XMLHttpRequest());
  x.open(method, url);
  if (type) x.setRequestHeader("content-type", type);
  x.upload.onprogress = (e) => my === job && onp && onp(e.loaded);
  x.onload = () => (x.status >= 200 && x.status < 300 ? ok(x.getResponseHeader("etag")) : no(new Error("status " + x.status)));
  x.onerror = () => no(new Error("network")); x.onabort = () => no(new Error("abort"));
  x.send(body);
 });
 // Unstable 4G: each request (a whole small file or one 10 MB part) is retried up to 3 times.
 // A canceled job (file swapped, tab switched) never starts another request, not even a pending retry or the next part.
 const retry = async (my, fn) => {
  for (let i = 0; ; i++) {
   if (my !== job) throw new Error("abort");
   try { return await fn(); } catch (e) { if (my !== job || i >= 2) throw e; await new Promise((r) => setTimeout(r, 1000 * (i + 1))); }
  }
 };
 // PUTs one blob to the URL(s) the Worker gave: a single URL or 10 MB multipart parts, each retried.
 const put = async (u, blob, my, onp) => {
  if (u.mode === "multipart") {
   const tags = [];
   for (let i = 0; i < u.parts.length && my === job; i++) {
    const part = blob.slice(i * u.part_size, (i + 1) * u.part_size);
    tags.push(await retry(my, () => send("PUT", u.parts[i], part, my, (n) => onp && onp((i * u.part_size + n) / blob.size))));
   }
   const xml = "<CompleteMultipartUpload>" + tags.map((t, i) => "<Part><PartNumber>" + (i + 1) + "</PartNumber><ETag>" + t + "</ETag></Part>").join("") + "</CompleteMultipartUpload>";
   if (my !== job) throw new Error("abort");
   await retry(my, () => send("POST", u.complete, xml, my, null, "application/xml"));
  } else await retry(my, () => send("PUT", u.url, blob, my, (n) => onp && onp(n / blob.size), blob.type));
 };
 const fileUrl = async (file, blob) => {
  const r = await fetch("/api/drafts/" + draft + "/files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file, type: blob.type, size: blob.size }) });
  if (!r.ok) throw new Error("draft");
  return (await r.json()).upload;
 };
 // What goes up: the distorted voice (anonymous audio), the 1080p video and its audio track, or the file as it is.
 // The original anonymous voice is never uploaded: without the distortion there is no upload at all.
 const prepare = async (src, kind, anon, my) => {
  const label = (t) => { $("up-label").textContent = t; progress(0); };
  if (kind === "audio" && anon) { label("Preparando áudio"); return { blob: await (await media()).distortVoice(src) }; }
  if (kind !== "video") return { blob: src };
  const m = await media().catch(() => null);
  if (!m || !m.hasWebCodecs()) { $("up-note").hidden = false; return { blob: src }; }
  label("Preparando vídeo");
  const v = await m.compressVideo(src, (p) => my === job && progress(p)).catch(() => null);
  if (!v) return { blob: src };
  if (my === job && v.video !== src) { $("vstatus").textContent = "Vídeo pronto · " + v.height + "p"; $("vready").dataset.height = String(v.height); }
  return { blob: v.video, track: v.track };
 };
 // Resolves true once the media is in R2; false when it failed or was replaced.
 const upload = (blob, kind, dur, keep = false) => (uploadP = runUpload(blob, kind, dur, keep && !!draft));
 const runUpload = async (src, kind, dur, keep) => {
  cancelUpload(keep); const my = job; last = { blob: src, kind, dur };
  const anon = kind === "audio" && anonOn();
  up.dataset.state = "uploading";
  try {
   const prep = await prepare(src, kind, anon, my); if (my !== job) return false;
   const blob = prep.blob.type ? prep.blob : new Blob([prep.blob], { type: kind + "/webm" });
   $("up-label").textContent = kind === "video" ? "Carregando vídeo" : "Carregando áudio"; progress(0);
   let u;
   if (keep) u = await fileUrl("media", blob);
   else {
    const token = await turnstileToken(); if (my !== job) return false;
    const r = await fetch("/api/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, type: blob.type, size: blob.size, duration: dur, token }) });
    if (my !== job) return false;
    if (!r.ok) throw new Error(r.status === 429 ? "rate" : "draft");
    const d = await r.json(); u = d.upload; up.dataset.draft = d.id; draft = d.id; syncPhotos();
   }
   if (my !== job) return false;
   await put(u, blob, my, progress);
   if (prep.track && my === job) { await put(await fileUrl("audio", prep.track), prep.track, my, null); track = true; }
   if (my !== job) return false;
   progress(1); up.dataset.anon = String(anon); up.dataset.state = "done"; return true;
  } catch (e) {
   if (my !== job) return false;
   $("up-error").textContent = e.message === "rate" ? "Muitas tentativas. Espere um minuto e tente de novo." : "Não foi possível carregar o arquivo.";
   up.dataset.state = "error"; return false;
  }
 };

 // ---- Photos (up to 10): each goes to its slot incoming/<draft>/photo-<n> as soon as the draft exists.
 // A new draft (file swapped) uploads them again. Uploads to one slot run one after another, so a removed photo
 // still uploading can never overwrite the photo that takes its slot.
 const photos = [], slotLock = {};
 const photoCount = () => { $("photo-count").textContent = photos.length + " / 10 fotos"; $("photo-add").hidden = photos.length >= 10; };
 const uploadPhoto = (ph) => {
  const d = draft; ph.draft = d;
  const prev = slotLock[ph.slot] || Promise.resolve();
  ph.p = prev.then(async () => {
   if (ph.draft !== d || !photos.includes(ph)) return false;
   const blob = await ph.ready, type = blob.type || "image/jpeg";
   const r = await fetch("/api/drafts/" + d + "/photos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ n: ph.slot, type, size: blob.size }) });
   if (!r.ok) return false;
   const u = (await r.json()).upload;
   const put = await fetch(u.url, { method: "PUT", headers: { "content-type": type }, body: blob });
   return put.ok && ph.draft === d;
  }).catch(() => false);
  slotLock[ph.slot] = ph.p;
  return ph.p;
 };
 const syncPhotos = () => { if (draft) photos.forEach((ph) => ph.draft !== draft && uploadPhoto(ph)); };
 const addPhotos = () => {
  const picked = [...$("photo-file").files].filter((f) => f.type.startsWith("image/") || !f.type); $("photo-file").value = "";
  for (const f of picked) {
   if (photos.length >= 10) break;
   const used = new Set(photos.map((x) => x.slot)), slot = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((n) => !used.has(n));
   // Resized to ≤ 2000 px WebP in the browser; the original only if the browser can't decode it.
   const ready = media().then((m) => m.toWebp(f)).then((b) => b || f).catch(() => f);
   const ph = { file: f, ready, slot, url: URL.createObjectURL(f), draft: null, p: Promise.resolve(false) };
   const li = document.createElement("li"); li.className = "photo"; li.dataset.slot = String(slot);
   const img = document.createElement("img"); img.src = ph.url; img.alt = "Foto " + (photos.length + 1);
   const rm = document.createElement("button"); rm.type = "button"; rm.setAttribute("aria-label", "Remover foto"); rm.innerHTML = icons.x;
   rm.addEventListener("click", () => { photos.splice(photos.indexOf(ph), 1); ph.draft = null; URL.revokeObjectURL(ph.url); li.remove(); photoCount(); });
   li.append(img, rm); $("photo-list").append(li); ph.el = li;
   photos.push(ph);
   if (draft) uploadPhoto(ph);
  }
  photoCount();
 };
 $("photo-add").addEventListener("click", () => $("photo-file").click());
 $("photo-file").addEventListener("change", addPhotos);

 // ---- Anonimizar voz (audio only): hides the name field (never sent while on) and replaces the uploaded audio with
 // the distorted one in the same draft; off again puts the original back.
 $("anon").addEventListener("click", () => {
  const on = $("anon").getAttribute("aria-checked") !== "true"; $("anon").setAttribute("aria-checked", String(on)); $("form").dataset.anon = String(on);
  if (main.dataset.media === "audio" && last && last.kind === "audio") upload(last.blob, "audio", last.dur, true);
 });
 $("consent").addEventListener("change", canSend);

 // ---- Send: wait for the media and the photos, then ask the Worker to check and keep them.
 const sendError = (msg) => { $("send-error").textContent = msg; $("send-error").classList.add("show"); };
 const doSend = async () => {
  if ($("send").disabled) return;
  $("send-error").classList.remove("show"); lock(true); $("send").textContent = "Enviando…";
  const done = () => { $("send").textContent = "Enviar"; lock(false); };
  try {
   if (up.dataset.state === "error" && last) upload(last.blob, last.kind, last.dur, true);
   if (!(await uploadPhotosAndMedia())) return;
   const anonymous = main.dataset.media === "audio" && anonOn();
   // Never send as anonymous a voice that went up undistorted.
   if (anonymous && up.dataset.anon !== "true") return sendError("Não foi possível carregar o arquivo. Tente de novo.");
   const r = await fetch("/api/drafts/" + draft + "/send", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ consent: true, anonymous, track, name: anonymous ? "" : $("name").value, photos: photos.map((x) => x.slot) }) });
   if (r.status === 422) { discard(); fail("Este arquivo não é um áudio ou vídeo válido. Escolha outro."); return; }
   if (!r.ok) return sendError("Não foi possível enviar. Tente de novo.");
   thanks((await r.json()).name);
  } catch { sendError("Não foi possível enviar. Tente de novo."); }
  finally { done(); }
 };
 const uploadPhotosAndMedia = async () => {
  if (!(await uploadP) || !draft) { sendError("Não foi possível carregar o arquivo. Tente de novo."); return false; }
  syncPhotos();
  let ok = await Promise.all(photos.map((x) => x.p));
  if (ok.includes(false)) ok = await Promise.all(photos.map((x, i) => (ok[i] ? true : uploadPhoto(x)))); // one more try each
  if (ok.includes(false)) { sendError("Não foi possível carregar as fotos. Tente de novo."); return false; }
  return true;
 };
 const thanks = (name) => {
  const first = (name || "").split(" ")[0];
  $("thanks-text").textContent = "Obrigado por mandar sua mensagem" + (first ? ", " + first : "") + ". Vou ouvir com calma, com um café do lado. Se ela entrar num vídeo, você vai ver no canal.";
  player.pause(); vplayer.pause();
  setState("sent"); window.scrollTo(0, 0); $("thanks-title").focus();
 };
 $("send").addEventListener("click", doSend);
 $("again").addEventListener("click", () => location.reload());
 $("up-retry").addEventListener("click", () => last && upload(last.blob, last.kind, last.dur, true));

 rec.addEventListener("click", () => { if (rec.dataset.kind === "audio") start(); });
 $("stop").addEventListener("click", stop);
 $("upload").addEventListener("click", () => file.click());
 $("vswap").addEventListener("click", () => file.click());
 file.addEventListener("change", pick);
 $("redo").addEventListener("click", () => { if (source === "file") return file.click(); discard(); start(); });
 const vtoggle = () => (vplayer.paused ? vplayer.play() : vplayer.pause());
 $("vplay").addEventListener("click", vtoggle); vplayer.addEventListener("click", vtoggle);
 vplayer.addEventListener("play", () => $("vframe").classList.add("playing"));
 vplayer.addEventListener("pause", () => $("vframe").classList.remove("playing"));
 $("play").addEventListener("click", () => (player.paused ? player.play() : player.pause()));
 player.addEventListener("play", () => { $("play").innerHTML = icons.pause; $("play").setAttribute("aria-label", "Pausar"); });
 player.addEventListener("pause", () => { $("play").innerHTML = icons.play; $("play").setAttribute("aria-label", "Ouvir gravação"); });
 player.addEventListener("timeupdate", () => { $("ready-bar").style.width = (Math.min(player.currentTime, duration) / MAX) * 100 + "%"; });
 player.addEventListener("ended", () => { $("ready-bar").style.width = (duration / MAX) * 100 + "%"; });
})();
</script>`);

type Row = { id: string; name: string | null; anonymous: number; kind: string; status: string; duration_s: number | null; transcript: string | null; transcript_error?: string | null; tags: string };
const STATUS: Record<string, string> = { uploading: "Enviando", new: "Novo", favorite: "Favorito", used: "Usado", rejected: "Rejeitado" };
export const panelPage = (rows: Row[]) => layout("Coffee Time · Painel", `<main class="wrap">
<div class="eyebrow">Painel</div><h1 style="font-size:36px;font-weight:800;letter-spacing:-.03em;margin:4px 0 20px">Envios</h1>
<ul style="list-style:none;padding:0;margin:0" id="submissions">${rows.map((r) => `<li data-id="${esc(r.id)}" style="display:flex;gap:20px;padding:16px;border-bottom:1px solid var(--line)">
 <div style="width:200px;flex-shrink:0"><b>${esc(r.anonymous ? "Anônimo" : r.name || "Sem nome")}</b><div style="color:var(--subtle);font-size:13px">${esc(r.kind === "video" ? "vídeo" : "áudio")}</div></div>
 <div style="flex:1;color:var(--ink2)">${r.transcript ? `“${esc(r.transcript)}”` : `<i style="color:var(--subtle)">${r.transcript == null && !r.transcript_error && r.status !== "rejected" ? "Transcrevendo…" : "Sem transcrição"}</i>`}
  <div style="margin-top:8px">${(JSON.parse(r.tags) as string[]).map((t) => `<span class="pill">${esc(t)}</span>`).join("")}</div></div>
 <div style="width:96px;flex-shrink:0;color:var(--accent);font-size:13px;font-weight:600">${esc(STATUS[r.status] || r.status)}</div></li>`).join("")}</ul>
</main>`);

// Privacy page (ADR 0005): what is kept, why, and deletion by e-mail. Linked from the consent checkbox.
export const privacyPage = () => layout("Política de privacidade · Coffee Time", `<style>
.privacy{max-width:680px}.privacy h1{font-size:32px;font-weight:800;letter-spacing:-.03em;margin:6px 0 8px}
.privacy h2{font-size:18px;font-weight:700;margin:28px 0 8px}.privacy p,.privacy li{color:var(--ink2);font-size:16px;line-height:26px}
.privacy ul{padding-left:20px;margin:0}.privacy a{color:var(--accent)}.privacy code{font:500 .95em "JetBrains Mono",ui-monospace,monospace;color:var(--ink)}
.privacy .back{display:inline-flex;align-items:center;gap:8px;margin-top:32px;font-weight:600;text-decoration:none}
</style>
<main class="wrap privacy">
<div class="eyebrow">Coffee Time</div>
<h1>Política de privacidade</h1>
<p>Você não precisa de conta para mandar uma mensagem. Eu guardo só o necessário para ouvir e, se você autorizar, usar seu envio nos vídeos do canal.</p>
<h2>O que eu guardo</h2>
<ul>
 <li>O áudio ou vídeo que você envia e as fotos, se mandar alguma.</li>
 <li>Seu nome, se preencher.</li>
 <li>A data do envio e a data em que você deu a autorização.</li>
 <li>Uma transcrição automática da mensagem, para eu encontrar seu envio.</li>
</ul>
<p>Não peço e-mail, telefone nem login. Para evitar abuso, seu IP é guardado de forma irreconhecível (hash) por um minuto e depois apagado.</p>
<h2>Para que uso</h2>
<p>Para ouvir sua mensagem e, se ela entrar num vlog, mostrar o áudio, o vídeo, as fotos e o nome no canal. Não vendo nem compartilho seus dados.</p>
<h2>Como apagar seu envio</h2>
<p>Escreva para <code>${CONTACT}</code> contando quando mandou e o que disse. Eu encontro seu envio e apago os arquivos e os dados.</p>
<p>Vídeos já publicados no canal continuam no ar.</p>
<h2>Onde ficam os dados</h2>
<p>Na Cloudflare: os arquivos no R2 e os dados no D1.</p>
<a class="back" href="/">${icon('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>', 18)}Voltar</a>
</main>`);
