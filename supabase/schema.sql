-- ============================================================
-- Poddster Post Production — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Projects: one row per deliverable (episode or individual highlight)
create table if not exists projects (
  id                uuid primary key default gen_random_uuid(),
  job_id            text not null,          -- 5-char hex e.g. A3F2B (shared across episode+highlights)
  internal_id       text not null unique,   -- job_id + suffix: A3F2BE, A3F2BH1, A3F2BH2
  order_id          text,                   -- booking/order reference from calendar
  client_name       text,
  client_code       text,                   -- short code e.g. PC1, 4E1
  assigned_producer text,                   -- account manager who triggered it
  assigned_editor   text,                   -- editor name or email
  type              text not null default 'episode'
                    check (type in ('episode', 'highlight')),
  highlight_number  integer,               -- 1,2,3… — null for episodes
  filming_date      date,
  filming_time      text,                  -- e.g. "10:00 - 11:00"
  setup             text,                  -- room name or "external"
  drive_link        text,                  -- Google Drive folder URL
  footage_ok        boolean default false,
  services          text,                  -- raw services string from booking
  addons            text,                  -- raw addons string from booking
  notes             text,                  -- free-text AM notes
  current_version   integer default 1,
  status            text not null default 'pending_trigger'
                    check (status in (
                      'pending_trigger',   -- ingested, waiting for AM to start
                      'active',            -- in editor queue, timer running
                      'delivered',         -- editor marked done / Frame.io stamped
                      'in_revision',       -- client requested changes, back in queue
                      'complete',          -- all done, client happy
                      'cancelled'
                    )),
  source            text default 'calendar'
                    check (source in ('calendar', 'manual', 'force_push')),
  frame_asset_id    text,                  -- Frame.io asset UUID for webhook matching
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Versions: one row per cut (First Cut, V2, V3…)
create table if not exists versions (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  version_number   integer not null,       -- 1=First Cut, 2=V2, …
  label            text not null,          -- "First Cut", "V2", …
  submitted_date   date,                   -- when editor submitted to client
  due_date         date,                   -- deadline (auto-calc: submitted + working days)
  done_date        date,                   -- stamped when delivered
  frameio_link        text,               -- Frame.io player URL (set by file.ready webhook)
  frameio_uploaded_at timestamptz,        -- upload timestamp from Frame.io (set by file.ready webhook)
  notes            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (project_id, version_number)
);

-- Auto-update updated_at on any row change
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger trg_projects_updated_at
  before update on projects
  for each row execute function update_updated_at_column();

create or replace trigger trg_versions_updated_at
  before update on versions
  for each row execute function update_updated_at_column();

-- Indexes for common queries
create index if not exists idx_projects_status       on projects(status);
create index if not exists idx_projects_assigned_editor on projects(assigned_editor);
create index if not exists idx_projects_filming_date on projects(filming_date);
create index if not exists idx_versions_project_id   on versions(project_id);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- All authenticated users can read/write everything for now.
-- Tighten per-role once roles are defined.
alter table projects enable row level security;
alter table versions enable row level security;

create policy "auth_read_projects"  on projects for select to authenticated using (true);
create policy "auth_write_projects" on projects for insert to authenticated with check (true);
create policy "auth_update_projects" on projects for update to authenticated using (true);

create policy "auth_read_versions"  on versions for select to authenticated using (true);
create policy "auth_write_versions" on versions for insert to authenticated with check (true);
create policy "auth_update_versions" on versions for update to authenticated using (true);
