-- Studio capacity configuration scenarios.
-- One row is marked is_live = true and is used by the booking form / capacity page.
-- Saved what-ifs are additional rows.

create table if not exists studio_config (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  config      jsonb       not null,
  is_live     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Only one row may be live at a time.
create unique index if not exists studio_config_live_idx
  on studio_config (is_live)
  where is_live = true;

-- RLS: authenticated staff can read; admins can write.
alter table studio_config enable row level security;

create policy "Staff can read studio configs"
  on studio_config for select
  using (auth.role() = 'authenticated');

create policy "Admins can manage studio configs"
  on studio_config for all
  using  (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Seed the live row from PODDSTER_CONFIG.
insert into studio_config (name, config, is_live)
values (
  'Poddster Live',
  '{
    "rooms": [
      {"id": "S1", "label": "Studio 1", "sets": ["Exec", "Nest"]},
      {"id": "S2", "label": "Studio 2", "sets": ["Iris", "Club"]},
      {"id": "S3", "label": "Studio 3", "sets": ["Nova"]},
      {"id": "S4", "label": "Studio 4", "sets": ["Core", "Cove"]}
    ],
    "exclusions": [{"rooms": ["S3", "S4"], "gapMinutes": 30}],
    "buffers": {"beforeMinutes": 30, "afterMinutes": 30},
    "operators": {
      "names": ["Josiah", "Syafiq", "Sufi"],
      "leave": [
        {"date": "2026-10-16", "operator": "Sufi"},
        {"date": "2026-10-21", "operator": "Syafiq"},
        {"date": "2026-10-22", "operator": "Syafiq"},
        {"date": "2026-10-23", "operator": "Syafiq"},
        {"date": "2026-10-26", "operator": "Syafiq"},
        {"date": "2026-10-27", "operator": "Syafiq"},
        {"date": "2026-10-28", "operator": "Syafiq"},
        {"date": "2026-10-29", "operator": "Sufi"}
      ]
    },
    "hours": {"open": "10:00", "close": "18:00", "days": [1, 2, 3, 4, 5]},
    "slotMinutes": 30
  }',
  true
)
on conflict do nothing;
