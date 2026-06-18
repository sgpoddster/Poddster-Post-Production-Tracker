import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { IngestPayload } from '@/lib/types'

export async function POST(req: NextRequest) {
  // Verify the shared API key from GAS
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.INGEST_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: IngestPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.jobId || !body.internalId) {
    return NextResponse.json({ error: 'jobId and internalId are required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const project = {
    job_id:            String(body.jobId).trim().toUpperCase(),
    internal_id:       String(body.internalId).trim().toUpperCase(),
    order_id:          body.orderId          ?? null,
    client_name:       body.clientName       ?? null,
    client_code:       body.clientCode       ?? null,
    assigned_producer: body.assignedProducer ?? null,
    assigned_editor:   body.assignedEditor   ?? null,
    type:              body.type             ?? 'episode',
    highlight_number:  body.highlightNumber  ?? null,
    filming_date:      body.filmingDate      ?? null,
    filming_time:      body.filmingTime      ?? null,
    setup:             body.setup            ?? null,
    drive_link:        body.driveLink        ?? null,
    services:          body.services         ?? null,
    addons:            body.addons           ?? null,
    status:            'pending_trigger' as const,
    source:            'calendar' as const,
  }

  // Upsert: insert new or update existing (matched on internal_id)
  const { data, error } = await supabase
    .from('projects')
    .upsert(project, { onConflict: 'internal_id', ignoreDuplicates: false })
    .select()
    .single()

  if (error) {
    console.error('Ingest error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: data.id, internal_id: data.internal_id })
}
