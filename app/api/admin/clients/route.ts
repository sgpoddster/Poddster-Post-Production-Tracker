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

  const { name, code, first_name, last_name, email, email_2, email_3, exclude_from_reminders } = await request.json()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data: client, error: dbError } = await supabase
    .from('clients')
    .insert({
      name,
      code:       code       || null,
      first_name: first_name || null,
      last_name:  last_name  || null,
      email:      email      || null,
      email_2:    email_2    || null,
      email_3:    email_3    || null,
      exclude_from_reminders: !!exclude_from_reminders,
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ client }, { status: 201 })
}

export async function PATCH(request: Request) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { id, name, code, first_name, last_name, email, email_2, email_3, exclude_from_reminders } = await request.json()
  if (!id)   return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data: client, error: dbError } = await supabase
    .from('clients')
    .update({
      name,
      code:       code       || null,
      first_name: first_name || null,
      last_name:  last_name  || null,
      email:      email      || null,
      email_2:    email_2    || null,
      email_3:    email_3    || null,
      exclude_from_reminders: !!exclude_from_reminders,
    })
    .eq('id', id)
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ client })
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
