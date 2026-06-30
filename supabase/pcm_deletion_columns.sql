-- Add drive_folder (rclone-addressable folder name) and deleted_at to pcm_recordings
alter table pcm_recordings
  add column if not exists drive_folder text,
  add column if not exists deleted_at   timestamptz;
