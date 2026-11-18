-- A frame of a video (#50), grabbed in the browser and stored as `media/<id>/thumb` (≤ 2000 px WebP, or JPEG/PNG where
-- the browser can't encode WebP), shown in the panel list when the message has no photos. NULL for audio messages and
-- for videos sent before this column existed (no backfill).
ALTER TABLE submissions ADD COLUMN thumb_key TEXT;
