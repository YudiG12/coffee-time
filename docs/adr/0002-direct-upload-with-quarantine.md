# ADR 0002: Direct upload to R2 with quarantine and an hourly sweep

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-12 |
| **Deciders** | Yudi Ganeko |

## Context

Videos up to ~50 MB (after compression) over unstable 4G. Passing them through the Worker wastes CPU and hits request limits. The endpoint is public and anonymous, so anything can be uploaded.

## Decision

- The browser asks the Submit API for a draft (Turnstile + IP rate limit) and gets short-lived signed URLs for `incoming/`.
- Multipart upload straight to R2.
- On **Send**, the Worker checks size (`HEAD`) and real type (first 4 KB, magic bytes), then moves files to `media/` and enqueues transcription; invalid files are deleted.
- A Cron runs hourly: completes sends the browser never confirmed, deletes drafts older than 24 h and failed sends older than 7 days.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Upload through the Worker | CPU and request-size limits; slow on bad 4G. |
| No quarantine, accept on upload | Anyone could fill R2 with junk that stays forever. |
| Delete unconfirmed files after 1 day | A real message is lost if the tab closes before Send is confirmed. |

## Consequences

- No real message is lost if the tab closes after **Send**: the sweep finishes it.
- Junk cannot pile up in R2.
- Two prefixes and a lifecycle to reason about; covered by the verify checks.
