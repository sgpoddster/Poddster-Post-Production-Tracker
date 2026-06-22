import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { parseCalendarEvent, RawCalendarEvent } from '@/lib/calendarParser'

// Hourly cron: scan all 3 Poddster calendars for footage-only bookings
// (those without post-production services) and upsert into footage_deliveries.
//
// Auth: Vercel CRON_SECRET header (automatic on Vercel) or ?key=INGEST_API_KEY (manual testing).
//
// Required env vars:
//   GOOGLE_CLIENT_ID              — Google OAuth client ID (can reuse the one Supabase uses)
//   GOOGLE_CLIENT_SECRET          — Google OAuth client secret
//   GOOGLE_CALENDAR_REFRESH_TOKEN — Offline refresh token for singapore@poddster.com
//                                   with scope https://www.googleapis.com/auth/calendar.readonly
//
// To get the refresh token, run this one-off flow from a browser:
//   1. OAuth consent: https://accounts.google.com/o/oauth2/auth?client_id={CLIENT_ID}
//      &redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/calendar.readonly&access_type=offline&prompt=consent
//   2. Exchange the code: POST to https://oauth2.googleapis.com/token with grant_type=authorization_code
//   3. Store the returned refresh_token in Vercel env.

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

const CALENDAR_IDS = [
  'singapore@poddster.com',
  'c_099180ae8058ae26042744b7d7b498279e6395bc1e597962b430313eb194aaaf@group.calendar.google.com',
  'c_86fc0b239e875e6f748bf85a4df556be4cdd1721e5c3567b27354d60d25c9c40@group.calendar.google.com',
]

// hasPP: the event description mentions editing or highlight services.
// Mirrors the GAS detection: services/addons containing 'edit', 'standard', or 'highlight'.
function isHasPP(parsed: ReturnType<typeof parseCalendarEvent>): boolean {
  return parsed.episodeCount > 0 || parsed.highlightCount > 0
}

async function getGoogleAccessToken(): Promise<string> {
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_CALENDAR_REFRESH_TOKEN not set')
  }
  const res = await fetch(GOOGLE_TOKEN_URL, {
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
    throw new Error(`Google token exchange failed: ${JSON.stringify(json).slice(0, 200)}`)
  }
  return json.access_token as string
}

async function fetchCalendarEvents(calendarId: string, token: string): Promise<RawCalendarEvent[]> {
  // Scan 90 days back to 365 days ahead — enough to catch recent and upcoming footage shoots.
  const now = new Date()
  const timeMin = new Date(now)
  timeMin.setDate(timeMin.getDate() - 90)
  const timeMax = new Date(now)
  timeMax.setDate(timeMax.getDate() + 365)

  const params = new URLSearchParams({
    timeMin:      timeMin.toISOString(),
    timeMax:      timeMax.toISOString(),
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '500',
  })

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const text = await res.text()
    console.warn(`[footage-ingest] calendar ${calendarId} fetch failed: ${res.status} ${text.slice(0, 200)}`)
    return []
  }

  const json = await res.json()
  return (json.items ?? []) as RawCalendarEvent[]
}

// Build "HH:MM - HH:MM" string from event start + end ISO strings.
function buildFilmingTime(startISO: string, endISO: string): string | null {
  if (!startISO || !endISO) return null
  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${fmt(startISO)} - ${fmt(endISO)}`
}

export async function GET(req: NextRequest) {
  // Auth: Vercel sends Authorization: Bearer {CRON_SECRET} for scheduled runs.
  // Also allow ?key=INGEST_API_KEY for manual testing from a browser.
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
  const seen = new Set<string>()        // deduplicate across calendars by event id
  let inserted = 0, skipped = 0, hasPP = 0

  for (const calId of CALENDAR_IDS) {
    const events = await fetchCalendarEvents(calId, token)
    console.log(`[footage-ingest] ${calId}: ${events.length} events`)

    for (const ev of events) {
      if (!ev.id) continue
      if (seen.has(ev.id)) continue
      seen.add(ev.id)

      const parsed = parseCalendarEvent(ev)

      // Skip events with no date (all-day events, blocks, etc.)
      if (!parsed.filmingDate) continue

      // Skip hasPP bookings — those go to /api/bookings/ingest
      if (isHasPP(parsed)) {
        hasPP++
        continue
      }

      const startISO = ev.start.dateTime ?? ''
      const endISO   = ev.end.dateTime   ?? ''

      const row = {
        job_id:       ev.id,                                     // calendar event ID is stable + unique
        order_id:     parsed.orderId ?? null,
        filming_date: parsed.filmingDate || null,
        filming_time: buildFilmingTime(startISO, endISO),
        setup:        parsed.setup ?? null,
        source:       'calendar' as const,
      }

      // ignoreDuplicates: don't overwrite drive_link or sent_at if already set
      const { error } = await supabase
        .from('footage_deliveries')
        .upsert(row, { onConflict: 'job_id', ignoreDuplicates: true })

      if (error) {
        console.error(`[footage-ingest] upsert error for ${ev.id}:`, error.message)
      } else {
        inserted++
      }
    }
  }

  skipped = seen.size - inserted - hasPP

  console.log(`[footage-ingest] done — events=${seen.size} inserted/updated=${inserted} hasPP=${hasPP} skipped=${skipped}`)
  return NextResponse.json({ ok: true, total: seen.size, inserted, hasPP, skipped })
}
