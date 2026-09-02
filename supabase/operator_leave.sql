create table if not exists operator_leave (
  id         uuid        primary key default gen_random_uuid(),
  date       date        not null,
  operator   text        not null,
  note       text,
  created_at timestamptz not null default now(),
  unique (date, operator)
);

create index if not exists operator_leave_date_idx on operator_leave (date);

alter table operator_leave enable row level security;

create policy "Staff can read operator leave"
  on operator_leave for select
  using (auth.role() = 'authenticated');

create policy "Staff can manage operator leave"
  on operator_leave for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
