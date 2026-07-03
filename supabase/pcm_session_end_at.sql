ALTER TABLE pcm_recordings
  ADD COLUMN IF NOT EXISTS session_end_at timestamptz;
