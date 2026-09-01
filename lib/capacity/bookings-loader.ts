import { createClient } from '@supabase/supabase-js'
import type { Booking } from './capacity-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function parseTimeRange(s: string): { start: string; end: string } | null {
  const m = s.match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/)
  if (!m) return null
  return { start: m[1], end: m[2] }
}

function addHours(start: string, durationHours: number): string {
  const [h, mm] = start.split(':').map(Number)
  const total = h * 60 + mm + Math.round(durationHours * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export async function loadBookingsForRange(from: string, to: string): Promise<Booking[]> {
  const [{ data: deliveries }, { data: projects }] = await Promise.all([
    supabase
      .from('footage_deliveries')
      .select('id, filming_date, filming_time, setup, client_name')
      .gte('filming_date', from)
      .lte('filming_date', to)
      .not('setup', 'is', null)
      .not('filming_time', 'is', null),
    supabase
      .from('projects')
      .select('id, filming_date, filming_time, shoot_duration, setup, client_name')
      .gte('filming_date', from)
      .lte('filming_date', to)
      .not('setup', 'is', null)
      .not('filming_time', 'is', null)
      .not('status', 'in', '("cancelled","complete")'),
  ])

  const bookings: Booking[] = []

  for (const d of deliveries ?? []) {
    const range = parseTimeRange(d.filming_time)
    if (!range) continue
    bookings.push({ id: d.id, date: d.filming_date, start: range.start, end: range.end, set: d.setup, client: d.client_name ?? undefined })
  }

  for (const p of projects ?? []) {
    const start_t = p.filming_time?.trim()
    const dur = parseFloat(p.shoot_duration ?? '')
    if (!start_t || isNaN(dur) || dur <= 0) continue
    bookings.push({ id: p.id, date: p.filming_date, start: start_t, end: addHours(start_t, dur), set: p.setup, client: p.client_name ?? undefined })
  }

  const seen = new Set<string>()
  return bookings.filter(b => {
    const key = `${b.date}|${b.start}|${b.set.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
