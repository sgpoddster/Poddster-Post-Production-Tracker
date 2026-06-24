import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'

// POST /api/footage/[id]/undo — reset delivery to unsent state (admin only)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('footage_deliveries')
    .update({
      sent_at:           null,
      expires_at:        null,
      conversion_status: null,
      converted_link:    null,
      updated_at:        new Date().toISOString(),
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
