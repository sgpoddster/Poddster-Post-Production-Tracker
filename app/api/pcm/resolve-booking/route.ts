import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Maps setup name (lowercase) to studio
const SETUP_TO_STUDIO: Record<string, string> = {
  nest: 'Studio 1',
  exec: 'Studio 1',
  iris: 'Studio 2',
  club: 'Studio 2',
  nova: 'Studio 3',
  core: 'Studio 4',
}

// Returns setups that belong to a given studio
function setupsForStudio(studio: string): string[] {
  return Object.entries(SETUP_TO_STUDIO)
    .filter(([, s]) => s === studio)
    .map(([setup]) => setup)
}

// Parse "HH:MM" → minutes since midnight
function toMinutes(t: string): number | null {
  try {
    const [h, m] = t.trim().split(':').map(Number)
    return h * 60 + m
  } catch {
    return null
  }
}

// Parse "HH:MM - HH:MM" → {start, end} minutes
function parseBookingTimes(filming_time: string): { start: number; end: number } | null {
  try {
    const parts = filming_time.split(/\s*-\s*/)
    const start = toMinutes(parts[0])
    const end   = toMinutes(parts[1])
    if (start === null || end === null) return null
    return { start, end }
  } catch {
    return null
  }
}

// Sessions can run up to 25 mins past booking end (30-min gap between bookings keeps this unambiguous)
const OVERRUN_BUFFER = 25

export async function GET(request: Request) {
  const secret = request.headers.get('x-pcm-secret')
  if (!secret || secret !== process.env.PCM_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const studio       = searchParams.get('studio')     // e.g. "Studio 4"
  const date         = searchParams.get('date')        // e.g. "2026-07-21" (MDTM date)
  const end_time_str = searchParams.get('end_time')   // session end time HH:MM (SGT) — preferred
  const time_str     = searchParams.get('time')        // legacy: recording start time HH:MM
  // from_date: ATEM folder creation date (first session start). When earlier than `date`,
  // the composite file MDTMs are unreliable (set when the NEXT session starts, not when
  // the current session ended). Cross-day absolute-time matching is used instead.
  const from_date_str = searchParams.get('from_date') // e.g. "2026-07-20"

  if (!studio || !date || (!end_time_str && !time_str)) {
    return NextResponse.json({ error: 'studio, date, and end_time (or time) are required' }, { status: 400 })
  }

  const setups = setupsForStudio(studio)

  if (setups.length === 0) {
    return NextResponse.json({ error: `Unknown studio: ${studio}` }, { status: 400 })
  }

  const setupFilter = setups.map(s => `setup.ilike.${s}`).join(',')

  // ── Cross-day MDTM mode ───────────────────────────────────────────────────
  // When from_date < date, composite file MDTMs are known to be unreliable: the
  // ATEM sets them to the start of the NEXT recording session (which may be on a
  // different day). Normal same-day window matching would misattribute sessions.
  // Instead: search all bookings across [from_date, date], compare in absolute
  // SGT datetime, and return the LAST booking whose end+buffer is strictly before
  // the session end absolute time.
  if (from_date_str && from_date_str < date && end_time_str) {
    const { data: rangeData } = await supabase
      .from('footage_deliveries')
      .select('client_name, filming_date, filming_time, setup')
      .gte('filming_date', from_date_str)
      .lte('filming_date', date)
      .not('setup', 'is', null)
      .or(setupFilter)
      .order('filming_date', { ascending: true })
      .order('filming_time', { ascending: true })

    if (rangeData && rangeData.length > 0) {
      const sessionEndAbs = new Date(`${date}T${end_time_str}:00+08:00`)
      let crossMatch: typeof rangeData[0] | null = null

      for (const booking of rangeData) {
        const times = parseBookingTimes(booking.filming_time)
        if (!times) continue
        const endH = Math.floor(times.end / 60).toString().padStart(2, '0')
        const endM = (times.end % 60).toString().padStart(2, '0')
        const bookingEndAbs = new Date(`${booking.filming_date}T${endH}:${endM}:00+08:00`)
        const bookingEndWithBuffer = new Date(bookingEndAbs.getTime() + OVERRUN_BUFFER * 60_000)
        if (bookingEndWithBuffer < sessionEndAbs) {
          crossMatch = booking  // sorted ascending — last qualifying booking wins
        }
      }

      if (crossMatch) {
        return NextResponse.json({
          client_name:  crossMatch.client_name,
          booking_time: crossMatch.filming_time.split('-')[0].trim(),
          match_method: 'cross_day_range',
        })
      }
    }
    // Fall through to same-day matching if cross-day found nothing
  }

  // ── Same-day matching ─────────────────────────────────────────────────────
  // Fetch all bookings for this studio on this date that have a setup.
  // Use ilike per setup value so "Club" matches "club" etc.
  const { data, error } = await supabase
    .from('footage_deliveries')
    .select('client_name, filming_time, setup')
    .eq('filming_date', date)
    .not('setup', 'is', null)
    .or(setupFilter)
    .order('filming_time', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ client_name: null, booking_time: null })
  }

  let match = null
  let matchMethod = 'none'

  if (end_time_str) {
    // Primary: booking_start <= end_minutes <= booking_end + buffer.
    // 25-min buffer handles overruns; 30-min gap between bookings keeps it unambiguous.
    const end_minutes = toMinutes(end_time_str)
    if (end_minutes !== null) {
      for (const booking of data) {
        const times = parseBookingTimes(booking.filming_time)
        if (!times) continue
        if (times.start <= end_minutes && end_minutes <= times.end + OVERRUN_BUFFER) {
          match = booking
          matchMethod = 'end_time'
        }
      }

      // Fallback: if the timestamp is well past all booking windows (e.g. SSD was
      // physically disconnected and reconnected later, corrupting file MDTMs), return
      // the most recent booking that clearly ended before the recorded time.
      if (!match) {
        for (const booking of data) {
          const times = parseBookingTimes(booking.filming_time)
          if (!times) continue
          if (times.end + OVERRUN_BUFFER < end_minutes) {
            match = booking   // sorted ascending — last qualifying booking wins
            matchMethod = 'fallback_last_before'
          }
        }
      }
    }
  } else {
    // Legacy: match by recording start time proximity
    const rec_minutes = toMinutes(time_str!)
    if (rec_minutes !== null) {
      for (let i = 0; i < data.length; i++) {
        const times = parseBookingTimes(data[i].filming_time)
        if (!times) continue
        const next_start = i + 1 < data.length
          ? parseBookingTimes(data[i + 1].filming_time)?.start ?? null
          : null
        if (
          times.start <= rec_minutes + 30 &&
          (next_start === null || rec_minutes < next_start)
        ) {
          match = data[i]
        }
      }
    }
  }

  if (!match) {
    return NextResponse.json({ client_name: null, booking_time: null })
  }

  const booking_time = match.filming_time.split('-')[0].trim() // "10:00"

  return NextResponse.json({
    client_name:  match.client_name,
    booking_time,
    match_method: matchMethod,
  })
}
