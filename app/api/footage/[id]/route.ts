import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'

// PATCH /api/footage/[id] — save drive_link (admin only)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { drive_link } = body as { drive_link?: string }

  if (drive_link === undefined) {
    return NextResponse.json({ error: 'drive_link is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('footage_deliveries')
    .update({ drive_link: drive_link || null, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
