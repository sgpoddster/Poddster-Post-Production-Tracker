import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { canPlace, type Booking } from '@/lib/capacity/capacity-engine'
import { getLiveConfig } from '@/lib/capacity/config-loader'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Parse "HH:MM - HH:MM" or "HH:MM-HH:MM" into { start, end }. */
function parseTimeRange(s: string): { start: string; end: string } | null {
  const m = s.match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/)
  if (!m) return null
  return { start: m[1], end: m[2] }
}

/** Parse "HH:MM" start + decimal hours duration into an end time "HH:MM". */
function addHours(start: string, durationHours: number): string {
  const [h, mm] = start.split(':').map(Number)
  const total = h * 60 + mm + Math.round(durationHours * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export async function GET(request: Request) {
  // Require an authenticated session.
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const set = searchParams.get('set')

  if (!date || !start || !end || !set) {
    return NextResponse.json({ error: 'date, start, end, and set are required' }, { status: 400 })
  }

  // Fetch existing bookings from footage_deliveries (calendar-sourced).
  const { data: deliveries } = await supabase
    .from('footage_deliveries')
    .select('id, filming_date, filming_time, setup')
    .eq('filming_date', date)
    .not('setup', 'is', null)
    .not('filming_time', 'is', null)

  // Fetch manually-created projects (non-cancelled, non-complete).
  const { data: projects } = await supabase
    .from('projects')
    .select('id, filming_date, filming_time, shoot_duration, setup')
    .eq('filming_date', date)
    .not('setup', 'is', null)
    .not('filming_time', 'is', null)
    .not('status', 'in', '("cancelled","complete")')

  const bookings: Booking[] = []

  for (const d of deliveries ?? []) {
    const range = parseTimeRange(d.filming_time)
    if (!range) continue
    bookings.push({ id: d.id, date: d.filming_date, start: range.start, end: range.end, set: d.setup })
  }

  for (const p of projects ?? []) {
    // filming_time in projects is the start time only ("HH:MM").
    // Use shoot_duration (decimal hours) to compute end.
    const start_t = p.filming_time?.trim()
    const dur = parseFloat(p.shoot_duration ?? '')
    if (!start_t || isNaN(dur) || dur <= 0) continue
    const end_t = addHours(start_t, dur)
    bookings.push({ id: p.id, date: p.filming_date, start: start_t, end: end_t, set: p.setup })
  }

  // De-duplicate by (date, start, set) — footage_deliveries and projects may overlap
  // for bookings that were ingested from the calendar and also manually created.
  const seen = new Set<string>()
  const unique = bookings.filter(b => {
    const key = `${b.date}|${b.start}|${b.set.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  let config
  try {
    config = await getLiveConfig()
  } catch {
    config = (await import('@/lib/capacity/capacity-engine')).PODDSTER_CONFIG
  }

  let result
  try {
    result = canPlace(unique, config, { date, start, end, set })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Unknown set — engine can't map it to a room.
    return NextResponse.json({ ok: null, reasons: [], unknown_set: true, detail: msg })
  }

  const blocked_by = deriveBlockedBy(result.reasons)
  return NextResponse.json({ ...result, blocked_by })
}

function deriveBlockedBy(reasons: string[]): 'room' | 'operator' | 'hours' | null {
  if (!reasons.length) return null
  for (const r of reasons) {
    if (r.includes('Outside')) return 'hours'
    if (r.includes('operator') || r.includes('No operator')) return 'operator'
  }
  return 'room'
}
