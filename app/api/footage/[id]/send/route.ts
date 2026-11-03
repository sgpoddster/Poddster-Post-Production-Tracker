import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'
import { sendFootageDeliveryEmail } from '@/lib/email'
import { resolveDeliveryEmail } from '@/lib/footage-email'

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

  // Optional email typed in by the admin when none is on file — saved to the row
  const body = await req.json().catch(() => ({})) as { email?: string }
  const typedEmail = body.email?.trim()
  if (typedEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedEmail)) {
      return NextResponse.json({ error: 'That email address doesn\'t look valid' }, { status: 400 })
    }
    await supabase.from('footage_deliveries').update({ email: typedEmail }).eq('id', params.id)
  }

  const email = typedEmail || await resolveDeliveryEmail(supabase, delivery)
  if (!email) {
    return NextResponse.json({ error: `No email on file for "${delivery.client_name}"`, code: 'no_email' }, { status: 400 })
  }

  await sendFootageDeliveryEmail({
    toEmails: [email],
    ccEmails: [],
    clientFirstName: null,
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
