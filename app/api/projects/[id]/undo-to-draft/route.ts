import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: project } = await supabase
    .from('projects')
    .select('status, current_version')
    .eq('id', params.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['active', 'in_revision'].includes(project.status)) {
    return NextResponse.json({ error: 'Project is not in progress' }, { status: 400 })
  }

  // Delete the current version row created at trigger time
  await supabase
    .from('versions')
    .delete()
    .eq('project_id', params.id)
    .eq('version_number', project.current_version)

  // Reset to draft; current_version steps back (or null if was V1)
  const prevVersion = project.current_version > 1 ? project.current_version - 1 : null

  const { error } = await supabase
    .from('projects')
    .update({
      status: 'pending_trigger',
      current_version: prevVersion,
      previous_status: null,
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
