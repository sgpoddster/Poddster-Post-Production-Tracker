-- Add ssd_root column to pcm_studio_stats so the dashboard can show SSD name
alter table pcm_studio_stats
  add column if not exists ssd_root text;
