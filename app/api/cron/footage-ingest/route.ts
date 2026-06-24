import { NextRequest, NextResponse } from 'next/server'
import { createSign } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { parseCalendarEvent, RawCalendarEvent } from '@/lib/calendarParser'

// Daily cron: scan all 3 Poddster calendars for footage-only bookings and
// upsert into footage_deliveries. Reads the calendar directly — no GAS needed.
//
// Auth: Vercel CRON_SECRET header (automatic) or ?key=INGEST_API_KEY (manual).
//
// Required env var — ONE of:
//   GOOGLE_SERVICE_ACCOUNT_JSON  — full JSON key file content (preferred, service account)
//   OR the legacy OAuth trio:
//   GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_CALENDAR_REFRESH_TOKEN
//
// Service account setup (one-time):
//   1. Google Cloud Console → arwconverter project → IAM → Service Accounts
//   2. Create (or reuse existing) service account → Keys → Add Key → JSON → Download
//   3. Enable "Google Calendar API" in the project if not already on
//   4. Share each calendar below with the service account email (view/read access)
//   5. Paste the entire JSON file content into Vercel env var GOOGLE_SERVICE_ACCOUNT_JSON

const CALENDAR_IDS = [
  'singapore@poddster.com',
  'c_099180ae8058ae26042744b7d7b498279e6395bc1e597962b430313eb194aaaf@group.calendar.google.com',
  'c_86fc0b239e875e6f748bf85a4df556be4cdd1721e5c3567b27354d60d25c9c40@group.calendar.google.com',
]

const SINGAPORE_TZ = 'Asia/Singapore'

// ── Service account JWT auth ──────────────────────────────────────────────────

async function getTokenViaServiceAccount(saJson: string): Promise<string> {
  const sa = JSON.parse(saJson) as {
    client_email: string
    private_key: string
  }

  const now    = Math.floor(Date.now() / 1000)
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  })).toString('base64url')

  const sigInput  = `${header}.${payload}`
  const sign      = createSign('RSA-SHA256')
  sign.update(sigInput)
  const signature = sign.sign(sa.private_key, 'base64url')
  const jwt       = `${sigInput}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })
  const json = await res.json()
  if (!json.access_token) {
    throw new Error(`Service account token exchange failed: ${JSON.stringify(json).slice(0, 200)}`)
  }
  return json.access_token as string
}

// ── Legacy OAuth refresh token auth ──────────────────────────────────────────

async function getTokenViaRefreshToken(): Promise<string> {
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Set GOOGLE_SERVICE_ACCOUNT_JSON (or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_CALENDAR_REFRESH_TOKEN)')
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })
  const json = await res.json()
  if (!json.access_token) {
    throw new Error(`OAuth token exchange failed: ${JSON.stringify(json).slice(0, 200)}`)
  }
  return json.access_token as string
}

async function getGoogleAccessToken(): Promise<string> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  return saJson ? getTokenViaServiceAccount(saJson) : getTokenViaRefreshToken()
}

// ── Calendar helpers ──────────────────────────────────────────────────────────

function isHasPP(parsed: ReturnType<typeof parseCalendarEvent>): boolean {
  return parsed.episodeCount > 0 || parsed.highlightCount > 0
}

async function fetchCalendarEvents(calendarId: string, token: string): Promise<RawCalendarEvent[]> {
  const now = new Date()
  const timeMin = new Date(now); timeMin.setDate(timeMin.getDate() - 90)
  const timeMax = new Date(now); timeMax.setDate(timeMax.getDate() + 365)

  const params = new URLSearchParams({
    timeMin:      timeMin.toISOString(),
    timeMax:      timeMax.toISOString(),
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '500',
  })

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

  if (!res.ok) {
    const text = await res.text()
    console.warn(`[footage-ingest] calendar ${calendarId} failed: ${res.status} ${text.slice(0, 200)}`)
    return []
  }

  const json = await res.json()
  return (json.items ?? []) as RawCalendarEvent[]
}

// Format as "HH:MM - HH:MM" in Singapore time
function buildFilmingTime(startISO: string, endISO: string): string | null {
  if (!startISO || !endISO) return null
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-SG', {
      timeZone: SINGAPORE_TZ,
      hour:     '2-digit',
      minute:   '2-digit',
      hour12:   false,
    })
  return `${fmt(startISO)} - ${fmt(endISO)}`
}

// Format as "YYYY-MM-DD" in Singapore time
function buildFilmingDate(startISO: string): string | null {
  if (!startISO) return null
  return new Date(startISO).toLocaleDateString('en-CA', { timeZone: SINGAPORE_TZ })
}

// Extract client name from event summary e.g. "Neal Moore | Poddster Singapore Studio Booking" → "Neal Moore"
function extractClientName(summary: string | undefined): string | null {
  if (!summary) return null
  const before = summary.split('|')[0].trim()
  return before || null
}

// Extract customer email from event description e.g. "User Email: ben@example.com"
function extractEmail(description: string | undefined): string | null {
  if (!description) return null
  const m = description.match(/User\s+Email\s*:\s*([^\s\n\r<]+)/i)
  return m ? m[1].trim() : null
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const queryKey   = new URL(req.url).searchParams.get('key')
  const cronSecret = process.env.CRON_SECRET
  const ingestKey  = process.env.INGEST_API_KEY

  const validVercel = cronSecret && authHeader === `Bearer ${cronSecret}`
  const validManual = ingestKey  && queryKey   === ingestKey

  if (!validVercel && !validManual) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let token: string
  try {
    token = await getGoogleAccessToken()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[footage-ingest] token error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const supabase = createServiceClient()
  const seen = new Set<string>()
  let inserted = 0, skipped = 0, hasPPCount = 0

  // Load existing (order_id, filming_date) pairs to avoid duplicating GAS-ingested rows
  const { data: existing } = await supabase
    .from('footage_deliveries')
    .select('job_id, order_id, filming_date')

  const knownJobIds     = new Set((existing ?? []).map(r => r.job_id as string))
  const knownOrderDates = new Set(
    (existing ?? [])
      .filter(r => r.order_id && r.filming_date)
      .map(r => `${r.order_id}|${r.filming_date}`)
  )

  for (const calId of CALENDAR_IDS) {
    const events = await fetchCalendarEvents(calId, token)
    console.log(`[footage-ingest] ${calId}: ${events.length} events`)

    for (const ev of events) {
      if (!ev.id || seen.has(ev.id)) continue
      seen.add(ev.id)

      const parsed = parseCalendarEvent(ev)
      if (!parsed.filmingDate) continue

      if (isHasPP(parsed)) { hasPPCount++; continue }

      const startISO    = ev.start.dateTime ?? ''
      const endISO      = ev.end.dateTime   ?? ''
      const filmingDate = buildFilmingDate(startISO) ?? parsed.filmingDate
      const clientName  = extractClientName(ev.summary)
      const email       = extractEmail(ev.description)
      const orderDateKey = parsed.orderId && filmingDate ? `${parsed.orderId}|${filmingDate}` : null

      if (knownJobIds.has(ev.id)) {
        // Already a cron row — sync all mutable fields in case the booking was rescheduled
        await supabase
          .from('footage_deliveries')
          .update({
            client_name:  clientName,
            email,
            filming_date: filmingDate,
            filming_time: buildFilmingTime(startISO, endISO),
            setup:        parsed.setup ?? null,
            order_id:     parsed.orderId ?? null,
          })
          .eq('job_id', ev.id)
        skipped++
        continue
      }

      if (orderDateKey && knownOrderDates.has(orderDateKey)) {
        // A GAS row exists for this order+date — update its name/email from the calendar
        await supabase
          .from('footage_deliveries')
          .update({ client_name: clientName, email })
          .eq('order_id', parsed.orderId!)
          .eq('filming_date', filmingDate!)
        skipped++
        continue
      }

      const row = {
        job_id:       ev.id,
        order_id:     parsed.orderId  ?? null,
        client_name:  clientName,
        email,
        filming_date: filmingDate,
        filming_time: buildFilmingTime(startISO, endISO),
        setup:        parsed.setup    ?? null,
        source:       'calendar' as const,
      }

      const { error } = await supabase
        .from('footage_deliveries')
        .upsert(row, { onConflict: 'job_id', ignoreDuplicates: false })

      if (error) {
        console.error(`[footage-ingest] upsert error for ${ev.id}:`, error.message)
      } else {
        inserted++
        knownJobIds.add(ev.id)
        if (orderDateKey) knownOrderDates.add(orderDateKey)
      }
    }
  }

  // ── Cleanup: remove rows whose calendar event no longer exists ───────────────
  // Only applies to cron-sourced rows (long job_ids = calendar event IDs) that
  // fall within the scan window. Rows already sent are kept as historical records.
  const now = new Date()
  const windowMin = new Date(now); windowMin.setDate(windowMin.getDate() - 90)
  const windowMax = new Date(now); windowMax.setDate(windowMax.getDate() + 365)
  const windowMinDate = windowMin.toLocaleDateString('en-CA', { timeZone: SINGAPORE_TZ })
  const windowMaxDate = windowMax.toLocaleDateString('en-CA', { timeZone: SINGAPORE_TZ })

  // Cron rows have long job_ids (calendar event IDs, always > 10 chars)
  const staleRows = (existing ?? []).filter(r => {
    const jobId       = r.job_id as string
    const filmingDate = r.filming_date as string | null
    return (
      jobId.length > 10 &&                    // cron-sourced row
      filmingDate &&
      filmingDate >= windowMinDate &&          // within scan window
      filmingDate <= windowMaxDate &&
      !seen.has(jobId)                        // event not seen in this fetch
    )
  })

  let removed = 0
  if (staleRows.length > 0) {
    const staleIds = staleRows.map(r => r.job_id as string)
    const { error: delErr } = await supabase
      .from('footage_deliveries')
      .delete()
      .in('job_id', staleIds)
      .is('sent_at', null)   // never delete already-sent deliveries

    if (delErr) {
      console.error('[footage-ingest] cleanup error:', delErr.message)
    } else {
      removed = staleRows.length
      console.log(`[footage-ingest] removed ${removed} stale rows`)
    }
  }

  skipped = seen.size - inserted - hasPPCount

  console.log(`[footage-ingest] done — total=${seen.size} inserted=${inserted} hasPP=${hasPPCount} skipped=${skipped} removed=${removed}`)
  return NextResponse.json({ ok: true, total: seen.size, inserted, hasPP: hasPPCount, skipped, removed })
}
