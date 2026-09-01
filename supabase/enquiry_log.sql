-- Captures every slot enquiry from the booking form.
-- Outcome + blocked_by are populated automatically from the capacity engine.
-- Six months of this data makes the what-if scenario numbers defensible.

create type if not exists enquiry_outcome as enum ('booked', 'moved', 'lost');

create table if not exists enquiry_log (
  id                  uuid        primary key default gen_random_uuid(),
  requested_date      date        not null,
  requested_start     time        not null,
  requested_duration  interval    not null,
  requested_set       text        not null,
  outcome             enquiry_outcome not null,
  alternative_offered text,
  blocked_by          text        check (blocked_by in ('room', 'operator', 'hours')),
  notes               text,
  created_at          timestamptz not null default now()
);

create index if not exists enquiry_log_date_idx on enquiry_log (requested_date);
create index if not exists enquiry_log_outcome_idx on enquiry_log (outcome);

-- RLS: inserts are via the server-side API (service role bypasses RLS).
-- Reads are authenticated-only.
alter table enquiry_log enable row level security;

create policy "Staff can read enquiry log"
  on enquiry_log for select
  using (auth.role() = 'authenticated');
