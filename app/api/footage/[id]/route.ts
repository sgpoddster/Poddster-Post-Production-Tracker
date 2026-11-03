import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'
import { EMAIL_RE } from '@/lib/footage-email'

// PATCH /api/footage/[id] — save drive_link, email and/or extra_emails (admin only)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { drive_link, email, extra_emails } = body as {
    drive_link?: string
    email?: string
    extra_emails?: string[]
  }

  if (drive_link === undefined && email === undefined && extra_emails === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (drive_link !== undefined) update.drive_link = drive_link || null

  if (email !== undefined) {
    const v = email.trim()
    if (v && !EMAIL_RE.test(v)) return NextResponse.json({ error: `"${v}" doesn't look like a valid email` }, { status: 400 })
    update.email = v || null
  }

  if (extra_emails !== undefined) {
    if (!Array.isArray(extra_emails)) return NextResponse.json({ error: 'extra_emails must be a list' }, { status: 400 })
    const list = extra_emails.map(e => String(e).trim()).filter(Boolean)
    const bad = list.find(e => !EMAIL_RE.test(e))
    if (bad) return NextResponse.json({ error: `"${bad}" doesn't look like a valid email` }, { status: 400 })
    update.extra_emails = Array.from(new Map(list.map(e => [e.toLowerCase(), e])).values())
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('footage_deliveries')
    .update(update)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
