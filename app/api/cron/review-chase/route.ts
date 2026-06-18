import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendReviewChaseEmail } from '@/lib/email'
import { deleteFrameIoFolder } from '@/lib/frameio-folders'

// Daily job (called by a GAS time-trigger): chase clients who haven't responded
// to a Client Review.
//   Day 7  in review  → reminder    (review_chase_stage 0 → 1)
//   Day 14 in review  → final notice (review_chase_stage 1 → 2) + extension link
//   Day 21 in review  → delete Frame.io folder, auto-complete project
// Auth: ?key=<INGEST_API_KEY>.
export async function GET(req: NextRequest)  { return run(req) }
export async function POST(req: NextRequest) { return run(req) }

async function run(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const key = params.get('key')
  if (!process.env.INGEST_API_KEY || key !== process.env.INGEST_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // SAFETY: no real client emails until REVIEW_CHASE_LIVE=true is set in env.
  //   - default            → dry run: report who WOULD be chased, send nothing, change nothing
  //   - ?testTo=me@x.com    → send the real email to THAT address only (preview); no stage change
  //   - REVIEW_CHASE_LIVE   → live: email clients + advance stage + run deletions
  const testTo = params.get('testTo')
  const live = process.env.REVIEW_CHASE_LIVE === 'true'
  const mode = testTo ? 'test' : live ? 'live' : 'dry-run'

  // Test-only knobs (ignored in live runs):
  //   onlyClient=<name>  → restrict to one client
  //   days=<n>           → pretend every project's been in review n days
  const onlyClient = params.get('onlyClient')
  const daysOverride = params.get('days') ? Number(params.get('days')) : null

  const supabase = createServiceClient()
  const todayMs = Date.now()
  const today = new Date().toISOString().split('T')[0]
  const dayMs = 86_400_000

  // ─── Day-21 deletion pass (live mode only) ───────────────────────────────
  // Find stage-2 in_client_review projects whose version done_date is ≥21 days
  // ago and whose deletion hold has expired (or was never set).
  let deletedCount = 0
  const deletionLog: { internalId: string; result: boolean }[] = []

  if (mode === 'live') {
    const { data: forDeletion } = await supabase
      .from('projects')
      .select('id, internal_id, client_name, frameio_folder_link, current_version, deletion_hold_until, versions(*)')
      .eq('status', 'in_client_review')
      .eq('review_chase_stage', 2)

    for (const p of forDeletion ?? []) {
      // Skip if within a user-requested hold period
      if (p.deletion_hold_until && p.deletion_hold_until >= today) continue

      const ver = (p.versions ?? []).find((v: { version_number: number }) => v.version_number === p.current_version)
      const days = ver?.done_date
        ? Math.floor((todayMs - new Date(ver.done_date + 'T00:00:00').getTime()) / dayMs)
        : null
      if (days == null || days < 21) continue

      // Delete Frame.io folder if present
      let deleted = true
      if (p.frameio_folder_link) {
        deleted = await deleteFrameIoFolder(p.frameio_folder_link)
      }

      deletionLog.push({ internalId: p.internal_id, result: deleted })

      // Auto-complete regardless of whether deletion succeeded (folder may already be gone)
      await supabase
        .from('projects')
        .update({ status: 'complete', frameio_folder_link: null })
        .eq('id', p.id)

      deletedCount++
    }
  }

  // ─── Chase email pass ─────────────────────────────────────────────────────
  let query = supabase
    .from('projects')
    .select('id, client_name, type, highlight_number, internal_id, filming_date, filming_time, order_id, current_version, review_chase_stage, assigned_editor, versions(*)')
    .eq('status', 'in_client_review')
  if (onlyClient) query = query.eq('client_name', onlyClient)
  const { data: projects } = await query

  // Determine which projects are due for stage 1 (≥7d) or stage 2 (≥14d)
  type Due = { stage: 1 | 2; project: { id: string; client_name: string | null; type: 'episode' | 'highlight'; highlight_number: number | null; internal_id: string; filming_date: string | null; filming_time: string | null; order_id: string | null; current_version: number; assigned_editor: string | null } }
  const due: Due[] = []

  for (const p of projects ?? []) {
    const ver = (p.versions ?? []).find((v: { version_number: number }) => v.version_number === p.current_version)
    const days = daysOverride ?? (ver?.done_date
      ? Math.floor((todayMs - new Date(ver.done_date + 'T00:00:00').getTime()) / dayMs)
      : null)
    if (days == null) continue
    const stage = p.review_chase_stage ?? 0

    if (stage < 1 && days >= 7 && days < 14) due.push({ stage: 1, project: p })
    else if (stage < 2 && days >= 14)        due.push({ stage: 2, project: p })
  }

  // Group by client + stage so each client gets one email per stage
  const groups = new Map<string, Due[]>()
  for (const d of due) {
    const key = `${d.project.client_name ?? ''}|${d.stage}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(d)
  }

  let emailsSent = 0
  const preview: { clientName: string; stage: 1 | 2; to: string[]; count: number }[] = []
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://poddster-post-production-tracker.vercel.app'

  for (const rows of Array.from(groups.values())) {
    const clientName = rows[0].project.client_name ?? ''
    const stage = rows[0].stage

    // Client contact + portal token
    const { data: client } = await supabase
      .from('clients')
      .select('first_name, email, email_2, email_3, portal_token, exclude_from_reminders')
      .eq('name', clientName)
      .single()

    // Client opted out of reminder emails — skip entirely (no send, no stage change)
    if (client?.exclude_from_reminders) continue

    const clientEmails = [client?.email, client?.email_2, client?.email_3].filter((e): e is string => !!e)
    const toEmails = testTo ? [testTo] : clientEmails
    const portalUrl = client?.portal_token ? `${appUrl}/client/${client.portal_token}` : null

    // CC the producer(s) on this group's projects (live only — never to real
    // producers during a test/preview run).
    const ccEmails = mode === 'live'
      ? Array.from(new Set(rows.map((r: Due) => r.project.assigned_editor).filter((e): e is string => !!e)))
      : []

    // Only send in live or test mode (never in dry-run)
    if (mode !== 'dry-run' && toEmails.length > 0) {
      await sendReviewChaseEmail({
        toEmails,
        ccEmails,
        clientFirstName: client?.first_name ?? null,
        clientName,
        stage,
        items: rows.map((r: Due) => ({
          type: r.project.type,
          highlightNumber: r.project.highlight_number,
          internalId: r.project.internal_id,
          filmingDate: r.project.filming_date,
          filmingTime: r.project.filming_time,
          version: r.project.current_version,
          orderId: r.project.order_id,
        })),
        portalUrl,
        // Pass extension token for stage-2 emails so clients can self-serve a 7-day hold
        extensionToken: stage === 2 ? (client?.portal_token ?? null) : null,
      })
      emailsSent++
    }

    // Advance the chase stage ONLY in live mode (test/dry-run leave data untouched
    // so they can be re-run safely).
    if (mode === 'live') {
      await supabase
        .from('projects')
        .update({ review_chase_stage: stage })
        .in('id', rows.map((r: Due) => r.project.id))
    }

    preview.push({ clientName, stage, to: toEmails, count: rows.length })
  }

  return NextResponse.json({
    ok: true,
    mode,
    due: due.length,
    emailsSent,
    clients: groups.size,
    preview,
    deletedCount,
    deletionLog,
  })
}
