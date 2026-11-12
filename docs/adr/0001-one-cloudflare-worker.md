# ADR 0001 · One Cloudflare Worker with D1, R2 and Queues

**Status:** accepted · 2026-11-12

## Context
Low volume (dozens of messages a week, spikes after a story), cost must stay near zero, and the owner already runs other projects on Cloudflare.

## Decision
A single Worker serves the public site, the submit API, the panel, the MCP endpoint, the queue consumer and the hourly cron. D1 holds submissions, R2 holds media, a Queue runs background work.

## Consequences
- US$ 0 on free tiers until ~10 GB of media.
- One deploy, one codebase; parts are separated by route and handler, not by service.
- No KV, Durable Objects, Pages or Stream; adding one needs a new ADR.
