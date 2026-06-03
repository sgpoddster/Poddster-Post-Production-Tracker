# Changelog — Poddster Post-Production Tracker

All notable changes to the web app. Newest first. Dates are when the work shipped.

---

## 2026-06 — Email via Google Apps Script (no DNS needed)

### Fixed
- Assignment email is now **awaited** in the trigger route so it actually sends
  before the Vercel function freezes (was fire-and-forget).
- Removed the clapperboard emoji from the email heading — it rendered as broken
  `�` diamonds through the GmailApp send path.

### Changed
- **Email sending moved from Resend to a Google Apps Script web app** running in
  the `sgproduction@poddster.com` mailbox (`GmailApp.sendEmail`). Avoids the
  DigitalOcean DNS / domain-verification dependency entirely — mail sends from
  the production mailbox with Google's own deliverability.
- `lib/email.ts` now POSTs the rendered HTML to the GAS web app
  (`GAS_EMAIL_WEBHOOK_URL` + `GAS_EMAIL_SECRET`) instead of calling Resend.
- GAS relay script committed at `docs/gas-email-webapp.gs` (deploy under the
  sgproduction mailbox; Execute as: me, Access: anyone, guarded by a shared secret).
- Resend remains an option later for custom-domain client-facing mail.

---

## 2026-06 — Frame.io status automation, queue filters, version editing

### Added
- **Frame.io status automation.** The webhook now reads Frame.io's built-in
  "Status" select field (via `include=metadata`) and acts on it:
  - **Needs Review** → moves a project from Client Review back to In Progress,
    starting the next revision (bumps version, new deadline, `in_revision`).
  - **Approved** → marks the project **Complete**.
  - Subscribed events: `file.ready` (delivered → Client Review, existing),
    plus `metadata.value.updated` / `file.updated` for status changes.
- **Queue: due-window toggle** — Today / +1 day / +2 days / All (working days).
  Shows projects due on or before the target day (overdue always included).
- **Queue: client filter** — dropdown listing only clients currently in the
  queue, with search; filters to the selected client.
- **Queue: producer filter** (admin) — same multi-select as the dashboard.
- **Edit project version number.** The Edit modal now has a Version selector
  (V1 First Cut … V10). Changing it on an active project flips status
  First Cut ↔ Revision, recalculates the deadline (5 working days for V1,
  3 for V2+), reshapes the version rows, and trims versions above the new one.
- **New project: starting version** selector (V1–V10) for projects that come in
  mid-pipeline; earlier versions are created as empty placeholders on trigger.
- **On-hold reason** — optional note captured when placing a hold, shown beside
  the On Hold button.
- **Client portal** — public, login-free page at `/client/[token]` showing all
  of a client's projects grouped by filming session, with statuses and version
  timelines. "Copy client link" available on the project detail page and on each
  row in Admin → Clients.
- **Editor field** alongside Producer. Defaults to the producer until overridden;
  display shows "Producer (Editor)" when they differ. Queue/filters/emails still
  key off the producer.
- **Editor assignment emails** (Resend) — editors get a themed email when a
  project is triggered/assigned.
- **Client emails (×3) + first/last name** on the clients table, editable in
  Admin → Clients and used by the portal.
- **Client search** in Admin → Clients (name / code / first / last / any email),
  with "Add client" moved to the top of the list.
- **Dashboard search + producer filter + overdue flagging**, responsive
  mobile layout for the navbar, dashboard header, and rows.

### Changed
- New/Edit project forms require all fields except Notes.
- Add/Edit client forms drop the separate Code box — the code is auto-extracted
  from the client name's parentheses (e.g. `Benjamin Loh (QW2)` → `QW2`).
- Calendar picker now paginates Google Calendar results (was capped at 250 and
  silently dropping later bookings); search matches the event title only.

### Fixed
- Frame.io v4 auth — uses Adobe IMS OAuth (refresh-token → access-token) rather
  than developer tokens, which only work on v2.
- Resend client instantiated lazily to avoid a build-time crash when the key is absent.
- Calendar picker "stuck filter" — deduplicated events that appeared on multiple
  calendars (duplicate React keys broke list reconciliation).
- `source` check constraint, version-row date casts, and duplicate internal IDs
  handled during the historical data import.

### Data
- Imported ~343 historical deliverables (Apr–May 2026) from the Edits & Highlights
  sheet, with full version history and inferred statuses.
- Backfilled client emails and first/last names from the CRM export.

---

## Schema migrations run this period

```sql
-- Client contact details
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_2 TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_3 TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_token UUID DEFAULT gen_random_uuid();

-- Project additions
ALTER TABLE projects ADD COLUMN IF NOT EXISTS hold_reason TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS editor TEXT;
```

---

## Before 2026-06

See `architecture.md` for the baseline system (pipeline, statuses, deadlines,
calendar pre-fill, ID system, Frame.io filename helper) as of late May 2026.
