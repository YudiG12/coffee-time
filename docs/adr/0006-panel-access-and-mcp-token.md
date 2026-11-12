# ADR 0006: Cloudflare Access for the panel, a Bearer token for MCP

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-12 |
| **Deciders** | Yudi Ganeko |

## Context

Only the owner uses the panel. His AI agent needs programmatic read access and status updates.

## Decision

The panel routes sit behind Cloudflare Access (owner's e-mail); the Worker also verifies the Access JWT. The MCP endpoint uses a separate Bearer token stored as a Worker secret, compared in constant time.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Panel login built in the app | Auth code to maintain for one user. |
| Reuse Access for the agent | The agent would act with the owner's session; a separate token can be rotated alone. |

## Consequences

- No auth code to maintain for the panel.
- The agent never uses the owner's session; the token can be rotated alone.
- `verify` must cover both: missing/wrong/forged credentials get 401, valid ones get 200.
