-- ============================================================
-- PCM Recordings — add 'split' and 'deleted' to state check
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 'split' marks staging folders whose sessions have been moved to
-- named sibling folders (Studio 2 43 — date — client). These rows
-- are hidden from the dashboard. 'deleted' was also missing.

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
    'gave_up',
    'deleted',
    'split'
  ));
