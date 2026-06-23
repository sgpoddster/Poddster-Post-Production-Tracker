import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendFootage1080pEmail } from '@/lib/email'

// POST /api/footage/convert-callback — called by Cloud Run when conversion is complete
export async function POST(req: NextRequest) {
  // Verify it's from our Cloud Run service (same shared token)
  const expectedToken = process.env.MP4_CONVERTOR_TOKEN
  if (!expectedToken) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  let body: {
    delivery_id: string
    status: string
    converted_link: string
    files: { file: string; kind: string; status: string; message?: string }[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Simple token check from query param (Cloud Run can't easily add auth headers)
  const bodyAsAny = body as Record<string, unknown>
  const token = req.nextUrl.searchParams.get('token') ?? (bodyAsAny['token'] as string | undefined)
  if (token !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { delivery_id, status, converted_link } = body
  if (!delivery_id) {
    return NextResponse.json({ error: 'delivery_id required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const conversionStatus = status === 'done' ? 'done' : 'error'

  await supabase
    .from('footage_deliveries')
    .update({
      conversion_status: conversionStatus,
      converted_link:    conversionStatus === 'done' ? (converted_link ?? null) : null,
      updated_at:        new Date().toISOString(),
    })
    .eq('id', delivery_id)

  if (conversionStatus !== 'done' || !converted_link) {
    console.error(`[convert-callback] conversion failed for ${delivery_id}:`, status)
    return NextResponse.json({ success: true })
  }

  // Look up delivery details to send the email
  const { data: delivery } = await supabase
    .from('footage_deliveries')
    .select('*')
    .eq('id', delivery_id)
    .single()

  if (!delivery) {
    return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
  }

  // Look up client email(s)
  const { data: client } = await supabase
    .from('clients')
    .select('emails, cc_emails, first_name')
    .ilike('name', delivery.client_name ?? '')
    .single()

  const toEmails: string[] = (client?.emails ?? []).filter(Boolean)
  if (toEmails.length > 0) {
    await sendFootage1080pEmail({
      toEmails,
      ccEmails:        client?.cc_emails ?? [],
      clientFirstName: client?.first_name ?? null,
      clientName:      delivery.client_name ?? '',
      convertedLink:   converted_link,
    })

    // Set sent_at if not already sent (so it moves to Active section)
    if (!delivery.sent_at) {
      const now = new Date()
      const expires = new Date(now)
      expires.setDate(expires.getDate() + 7)
      await supabase
        .from('footage_deliveries')
        .update({
          sent_at:    now.toISOString(),
          expires_at: expires.toISOString().split('T')[0],
          updated_at: now.toISOString(),
        })
        .eq('id', delivery_id)
    }
  } else {
    console.warn(`[convert-callback] no email on file for ${delivery.client_name} — skipping send`)
  }

  return NextResponse.json({ success: true })
}
