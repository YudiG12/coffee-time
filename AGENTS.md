# AGENTS.md

Coffee Time: a Portuguese-language site where subscribers send the owner a short audio or video message for his vlogs, plus an owner panel and an MCP endpoint for his AI editor. Everything in the repo is in English; everything the user sees is in Portuguese.

Read first: [ARCHITECTURE.md](ARCHITECTURE.md), [docs/PRD.md](docs/PRD.md), [the flows](ARCHITECTURE.md#flows), [docs/design/](docs/design/).

## Stay inside ARCHITECTURE.md
Stay inside ARCHITECTURE.md. A feature that needs a service or pattern not listed there: stop, open an issue labeled `needs-owner` explaining why, and don't build it.

## Follow the design
Follow docs/design/ and the brand tokens. A new screen that changes the app's look (new layout, new navigation): stop, open an issue labeled `needs-owner` asking for a mockup. Small features that reuse existing patterns go straight to code.

Copy: short, correct Portuguese; icons, never emojis.

## Diagrams
Every map is generated, never drawn by hand: `docs/architecture/draw.py` (architecture map), `draw_flows.py` (one map per flow, numbered arrows) and `docs/assets/build.py` (README banner and high-level design). After changing one, run `docs/architecture/render.sh`, open every PNG, and fix anything that overlaps or crosses before committing. A new service or flow updates the map, the flow maps and `ARCHITECTURE.md` in the same PR.

## Verify a change
`npm run verify` runs the Worker locally on a free port with an isolated, throwaway D1 and fake data (`scripts/demo-seed.sql`). It checks the API, the MCP tools, the auth rules and the screens, and writes screenshots, a GIF and `verify-out/report.json` (`verdict: PASS|FAIL`). It never touches production and works offline. `npm run verify -- --keep` leaves the server running.

- **Builder** (Claude): makes the change, adds a check for it in `scripts/verify.mjs`, runs verify until PASS, looks at the screenshots, opens the PR.
- **Verifier** (Codex): runs verify on the PR head and reviews the diff against this file, ARCHITECTURE.md and docs/design/.

Never weaken an `auth:` check. A change that needs one changed stops and opens a `needs-owner` issue.

## Feature map
| Feature | Files | Check in verify |
|---|---|---|
| Start page (pt-BR): hero, Audio/Video tabs, buttons, "Como fica no vlog" | `src/pages.ts` `startPage`, `public/` | `ui: start page …`, `ui: start page layout, tabs and icons …` |
| Audio recording (MediaRecorder, Opus): recording state, 90 s auto-stop, "Gravação pronta", play, Regravar | `src/pages.ts` `startPage`, `?max=` dev flag in `src/index.ts` `/` | `ui: record audio with a fake microphone …`, `ui: recording stops by itself at the limit …` |
| Upload a file ("Envie um arquivo"): one audio or video ≤ 90 s, audio ready ("Trocar áudio"), video preview ("Vídeo pronto · 1080p", "Trocar vídeo"), refusal message | `src/pages.ts` `startPage`, `scripts/fixtures/` | `ui: upload a short audio and a short video …`, `ui: a file longer than 90 s …` |
| Draft and background upload (ADR 0002): `POST /api/drafts` (Turnstile, 5 per IP per minute), signed R2 URLs ≤ 15 min, multipart over 10 MB, Worker upload route in local dev only; progress row "Carregando …", "Arquivo carregado", "Tentar de novo" | `src/api/drafts.ts`, `src/api/s3.ts`, `src/pages.ts` `startPage`, `migrations/0002_draft_hits.sql` | `api: draft …`, `api: the 6th draft …`, `api: presigned URLs …`, `api: Turnstile check …`, `api: signed upload URL …`, `ui: a picked file uploads …`, `ui: a failed upload …` |
| Send form, Send and thanks (ADR 0002, 0005): "Anonimizar voz" (audio only, hides the name), optional name, up to 10 photos (`POST /api/drafts/:id/photos`), consent, "Enviar" only with media + consent; `POST /api/drafts/:id/send` checks size (HEAD) + magic bytes, moves to `media/`, status `new`; junk → `rejected` and deleted; thanks screen; `/privacidade` | `src/api/send.ts`, `src/api/sniff.ts`, `src/api/drafts.ts`, `src/pages.ts` `startPage` `privacyPage` | `api: send a full submission …`, `api: a file renamed to .mp4 …`, `api: Send before the upload …`, `api: photo URLs …`, `api: magic bytes …`, `api: Send survives a storage error …`, `ui: Enviar needs consent …`, `ui: anonymous audio …`, `ui: without the voice distortion …`, `ui: Enviar waits …`, `ui: privacy page …` |
| Media work in the browser (ADR 0003): anonymous audio distorted (pitch ×0.78, formants ×0.88) before upload, replaced in the same draft when "Anonimizar voz" changes; video to 1080p ~5 Mbps (Mediabunny/WebCodecs) + its audio track (`POST /api/drafts/:id/files`, `audio_key`); photos ≤ 2000 px WebP; no WebCodecs → original video + warning | `src/site/media.ts` (built to `public/media.js` by `scripts/build-site.mjs`), `src/pages.ts` `startPage`, `src/api/drafts.ts`, `src/api/send.ts`, `migrations/0003_audio_key.sql`, `scripts/fixtures/video-2s-4k.webm` | `api: draft files …`, `ui: anonymous audio is distorted …`, `ui: a 4K video …`, `ui: photos are stored as WebP …`, `ui: without WebCodecs …` |
| Transcript and tags in the background (ADR 0004): Send enqueues `{ id }` on Queue `coffee-time-jobs` before committing (queue error → 503, retryable; a job before the commit is retried); consumer reads the audio (or a video's audio track) from R2, Whisper pt-BR, text model for free tags (type + topics, cleaned), saves `transcript`/`tags`; 3 retries with backoff, then `coffee-time-jobs-dlq` marks `transcript_error`; panel "Transcrevendo…" / "Sem transcrição"; verify stubs AI (`scripts/fixtures/ai-stub.js`) | `src/jobs/transcribe.ts`, `src/api/send.ts`, `src/index.ts`, `src/pages.ts` `panelPage`, `wrangler.jsonc` `queues` `ai`, `migrations/0004_transcript_error.sql` | `api: Send enqueues a job …`, `api: a failing job is retried …`, `api: tags from the model are cleaned …`, `api: a job that arrives before Send commits …`, `ui: panel says "Transcrevendo…" …` |
| Panel list and filters | `src/index.ts` `/painel`, `/api/panel/submissions` | `api: panel …`, `ui: panel …` |
| MCP tools | `src/index.ts` `/mcp` | `mcp: …` |
| Auth (Access JWT, Bearer, dev) | `src/auth.ts`, `guard` in `src/index.ts` | `auth: …` |
| Schema | `migrations/` | migrate + seed step |

# Pipeline (issue → PR → verify → merge → deploy)

1. Work is queued as GitHub issues labeled `agent`, each with "Done when…". One open PR per repo at a time.
2. Builder (Claude, cloud) takes the oldest `agent` issue, works on a branch, runs `npm run verify`, opens a PR with the template (Summary, Decisions, Attention) and `Closes #N`.
3. CI posts the proof comment (verdict, GIF, screenshots). Codex reviews/verifies.
4. `auto-merge.yml` merges every PR when Codex passes and CI is green, then deploys. No human review: security is guarded by the `auth:` checks in verify (a PR that loosens auth fails CI), and the merge script always runs from `main`, so a PR can't change its own merge rules. PRs touching sensitive paths (`wrangler*.jsonc`, `src/auth.ts`, `migrations/`, `SECURITY.md`, `.github/`, auth code) are only flagged 🔒 in the changelog. It labels `circuit-breaker` and stops only when the same Codex finding comes back after a fix, or after 5 failed rounds. The owner can hold any PR by adding the `needs-owner` label by hand.
5. Migrations merge automatically; put the D1 Time Travel bookmark in the PR's "Attention".
6. On merge, a GitHub Release `pr-N` is published (Summary, Decisions, proof GIF + screenshots) and a line is added to `CHANGELOG.md`. Write the PR Summary for the owner: it becomes the changelog entry.
   **Cover:** every PR fills `## Cover` in its body with one screenshot file name from `verify-out/` that best shows *this* PR's feature (the new screen or state, not the start page). CI puts it as the first image of the proof and the release; it is the thumbnail in the owner's panel. If the feature has no screenshot yet, add one to `scripts/verify.mjs`.
