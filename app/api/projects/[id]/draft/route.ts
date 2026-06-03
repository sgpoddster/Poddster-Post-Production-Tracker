import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'

// Move a triggered project back to Draft (pre-trigger):
// clears version rows + hold state, status → pending_trigger.
// current_version is preserved so a re-trigger restores the same starting version.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Remove the version rows created at/after trigger
  await supabase.from('versions').delete().eq('project_id', params.id)

  const { error } = await supabase
    .from('projects')
    .update({
      status: 'pending_trigger',
      on_hold: false,
      hold_date: null,
      hold_reason: null,
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
