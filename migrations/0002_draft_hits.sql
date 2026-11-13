-- Per-IP rate limit for POST /api/drafts (ADR 0002). One row per draft, IP hashed, kept for one minute.
CREATE TABLE draft_hits (
  ip_hash TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX draft_hits_ip ON draft_hits(ip_hash, at);
