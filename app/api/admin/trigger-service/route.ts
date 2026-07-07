import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { addWorkDays, versionLabel, workDaysForVersion } from '@/lib/utils'
import { getHolidayDates } from '@/lib/holidays'
import { sendBatchAssignmentEmail } from '@/lib/email'
import { createFrameIoShootFolder } from '@/lib/frameio-folders'

// Temporary service-role-protected trigger endpoint (remove after use)
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('x-service-key')
  if (authHeader !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const projectIds: string[] = Array.isArray(body?.projectIds) ? body.projectIds : []
  if (projectIds.length === 0) {
    return NextResponse.json({ error: 'No projects selected' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: projects, error: fetchErr } = await supabase
    .from('projects')
    .select('*')
    .in('id', projectIds)
    .eq('status', 'pending_trigger')

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!projects || projects.length === 0) {
    return NextResponse.json({ error: 'No matching pending projects' }, { status: 400 })
  }

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const holidays = await getHolidayDates()
  let representativeDue = todayStr

  for (const project of projects) {
    const startingVersion = project.current_version ?? 1
    const newStatus = startingVersion > 1 ? 'in_revision' : 'active'
    await supabase.from('projects').update({ status: newStatus }).eq('id', project.id)

    if (startingVersion > 1) {
      const placeholders = Array.from({ length: startingVersion - 1 }, (_, i) => ({
        project_id: project.id, version_number: i + 1, label: versionLabel(i + 1),
      }))
      await supabase.from('versions').upsert(placeholders, { onConflict: 'project_id,version_number', ignoreDuplicates: true })
    }

    const dueStr = addWorkDays(today, workDaysForVersion(startingVersion), holidays).toISOString().split('T')[0]
    representativeDue = dueStr
    await supabase.from('versions').upsert({
      project_id: project.id, version_number: startingVersion,
      label: versionLabel(startingVersion), submitted_date: todayStr, due_date: dueStr,
    }, { onConflict: 'project_id,version_number' })
  }

  const first = projects[0]
  if (first.assigned_editor) {
    const { data: editorProfile } = await supabase
      .from('user_profiles').select('display_name').eq('email', first.assigned_editor).single()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://poddster-post-production-tracker.vercel.app'
    await sendBatchAssignmentEmail({
      editorEmail: first.assigned_editor,
      editorName: editorProfile?.display_name ?? first.assigned_editor.split('@')[0],
      clientName: first.client_name ?? 'Client',
      items: projects.map(p => ({ type: p.type, highlightNumber: p.highlight_number })),
      filmingDate: first.filming_date,
      filmingTime: first.filming_time,
      dueDate: representativeDue,
      projectUrl: `${appUrl}/projects/${first.id}`,
    }).catch(e => console.error('[email] error:', e))
  }

  try {
    const folderUrl = await createFrameIoShootFolder({
      clientName: first.client_name, jobId: first.job_id,
      filmingDate: first.filming_date, filmingTime: first.filming_time,
    })
    if (folderUrl) {
      await supabase.from('projects').update({ frameio_folder_link: folderUrl }).eq('job_id', first.job_id)
    }
  } catch (e) {
    console.error('[frameio] error:', e)
  }

  return NextResponse.json({ success: true, triggered: projects.length, projects: projects.map(p => p.id) })
}
