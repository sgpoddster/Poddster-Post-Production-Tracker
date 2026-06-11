# Changelog — Poddster Post-Production Tracker

All notable changes to the web app. Newest first. Dates are when the work shipped.

---

## 2026-06-11 — Fix button text colours for light mode legibility

### Fixed
- **Trigger button** — text changed from `text-th` to `text-white` so it's always readable on the red background in both light and dark mode.
- **Overdue countdown pill** — text changed to `text-white` (was `text-th`, which rendered dark on red in light mode).
- **On-hold countdown pill** — text changed to `text-black` (was `text-orange-200`, which was too light in some themes).
- **Batch trigger action bar** — text changed to `text-white` for consistency.

---

## 2026-06-10 — Per-user light / dark theme toggle

### Added
- **Theme toggle button** (☀️/🌙) in the navbar, visible to all users. Preference is stored
  in `localStorage` so each user's choice is independent — Ben can use light while Martin
  stays dark. Choice persists across sessions and page reloads.
- **Flash-free**: a tiny inline `<script>` in `<head>` applies the saved theme class before
  hydration, so there's no dark→light flash on load.

### Changed
- **CSS variable colour system** — brand surface colours (`brand-black`, `brand-surface`,
  `brand-surface2`, `brand-dim`) now resolve from CSS custom properties, switching between
  dark and light values when the `.light` class is on `<html>`.
- **`th` Tailwind colour** added — maps to `rgb(var(--th-rgb) / <alpha-value>)`. In dark mode
  `--th-rgb` is white; in light mode it's slate-900. All previous `text-white/XX`,
  `border-white/XX`, `bg-white/XX`, `divide-white/XX` classes replaced with `text-th/XX` etc.
  via a single codebase-wide sweep (~600 class instances across ~40 files).
- Hardcoded dark hex backgrounds (`#111`, `#1a1a2e`, `#1a1a1a`) replaced with
  `var(--bg-tooltip)` / `var(--bg-float)` CSS variables that invert in light mode.
- Post Production logo uses `.logo-mono` CSS class (white in dark, black in light) instead of
  hardcoded `brightness-0 invert`.
- Scrollbar colours use CSS variables, switching to a light grey track/thumb in light mode.

---

## 2026-06-09 — Remove Drive links from lists + button polish

### Changed
- **Drive ↗ link removed** from queue rows and dashboard draft rows — it's accessible
  on the project detail page so duplicating it on every list row is noise.
- **OnHoldButton (inactive state)** — brighter: `bg-white/7 border-white/25 text-white/60`
  (was nearly invisible at `border-white/15 text-white/40`).
- **UndoButton** — same brighter neutral style (`bg-white/7 border-white/25 text-white/60`)
  plus `whitespace-nowrap` so it stays single-line height.
- **MarkDoneButton** — added `whitespace-nowrap` so "✓ Done" never wraps, keeping it
  the same height as the Hold button beside it.

---

## 2026-06-05 — Client Review: delivery time + overlap fix

### Fixed
- **Button overflow on Client Review rows** — Complete + Start Revision + Undo totals ~250px,
  overflowing the previous `w-52` (208px) actions column. Bumped to `w-64` (256px) across
  all dashboard row types (InProgressRow, CompletedRow, DashGroupHeader items badge) for
  consistent alignment.

### Changed
- **"Due was" → "Due"** label on Client Review date block.
- **Delivered now shows time in Singapore time** — uses `version.updated_at` (the timestamp
  of when the Done button was clicked) formatted as e.g. "Thu 4 Jun 2:30pm". A new
  `formatTimeSGT` utility wraps `toLocaleTimeString` with `timeZone: 'Asia/Singapore'`.

---

## 2026-06-05 — Client Review: delivered + due dates

### Added
- **Client Review rows now show "Delivered" and "Due was" dates** in the countdown
  column (which was previously empty for in-review items). Uses the same column
  position as the countdown pill on in-progress rows so the layout stays consistent.
  - **Delivered** = `done_date` of the current version (when the editor sent it to the client)
  - **Due was** = `due_date` (the original editor deadline — useful for seeing if it shipped on time)
  Both shown as compact two-line labels using `formatDateShort` (e.g. "Mon 5 Jun").

---

## 2026-06-05 — Wider layout + legible IDs

### Changed
- **`max-w-7xl` (1280px)** across queue, dashboard, and navbar (was `max-w-5xl` / 1024px).
  Gives meaningfully more real estate on 14"+ MBPs at HiDPI resolutions.
- **ID column legibility** — all `<code>` ID cells (internal IDs and job IDs in queue,
  dashboard, and draft list) bumped from `text-xs text-white/20` to `text-sm text-white/45`:
  one step larger, more than doubled the brightness.

---

## 2026-06-05 — Dashboard alignment + expanded group shading

### Fixed
- **Client name and countdown aligned on the dashboard** (In Progress, Client Review,
  Completed sections) using the same 4-column approach as the queue fix:
  - `InProgressRow`: `w-3` spacer + `[client flex-1]` + `[countdown shrink-0]` + `[actions w-52]`.
    The `w-52` actions column (wider than queue's `w-36`) accommodates the wider Client Review
    button set (Complete + Start Revision + Undo for admin).
  - `CompletedRow`: same spacer + `w-52` Undo column.
  - `DashGroupHeader`: matches with `[code w-20]` + `[client flex-1]` + `[countdown shrink-0]`
    + `[items badge w-52]`.

### Added
- **Expanded JobGroup child rows now have a subtle lighter background** (`bg-white/[0.035]`)
  so it's visually obvious which rows belong to the expanded group (e.g. all FB11E deliverables
  share the same tinted band).

---

## 2026-06-05 — Queue row alignment fix

### Fixed
- **Client name and countdown pill now perfectly aligned across all row types.**
  Single rows (e.g. Revision rows) had no chevron, so the client name and "Xd left"
  pill were offset from collapsed group rows (which have a `w-3` chevron + gap before
  their content). Fixed by:
  - Adding an invisible `w-3` spacer to single `QueueRow`s so the content grid matches
    the `JobGroup` button structure exactly.
  - Splitting the right side into two separate fixed columns — a `shrink-0` countdown
    column and a `w-36 justify-end` actions column — instead of a single variable-width
    bucket. This ensures the "Xd left" pill lands at the same x position regardless of
    whether Hold + Done buttons or just an items badge follows it.
  - Matching `QueueRow` padding to `JobGroup` (`px-3 sm:px-5`, `py-3.5 sm:py-4`).

---

## 2026-06 — Collapse same-Job-ID rows in lists

### Added
- In the **queue** and the **dashboard** In Progress / Client Review / Completed
  sections, deliverables sharing a Job ID (episode + H1/H2/H3) now **collapse to
  one summary row** ("Episode + 3 Highlights", shared client/deadline). Collapsed
  by default; click to expand the individual rows and act on each.
  `groupByJob` + `summarizeDeliverables` helpers, shared `JobGroup` component.
  (Draft section keeps its batch-select UI unchanged.)

---

## 2026-06 — Copy folder name + output number selector

### Added
- **Copy folder name** button on the project detail page (next to Copy filename):
  Job ID + time + date, no E/H suffix or version — e.g. `F713C 11am 5th November
  2025`. `buildFolderName` helper.
- **Add Output**: pick the episode/highlight number (1–10) with a live ID preview.

---

## 2026-06 — Public holidays (closed days) in deadline calc

### Added
- **`holidays` table** + **Admin → Closed Days** tab to add/remove the dates the
  studio is closed (grouped by year, optional name).
- Working-day deadline calculations now **skip closed days** as well as weekends
  (`addWorkDays` takes an optional holiday set). Applied across trigger, batch
  trigger, revision, version edit, and the Frame.io Needs-Review revision.
- `lib/holidays.ts` `getHolidayDates()` (service-role read); `/api/admin/holidays`
  GET/POST/DELETE (admin-gated).

---

## 2026-06 — Manual Job ID on new project

### Added
- Optional **Job ID** field on the New Project form. Enter an existing 5-hex
  code (A–F prefix) for in-progress projects, or leave blank to auto-generate.
  Internal IDs (E / H suffixes) are built off it as normal. Validated client +
  server side.

---

## 2026-06 — Exclude clients from reminder emails

### Added
- **`exclude_from_reminders`** flag on clients. Admin → Clients add/edit forms
  have an "Exclude from reminder emails" checkbox; flagged clients show a
  "No reminders" badge. The review-chase cron skips them entirely (no send,
  no stage change). Existing clients can be flagged in bulk via SQL.

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
