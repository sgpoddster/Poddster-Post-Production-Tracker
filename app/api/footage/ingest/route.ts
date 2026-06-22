import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Receives non-hasPP booking data from GAS.
// Auth: same x-api-key header as /api/bookings/ingest.
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.INGEST_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    jobId?: string
    orderId?: string
    clientName?: string
    clientCode?: string
    filmingDate?: string
    filmingTime?: string
    setup?: string
    services?: string
    addons?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const row = {
    job_id:       String(body.jobId).trim().toUpperCase(),
    order_id:     body.orderId     ?? null,
    client_name:  body.clientName  ?? null,
    client_code:  body.clientCode  ?? null,
    filming_date: body.filmingDate ?? null,
    filming_time: body.filmingTime ?? null,
    setup:        body.setup       ?? null,
    services:     body.services    ?? null,
    addons:       body.addons      ?? null,
    source:       'calendar' as const,
  }

  // Upsert on job_id — re-running GAS sync is safe, drive_link and sent_at are not overwritten
  const { data, error } = await supabase
    .from('footage_deliveries')
    .upsert(row, { onConflict: 'job_id', ignoreDuplicates: true })
    .select('id, job_id')
    .single()

  if (error) {
    console.error('[footage/ingest] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: data?.id, job_id: data?.job_id })
}
