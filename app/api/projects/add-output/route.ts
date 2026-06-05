import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { job_id, type, number } = await request.json()
  if (!job_id || !['episode', 'highlight'].includes(type)) {
    return NextResponse.json({ error: 'job_id and type are required' }, { status: 400 })
  }
  const chosenNum = Number.isInteger(number) && number >= 1 && number <= 10 ? number : null

  // Fetch all existing rows for this job
  const { data: siblings, error: fetchError } = await supabase
    .from('projects')
    .select('*')
    .eq('job_id', job_id)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!siblings || siblings.length === 0) {
    return NextResponse.json({ error: 'No project found with that job_id' }, { status: 404 })
  }

  // Use the first sibling as the template for shared fields
  const template = siblings[0]

  // Use the chosen number, or auto-sequence from existing rows of this type
  const existingOfType = siblings.filter(p => p.type === type)
  const nextNum = chosenNum ?? existingOfType.length + 1
  const internal_id = type === 'episode'
    ? `${job_id}E${nextNum}`
    : `${job_id}H${nextNum}`

  // Check for internal_id collision (safety net)
  const collision = siblings.find(p => p.internal_id === internal_id)
  if (collision) {
    return NextResponse.json({ error: `${internal_id} already exists` }, { status: 409 })
  }

  const { data: newProject, error: insertError } = await supabase
    .from('projects')
    .insert({
      job_id,
      internal_id,
      order_id:          template.order_id,
      client_name:       template.client_name,
      client_code:       template.client_code,
      assigned_editor:   template.assigned_editor,
      assigned_producer: template.assigned_producer,
      type,
      highlight_number:  type === 'highlight' ? nextNum : null,
      filming_date:      template.filming_date,
      filming_time:      template.filming_time,
      shoot_duration:    template.shoot_duration,
      drive_link:        template.drive_link,
      notes:             template.notes,
      status:            'pending_trigger',
      current_version:   1,
      source:            'manual',
    })
    .select()
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ project: newProject }, { status: 201 })
}
