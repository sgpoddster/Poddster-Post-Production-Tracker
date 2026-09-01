import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: Request) {
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { date, start, duration_minutes, set, outcome, blocked_by } = body

  if (!date || !start || !duration_minutes || !set || !outcome) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { error } = await supabase.from('enquiry_log').insert({
    requested_date:     date,
    requested_start:    start,
    requested_duration: `${duration_minutes} minutes`,
    requested_set:      set,
    outcome,
    blocked_by:         blocked_by ?? null,
  })

  if (error) {
    console.error('enquiry_log insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
