import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { versionId } = await req.json()
  if (!versionId) return NextResponse.json({ error: 'versionId required' }, { status: 400 })

  const today = new Date().toISOString().split('T')[0]

  // Get current status to save for undo
  const { data: project } = await supabase
    .from('projects')
    .select('status')
    .eq('id', params.id)
    .single()

  // Stamp done_date on the version
  const { error: versionError } = await supabase
    .from('versions')
    .update({ done_date: today })
    .eq('id', versionId)

  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 })

  // Update project status → in_client_review, save previous for undo
  const { error: projectError } = await supabase
    .from('projects')
    .update({
      status: 'in_client_review',
      previous_status: project?.status ?? 'active',
      review_chase_stage: 0,
    })
    .eq('id', params.id)

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 })

  return NextResponse.json({ success: true, doneDate: today })
}
