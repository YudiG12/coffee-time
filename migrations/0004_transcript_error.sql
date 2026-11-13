-- Set when the transcription job gave up (ADR 0004: retries, then the dead-letter queue). The message stays in the
-- panel without text; NULL while the job is pending or once it has worked.
ALTER TABLE submissions ADD COLUMN transcript_error TEXT;
