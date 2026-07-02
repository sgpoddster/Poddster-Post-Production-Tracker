import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addWorkDays, versionLabel, workDaysForVersion } from '@/lib/utils'
import { getHolidayDates } from '@/lib/holidays'
import { sendBatchAssignmentEmail } from '@/lib/email'
import { createFrameIoShootFolder } from '@/lib/frameio-folders'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const projectIds: string[] = Array.isArray(body?.projectIds) ? body.projectIds : []
  if (projectIds.length === 0) {
    return NextResponse.json({ error: 'No projects selected' }, { status: 400 })
  }

  // Fetch the selected projects
  const { data: projects, error: fetchErr } = await supabase
    .from('projects')
    .select('*')
    .in('id', projectIds)
    .eq('status', 'pending_trigger')

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!projects || projects.length === 0) {
    return NextResponse.json({ error: 'No matching pending projects' }, { status: 400 })
  }

  // Safety: all must share one Job ID
  const jobIds = new Set(projects.map(p => p.job_id))
  if (jobIds.size > 1) {
    return NextResponse.json({ error: 'Selected projects span multiple Job IDs' }, { status: 400 })
  }

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const holidays = await getHolidayDates()
  let representativeDue = todayStr

  for (const project of projects) {
    const startingVersion = project.current_version ?? 1
    const newStatus = startingVersion > 1 ? 'in_revision' : 'active'

    await supabase.from('projects').update({ status: newStatus }).eq('id', project.id)

    // Empty placeholders for any versions before the starting one.
    // Upsert (ignoreDuplicates) so re-triggers don't fail on existing placeholder rows.
    if (startingVersion > 1) {
      const placeholders = Array.from({ length: startingVersion - 1 }, (_, i) => ({
        project_id:     project.id,
        version_number: i + 1,
        label:          versionLabel(i + 1),
      }))
      await supabase.from('versions').upsert(placeholders, { onConflict: 'project_id,version_number', ignoreDuplicates: true })
    }

    const dueStr = addWorkDays(today, workDaysForVersion(startingVersion), holidays).toISOString().split('T')[0]
    representativeDue = dueStr
    const { error: versionError } = await supabase.from('versions').upsert({
      project_id:     project.id,
      version_number: startingVersion,
      label:          versionLabel(startingVersion),
      submitted_date: todayStr,
      due_date:       dueStr,
    }, { onConflict: 'project_id,version_number' })
    if (versionError) console.error(`[trigger-batch] version upsert error for ${project.id}:`, versionError)
  }

  // One consolidated email to the producer
  const first = projects[0]
  if (first.assigned_editor) {
    const { data: editorProfile } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('email', first.assigned_editor)
      .single()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://poddster-post-production-tracker.vercel.app'

    await sendBatchAssignmentEmail({
      editorEmail: first.assigned_editor,
      editorName:  editorProfile?.display_name ?? first.assigned_editor.split('@')[0],
      clientName:  first.client_name ?? 'Client',
      items:       projects.map(p => ({ type: p.type, highlightNumber: p.highlight_number })),
      filmingDate: first.filming_date,
      filmingTime: first.filming_time,
      dueDate:     representativeDue,
      projectUrl:  `${appUrl}/projects/${first.id}`,
    }).catch(e => console.error('[email] batch error:', e))
  }

  // Create Frame.io shoot folder once for the whole batch — awaited before return
  // (Vercel terminates the function on response, .then() chains don't run)
  try {
    const folderUrl = await createFrameIoShootFolder({
      clientName:  first.client_name,
      jobId:       first.job_id,
      filmingDate: first.filming_date,
      filmingTime: first.filming_time,
    })
    if (folderUrl) {
      await supabase.from('projects')
        .update({ frameio_folder_link: folderUrl })
        .eq('job_id', first.job_id)
    }
  } catch (e) {
    console.error('[frameio-folders] batch trigger error:', e)
  }

  return NextResponse.json({ success: true, triggered: projects.length })
}
