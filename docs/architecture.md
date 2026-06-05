# Poddster Post-Production Tracker — Architecture

> Last updated: June 2026 · see `docs/changelog.md` for the running change log

---

## What It Does

A web app for the Poddster team (Singapore podcast studio) to manage the post-production pipeline from recording shoot to client delivery. It replaces a Google Sheets workflow with a proper tracked system, giving producers a dashboard of every project and editors a sorted queue of their active work.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth — Google OAuth (SSO) |
| Hosting | Vercel |
| External data in | Google Calendar API (client-side, read-only); Frame.io v4 webhooks |
| External data out | Email via Google Apps Script web app (GmailApp, sgproduction@poddster.com); Frame.io filename helper |
| Frame.io auth | Adobe IMS OAuth (refresh-token → access-token) for v4 API |
| Legacy ingest | Google Apps Script → `/api/bookings/ingest` |

---

## High-Level Flow

```
Google Calendar                     Google Apps Script (GAS)
     │                                        │
     │  Browse & pick booking                 │  Automated sync
     ▼                                        ▼
New Project Modal          POST /api/bookings/ingest
  (manual form)              (x-api-key authenticated)
          │                           │
          └──────────┬────────────────┘
                     ▼
              projects table
           (status: pending_trigger)
                     │
               Admin triggers
                     ▼
              versions table
         (status: active, V1 due date set)
                     │
            Editor edits footage
                     │
               Mark as Done
                     ▼
         status: in_client_review
                     │
         ┌───────────┴───────────┐
         │                       │
    Complete                Start Revision
         │                       │
   status: complete         versions table
                            (V2 created, status: in_revision)
                                 │
                           (cycle repeats)
```

---

## Database Schema

### `projects`

The core table. One row per deliverable (episodes and highlights are separate rows, even if from the same shoot).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Supabase auto |
| `job_id` | text | 5-char hex (e.g. `A3F2B`). All rows from the same shoot share this. |
| `internal_id` | text (unique) | `{job_id}E1`, `{job_id}H1`, `{job_id}H2` etc. |
| `order_id` | text | From booking system (optional) |
| `client_name` | text | Company/show name |
| `client_code` | text | Short code, e.g. `PODS` |
| `assigned_editor` | text | Email — the **Producer** (drives queue, filters, emails) |
| `editor` | text | Email — the actual **Editor** (display only; defaults to producer) |
| `assigned_producer` | text | Legacy column, unused |
| `type` | enum | `episode` or `highlight` |
| `highlight_number` | int | 1, 2, 3… for highlight rows; null for episodes |
| `filming_date` | date | `YYYY-MM-DD` |
| `filming_time` | text | e.g. `10:00 - 11:00` |
| `setup` | text | Room name (e.g. `nest`) |
| `drive_link` | text | Google Drive folder URL |
| `services` | text | Raw services string from booking |
| `addons` | text | Raw addons string from booking |
| `notes` | text | Free text |
| `status` | enum | See status lifecycle below |
| `current_version` | int | Which version is active (1, 2, 3…) |
| `on_hold` | boolean | Timer frozen |
| `hold_date` | date | When hold was placed (for deadline extension on resume) |
| `hold_reason` | text | Optional note captured when placing a hold |
| `previous_status` | enum | Status before the last transition (for Undo) |
| `source` | enum | `manual`, `calendar`, `force_push` |
| `frame_asset_id` | text | Future Frame.io integration |
| `created_at` / `updated_at` | timestamptz | Auto-managed |

### `versions`

One row per version of each project (V1 First Cut, V2, V3…).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `project_id` | uuid (FK) | → `projects.id` |
| `version_number` | int | 1, 2, 3… |
| `label` | text | `First Cut`, `V2`, `V3`… |
| `submitted_date` | date | When the brief/footage was handed over |
| `due_date` | date | Deadline for this version |
| `done_date` | date | When editor marked it delivered |
| `notes` | text | Version-level notes |

### `clients`

Lookup table for the client quick-fill dropdown and the client portal.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | Display name, includes code in brackets e.g. `Adam Fayed (4AF)` |
| `code` | text | Auto-extracted from the name's parentheses on save |
| `first_name` / `last_name` | text | Contact name |
| `email`, `email_2`, `email_3` | text | Up to 3 contact emails (portal + completion mail) |
| `portal_token` | uuid | Per-client key for the public `/client/[token]` portal |
| `exclude_from_reminders` | boolean | If true, the review-chase cron skips this client |

### `user_profiles`

Extends Supabase Auth users with app-specific data.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (FK) | → `auth.users.id` |
| `email` | text | |
| `display_name` | text | Shown in UI instead of email |
| `role` | enum | `admin` or `producer` |

---

## Project Status Lifecycle

```
                    ┌─────────────────────┐
                    │   pending_trigger   │  ← Created here (manual or GAS ingest)
                    └──────────┬──────────┘
                               │  Admin/producer triggers
                               │  (sets submitted_date + due_date on V1)
                               ▼
                    ┌─────────────────────┐
                    │       active        │  ← Editor working on it
                    └──────────┬──────────┘
                               │  Mark Done
                               ▼
                    ┌─────────────────────┐
                    │  in_client_review   │  ← Waiting for client feedback
                    └────────┬─────┬──────┘
                             │     │
               Complete ─────┘     └───── Start Revision
                    │                           │  (creates V2, resets deadline)
                    ▼                           ▼
           ┌──────────────┐          ┌──────────────────┐
           │   complete   │          │   in_revision    │  ← Editor on V2+
           └──────────────┘          └────────┬─────────┘
                                              │  Mark Done → in_client_review
                                              │  (cycle repeats)

     Any non-complete status → cancelled  (admin only)
     Any status → undo (reverts to previous_status)
     active / in_revision → on hold (timer frozen, resumes from where it left off)
     active / in_revision → Back to Draft (clears versions → pending_trigger, admin)
     pending_trigger is labelled "Draft" in the UI
```

---

## Deadline Calculation

| Trigger | Working days allowed |
|---|---|
| V1 (First Cut) | 5 working days from submitted_date |
| V2+ (Revisions) | 3 working days from submitted_date |

Weekends **and studio closed days** (the `holidays` table, managed in Admin →
Closed Days) are skipped. `addWorkDays` takes an optional holiday set.

**Admin backdating**: When triggering, admin can set `submittedDate` in the past — the deadline is calculated from that date, not today. Useful for catching up missed triggers.

**On Hold**:
1. Hold placed → `on_hold = true`, `hold_date = today`
2. Hold lifted → `daysPaused = today − hold_date` (calendar days)
3. `due_date` extended by `daysPaused` days
4. `on_hold = false`, `hold_date = null`

---

## Pages

| Route | Who | What |
|---|---|---|
| `/` | All | Redirects to `/dashboard` |
| `/login` | Public | Google OAuth sign-in |
| `/dashboard` | All | Four **collapsible** sections: Draft, In Progress, Client Review, Completed (last 30 days). Search box + multi-select **client** filter + admin **producer** filter; overdue flagging; batch-trigger checkboxes on Draft. Admin sees all; producer sees own. |
| `/queue` | All | Flat urgency-sorted list of active/in_revision work. Filters (one row): due window (Today/+1/+2/All working days), multi-select client, admin producer. Admin sees all; editor sees own. |
| `/projects/[id]` | All | Full project detail: meta, version timeline, action buttons. Admin gets Edit (incl. version selector), Cancel, Due Date editor, Copy client link. |
| `/admin` | Admin only | Tabs: **Team** (role management) and **Clients** (search, add at top, emails ×3, names, portal link). |
| `/client/[token]` | Public | Login-free client portal — all of a client's projects grouped by session, statuses + version timelines. Served via service-role read; whitelisted in middleware. |

---

## API Routes

All routes require a valid Supabase session cookie except `/api/bookings/ingest` (uses `x-api-key` header).

### Projects — lifecycle

| Method | Route | What it does |
|---|---|---|
| `POST` | `/api/projects/create` | Create one or more project rows from the New Project form. Generates Job ID. Accepts `editor` and `starting_version`. |
| `POST` | `/api/projects/[id]/trigger` | Move into the pipeline, create the active version row with deadline. V1 → `active`; V2+ → `in_revision` (with empty placeholders for earlier versions). Accepts optional `submittedDate`. Sends the editor assignment email (awaited). |
| `POST` | `/api/projects/trigger-batch` | Trigger several pending projects (must share one Job ID) at once; sends **one** consolidated assignment email listing all deliverables. |
| `PATCH` | `/api/projects/[id]` | Edit project metadata (client, producer/editor, dates, drive link, notes). Code auto-derived from name. **Version change**: reshapes version rows, flips First Cut ↔ Revision, recalculates the deadline. Admin only. |
| `POST` | `/api/projects/[id]/cancel` | Set status to `cancelled`. Admin only. |
| `POST` | `/api/projects/[id]/hold` | Freeze timer (`on_hold = true`, `hold_date = today`, optional `hold_reason`). |
| `POST` | `/api/projects/[id]/resume` | Unfreeze, extend due_date by days paused (timer continues from where it left off). |
| `POST` | `/api/projects/[id]/draft` | Move back to `pending_trigger` (Draft): clears version rows + hold state. Admin only. |
| `POST` | `/api/projects/[id]/complete` | Move to `complete`, save `previous_status`. |
| `POST` | `/api/projects/[id]/undo` | Revert to `previous_status`. |
| `POST` | `/api/projects/[id]/revision` | Create next version row, set status to `in_revision`. |
| `PATCH` | `/api/projects/[id]/version/done` | Set `done_date` on current version, move to `in_client_review`. |
| `PATCH` | `/api/projects/[id]/version/due-date` | Update due_date on a specific version. Admin only. |

### Projects — other

| Method | Route | What it does |
|---|---|---|
| `POST` | `/api/projects/add-output` | Register a Frame.io output asset against a Job ID (future). |

### Frame.io webhook

| Method | Route | What it does |
|---|---|---|
| `POST` | `/api/webhooks/frameio` | Handles `file.ready` (delivered cut → Client Review, sets `done_date`), and status changes via `metadata.value.updated` / `file.updated`: **Needs Review** → start next revision (back to In Progress); **Approved** → Complete. Resolves the project by parsing the Internal ID from the filename, reads the built-in "Status" field via `include=metadata`. Auth: Adobe IMS OAuth → Frame.io v4 API. **Two webhooks** point here: one subscribed to `file.ready`, one to `metadata.value.updated` + `file.updated` (v4 can't PATCH a webhook's events). |

### Cron (GAS-triggered)

| Method | Route | What it does |
|---|---|---|
| `GET/POST` | `/api/cron/review-chase` | Daily: emails clients sitting in Client Review for 7 days (reminder) / 14 days (final notice). Reads only our tables (days since current version `done_date`). One email per client per stage, sent once via `review_chase_stage`, **CC'ing the assigned producer(s)**. Auth: `?key=<INGEST_API_KEY>`. Safe by default (dry-run); `REVIEW_CHASE_LIVE=true` to send, `?testTo=`/`?onlyClient=`/`?days=` for previewing. Fired by a GAS daily time-trigger. |

### Ingest (GAS)

| Method | Route | What it does |
|---|---|---|
| `POST` | `/api/bookings/ingest` | Upsert a project row from GAS. Authenticated with `INGEST_API_KEY` env var. Matches on `internal_id`. |

### Admin

| Method | Route | What it does |
|---|---|---|
| `GET/POST/DELETE` | `/api/admin/clients` | CRUD for the clients lookup table. |
| `GET/PATCH` | `/api/admin/users` | List users / update role. |

---

## Key Components

### Shared (`/components`)

| Component | Purpose |
|---|---|
| `Navbar` | Top nav with page links and sign-out. Highlights active route. |
| `StatusBadge` | Coloured pill for each project status. |
| `CountdownTimer` | Shows `Xd left` / `Due today` / `Xd overdue` badge + full date. Handles on-hold frozen display. Green → amber (≤2 days) → red (overdue). |
| `OnHoldButton` | Ghost when idle; solid amber when on hold. Admin only. |
| `CompleteButton` | Green "✓ Complete" for in_client_review projects. |
| `UndoButton` | Ghost "↩ Undo" to revert the last status change. |
| `NewProjectModal` | Full form: client, filming details, editor assignment, episode/highlight counts. Includes `CalendarPicker` for pre-fill. |
| `CalendarPicker` | Fetches events from 3 Google Calendars using the user's OAuth `provider_token`. Select a booking to pre-fill the form. |
| `SignOutButton` | Calls `supabase.auth.signOut()` then redirects to `/login`. |

### Dashboard (`/app/dashboard`)

| Component | Purpose |
|---|---|
| `TriggerButton` | Non-admin: instant trigger. Admin: expands inline with date picker for backdating. |
| `StartRevisionButton` | Creates next version row and sets `in_revision`. |
| `NewProjectButton` | Opens `NewProjectModal`. |

### Project detail (`/app/projects/[id]`)

| Component | Purpose |
|---|---|
| `EditProjectModal` | Admin modal to edit all project metadata. Client quick-fill dropdown auto-populates name + code. |
| `CancelButton` | Inline confirmation before calling `/api/.../cancel`. Redirects to dashboard. |
| `DueDateEditor` | Inline date picker on version rows. Click due date → edit → save. Admin only, non-delivered versions only. |
| `CopyFilenameButton` | Generates the Frame.io output filename and copies to clipboard. Tooltip previews the filename on hover. |
| `AddOutputButton` | Register a Frame.io asset (future). |

### Queue (`/app/queue`)

| Component | Purpose |
|---|---|
| `MarkDoneButton` | Sets `done_date` on current version and moves to `in_client_review`. |

---

## Auth & Roles

```
User visits any page
        │
   middleware.ts checks Supabase session cookie
        │
   Not logged in → redirect /login
        │
   /login → Google OAuth (with calendar.readonly scope)
        │
   Supabase stores session + provider_token (Google access token)
        │
   getUserProfile() checks user_profiles table for role
        │
   ┌────┴────┐
admin      producer
  │              │
Sees all       Sees own
projects       projects only
Can edit/      No admin
cancel/hold    controls
```

The `provider_token` (Google OAuth access token) is used client-side by `CalendarPicker` to call the Google Calendar API directly. It expires after ~1 hour — the UI shows a friendly re-login prompt if it's stale.

---

## ID System

```
Job ID:       A3F2B          (random 5-char hex, prefix A-F)
                │
                ├── A3F2BE1  ← Episode 1     (type: episode)
                ├── A3F2BE2  ← Episode 2     (type: episode, if multi-episode shoot)
                ├── A3F2BH1  ← Highlight 1   (type: highlight, highlight_number: 1)
                ├── A3F2BH2  ← Highlight 2
                └── A3F2BH3  ← Highlight 3
```

All rows sharing a Job ID come from the same shoot. The Internal ID is the unique identifier for each individual deliverable and is used as the base for the Frame.io output filename.

---

## Frame.io Output Filename Format

```
{internal_id}  {start time}  {date}  - V{version}

Example:
  E82F2E  2pm  7th May 2026  - V1

Components:
  E82F2E          ← internal_id from project
  2pm             ← filming_time start, 12-hr, no :00 if on the hour
  7th May 2026    ← filming_date with ordinal suffix, no weekday
  V1              ← current_version (editor adjusts if needed before uploading)
```

Generated by `buildOutputFilename()` in `lib/utils.ts`. The "Copy filename" button on the project detail page puts this on the clipboard in one click.

---

## Calendar Integration

```
CalendarPicker (client component)
        │
        │  GET https://www.googleapis.com/calendar/v3/calendars/{id}/events
        │  Authorization: Bearer {supabase session provider_token}
        │
        │  Three calendars polled in parallel:
        │    singapore@poddster.com
        │    c_[nest calendar id]@group.calendar.google.com
        │    c_[river calendar id]@group.calendar.google.com
        │
        │  Date window: user-selectable (7d / 1m / 3m / 6m / 1yr back) + 2 weeks ahead
        │
        ▼
   parseCalendarEvent() in lib/calendarParser.ts
        │
        │  Extracts:
        │    filmingDate / filmingHour / filmingMins  (from event start)
        │    duration                                  (end − start, rounded 0.5hr)
        │    episodeCount  (detects "Professional Edit" / "Standard Episode Edit")
        │    highlightCount  (parses "N Standard Highlights (M)" → N×M)
        │    notes  (extracts "Notes: …" line)
        │
        ▼
   NewProjectModal  (fields pre-filled, all editable)
```

Client name and code are always entered manually — bookings contain the booker's personal name/email, not the company account.

---

## GAS Ingest (Legacy / Automation)

The Google Apps Script (`Code.gs`) syncs bookings from Google Sheets into this app:

```
Google Apps Script
        │
        │  POST /api/bookings/ingest
        │  Headers: x-api-key: {INGEST_API_KEY}
        │  Body: IngestPayload { jobId, internalId, orderId, clientName, … }
        │
        ▼
   Upsert on internal_id  →  projects table
   (creates new or updates existing, preserves status if already triggered)
```

This is the automated path for bookings that flow through the GAS pipeline. Manual creation via the web app is the primary path for now.

---

## Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Bypasses RLS for ingest, webhook, client portal |
| `INGEST_API_KEY` | Server only | Shared secret for GAS → ingest endpoint |
| `NEXT_PUBLIC_APP_URL` | Server | Base URL for links in emails |
| `ADOBE_CLIENT_SECRET` | Server only | Adobe IMS OAuth (Frame.io v4) |
| `FRAMEIO_REFRESH_TOKEN` | Server only | Adobe IMS refresh token (Frame.io v4) — see note below |
| `GAS_EMAIL_WEBHOOK_URL` | Server only | Google Apps Script web-app URL that sends mail via GmailApp |
| `GAS_EMAIL_SECRET` | Server only | Shared secret the GAS relay checks before sending |

> **Frame.io token caveat:** the refresh token is shared with the GAS Frame
> audit tool, and Adobe IMS can rotate it — when it does, the Vercel copy goes
> stale (`access_denied`) and must be re-synced. A durable fix (GAS writes the
> live access token to Supabase; the webhook reads it) is planned.

---

## What's Still To Build

| Feature | Notes |
|---|---|
| GAS ingest script | `Code.gs` ingest path exists; full 5-phase calendar sync still to wire up |
| Durable Frame.io token | GAS → Supabase token bridge so `access_denied` stops recurring |
| Completion email to clients | Email all stored client addresses when a project completes (via the same GAS relay) |
| Stats / reporting | Looker Studio connected to Supabase Postgres (preferred over in-app) |
| Public holidays | Deadline calc currently skips weekends only |

### Done since the May baseline
Frame.io webhook (file.ready + Approved/Needs Review automation), dashboard &
queue search/filters, mobile layout pass, Vercel deployment, client portal,
editor field, editor assignment emails, client emails/names, version editing.
