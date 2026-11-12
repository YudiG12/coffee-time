# Architecture (v1)

![Architecture of v1](docs/architecture/v1.png)

| Concern | How | Decision |
|---|---|---|
| Runtime | One **Worker**: public site (pt-BR), submit API, panel, MCP endpoint, queue consumer, hourly cron | [ADR 0001](docs/adr/0001-one-cloudflare-worker.md) |
| Media | **R2**. Browser uploads straight to `incoming/` with short-lived signed URLs; on Send the Worker checks size and real type and moves files to `media/` | [ADR 0002](docs/adr/0002-direct-upload-with-quarantine.md) |
| Messages | **D1**: submission, status, consent, transcript, tags | [ADR 0001](docs/adr/0001-one-cloudflare-worker.md) |
| Heavy media work | **In the browser**: video to 1080p ~5 Mbps (WebCodecs), photos to WebP, voice distortion for anonymous audio, audio track extracted from video; upload starts when the file is picked | [ADR 0003](docs/adr/0003-processing-in-the-browser.md) |
| Transcript and tags | A **Queue** job per submission: **Workers AI** Whisper, then a text model for free-form tags; retries, then a dead-letter queue | [ADR 0004](docs/adr/0004-transcription-and-free-tags.md) |
| Cleanup | **Cron** every hour: completes unconfirmed sends, deletes drafts after 24 h and failed sends after 7 days | [ADR 0002](docs/adr/0002-direct-upload-with-quarantine.md) |
| Abuse | **Turnstile** and an IP rate limit on drafts; expiring URLs; quarantine with a magic-bytes check | [ADR 0002](docs/adr/0002-direct-upload-with-quarantine.md) |
| Subscribers | No account; optional name; one consent checkbox; deletion by e-mail | [ADR 0005](docs/adr/0005-no-accounts-deletion-by-email.md) |
| Owner and agent | Panel behind **Cloudflare Access**; MCP with its own Bearer token | [ADR 0006](docs/adr/0006-panel-access-and-mcp-token.md) |

Not used: KV, Durable Objects, Pages, Stream.

**Limits of this design.** One audio or one video (≤ 90 s) and up to 10 photos per message. Browsers without WebCodecs upload the original, up to 300 MB. Free on Cloudflare until about 10 GB of media (~200 videos), then about US$ 0.015 per GB per month. Deletion requests are handled by hand.

## Flows

### 1. Send a message

<p align="center"><img src="docs/architecture/flows/1-send.png" alt="Flow 1: send a message" width="760"></p>

### 2. Transcript and tags

<p align="center"><img src="docs/architecture/flows/2-transcribe.png" alt="Flow 2: transcript and tags" width="760"></p>

### 3. Owner and agent read

<p align="center"><img src="docs/architecture/flows/3-read.png" alt="Flow 3: owner and agent read" width="760"></p>

### 4. Hourly sweep

<p align="center"><img src="docs/architecture/flows/4-sweep.png" alt="Flow 4: hourly sweep" width="760"></p>

### 5. Deletion request

<p align="center"><img src="docs/architecture/flows/5-delete.png" alt="Flow 5: deletion request" width="760"></p>

## Repository

```
src/
  site/        public pages (pt-BR) and browser-side media work
  api/         drafts, signed URLs, Send
  panel/       owner panel
  mcp/         MCP endpoint
  jobs/        queue consumer and hourly sweep
  db/          D1 schema and migrations
docs/
  adr/  architecture/  assets/  design/  PRD.md
```
