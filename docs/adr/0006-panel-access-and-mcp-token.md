# ADR 0006 · Cloudflare Access for the panel, a Bearer token for MCP

**Status:** accepted · 2026-11-12

## Context
Only the owner uses the panel. His AI agent needs programmatic read access and status updates.

## Decision
The panel routes sit behind Cloudflare Access (owner's e-mail); the Worker also verifies the Access JWT. The MCP endpoint uses a separate Bearer token stored as a Worker secret, compared in constant time.

## Consequences
- No auth code to maintain for the panel.
- The agent never uses the owner's session; the token can be rotated alone.
- `verify` must cover both: missing/wrong/forged credentials get 401, valid ones get 200.
