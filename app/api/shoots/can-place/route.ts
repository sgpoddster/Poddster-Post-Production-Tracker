import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { canPlace } from '@/lib/capacity/capacity-engine'
import { getLiveConfig } from '@/lib/capacity/config-loader'
import { loadBookingsForRange } from '@/lib/capacity/bookings-loader'

export async function GET(request: Request) {
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

  const unique = await loadBookingsForRange(date, date)

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
