-- ============================================================
-- PCM Recordings — add retry_requested flag
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Allows the dashboard to queue a manual retry for a failed/gave_up recording.
-- discover.py polls /api/pcm/pending-retries at the start of each scan, resets
-- the state.json entry, and clears this flag via /api/pcm/update.

ALTER TABLE pcm_recordings
  ADD COLUMN IF NOT EXISTS retry_requested boolean DEFAULT false;
