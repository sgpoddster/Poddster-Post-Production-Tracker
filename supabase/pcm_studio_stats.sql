-- ============================================================
-- PCM Studio Stats — SSD capacity per studio
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

create table if not exists pcm_studio_stats (
  studio       text primary key,
  used_bytes   bigint,
  free_bytes   bigint,
  total_bytes  bigint,
  updated_at   timestamptz default now()
);

alter table pcm_studio_stats enable row level security;

create policy "auth_read_studio_stats"
  on pcm_studio_stats for select to authenticated using (true);

-- Enable real-time so the dashboard gets live SSD updates
alter publication supabase_realtime add table pcm_studio_stats;
