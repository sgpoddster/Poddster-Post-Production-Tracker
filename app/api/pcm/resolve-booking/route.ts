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

// Parse "HH:MM - HH:MM" → start minutes since midnight
function parseStartMinutes(filming_time: string): number | null {
  try {
    const start = filming_time.split('-')[0].trim() // "10:00"
    const [h, m] = start.split(':').map(Number)
    return h * 60 + m
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const secret = request.headers.get('x-pcm-secret')
  if (!secret || secret !== process.env.PCM_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const studio      = searchParams.get('studio')       // e.g. "Studio 4"
  const date        = searchParams.get('date')          // e.g. "2026-06-30"
  const time_str    = searchParams.get('time')          // e.g. "10:05" (recording start)

  if (!studio || !date || !time_str) {
    return NextResponse.json({ error: 'studio, date and time are required' }, { status: 400 })
  }

  const [h, m]        = time_str.split(':').map(Number)
  const rec_minutes   = h * 60 + m
  const setups        = setupsForStudio(studio)

  if (setups.length === 0) {
    return NextResponse.json({ error: `Unknown studio: ${studio}` }, { status: 400 })
  }

  // Fetch all bookings for this studio on this date that have a setup.
  // Use ilike per setup value so "Club" matches "club" etc.
  const { data, error } = await supabase
    .from('footage_deliveries')
    .select('client_name, filming_time, setup')
    .eq('filming_date', date)
    .not('setup', 'is', null)
    .or(setups.map(s => `setup.ilike.${s}`).join(','))
    .order('filming_time', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ client_name: null, booking_time: null })
  }

  // Find the booking whose start time is closest before the recording start,
  // but before the next booking's start time
  let match = null
  for (let i = 0; i < data.length; i++) {
    const booking_start = parseStartMinutes(data[i].filming_time)
    if (booking_start === null) continue

    const next_start = i + 1 < data.length
      ? parseStartMinutes(data[i + 1].filming_time)
      : null

    if (
      booking_start <= rec_minutes + 30 && // recording started within 30 mins after booking
      (next_start === null || rec_minutes < next_start) // before next booking
    ) {
      match = data[i]
    }
  }

  if (!match) {
    return NextResponse.json({ client_name: null, booking_time: null })
  }

  const booking_time = match.filming_time.split('-')[0].trim() // "10:00"

  return NextResponse.json({
    client_name:  match.client_name,
    booking_time,
  })
}
