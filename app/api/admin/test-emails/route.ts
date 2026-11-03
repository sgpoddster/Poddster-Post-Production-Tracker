import { NextRequest, NextResponse } from 'next/server'
import { getUserProfile } from '@/lib/auth'
import {
  sendFootageDeliveryEmail,
  sendFootage1080pEmail,
  sendFootageReminderEmail,
  sendFootageExpiredEmail,
  sendReviewChaseEmail,
} from '@/lib/email'

// GET /api/admin/test-emails?type=all — send sample client emails to the signed-in admin only.
// Sample data, no DB reads or writes. type: 4k | 1080p | reminder | deleted | chase1 | chase2 | all
const SAMPLE_LINK = 'https://drive.google.com/drive/my-drive'

const SAMPLE_ITEMS = [
  { type: 'episode' as const,   internalId: 'TEST1E',  filmingDate: '2026-11-03', filmingTime: '17:00 - 18:00', version: 1, orderId: 'TESTORDER' },
  { type: 'highlight' as const, highlightNumber: 1, internalId: 'TEST1H1', filmingDate: '2026-11-03', filmingTime: '17:00 - 18:00', version: 1, orderId: 'TESTORDER' },
]

const SENDERS: Record<string, (to: string) => Promise<string | null | undefined>> = {
  '4k':       to => sendFootageDeliveryEmail({ toEmails: [to], clientFirstName: null, clientName: 'Test Client', driveLink: SAMPLE_LINK }),
  '1080p':    to => sendFootage1080pEmail({ toEmails: [to], clientFirstName: null, clientName: 'Test Client', convertedLink: SAMPLE_LINK }),
  'reminder': to => sendFootageReminderEmail({ toEmails: [to], clientName: 'Test Client', driveLink: SAMPLE_LINK }),
  'deleted':  to => sendFootageExpiredEmail({ toEmails: [to], clientName: 'Test Client' }),
  'chase1':   to => sendReviewChaseEmail({ toEmails: [to], clientFirstName: null, clientName: 'Test Client', stage: 1, items: SAMPLE_ITEMS, portalUrl: null }),
  'chase2':   to => sendReviewChaseEmail({ toEmails: [to], clientFirstName: null, clientName: 'Test Client', stage: 2, items: SAMPLE_ITEMS, portalUrl: null, extensionToken: 'test-preview' }),
}

export async function GET(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!profile.email) return NextResponse.json({ error: 'No email on your profile' }, { status: 400 })

  const type = new URL(req.url).searchParams.get('type') ?? 'all'
  const types = type === 'all' ? Object.keys(SENDERS) : [type]
  const unknown = types.filter(t => !SENDERS[t])
  if (unknown.length) {
    return NextResponse.json({ error: `Unknown type: ${unknown.join(', ')}`, types: Object.keys(SENDERS) }, { status: 400 })
  }

  // Send one at a time with a gap — the GAS relay drops rapid back-to-back calls
  const results: Record<string, string> = {}
  for (const [i, t] of types.entries()) {
    if (i > 0) await new Promise(r => setTimeout(r, 2000))
    results[t] = (await SENDERS[t](profile.email)) ?? 'sent'
  }

  const ok = Object.values(results).every(r => r === 'sent')
  return NextResponse.json({ ok, sentTo: profile.email, results }, { status: ok ? 200 : 502 })
}
