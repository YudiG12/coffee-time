# Security

## Access model

- **Public form, no account.** Drafts need a Turnstile token and pass an IP rate limit. Upload URLs are signed, short-lived and limited to `incoming/`.
- **Nothing is trusted on upload.** On Send the Worker checks size and real file type (magic bytes); anything else is deleted. Unconfirmed drafts are deleted after 24 h.
- **Anonymous voice is distorted in the browser**, so the original never reaches the server.
- **Panel behind Cloudflare Access** (owner's e-mail), and the Worker verifies the Access JWT.
- **MCP with its own Bearer token**, a Worker secret compared in constant time.
- **Secrets** live only in Worker secrets and a git-ignored `.dev.vars`.

What it does not do yet: virus scanning (media is only played or downloaded by the owner), self-service deletion (by e-mail to contato@yudiganeko.com, [ADR 0005](docs/adr/0005-no-accounts-deletion-by-email.md)).

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/YudiG12/coffee-time/security/advisories/new) instead of a public issue.
