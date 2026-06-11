import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().split('T')[0]

  let reason: string | null = null
  try {
    const body = await req.json()
    reason = body?.reason ?? null
  } catch { /* no body */ }

  let { error } = await supabase
    .from('projects')
    .update({ on_hold: true, hold_date: today, hold_reason: reason })
    .eq('id', params.id)

  // Fallback: hold_reason column may not exist in older DB instances
  if (error) {
    const fallback = await supabase
      .from('projects')
      .update({ on_hold: true, hold_date: today })
      .eq('id', params.id)
    error = fallback.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
