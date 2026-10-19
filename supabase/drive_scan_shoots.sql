-- Shoot-level folder scan results (depth 3: Root → Client → Year → Shoot)
create table if not exists drive_scan_shoots (
  id               uuid primary key default gen_random_uuid(),
  drive_type       text not null,
  folder_id        text not null,
  folder_name      text not null,
  client_folder_id text not null,
  client_name      text not null,
  client_code      text,
  year             text,
  size_bytes       bigint not null default 0,
  file_count       int    not null default 0,
  created_at_drive timestamptz,
  last_scanned_at  timestamptz not null,
  constraint drive_scan_shoots_uniq unique (drive_type, folder_id)
);

alter table drive_scan_shoots enable row level security;
create policy "service role only" on drive_scan_shoots
  using (false) with check (false);
