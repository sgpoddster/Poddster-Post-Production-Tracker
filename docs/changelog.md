# Changelog — Poddster Post-Production Tracker

All notable changes to the web app. Newest first. Dates are when the work shipped.

---

## 2026-06 — Email polish, CC producer, and UI tweaks

### Added
- **CC the producer** on client review-chase emails so they see any client
  reply (live mode only; the GAS relay + `sendViaGas` gained a `cc` field).
- **Poddster logo image** in all email headers (replaces the "PODDSTER" text).
- Review-chase **copy + subjects** finalised: "Reminder on your edit/s" /
  "Final reminder", filename-style line items (`Episode - DDBA4E1 5pm 8th June
  2026 - V1 · Booking <order_id>`), Needs-Review CTA, 7-day approve/archive/delete
  warning. Subjects: "Reminder - Your Poddster Edit/s" / "Final Reminder - …".
- Review-chase **test knobs**: `onlyClient=<name>` and `days=<n>` for previewing.

### Changed
- **Drive Link is now mandatory** when creating a new project.
- **Client filter is multi-select with checkboxes** (matches the producer menu),
  on both dashboard and queue (`?client=name1,name2`).
- **Queue filters** (client + producer) aligned together on one row; due-window
  toggle on the left.
- Queue **Hold button** no longer wraps — same height as Done (matches dashboard).

> GAS relay note: the `sgproduction@` email web app must be re-deployed with the
> updated `docs/gas-email-webapp.gs` (adds `cc` support) for producer CC to work.

---

## 2026-06 — Dashboard client filter + collapsible sections

### Added
- **Client filter** dropdown on the dashboard (`?client=`), listing clients
  present in the current view; composes with the existing producer filter + search.
- **Collapsible sections** — Draft / In Progress / Client Review / Completed each
  have a chevron toggle; collapsed state is remembered per section via localStorage.

---

## 2026-06 — Client review-chase emails

### Added
- **Automated review chase.** A daily job emails clients who haven't responded
  to a Client Review (measured purely from our own data — days since the current
  version's `done_date`; no Frame.io needed):
  - **Day 7** still in review → reminder email
  - **Day 14** still in review → final notice ("we'll archive in 30 days")
  - Consolidated **one email per client** per stage; sent once (no spam).
  - Archiving itself is **manual in Frame.io** — the app just nudges + tracks.
- `POST /api/cron/review-chase?key=<INGEST_API_KEY>` runs the check.
  **Safe by default:** dry run unless `REVIEW_CHASE_LIVE=true` is set in env.
  `?testTo=you@x.com` previews the real email to one address without touching data.
- `review_chase_stage` column on projects (0/1/2); resets to 0 whenever a fresh
  version enters Client Review (manual Done or Frame.io `file.ready`).
- GAS daily-trigger script at `docs/gas-review-chase-trigger.gs`.

---

## 2026-06 — Frame.io status automation live

### Added / Confirmed
- The Frame.io **Status** automation is now wired up and tested end-to-end:
  - **Needs Review** → project returns to the queue as a revision (in_revision, V+1).
  - **Approved** → project marked **Complete**.
- A second Frame.io webhook ("PP Tracker — status changes") was created on the
  workspace subscribed to `metadata.value.updated` + `file.updated`, pointing at
  the same `/api/webhooks/frameio` endpoint. (v4 has no PATCH for webhooks, so a
  separate webhook is used rather than editing the existing `file.ready` one.)

### Removed
- Temporary debug GET handlers on the webhook route (`?file=`, `?webhooks=`,
  `?update_webhook=`). The route is POST-only again.

---

## 2026-06 — Draft rename + Back-to-Draft

### Changed
- **"Awaiting Trigger" renamed to "Draft"** across the UI (dashboard section,
  status badge). The client portal keeps its client-facing "Awaiting Files".
- **Hold button is now a small menu.** Not on hold → *Put on hold* / *Back to
  Draft*. On hold → *Take off hold* / *Back to Draft*.

### Added
- **Back to Draft** (admin) — moves a triggered project back to `pending_trigger`,
  clearing its version rows and hold state (`POST /api/projects/[id]/draft`).
  `current_version` is preserved so a re-trigger restores the same starting version.

### Note
- Taking a project off hold continues the timer **from where it left off** — the
  deadline is extended by the days paused (existing resume behaviour, unchanged).

---

## 2026-06 — Batch trigger (multi-select)

### Added
- **Multi-select trigger** in the Awaiting Trigger section. Checkboxes let you
  select multiple deliverables **from the same Job ID** (others lock out once a
  selection starts) and fire them together with a "Trigger all selected" bar.
- New endpoint `POST /api/projects/trigger-batch` — triggers the selected
  projects and sends **one consolidated email** to the producer listing all the
  deliverables (e.g. "1 Episode + 3 Highlights") instead of one email each.
- `sendBatchAssignmentEmail()` builds the consolidated email.
- Individual per-row Trigger buttons remain for one-offs.

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
