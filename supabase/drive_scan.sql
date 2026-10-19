-- Drive folder scan results (populated by daily cron)
create table if not exists drive_scan_folders (
  id              uuid primary key default gen_random_uuid(),
  drive_type      text not null,          -- 'client_raw' | 'post_production'
  folder_id       text not null,
  folder_name     text not null,
  client_code     text,
  size_bytes      bigint not null default 0,
  file_count      int    not null default 0,
  created_at_drive timestamptz,
  last_scanned_at timestamptz not null,
  constraint drive_scan_folders_uniq unique (drive_type, folder_id)
);

-- Allow service role full access; no RLS needed (admin-only via API)
alter table drive_scan_folders enable row level security;
create policy "service role only" on drive_scan_folders
  using (false) with check (false);
