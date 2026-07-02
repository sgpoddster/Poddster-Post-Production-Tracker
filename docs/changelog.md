# Changelog — Poddster Post-Production Tracker

All notable changes to the web app. Newest first. Dates are when the work shipped.

---

## 2026-07-02 — PCM: SSD vs NAS audit tool

### Added
- **`docs/nas_files/audit_ssd_vs_nas.py`** — one-shot audit script that connects to all ATEM SSDs via FTP and compares every recording folder (no date filter) against `state.json` and the NAS backup directory. Reports: `✗ MISSING` (on SSD but never discovered), `⚠ STUCK` (in a non-done state like failed/uploading), `✓ DONE` (archived/split), `~ NAS ONLY` (in state.json but folder gone from SSD). Supports `--studio` and `--missing-only` flags.
- Run: `source /volume1/PCM/config/env.sh && python3 /volume1/PCM/app/audit_ssd_vs_nas.py`

---

## 2026-07-02 — Fix: re-triggered projects missing due date

### Fixed
- **`app/api/projects/trigger-batch/route.ts`** and **`app/api/projects/[id]/trigger/route.ts`** — version rows are now `upsert`ed instead of `insert`ed on trigger. Previously, if a project was reverted from V2+ to draft (`undo-to-draft` only removes the current version row, leaving V1 placeholder intact), re-triggering would silently fail the duplicate-key insert and leave the project with no due date. Upsert with `onConflict: 'project_id,version_number'` ensures the active version's `submitted_date` and `due_date` are always written. Placeholder rows use `ignoreDuplicates: true` to avoid overwriting already-completed earlier versions. Error logging added to the batch route's version upsert.

---

## 2026-07-02 — Frame.io folder creation: rotating token fix

### Fixed
- **`lib/frameio-folders.ts`** — `getAccessToken()` now reads from `app_config` Supabase table (same as the webhook route) and writes the new refresh token back after each exchange. Previously used the static `FRAMEIO_REFRESH_TOKEN` env var which goes stale as soon as any other route rotates the token.

---

## 2026-07-02 — PCM: Per-session NAS+Drive split

### Changed
- **`docs/nas_files/upload_drive.py`** — booking date ±1-day fallback now only fires when session end time is near midnight (≤03:00 or ≥21:00 SGT), preventing false matches against tomorrow's bookings for daytime sessions. Sessions within a single ATEM folder now each get their own permanent NAS folder (`Studio 2 43 — 2026-07-01 14:00 — Janine Stein/`) and their own DB row with individual drive_url, nas_path, file_count, and total_bytes. The original staging folder is deleted after all sessions are moved. "Unknown" client label changed to "Uncategorised".
- **`docs/nas_files/discover.py`** — staging folders are now marked `split` (not `archived`) after upload. `split` is treated as a DONE state. File-count new-session detection covers both `archived` and `split`. Manifest file_count is now read *before* the upload subprocess (since the staging folder is deleted during upload).
- **`app/pcm/page.tsx`** — excludes `state = 'split'` from initial recordings query so staging placeholder rows don't appear in the dashboard.
- **`app/pcm/PCMDashboard.tsx`** — realtime handler ignores inserts with `state = 'split'`; removes a row from state if it transitions to `split` via update.

---

## 2026-07-02 — PCM: Drive link backfill tool

### Added
- **`app/api/pcm/backfill-links/route.ts`** — new GET endpoint (PCM-secret protected) returning all `state=archived` recordings where `drive_url IS NULL`. Used by the NAS backfill script.
- **`docs/nas_files/backfill_links.py`** — one-shot NAS script that resolves missing Drive folder URLs via rclone and posts them back to the DB. Run with `source /volume1/PCM/config/env.sh && python3 /volume1/PCM/app/backfill_links.py`. Supports `--dry-run`.

---

## 2026-07-02 — PCM: Recorded column in Completed + stale lock fix

### Added
- **`app/pcm/PCMDashboard.tsx`** — "Recorded" column in the Completed table showing `copy_started_at` (when the ATEM SSD copy began, i.e. approximate session time).

### Fixed
- **`docs/nas_files/discover.py`** — stale lock file detection: removes `discover.lock` if the recorded PID is no longer running, preventing silent blocking of overnight scheduled runs on Synology DSM.

### Fixed
- **`docs/nas_files/discover.py`** — stale lock file detection: if `discover.lock` exists but the recorded PID is no longer running, the lock is removed before attempting to acquire it. Prevents overnight scheduled runs being silently blocked when a previous run exited uncleanly without releasing the flock (observed on Synology DSM kernel).

### Changed
- **`app/api/cron/footage-ingest/route.ts`** — CalendarPicker (Import from Calendar) now filters to PP-only bookings; footage cron ingests all bookings including PP sessions.

---

## 2026-07-01 — PCM dashboard: date/time in Updated column

### Changed
- **`app/pcm/PCMDashboard.tsx`** — In Progress "Updated" column now shows full date + time (e.g. "30 Jun, 22:46") instead of relative "Xh ago", matching the Completed section style.

---

## 2026-06-30 — Footage ingest: include PP bookings

### Changed
- **`app/api/cron/footage-ingest/route.ts`** — removed the `hasPP` skip. All calendar recordings (including sessions with post-production services) are now ingested into `footage_deliveries`. PP bookings are still counted separately in the cron response for visibility. Footage can now be delivered to any client regardless of whether they also have editing work.

---

## 2026-06-30 — PCM live transfer progress on dashboard

### Added
- **Live transfer progress** — both the ATEM→NAS copy phase and the NAS→Drive upload phase now report real-time progress to the dashboard every 10 seconds.
- **Progress bar on dashboard** — active `copying` rows show an animated indeterminate bar + bytes copied + speed. Active `uploading` rows show a percentage progress bar (bytes_transferred / total_bytes) + speed + ETA countdown.
- **`supabase/pcm_progress_columns.sql`** — migration adding `bytes_transferred bigint`, `transfer_speed text`, `eta_seconds integer` columns to `pcm_recordings`.
- **`app/api/pcm/progress/route.ts`** — new `POST /api/pcm/progress` endpoint: updates only the three progress columns, does not change state or set timestamps.
- **`TransferProgress` component** — in `PCMDashboard.tsx`. Shows in both the studio cards (active recording) and the All Recordings table.

### Changed
- **`docs/nas_files/copy_one.py`** — starts a background `_monitor_copy` thread before calling `copy_recording()`. Thread polls local dir bytes every 10s, computes speed from the delta, and POSTs to `/api/pcm/progress`. Thread is cleanly stopped in a `finally` block.
- **`docs/nas_files/upload_drive.py`** — replaces the `rclone("copy", ...)` call with `rclone_with_progress()`, which runs rclone with `--use-json-log --log-level INFO --stats 10s` and streams stdout line-by-line. Each stats log entry is parsed for bytes transferred, speed, and ETA (parsed from rclone's "Transferred: X / Y, N%, speed, ETA" format), then POSTed to `/api/pcm/progress`.

---

## 2026-06-30 — Frame.io token rotation + modal scroll fix

### Fixed
- **Frame.io webhook token expiry** — Adobe IMS uses rotating refresh tokens: each exchange returns a new refresh token and invalidates the old one. The webhook now saves the new token back to Supabase (`app_config` table, key `adobe_refresh_token`) on every exchange, so the token stays permanently fresh without manual renewal. Requires a one-time seed of the token in Supabase (done).
- **New Project modal cut off at 100% zoom** — modal now caps at viewport height (`max-h-[calc(100vh-2rem)]`) with a scrollable form body and pinned header, so all fields are accessible at any zoom level.

### Added
- **`app_config` Supabase table** — key/value store for internal server-side config. Created with `key text primary key, value text, updated_at timestamptz`. No RLS (service-role-only access).

### Changed
- **`app/api/webhooks/frameio/route.ts`** — `getAdobeAccessToken()` now reads refresh token from `app_config` (falls back to `FRAMEIO_REFRESH_TOKEN` env var), exchanges it, and upserts the returned refresh token back to `app_config`. Also skips the Frame.io API call for `metadata.value.updated` events when `resource.name` is present in the webhook payload.
- **`components/NewProjectModal.tsx`** — outer card is `flex flex-col max-h-[calc(100vh-2rem)]`; header has `shrink-0`; form has `overflow-y-auto`.

---

## 2026-06-30 — PCM parallel scanning + booking-named Drive folders + min_date filter

### Added
- **Parallel studio scanning** — discover.py now scans all enabled studios simultaneously using one thread per studio (Python stdlib `threading`). All 4 FTP connections run at once; state writes are protected by a lock.
- **Booking-named Drive folders** — uploaded folders are renamed to `Studio 4 CORE — 2026-06-30 10:00 — Acme Podcast` using the `footage_deliveries` table to resolve client name. Matched by studio (via setup→studio mapping), date, and recording start time (earliest file mtime). Falls back to `Unknown` if no match.
- **`app/api/pcm/resolve-booking/route.ts`** — `GET /api/pcm/resolve-booking?studio=&date=&time=`. Queries `footage_deliveries` where `setup` is not null, matches the correct booking slot, returns `client_name` and `booking_time`.
- **`min_date` filter** — settings.json `"min_date": "YYYY-MM-DD"` skips recordings older than that date. Prevents backing up the entire SSD backlog on first run.

### Changed
- **`docs/nas_files/discover.py`** — refactored `main()` to spawn one thread per studio via `scan_studio()`. All state mutations use `_state_lock`. Log prefix changed from `[discover]` to `[Studio N]` per studio.
- **`docs/nas_files/upload_drive.py`** — resolves recording start time from earliest file mtime, calls `/api/pcm/resolve-booking`, builds named Drive folder path.

### Setup mapping
| Setup | Studio |
|-------|--------|
| Nest, Exec | Studio 1 |
| Iris, Club | Studio 2 |
| Nova | Studio 3 |
| Core | Studio 4 |

---

## 2026-06-29 — PCM upload window + SSD capacity bars

### Added
- **Upload window** — Drive uploads only run between `upload_window.start_hour` and `upload_window.end_hour` (default 00:00–08:00, set in `settings.json`). ATEM→NAS copy still happens immediately on discovery. Recordings sit as `copy_complete` on NAS outside the window and are uploaded automatically on the next scan inside it.
- **SSD capacity bars** — each studio card on the dashboard now shows a thin capacity bar + "X.X of Y GB" label. Data is probed via FTP `SITE AVAIL` (free bytes) and directory size sum (used bytes) on every discover run. Updates live via Supabase real-time.
- **`supabase/pcm_studio_stats.sql`** — new `pcm_studio_stats` table (one row per studio: used/free/total bytes + updated_at). Includes RLS policy and real-time publication.
- **`app/api/pcm/studio-status/route.ts`** — `POST /api/pcm/studio-status` endpoint, same secret auth as the recordings endpoint. Upserts SSD stats per studio.
- **`docs/nas_files/reporter.py`** — refactored: `_post(path, payload)` helper now shared so discover.py can POST to `/api/pcm/studio-status` without duplicating HTTP logic.

### Changed
- **`docs/nas_files/discover.py`** — `copy_complete` recordings are now checked against the upload window before triggering Drive upload. Outside the window they're skipped with a "deferred" log line and picked up on the next in-window scan.
- **`app/pcm/PCMDashboard.tsx`** — `SsdBar` component added; studio cards render capacity bar if data is available. Bar turns amber at 75% and red at 90%.
- **`app/pcm/page.tsx`** — loads `pcm_studio_stats` in parallel with recordings and passes to dashboard.

### SQL to run in Supabase
Run `supabase/pcm_studio_stats.sql` in the Supabase SQL editor.

### settings.json addition
Add to `/volume1/PCM/config/settings.json` on the NAS:
```json
"upload_window": { "start_hour": 0, "end_hour": 8 }
```

---

## 2026-06-29 — PCM gave_up state + retry count on dashboard

### Added
- **`supabase/pcm_recordings_v2_retry.sql`** — migration: adds `retry_count integer` column and extends the state check constraint to include `gave_up`.
- **`gave_up` state** — after 5 consecutive failures, a recording transitions from `failed` → `gave_up`. It stops auto-retrying and requires manual intervention. Distinct from `failed` (which auto-retries).

### Changed
- **`docs/nas_files/discover.py`** — `state.json` now stores `{status, retries}` dicts (migrates old string entries transparently). After each failure, `retries` increments. At `MAX_RETRIES = 5`, reports `gave_up` instead of `failed`.
- **`app/api/pcm/update/route.ts`** — accepts `retry_count` in request body and upserts it to the DB.
- **`app/pcm/PCMDashboard.tsx`**:
  - `gave_up` badge: dark red `bg-red-900/30`, label "Gave up · N×" with retry count
  - `failed` badge: shows retry count ("Failed · 2×") so you can see how many attempts have run
  - Separate alert banners: orange "will auto-retry" for `failed`, dark red "manual intervention required" for `gave_up`

### SQL to run in Supabase
Run `supabase/pcm_recordings_v2_retry.sql` in the Supabase SQL editor.

---

## 2026-06-29 — PCM disconnection resilience + auto-retry

### Changed
- **`docs/nas_files/discover.py`** — `failed` recordings are now automatically retried on the next discover run instead of being skipped permanently. When the ATEM SSD is disconnected mid-copy, the FTP drop marks the recording as `failed`; the next scheduled run detects this state and re-queues the copy. copy_one.py's per-file resume logic then skips already-verified files, so only the missing portion is re-copied.

### Integrity checks summary
| Mechanism | What it protects |
|-----------|-----------------|
| `.partial` temp files | Incomplete individual file downloads |
| Per-file size verification | Byte-level correctness of each copied file |
| Per-file resume (size check) | Skip already-good files when retrying |
| `.pcm_copy_complete` marker | Full folder only marked done after all files pass |
| rclone `--checksum` | Drive upload verified by checksum, not just size |
| Drive file count vs manifest | Confirms every file reached Drive before archiving |
| Auto-retry on `failed` state | Re-queues on next discover run after any interruption |

---

## 2026-06-29 — PCM live dashboard

### Changed
- **`app/pcm/page.tsx`** — now a thin server wrapper that loads initial data and passes it to the client component.
- **`app/pcm/PCMDashboard.tsx`** (new client component) — subscribes to Supabase real-time changes on `pcm_recordings`. Dashboard updates instantly when the NAS pushes a state change — no page refresh needed. Features:
  - Pulsing dot on `copying` and `uploading` states
  - Live elapsed timer on active transfers (re-renders every second)
  - "X transfers in progress" indicator in header
  - Active rows highlighted in table
  - Drive folder link once archived
  - Failure alert banner

### SQL to run in Supabase
Enable real-time on the pcm_recordings table:
```sql
alter publication supabase_realtime add table pcm_recordings;
```

---

## 2026-06-29 — PCM Google Drive upload pipeline

### Added
- **`docs/nas_files/install_rclone.sh`** — downloads rclone ARM64 binary to `/volume1/PCM/bin/rclone`. Run once on the NAS.
- **`docs/nas_files/configure_rclone.sh`** — writes rclone config pointing at Google service account JSON. Run once after placing `service_account.json` in `/volume1/PCM/config/`.
- **`docs/nas_files/upload_drive.py`** — upload worker. Reads manifest for expected file count, rclone-copies to `ATEM Backups/{Studio}/{Recording}` on Drive, verifies file count, reports `uploading` → `archived` (with Drive URL), then deletes NAS copy. Pass `--no-cleanup` to keep NAS copy.
- **`docs/nas_files/discover.py`** — updated to chain copy → upload automatically. After a successful copy, kicks off `upload_drive.py`. If `upload_drive.py` doesn't exist yet, skips gracefully.

### Flow
```
ATEM SSD → (copy_one.py) → NAS → (upload_drive.py) → Google Drive → verify → delete NAS copy
```
Each step reports state to the dashboard: discovered → copying → copy_complete → uploading → archived

---

## 2026-06-29 — PCM NAS workers + nav link

### Added
- **`docs/nas_files/reporter.py`** — stdlib-only reporter (no pip needed). Drop at `/volume1/PCM/app/core/reporter.py` on the NAS.
- **`docs/nas_files/copy_one.py`** — updated copy_one that reports `copying` before and `copy_complete` (with file count + bytes) after each copy. Drop at `/volume1/PCM/app/copy_one.py`.
- **`docs/nas_files/discover.py`** — discovery worker. Scans all enabled ATEMs, detects new recording folders older than `min_age_minutes`, reports `discovered`, then kicks off `copy_one.py` automatically. Drop at `/volume1/PCM/app/discover.py`. Schedule via Synology Task Scheduler every 15 mins.
- **Navbar** — added "Backup" link to `/pcm` for admin users (desktop + mobile nav).

---

## 2026-06-29 — PCM (ATEM Backup) dashboard

### Added
- **`supabase/pcm_recordings.sql`** — new `pcm_recordings` table tracking ATEM recording state per studio (discovered → copying → copy_complete → uploading → archived | failed). Includes timestamps for each state transition, file count, total bytes, error field, NAS path, and Drive URL.
- **`app/api/pcm/update/route.ts`** — `POST /api/pcm/update` endpoint. Authenticated via `x-pcm-secret` header (shared secret in `PCM_SECRET` env var). Uses service role to upsert recording state. Called by PCM Python scripts on the Synology NAS.
- **`app/pcm/page.tsx`** — PCM dashboard page at `/pcm`. Shows per-studio status cards (latest recording + state) and a full recordings table with state badges, size, file count, and error column. Admin-only.
- **`docs/pcm_reporter.py`** — Python reporter module to deploy to `/volume1/PCM/app/core/reporter.py` on the NAS. Sends state updates to the Vercel API via outbound HTTPS. Reads `PCM_ENDPOINT` and `PCM_SECRET` from environment variables.

### Environment variables needed
- `PCM_SECRET` — add to Vercel (dashboard settings) and set the same value on the NAS.

---

## 2026-06-24 — Footage expiry emails, Drive deletion, and Poddster Cloud extend

### Added
- **`sendFootageReminderEmail()`** — email sent 2 days before `expires_at`: "your footage link expires in 2 days, please download". Includes Poddster Cloud upsell.
- **`sendFootageExpiredEmail()`** — email sent on `expires_at`: "your footage has been deleted" notice, with Poddster Cloud upsell for future sessions.
- **`GET /api/cron/footage-expiry`** — daily cron (1am UTC / 9am SGT) that finds rows due for reminder or expiry, sends the appropriate email, and trashes the Drive folder (via service account Drive API) once the expiry email has gone out. Drive link is cleared from the row after successful trash. Neither email fires twice — tracked by `reminder_sent_at` and `expired_sent_at` columns.
- **`POST /api/footage/[id]/extend`** — adds 6 months to `expires_at` from current expiry (or today if already expired). Resets `expired_sent_at` so the expiry cron won't re-fire incorrectly.
- **`FootageExtendButton` component** — "☁ +6mo" button shown next to "✓ Sent" on sent rows. Confirms before extending.
- **`vercel.json`** updated: added `footage-expiry` cron at `0 1 * * *`. Also corrected `footage-ingest` schedule from `0 9` (UTC) to `0 1` (1am UTC = 9am SGT).
- **SQL**: `reminder_sent_at timestamptz` and `expired_sent_at timestamptz` columns on `footage_deliveries`.

---

## 2026-06-24 — Footage delivery UX improvements

### Added
- **`FootageUndoButton` component** — "↺ Undo" resets a sent delivery back to unsent (clears `sent_at`, `expires_at`, `conversion_status`, `converted_link`). Admin only. Shown next to "✓ Sent" for testing.
- **`FootageShowMore` component** — "To Send" section shows 30 rows by default with "Show X more ↓" to reveal the rest (client-side, no page reload).
- **`GET /api/footage/[id]/undo`** — backing route for undo button.

### Changed
- Footage page hides future bookings by default (`filming_date <= today`), ordered most recent first.
- Drive link display changed from truncated URL to clean **"View Folder →"** anchor.
- Footage buttons updated to match deadline badge colours: Send 4K = white on blue, Convert & Send = black on green.

---

## 2026-06-24 — Footage: direct calendar ingest, email from booking, client name fix

### Changed
- **GAS footage ingest endpoint retired** (`POST /api/footage/ingest` now returns 410). Footage deliveries are sourced exclusively from the calendar cron.
- **Client name** on footage rows now always comes from the calendar event summary (the part before `|`), never from the clients table enrichment.
- **Email** on footage rows now parsed from the calendar event description (`User Email:` field) and stored directly on `footage_deliveries.email`. Send and callback routes use `delivery.email` directly — no longer look up the clients table.
- Cron now syncs all mutable fields (filming_date, filming_time, setup, client_name, email, order_id) when re-encountering an existing event — handles rescheduled bookings correctly.
- Cron skips events where the same `order_id + filming_date` already exists (prevents duplicates from legacy GAS rows).
- Cron removes stale rows within the scan window whose calendar event no longer exists (cancelled bookings). Already-sent rows are never deleted.
- **SQL**: `email text` column added to `footage_deliveries`.

---

## 2026-06-24 — Convert & Send (1080p transcoding via Cloud Run)

### Added
- **`conversion_status` / `converted_link`** columns on `footage_deliveries`.
- **`POST /api/footage/[id]/convert`** — admin triggers Cloud Run mp4-convertor v6. Sets `conversion_status = 'processing'`, fires Cloud Run with `waitUntil`, returns 202.
- **`POST /api/footage/convert-callback`** — Cloud Run POSTs back when done. Updates `conversion_status`, sends `sendFootage1080pEmail()`, sets `sent_at`/`expires_at`.
- **`sendFootage1080pEmail()`** in `lib/email.ts` — 1080p delivery email pointing to "Smaller File Size 1080p" subfolder.
- **`FootageConvertButton` component** — shows "Convert & Send" / "Converting…" / "✓ 1080p sent" / "↺ Retry 1080p" states.
- **Cloud Run mp4-convertor v6** (`/tmp/mp4-convertor-v6/main.py`) — creates "Smaller File Size 1080p" subfolder in session folder, copies audio files server-side (no download), transcodes MP4s to 1080p H.264 12 Mbps, POSTs callback with token.
- Requires Vercel env vars: `MP4_CONVERTOR_URL`, `MP4_CONVERTOR_TOKEN`.

### Changed
- **`FootageSendButton`** label changed to "✉ Send 4K".

---

## 2026-06-24 — Footage: service account calendar auth + has_post_production

### Added
- **`GOOGLE_SERVICE_ACCOUNT_JSON`** env var support in footage cron. Service account JWT auth replaces legacy OAuth refresh token approach. Falls back to `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` if env var absent.
- **`has_post_production boolean DEFAULT true`** column on `clients` table. Footage-only clients imported as `false`. Dashboard ClientFilter excludes `has_post_production = false` clients.
- 3rd Poddster calendar (`c_86fc...`) added to `CALENDAR_IDS` in footage cron.
- Singapore timezone fix for `filming_date` and `filming_time` using `toLocaleDateString('en-CA')` and `toLocaleTimeString('en-SG')`.

---

## 2026-06-22 — Footage ingest cron (hourly calendar scan)

### Added
- **`GET /api/cron/footage-ingest`** — hourly cron that scans all 3 Poddster calendars, filters out hasPP events (those containing edit/highlight/standard services), and upserts footage-only sessions into `footage_deliveries`. Uses the stable Google Calendar event ID as `job_id` so re-runs are idempotent and never overwrite saved drive_link or sent_at.
- **`vercel.json`** — schedules the cron at `0 * * * *` (top of every hour) via Vercel native cron. Auth uses Vercel's automatic `CRON_SECRET` header; also accepts `?key=INGEST_API_KEY` for manual test runs.
- Requires 3 new Vercel env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_REFRESH_TOKEN` (offline token for singapore@poddster.com with `calendar.readonly` scope).

---

## 2026-06-22 — Footage Delivery System (Phase 1)

### Added
- **`footage_deliveries` Supabase table** — one row per footage-only shoot (job_id unique). Columns: client info, filming details, drive_link, sent_at, expires_at, chase_stage.
- **`POST /api/footage/ingest`** — GAS posts non-hasPP bookings here (same x-api-key auth as `/api/bookings/ingest`). Upserts on job_id, never overwrites drive_link or sent_at.
- **`PATCH /api/footage/[id]`** — Admin saves the Google Drive footage link. Admin only.
- **`POST /api/footage/[id]/send`** — Fires the footage delivery email to the client, sets `sent_at` + `expires_at = sent_at + 7 days`. Looks up client emails from the shared `clients` table. Admin only.
- **`sendFootageDeliveryEmail()` in `lib/email.ts`** — Email using the standard Poddster template: greeting, Drive link CTA, 7-day policy, Poddster Cloud upsell, Google Review link, social media callout.
- **`/footage` page** — Admin-only. "To Send" and "Active" sections, sorted by filming date+time newest first. Each row shows client, date/time/setup, inline Drive link input, and Send button.
- **`FootageDriveLinkInput` component** — Inline URL input + Save button; updates via PATCH.
- **`FootageSendButton` component** — Confirm-then-send; disabled until Drive link is saved.
- **Navbar**: added "Footage" link (admin only) between Queue and Admin, on both desktop and mobile nav.
- **`FootageDelivery` type** added to `lib/types.ts`.

---

## 2026-06-18 — Admin button: Backfill Frame.io folder links

### Added
- **"Backfill Frame.io Folder Links" button** in Admin → Tools tab. Calls `POST /api/admin/backfill-frameio-folders`, shows a per-job result summary (saved / skipped / errors) with links to created folders.

---

## 2026-06-18 — Backfill Frame.io folder links for existing projects

### Added
- **`POST /api/admin/backfill-frameio-folders`** — admin-only one-shot route that finds all projects with a null `frameio_folder_link`, deduplicates by `job_id`, calls `createFrameIoShootFolder` for each, and saves the result. Returns a summary of saved/skipped/errored counts plus a per-job log. Safe to re-run — skips jobs where the call returns null (e.g. client name mismatch).

---

## 2026-06-18 — Fix Frame.io folder link missing on some triggered projects

### Fixed
- **`maxDuration = 300` added to both trigger routes** (`/api/projects/[id]/trigger` and `/api/projects/trigger-batch`). Without this, Vercel's default 10s function timeout was cutting off the Frame.io folder creation call before it completed, causing `frameio_folder_link` to silently stay null. Projects triggered before this fix can be re-triggered to backfill the link (idempotent — finds the existing folder).

---

## 2026-06-19 — Undo to Draft button on In Progress (admin only)

### Added
- **↩ Draft button** on all In Progress rows (admin only). Moves the project back to Draft (`pending_trigger`), deletes the version row that was created at trigger time, and resets `current_version`. Sits to the left of the Hold button, matching the style of the existing Undo button on Client Review rows.

---

## 2026-06-18 — Sort Client Review & Completed by date and time

### Changed
- **Client Review and Completed sections now sort by date + filming time** (newest first). Projects on the same date tiebreak by `filming_time` descending — 15:00 on the 19th appears above 14:00 on the 19th.

---

## 2026-06-18 — Review-chase cron fixes

### Fixed
- **Frame.io folder URL regex** — `deleteFrameIoFolder` now matches the last UUID in the URL rather than looking for a `/view/` segment, handling both the API-constructed format and the browser URL format.
- **Wrong Supabase import path** in `/api/extend-deletion/route.ts` (`@/lib/supabase/service` → `@/lib/supabase/server`); was causing a build failure.

### Added
- **`?testDeletion=1` knob** on the review-chase cron — runs the day-21 deletion pass for a single client (`onlyClient=`) without requiring `REVIEW_CHASE_LIVE=true`, safe for testing.

---

## 2026-06-18 — Frame.io asset deletion automation + review-chase email updates

### Added
- **Day-21 Frame.io folder deletion** — the review-chase cron now runs a deletion pass (live mode only) before the email pass. Any `in_client_review` project at `review_chase_stage=2` whose delivered version `done_date` is ≥ 21 days ago has its Frame.io shoot folder deleted via `DELETE /v4/accounts/{id}/folders/{folderId}`. The project is automatically moved to `status='complete'` and `frameio_folder_link` is cleared, whether or not the delete call succeeds (handles already-deleted folders gracefully).
- **Self-serve 7-day extension link** in day-14 chase email — stage-2 emails now include a discreet "I need more time →" button that links to `/api/extend-deletion?token={portalToken}`. Clicking it sets `deletion_hold_until = today + 7` on all the client's stage-2 in-review projects. The deletion pass skips any project whose hold is still active.
- **`/api/extend-deletion` public route** — GET endpoint that finds a client by `portal_token`, extends their deletion hold, and returns a styled HTML confirmation page (no login required).
- **`deleteFrameIoFolder(folderUrl)`** in `lib/frameio-folders.ts` — parses the folder ID from the `next.frame.io` URL and calls the Frame.io v4 DELETE endpoint. Returns `true` on success, `false` on any error (non-fatal).

### Changed
- **Review-chase stage-2 emails** now pass `extensionToken` (client's `portal_token`) to `sendReviewChaseEmail()` so the extension button is included. Stage-1 emails are unaffected.
- **Cron response** now includes `deletedCount` and `deletionLog` fields for observability.

### Database
- Requires: `ALTER TABLE projects ADD COLUMN IF NOT EXISTS deletion_hold_until date;` — run in Supabase SQL editor.

---

## 2026-06-18 — Dashboard: newest-first sort + show-20 limit on Client Review & Completed

### Changed
- **Delivered/Completed Date sort is now newest-first** (descending) for Client Review and Completed sections. Most recently delivered projects appear at the top.
- **Client Review and Completed sections show 20 items by default** with a "Show X more…" button to expand. Keeps the page manageable when sections grow large. A "Show fewer" button collapses back.

---

## 2026-06-17 — Auto-create Frame.io client project if missing

### Added
- **Auto-create Frame.io client project** — if no Frame.io project exists for a client when a shoot is triggered, the app now creates one automatically via `POST /v4/accounts/{id}/workspaces/{workspaceId}/projects` before creating the shoot folder inside it. Previously this step returned null for new clients.

---

## 2026-06-17 — Frame.io folder auto-creation, UI polish, time format toggle

### Added
- **Auto-create Frame.io shoot folder on trigger** — when a project (or batch) is triggered, the app finds the client's Frame.io project by name and creates a shoot folder named `{jobId} {time} {date}` (e.g. `DABA2 230pm 16th June 2026`) inside it. Uses Frame.io v4 API: `POST /v4/accounts/{id}/folders/{parentId}/folders` with `{ data: { name } }` body. Idempotent — if the folder already exists it returns the existing one.
- **Frame.io Folder link in project detail** — `frameio_folder_link` is saved to the project on trigger and shown as a MetaCell ("Frame.io Folder → Open folder ↗") on the project detail page. Requires `ALTER TABLE projects ADD COLUMN IF NOT EXISTS frameio_folder_link TEXT;`.
- **12h / 24h time format toggle** — button in the navbar (next to theme toggle). Preference persists in `localStorage`. All timestamps on the dashboard respect the toggle via the `TimeDisplay` client component and `TimeFormatProvider` context.
- **Copy Project ID button** — ghost button in the version history header on project detail; copies the 5-char Job ID (e.g. `DABA2`) to clipboard.
- **Filming time in assignment emails** — the trigger/batch-trigger emails now include the filming start time alongside the date (e.g. `14 Apr 2026 · 16:00`).

### Changed
- **Frame.io link colour on dashboard** — changed from red to `text-th/45` (matches surrounding muted text) with `hover:text-th/70`.
- **Revision badge** — `in_revision` status badge changed from amber to teal (`bg-teal-400 text-black`).
- **Start Revision button** — now visible to all users (not just admins) on both the dashboard card and the project detail page.
- **Per-section sort controls** — each dashboard section (Draft, In Progress, Client Review, Completed) has its own sort dropdown (Filming Date / Due Date / Delivered Date) that persists in the URL as `s_draft`, `s_ip`, `s_cr`, `s_done` params.
- **Draft section alignment** — fixed left-column kerning to match the "In Progress" section (removed extra spacer `<span>` and corrected gap to align checkbox + chevron columns).

### Fixed
- **Frame.io backfill inconsistency** — query now ordered `ASC` by `version_number` and the lookup map always overwrites so the highest version wins as fallback. Added `export const maxDuration = 300` to prevent Vercel 10s timeout cutting the scan short.
- **Active current version incorrectly getting Frame.io link** — backfill now excludes active current versions from candidates and runs a cleanup pass to clear any wrongly-assigned links before scanning.
- **Frame.io folder creation (v4 endpoint)** — correct route is `POST /v4/accounts/{id}/folders/{parentId}/folders` (not `/children`, not `/assets`). Payload must wrap name as `{ data: { name } }`. Standard Adobe OAuth token (no special scopes) works fine.

---

## 2026-06-15 — Frame.io backfill tool

### Added
- **Frame.io backfill** — admin-only tool under Admin → Tools tab. Scans all Frame.io projects/folders and populates `frameio_link` on any delivered version rows that don't have one yet. Safe to run multiple times (only touches rows with a `done_date` and no existing link). Constructs `app.frame.io/projects/{projectId}/files/{fileId}` URLs directly from the scan, matching by internal ID in the version stack name.
- Matches version stacks by exact `INTERNALID_Vn` key first, falls back to `INTERNALID` alone when no version suffix is in the stack name.

### Changed
- Removed manual Frame.io link editor from version rows — links now come from the webhook (live) or the backfill tool (historical). Deleted `FrameioLinkEditor.tsx` and the `/api/projects/[id]/version/frameio-link` PATCH route.

---

## 2026-06-12 — Fun fact of the day

### Added
- **💡 Fun fact button** in the navbar (right of theme toggle). Discreet emoji-only button; clicking opens a popup with a new fact each day. Facts are deterministic by calendar day so all users see the same one. 1002 facts seeded from CSV.
- `fun_facts` Supabase table + seed SQL at `supabase/fun_facts_seed.sql`.
- `/api/fun-fact` GET route — picks today's fact by day-of-year mod 1002.

### DB setup required
Run `supabase/fun_facts_seed.sql` in the Supabase SQL Editor to create and seed the table.

---

## 2026-06-11 — Frame.io upload link + timestamp in version history

### Added
- **Frame.io link** — when the `file.ready` webhook fires, the player URL is extracted from the Frame.io file object and stored on the version row. Shown as a "View in Frame.io" link in the version history on the project detail page.
- **Upload timestamp** — the Frame.io file's `created_at` timestamp is saved and displayed in the version history (formatted in Singapore time).

### DB migration required
Run the following in Supabase SQL Editor:
```sql
ALTER TABLE versions ADD COLUMN IF NOT EXISTS frameio_link text;
ALTER TABLE versions ADD COLUMN IF NOT EXISTS frameio_uploaded_at timestamptz;
```

---

## 2026-06-11 — Admin due date override in Edit Project modal

### Added
- **Due Date Override** field in the Edit Project modal (admin only). Shows the current due date for the active version with a date picker to set any past or future date. Includes a Reset link to revert to the original date. Saves directly to the version row in the DB.

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
