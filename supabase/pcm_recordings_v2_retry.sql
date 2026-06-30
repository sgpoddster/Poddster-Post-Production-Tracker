-- ============================================================
-- PCM Recordings v2 — retry tracking + gave_up state
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Add retry_count column
alter table pcm_recordings
  add column if not exists retry_count integer not null default 0;

-- Extend state check to include gave_up
alter table pcm_recordings
  drop constraint if exists pcm_recordings_state_check;

alter table pcm_recordings
  add constraint pcm_recordings_state_check check (state in (
    'discovered',
    'copying',
    'copy_complete',
    'uploading',
    'archived',
    'failed',
    'gave_up'
  ));
