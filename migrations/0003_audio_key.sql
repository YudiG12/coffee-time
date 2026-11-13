-- The audio track of a video, extracted in the browser (ADR 0003) for the transcription. NULL for audio messages
-- and for videos sent from browsers without WebCodecs.
ALTER TABLE submissions ADD COLUMN audio_key TEXT;
