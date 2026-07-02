import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addWorkDays, versionLabel, workDaysForVersion } from '@/lib/utils'
import { getHolidayDates } from '@/lib/holidays'
import { sendAssignmentEmail } from '@/lib/email'
import { createFrameIoShootFolder } from '@/lib/frameio-folders'

export const maxDuration = 300

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

  // V1 = first cut (active); V2+ means it's coming in mid-pipeline as a revision
  const newStatus = startingVersion > 1 ? 'in_revision' : 'active'

  // Move project into the pipeline (keep current_version as-is)
  const { data: project, error: updateError } = await supabase
    .from('projects')
    .update({ status: newStatus })
    .eq('id', id)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Upsert empty placeholder rows for any versions before the starting version.
  // ignoreDuplicates so re-triggers don't overwrite already-completed earlier versions.
  if (startingVersion > 1) {
    const placeholders = Array.from({ length: startingVersion - 1 }, (_, i) => ({
      project_id:     id,
      version_number: i + 1,
      label:          versionLabel(i + 1),
      submitted_date: null,
      due_date:       null,
      done_date:      null,
    }))
    await supabase.from('versions').upsert(placeholders, { onConflict: 'project_id,version_number', ignoreDuplicates: true })
  }

  // Upsert the active starting version with due date (handles re-triggers cleanly)
  const holidays   = await getHolidayDates()
  const dueDate    = addWorkDays(submittedDate, workDaysForVersion(startingVersion), holidays)
  const dueDateStr = dueDate.toISOString().split('T')[0]

  const { error: versionError } = await supabase
    .from('versions')
    .upsert({
      project_id:     id,
      version_number: startingVersion,
      label:          versionLabel(startingVersion),
      submitted_date: submittedDateStr,
      due_date:       dueDateStr,
    }, { onConflict: 'project_id,version_number' })

  if (versionError) {
    console.error('Version insert error:', versionError)
    // Non-fatal — project is already active
  }

  // Send assignment email to editor.
  // Awaited (not fire-and-forget) so it actually runs before the serverless
  // function freezes on return; errors are swallowed so they never fail the trigger.
  if (project.assigned_editor) {
    const { data: editorProfile } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('email', project.assigned_editor)
      .single()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://poddster-post-production-tracker.vercel.app'

    await sendAssignmentEmail({
      editorEmail:     project.assigned_editor,
      editorName:      editorProfile?.display_name ?? project.assigned_editor.split('@')[0],
      clientName:      project.client_name ?? 'Client',
      projectType:     project.type,
      highlightNumber: project.highlight_number,
      filmingDate:     project.filming_date,
      filmingTime:     project.filming_time,
      dueDate:         dueDateStr,
      projectUrl:      `${appUrl}/projects/${id}`,
    }).catch(e => console.error('[email] background error:', e))
  }

  // Create Frame.io shoot folder — must be awaited before return, Vercel kills
  // the function as soon as the response is sent so .then() chains never run.
  try {
    const folderUrl = await createFrameIoShootFolder({
      clientName:  project.client_name,
      jobId:       project.job_id,
      filmingDate: project.filming_date,
      filmingTime: project.filming_time,
    })
    if (folderUrl) {
      await supabase.from('projects')
        .update({ frameio_folder_link: folderUrl })
        .eq('job_id', project.job_id)
    }
  } catch (e) {
    console.error('[frameio-folders] trigger error:', e)
  }

  return NextResponse.json({ success: true, project })
}
