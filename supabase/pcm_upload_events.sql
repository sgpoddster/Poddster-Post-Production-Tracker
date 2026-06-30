-- Drive upload events — append-only, one row per completed upload.
--
-- Google Drive's 750 GB limit is a ROLLING 24-hour window, not a calendar day:
-- each upload's bytes "age out" ~24h after that upload, not all at once at midnight.
-- So we record every upload with a timestamp and sum the trailing 24h, rather than
-- keeping a single per-day counter (which falsely zeroed at midnight SGT and could
-- let a post-midnight upload hit Google's real limit).
create table if not exists pcm_upload_events (
  id          bigserial primary key,
  uploaded_at timestamptz not null default now(),
  bytes       bigint      not null,
  studio      text,
  recording   text
);

create index if not exists pcm_upload_events_uploaded_at_idx
  on pcm_upload_events (uploaded_at);

-- Allow real-time subscriptions (dashboard listens for INSERTs)
alter table pcm_upload_events replica identity full;

-- The old pcm_upload_quota table is superseded by this one and can be dropped
-- once the new code is deployed:
--   drop table if exists pcm_upload_quota;
