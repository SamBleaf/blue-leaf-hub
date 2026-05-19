-- Optional video URL on weekly portal updates
ALTER TABLE portal_updates ADD COLUMN IF NOT EXISTS video_url text;
