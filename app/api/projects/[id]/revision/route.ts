import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addWorkDays, versionLabel, workDaysForVersion } from '@/lib/utils'
import { getHolidayDates } from '@/lib/holidays'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params

  let submittedDate: string | null = null
  try { const body = await req.json(); submittedDate = body?.submittedDate ?? null } catch { /* no body */ }

  // Get current version
  const { data: project } = await supabase
    .from('projects')
    .select('current_version')
    .eq('id', id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const nextVersion = project.current_version + 1

  // Calculate due date from the submitted date (or today if not provided)
  const baseDate = submittedDate ? new Date(submittedDate + 'T00:00:00') : new Date()
  const holidays = await getHolidayDates()
  const dueDate = addWorkDays(baseDate, workDaysForVersion(nextVersion), holidays)
  const dueDateStr = dueDate.toISOString().split('T')[0]

  // Upsert: if a version row already exists (e.g. after a manual revert), reset its due date
  const { error: versionError } = await supabase
    .from('versions')
    .upsert({
      project_id:     id,
      version_number: nextVersion,
      label:          versionLabel(nextVersion),
      due_date:       dueDateStr,
      done_date:      null,
    }, { onConflict: 'project_id,version_number' })

  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 })

  // Update project status → in_revision, bump current_version
  const { error: updateError } = await supabase
    .from('projects')
    .update({ status: 'in_revision', current_version: nextVersion })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true, newVersion: nextVersion })
}
