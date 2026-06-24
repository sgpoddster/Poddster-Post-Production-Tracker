import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'

// POST /api/footage/[id]/extend — add 6 months to expires_at (Poddster Cloud purchase)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const { data: delivery } = await supabase
    .from('footage_deliveries')
    .select('expires_at')
    .eq('id', params.id)
    .single()

  // Extend from today or current expiry, whichever is later
  const base    = delivery?.expires_at && delivery.expires_at > new Date().toISOString().split('T')[0]
    ? new Date(delivery.expires_at)
    : new Date()
  base.setMonth(base.getMonth() + 6)
  const newExpiry = base.toISOString().split('T')[0]

  const { error } = await supabase
    .from('footage_deliveries')
    .update({
      expires_at:      newExpiry,
      expired_sent_at: null,   // reset so expiry email can fire again if needed
      updated_at:      new Date().toISOString(),
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, expires_at: newExpiry })
}
