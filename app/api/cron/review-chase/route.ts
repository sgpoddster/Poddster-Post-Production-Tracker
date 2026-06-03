import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendReviewChaseEmail } from '@/lib/email'

// Daily job (called by a GAS time-trigger): chase clients who haven't responded
// to a Client Review. Purely reads our own tables — no Frame.io.
//   Day 7  in review  → reminder    (review_chase_stage 0 → 1)
//   Day 14 in review  → final notice (review_chase_stage 1 → 2)
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
  //   - REVIEW_CHASE_LIVE   → live: email clients + advance stage
  const testTo = params.get('testTo')
  const live = process.env.REVIEW_CHASE_LIVE === 'true'
  const mode = testTo ? 'test' : live ? 'live' : 'dry-run'

  const supabase = createServiceClient()
  const todayMs = Date.now()
  const dayMs = 86_400_000

  const { data: projects } = await supabase
    .from('projects')
    .select('id, client_name, type, highlight_number, filming_date, current_version, review_chase_stage, versions(*)')
    .eq('status', 'in_client_review')

  // Determine which projects are due for stage 1 (≥7d) or stage 2 (≥14d)
  type Due = { stage: 1 | 2; project: { id: string; client_name: string | null; type: 'episode' | 'highlight'; highlight_number: number | null; filming_date: string | null } }
  const due: Due[] = []

  for (const p of projects ?? []) {
    const ver = (p.versions ?? []).find((v: { version_number: number }) => v.version_number === p.current_version)
    if (!ver?.done_date) continue
    const days = Math.floor((todayMs - new Date(ver.done_date + 'T00:00:00').getTime()) / dayMs)
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
      .select('first_name, email, email_2, email_3, portal_token')
      .eq('name', clientName)
      .single()

    const clientEmails = [client?.email, client?.email_2, client?.email_3].filter((e): e is string => !!e)
    const toEmails = testTo ? [testTo] : clientEmails
    const portalUrl = client?.portal_token ? `${appUrl}/client/${client.portal_token}` : null

    // Only send in live or test mode (never in dry-run)
    if (mode !== 'dry-run' && toEmails.length > 0) {
      await sendReviewChaseEmail({
        toEmails,
        clientFirstName: client?.first_name ?? null,
        clientName,
        stage,
        items: rows.map((r: Due) => ({
          type: r.project.type,
          highlightNumber: r.project.highlight_number,
          filmingDate: r.project.filming_date,
        })),
        portalUrl,
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

  return NextResponse.json({ ok: true, mode, due: due.length, emailsSent, clients: groups.size, preview })
}
