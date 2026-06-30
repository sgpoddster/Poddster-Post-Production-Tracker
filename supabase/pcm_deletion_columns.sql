-- Add drive_folder (rclone-addressable folder name), deleted_at, and nas_deleted_at to pcm_recordings
alter table pcm_recordings
  add column if not exists drive_folder   text,
  add column if not exists deleted_at     timestamptz,
  add column if not exists nas_deleted_at timestamptz;
