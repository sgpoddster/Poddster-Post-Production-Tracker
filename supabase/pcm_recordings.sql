-- ============================================================
-- PCM Recordings — Synology ATEM backup tracking
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

create table if not exists pcm_recordings (
  id                  uuid primary key default gen_random_uuid(),
  studio              text not null,              -- "Studio 1", "Studio 2", etc.
  recording           text not null,              -- folder name e.g. "STUDIO 1 2"
  state               text not null default 'discovered'
                      check (state in (
                        'discovered',             -- seen on ATEM SSD, not yet copying
                        'copying',                -- FTP copy in progress
                        'copy_complete',          -- copied to NAS, verified
                        'uploading',              -- uploading to Google Drive
                        'archived',               -- on Google Drive, verified
                        'failed'                  -- something went wrong
                      )),
  file_count          integer,
  total_bytes         bigint,
  error               text,                       -- last error message if state = failed
  discovered_at       timestamptz,
  copy_started_at     timestamptz,
  copy_completed_at   timestamptz,
  upload_started_at   timestamptz,
  upload_completed_at timestamptz,
  nas_path            text,                       -- local path on NAS
  drive_url           text,                       -- Google Drive folder URL once uploaded
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (studio, recording)
);

create or replace trigger trg_pcm_recordings_updated_at
  before update on pcm_recordings
  for each row execute function update_updated_at_column();

create index if not exists idx_pcm_recordings_state  on pcm_recordings(state);
create index if not exists idx_pcm_recordings_studio on pcm_recordings(studio);

-- Allow service role (used by the API route) to read/write without RLS
alter table pcm_recordings enable row level security;

create policy "auth_read_pcm"   on pcm_recordings for select to authenticated using (true);
create policy "auth_write_pcm"  on pcm_recordings for insert to authenticated with check (true);
create policy "auth_update_pcm" on pcm_recordings for update to authenticated using (true);

-- Service role bypasses RLS automatically — no extra policy needed.
