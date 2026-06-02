import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addWorkDays, versionLabel, workDaysForVersion } from '@/lib/utils'
import { sendAssignmentEmail } from '@/lib/email'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params

  // Optional: admin can pass a past submittedDate to backdate the deadline
  let submittedDate: Date = new Date()
  try {
    const body = await req.json()
    if (body?.submittedDate) {
      const parsed = new Date(body.submittedDate + 'T00:00:00')
      if (!isNaN(parsed.getTime())) submittedDate = parsed
    }
  } catch { /* no body — use today */ }

  const submittedDateStr = submittedDate.toISOString().split('T')[0]

  // Fetch current project to get starting_version
  const { data: existing } = await supabase
    .from('projects')
    .select('current_version')
    .eq('id', id)
    .single()

  const startingVersion = existing?.current_version ?? 1

  // Move project to active (keep current_version as-is)
  const { data: project, error: updateError } = await supabase
    .from('projects')
    .update({ status: 'active' })
    .eq('id', id)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Insert empty placeholder rows for any versions before the starting version
  if (startingVersion > 1) {
    const placeholders = Array.from({ length: startingVersion - 1 }, (_, i) => ({
      project_id:     id,
      version_number: i + 1,
      label:          versionLabel(i + 1),
      submitted_date: null,
      due_date:       null,
      done_date:      null,
    }))
    await supabase.from('versions').insert(placeholders)
  }

  // Insert the active starting version with due date
  const dueDate    = addWorkDays(submittedDate, workDaysForVersion(startingVersion))
  const dueDateStr = dueDate.toISOString().split('T')[0]

  const { error: versionError } = await supabase
    .from('versions')
    .insert({
      project_id:     id,
      version_number: startingVersion,
      label:          versionLabel(startingVersion),
      submitted_date: submittedDateStr,
      due_date:       dueDateStr,
    })

  if (versionError) {
    console.error('Version insert error:', versionError)
    // Non-fatal — project is already active
  }

  // Send assignment email to editor (non-blocking)
  if (project.assigned_editor) {
    const { data: editorProfile } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('email', project.assigned_editor)
      .single()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://poddster-post-production-tracker.vercel.app'

    sendAssignmentEmail({
      editorEmail:     project.assigned_editor,
      editorName:      editorProfile?.display_name ?? project.assigned_editor.split('@')[0],
      clientName:      project.client_name ?? 'Client',
      projectType:     project.type,
      highlightNumber: project.highlight_number,
      filmingDate:     project.filming_date,
      dueDate:         dueDateStr,
      projectUrl:      `${appUrl}/projects/${id}`,
    }).catch(e => console.error('[email] background error:', e))
  }

  return NextResponse.json({ success: true, project })
}
