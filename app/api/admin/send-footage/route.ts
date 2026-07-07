import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendFootageDeliveryEmail } from '@/lib/email'

// Admin utility: send the footage delivery email for a specific delivery record.
// Auth: ?key=<INGEST_API_KEY>
// Usage: GET /api/admin/send-footage?key=...&deliveryId=<uuid>
export async function GET(req: NextRequest) { return run(req) }
export async function POST(req: NextRequest) { return run(req) }

async function run(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const key    = params.get('key')

  if (!process.env.INGEST_API_KEY || key !== process.env.INGEST_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const deliveryId = params.get('deliveryId')
  if (!deliveryId) {
    return NextResponse.json({ error: 'Provide ?deliveryId=<uuid>' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: delivery, error: fetchErr } = await supabase
    .from('footage_deliveries')
    .select('*')
    .eq('id', deliveryId)
    .single()

  if (fetchErr || !delivery) return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
  if (!delivery.drive_link) return NextResponse.json({ error: 'No Drive link set on this delivery' }, { status: 400 })
  if (!delivery.email) return NextResponse.json({ error: 'No email address on this delivery' }, { status: 400 })

  await sendFootageDeliveryEmail({
    toEmails:        [delivery.email],
    ccEmails:        [],
    clientFirstName: null,
    clientName:      delivery.client_name ?? '',
    driveLink:       delivery.drive_link,
  })

  const now     = new Date()
  const expires = new Date(now)
  expires.setDate(expires.getDate() + 7)
  const expiresAt = expires.toISOString().split('T')[0]

  await supabase
    .from('footage_deliveries')
    .update({ sent_at: now.toISOString(), expires_at: expiresAt, updated_at: now.toISOString() })
    .eq('id', deliveryId)

  return NextResponse.json({
    success:    true,
    client:     delivery.client_name,
    sentTo:     delivery.email,
    expiresAt,
  })
}
