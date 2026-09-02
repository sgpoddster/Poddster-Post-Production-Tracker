import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function requireAdmin() {
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  return user ?? null
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('operator_leave')
    .select('id, date, operator, note')
    .gte('date', today)
    .order('date', { ascending: true })
    .order('operator', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data })
}

export async function POST(request: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { dates, operator, note } = body as {
    dates: string[]   // array of YYYY-MM-DD
    operator: string
    note?: string
  }

  if (!dates?.length || !operator) {
    return NextResponse.json({ error: 'dates and operator are required' }, { status: 400 })
  }

  const rows = dates.map(date => ({ date, operator, note: note ?? null }))
  const { data, error } = await supabase
    .from('operator_leave')
    .upsert(rows, { onConflict: 'date,operator', ignoreDuplicates: true })
    .select('id, date, operator, note')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data })
}
