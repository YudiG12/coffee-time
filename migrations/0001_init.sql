-- Submissions: one audio or one video per row, plus optional photos (keys in R2).
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','new','favorite','used','rejected')),
  kind TEXT NOT NULL CHECK (kind IN ('audio','video')),
  name TEXT,
  anonymous INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  duration_s INTEGER,
  media_key TEXT,
  photo_keys TEXT NOT NULL DEFAULT '[]',
  transcript TEXT,
  tags TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX submissions_status ON submissions(status, created_at);
