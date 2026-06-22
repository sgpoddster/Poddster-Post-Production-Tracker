import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'
import { sendFootageDeliveryEmail } from '@/lib/email'

// POST /api/footage/[id]/send — fire the footage delivery email (admin only)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const { data: delivery, error: fetchErr } = await supabase
    .from('footage_deliveries')
    .select('*')
    .eq('id', params.id)
    .single()

  if (fetchErr || !delivery) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!delivery.drive_link) {
    return NextResponse.json({ error: 'No Drive link saved yet' }, { status: 400 })
  }

  // Look up client email(s) from the shared clients table
  const { data: client } = await supabase
    .from('clients')
    .select('emails, cc_emails, first_name')
    .ilike('name', delivery.client_name ?? '')
    .single()

  const toEmails: string[] = (client?.emails ?? []).filter(Boolean)
  if (toEmails.length === 0) {
    return NextResponse.json({ error: `No email on file for "${delivery.client_name}"` }, { status: 400 })
  }

  await sendFootageDeliveryEmail({
    toEmails,
    ccEmails: client?.cc_emails ?? [],
    clientFirstName: client?.first_name ?? null,
    clientName: delivery.client_name ?? '',
    driveLink: delivery.drive_link,
  })

  // Mark sent and set 7-day expiry
  const now = new Date()
  const expires = new Date(now)
  expires.setDate(expires.getDate() + 7)
  const expiresAt = expires.toISOString().split('T')[0]

  await supabase
    .from('footage_deliveries')
    .update({
      sent_at:    now.toISOString(),
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    })
    .eq('id', params.id)

  return NextResponse.json({ success: true, expires_at: expiresAt })
}
