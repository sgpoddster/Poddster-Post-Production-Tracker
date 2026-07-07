import { NextRequest, NextResponse } from 'next/server'
import { createSign } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { sendFootageReminderEmail, sendFootageExpiredEmail } from '@/lib/email'

// Daily cron: send expiry reminder (T-2 days) and expiry notice (on expiry date),
// then trash the Drive folder once the expiry email has been sent.

async function getDriveToken(): Promise<string | null> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!saJson) return null

  const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
  const now     = Math.floor(Date.now() / 1000)
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  })).toString('base64url')

  const sigInput  = `${header}.${payload}`
  const sign      = createSign('RSA-SHA256')
  sign.update(sigInput)
  const jwt = `${sigInput}.${sign.sign(sa.private_key, 'base64url')}`

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const json = await res.json()
  return json.access_token ?? null
}

function extractFolderId(url: string | null): string | null {
  if (!url) return null
  return url.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] ?? null
}

async function trashFolder(folderId: string, token: string): Promise<boolean> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true`,
    {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ trashed: true }),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    console.error(`[footage-expiry] trash failed for ${folderId}: ${res.status} ${text.slice(0, 200)}`)
    return false
  }
  return true
}

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

  // ── Reminder: expires_at = today + 2 days, reminder not yet sent ─────────────
  let reminderQuery = supabase
    .from('footage_deliveries')
    .select('id, email, client_name, drive_link')
    .eq('expires_at', inTwoDays)
    .not('sent_at', 'is', null)
  if (!testTo) reminderQuery = reminderQuery.is('reminder_sent_at', null)
  if (onlyId)  reminderQuery = reminderQuery.eq('id', onlyId)
  const { data: reminderRows } = await reminderQuery

  for (const row of reminderRows ?? []) {
    if (!row.drive_link) continue
    const toEmails = testTo ? [testTo] : row.email ? [row.email] : []
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
    .select('id, email, client_name, drive_link')
    .lte('expires_at', today)
    .not('sent_at', 'is', null)
  if (!testTo) expiredQuery = expiredQuery.is('expired_sent_at', null)
  if (onlyId)  expiredQuery = expiredQuery.eq('id', onlyId)
  const { data: expiredRows } = await expiredQuery

  const driveToken = (!testTo && expiredRows?.length) ? await getDriveToken() : null

  for (const row of expiredRows ?? []) {
    const toEmails = testTo ? [testTo] : row.email ? [row.email] : []
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
