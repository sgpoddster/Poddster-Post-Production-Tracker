import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch current project to get hold_date and current_version
  const { data: project } = await supabase
    .from('projects')
    .select('hold_date, current_version')
    .eq('id', params.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!project.hold_date) return NextResponse.json({ error: 'Not on hold' }, { status: 400 })

  // Extend the current version's due_date by the number of calendar days it was paused
  const holdDate = new Date(project.hold_date + 'T00:00:00')
  const today    = new Date()
  const daysPaused = Math.round((today.getTime() - holdDate.getTime()) / 86_400_000)

  if (daysPaused > 0) {
    const { data: ver } = await supabase
      .from('versions')
      .select('id, due_date')
      .eq('project_id', params.id)
      .eq('version_number', project.current_version)
      .single()

    if (ver?.due_date) {
      const oldDue = new Date(ver.due_date + 'T00:00:00')
      oldDue.setDate(oldDue.getDate() + daysPaused)
      const newDueStr = oldDue.toISOString().split('T')[0]

      await supabase
        .from('versions')
        .update({ due_date: newDueStr })
        .eq('id', ver.id)
    }
  }

  // Clear hold state
  const { error } = await supabase
    .from('projects')
    .update({ on_hold: false, hold_date: null })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, daysPaused })
}
