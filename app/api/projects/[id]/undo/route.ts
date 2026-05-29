import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: project } = await supabase
    .from('projects')
    .select('status, previous_status, current_version')
    .eq('id', params.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!project.previous_status) return NextResponse.json({ error: 'Nothing to undo' }, { status: 400 })

  const restoreStatus = project.previous_status

  const updates: Record<string, unknown> = {
    status: restoreStatus,
    previous_status: null,
  }

  // If undoing a "done" action (going back to active/in_revision),
  // also clear the done_date on the current version
  if (project.status === 'in_client_review') {
    await supabase
      .from('versions')
      .update({ done_date: null })
      .eq('project_id', params.id)
      .eq('version_number', project.current_version)
  }

  const { error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, restoredStatus: restoreStatus })
}
