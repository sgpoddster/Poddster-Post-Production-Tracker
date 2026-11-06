import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendFootageReminderEmail, sendFootageExpiredEmail } from '@/lib/email'
import { deliveryRecipients, loadClientContacts } from '@/lib/footage-email'
import { getDriveToken, extractFolderId, trashFolder } from '@/lib/drive-trash'

// Daily cron: send expiry reminder (T-2 days) and expiry notice (on expiry date),
// then trash the Drive folder once the expiry email has been sent.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const queryKey   = new URL(req.url).searchParams.get('key')
  const cronSecret = process.env.CRON_SECRET
  const ingestKey  = process.env.INGEST_API_KEY

  if (!(cronSecret && authHeader === `Bearer ${cronSecret}`) &&
      !(ingestKey  && queryKey   === ingestKey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ?testTo=email  → send both email types to this address only; no DB changes, no deletions
  // ?onlyId=uuid   → restrict to one delivery record (combine with testTo for safe previewing)
  const params    = new URL(req.url).searchParams
  const testTo    = params.get('testTo')
  const onlyId    = params.get('onlyId')

  const supabase  = createServiceClient()
  const today     = new Date().toISOString().split('T')[0]
  const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString().split('T')[0]

  let reminders = 0, expired = 0, deleted = 0
  const clients = await loadClientContacts(supabase)

  // ── Reminder: expires_at = today + 2 days, reminder not yet sent ─────────────
  let reminderQuery = supabase
    .from('footage_deliveries')
    .select('id, email, extra_emails, client_name, drive_link')
    .eq('expires_at', inTwoDays)
    .not('sent_at', 'is', null)
  if (!testTo) reminderQuery = reminderQuery.is('reminder_sent_at', null)
  if (onlyId)  reminderQuery = reminderQuery.eq('id', onlyId)
  const { data: reminderRows } = await reminderQuery

  for (const row of reminderRows ?? []) {
    if (!row.drive_link) continue
    const toEmails = testTo ? [testTo] : deliveryRecipients(row, clients)
    if (!toEmails.length) continue
    await sendFootageReminderEmail({ toEmails, clientName: row.client_name ?? '', driveLink: row.drive_link })
    if (!testTo) {
      await supabase.from('footage_deliveries').update({ reminder_sent_at: new Date().toISOString() }).eq('id', row.id)
    }
    reminders++
  }

  // ── Expiry: expires_at <= today, expiry email not yet sent ───────────────────
  let expiredQuery = supabase
    .from('footage_deliveries')
    .select('id, email, extra_emails, client_name, drive_link')
    .lte('expires_at', today)
    .not('sent_at', 'is', null)
  if (!testTo) expiredQuery = expiredQuery.is('expired_sent_at', null)
  if (onlyId)  expiredQuery = expiredQuery.eq('id', onlyId)
  const { data: expiredRows } = await expiredQuery

  const driveToken = (!testTo && expiredRows?.length) ? await getDriveToken() : null

  for (const row of expiredRows ?? []) {
    const toEmails = testTo ? [testTo] : deliveryRecipients(row, clients)
    if (!toEmails.length) continue

    await sendFootageExpiredEmail({ toEmails, clientName: row.client_name ?? '' })

    if (!testTo) {
      let trashed = false
      if (driveToken) {
        const folderId = extractFolderId(row.drive_link)
        if (folderId) { trashed = await trashFolder(folderId, driveToken); if (trashed) deleted++ }
      }
      await supabase.from('footage_deliveries').update({
        expired_sent_at: new Date().toISOString(),
        drive_link:      trashed ? null : row.drive_link,
      }).eq('id', row.id)
    }

    expired++
  }

  console.log(`[footage-expiry] reminders=${reminders} expired=${expired} deleted=${deleted}${testTo ? ' (test mode)' : ''}`)
  return NextResponse.json({ ok: true, reminders, expired, deleted, testMode: !!testTo })
}
