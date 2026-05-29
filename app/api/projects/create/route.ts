import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addWorkDays } from '@/lib/utils'

function generateJobId(): string {
  const prefix = 'ABCDEF'[Math.floor(Math.random() * 6)]
  const chars = 'ABCDEF0123456789'
  let id = prefix
  for (let i = 0; i < 4; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    client_name,
    client_code,
    order_id,
    filming_date,
    filming_time,
    shoot_duration,
    setup,
    seats,
    assigned_editor,
    services,
    addons,
    notes,
    episode_count = 1,
    highlight_count = 0,
    drive_link,
  } = body

  if (!client_name) {
    return NextResponse.json({ error: 'client_name is required' }, { status: 400 })
  }

  const jobId = generateJobId()
  const rows = []

  // Episode rows: {jobId}E1, {jobId}E2, …
  for (let i = 1; i <= Math.max(1, Number(episode_count)); i++) {
    rows.push({
      job_id:            jobId,
      internal_id:       `${jobId}E${i}`,
      order_id:          order_id || null,
      client_name,
      client_code:       client_code || null,
      assigned_editor:   assigned_editor || null,
      type:              'episode',
      highlight_number:  null,
      filming_date:      filming_date || null,
      filming_time:      filming_time || null,
      shoot_duration:    shoot_duration || null,
      setup:             setup || null,
      seats:             seats ?? null,
      drive_link:        drive_link || null,
      services:          services || null,
      addons:            addons || null,
      notes:             notes || null,
      status:            'pending_trigger',
      current_version:   1,
      source:            'manual',
    })
  }

  // Highlight rows: {jobId}H1, {jobId}H2, …
  for (let i = 1; i <= Number(highlight_count); i++) {
    rows.push({
      job_id:            jobId,
      internal_id:       `${jobId}H${i}`,
      order_id:          order_id || null,
      client_name,
      client_code:       client_code || null,
      assigned_editor:   assigned_editor || null,
      type:              'highlight',
      highlight_number:  i,
      filming_date:      filming_date || null,
      filming_time:      filming_time || null,
      shoot_duration:    shoot_duration || null,
      setup:             setup || null,
      seats:             seats ?? null,
      drive_link:        drive_link || null,
      services:          services || null,
      addons:            addons || null,
      notes:             notes || null,
      status:            'pending_trigger',
      current_version:   1,
      source:            'manual',
    })
  }

  const { data, error } = await supabase.from('projects').insert(rows).select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ jobId, projects: data }, { status: 201 })
}
