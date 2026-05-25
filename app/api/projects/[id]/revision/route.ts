import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addWorkDays, versionLabel, workDaysForVersion } from '@/lib/utils'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params

  // Get current version
  const { data: project } = await supabase
    .from('projects')
    .select('current_version')
    .eq('id', id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const nextVersion = project.current_version + 1

  // Create next version row with due date
  const dueDate = addWorkDays(new Date(), workDaysForVersion(nextVersion))
  const dueDateStr = dueDate.toISOString().split('T')[0]

  const { error: versionError } = await supabase
    .from('versions')
    .insert({
      project_id:     id,
      version_number: nextVersion,
      label:          versionLabel(nextVersion),
      due_date:       dueDateStr,
    })

  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 })

  // Update project status → in_revision, bump current_version
  const { error: updateError } = await supabase
    .from('projects')
    .update({ status: 'in_revision', current_version: nextVersion })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true, newVersion: nextVersion })
}
