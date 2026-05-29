import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, supabase: null }
  const profile = await getUserProfile()
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403, supabase: null }
  return { error: null, status: 200, supabase }
}

export async function POST(request: Request) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { name, code } = await request.json()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data: client, error: dbError } = await supabase
    .from('clients')
    .insert({ name, code: code || null })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ client }, { status: 201 })
}

export async function DELETE(request: Request) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error: dbError } = await supabase.from('clients').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
