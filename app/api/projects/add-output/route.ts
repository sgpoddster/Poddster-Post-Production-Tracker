import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { job_id, type, count = 1, start_from = 1 } = await request.json()
  if (!job_id || !['episode', 'highlight'].includes(type)) {
    return NextResponse.json({ error: 'job_id and type are required' }, { status: 400 })
  }

  const numCount = Math.max(1, Math.min(10, Number(count)))
  const numStart = Math.max(1, Math.min(10, Number(start_from)))

  // Fetch all existing rows for this job
  const { data: siblings, error: fetchError } = await supabase
    .from('projects')
    .select('*')
    .eq('job_id', job_id)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!siblings || siblings.length === 0) {
    return NextResponse.json({ error: 'No project found with that job_id' }, { status: 404 })
  }

  const template = siblings[0]
  const existingIds = new Set(siblings.map((p: { internal_id: string }) => p.internal_id))
  const prefix = type === 'episode' ? 'E' : 'H'

  // Build rows to insert, checking for collisions
  const rows = []
  const collisions: string[] = []
  for (let i = 0; i < numCount; i++) {
    const n = numStart + i
    const internal_id = `${job_id}${prefix}${n}`
    if (existingIds.has(internal_id)) {
      collisions.push(internal_id)
    } else {
      rows.push({
        job_id,
        internal_id,
        order_id:          template.order_id,
        client_name:       template.client_name,
        client_code:       template.client_code,
        assigned_editor:   template.assigned_editor,
        assigned_producer: template.assigned_producer,
        type,
        highlight_number:  type === 'highlight' ? n : null,
        filming_date:      template.filming_date,
        filming_time:      template.filming_time,
        shoot_duration:    template.shoot_duration,
        drive_link:        template.drive_link,
        notes:             template.notes,
        status:            'pending_trigger',
        current_version:   1,
        source:            'manual',
      })
    }
  }

  if (collisions.length > 0) {
    return NextResponse.json(
      { error: `Already exists: ${collisions.join(', ')}` },
      { status: 409 }
    )
  }

  const { data: newProjects, error: insertError } = await supabase
    .from('projects')
    .insert(rows)
    .select()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ projects: newProjects }, { status: 201 })
}
