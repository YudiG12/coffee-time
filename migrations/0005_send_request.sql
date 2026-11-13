-- What the subscriber chose when they pressed Enviar (ADR 0002): consent was given, plus name, anonymous flag,
-- the video's audio track and the photo slots, as JSON. Saved before the files are checked, so the hourly sweep can
-- finish a send the browser never confirmed (tab closed, network lost, storage or queue error). Cleared on commit.
-- NULL for drafts nobody sent: those are deleted after 24 h.
ALTER TABLE submissions ADD COLUMN send_request TEXT;
ALTER TABLE submissions ADD COLUMN send_at TEXT;
