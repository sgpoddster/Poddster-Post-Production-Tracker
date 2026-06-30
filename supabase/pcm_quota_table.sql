-- Drive upload quota tracking: one row per SGT calendar day
create table if not exists pcm_upload_quota (
  date           text primary key,  -- YYYY-MM-DD (SGT)
  bytes_uploaded bigint not null default 0,
  updated_at     timestamptz not null default now()
);

-- Allow real-time subscriptions
alter table pcm_upload_quota replica identity full;
