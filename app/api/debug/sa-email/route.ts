import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const profile = await getUserProfile()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!saJson) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const { client_email } = JSON.parse(saJson)
  return NextResponse.json({ client_email })
}
