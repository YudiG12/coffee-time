# ADR 0005: No subscriber accounts; deletion by e-mail

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-12 |
| **Deciders** | Yudi Ganeko |

## Context

Sending must be as easy as possible. LGPD requires a way to ask for deletion. A deletion link or account adds friction and state.

## Decision

No login and no stored contact. Only an optional name (LinkedIn was dropped). One consent checkbox. The thanks page and the privacy page say: to remove a submission, e-mail `contato@yudiganeko.com` describing it; the owner finds it by transcript search and deletes files and row. A video already published stays online, and the consent text says so.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Account or magic link | Friction before the first message; more personal data. |
| Secret deletion link on the thanks screen | Easy to lose; e-mail is enough at this volume. |

## Consequences

- Minimal personal data stored.
- Deletion is manual, which is fine at this volume.
