import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'

// Frame.io sends:  X-Frameio-Signature: sha256=<hex_hmac>
// We verify it against the raw body using FRAMEIO_WEBHOOK_SECRET.
// If the env var is not set (local dev) we skip verification with a warning.

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.FRAMEIO_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[frameio webhook] FRAMEIO_WEBHOOK_SECRET not set — skipping signature check')
    return true
  }
  if (!signatureHeader) return false

  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')

  try {
    return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))
  } catch {
    return false
  }
}

// Extract the internal_id from a Frame.io asset name.
// Format: "{internal_id} {time} {date} - V{n}"
// e.g.  "E82F2E 2pm 7th May 2026 - V1"
// We take the first whitespace-delimited token.
function extractInternalId(assetName: string): string | null {
  const token = assetName.trim().split(/\s+/)[0]
  // Internal IDs are 6–8 chars: 5-char job_id (A–F prefix) + suffix (E, E1, E2, H1 …)
  if (/^[A-F][A-F0-9]{4}(E\d*|H\d+)$/i.test(token)) return token.toUpperCase()
  return null
}

export async function POST(req: NextRequest) {
  // 1. Read raw body (needed for HMAC verification before JSON.parse)
  const rawBody = await req.text()

  // 2. Verify signature
  const sig = req.headers.get('x-frameio-signature')
  if (!verifySignature(rawBody, sig)) {
    console.error('[frameio webhook] Invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // 3. Parse payload
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 4. Only handle asset.ready — ignore other event types silently
  const eventType = payload.type as string
  if (eventType !== 'asset.ready') {
    return NextResponse.json({ skipped: true, reason: `event type '${eventType}' not handled` })
  }

  // 5. Get asset name from payload
  const resource = payload.resource as Record<string, unknown> | undefined
  const assetName = (resource?.name as string | undefined) ?? ''

  if (!assetName) {
    return NextResponse.json({ skipped: true, reason: 'no asset name' })
  }

  // 6. Parse internal_id from filename
  const internalId = extractInternalId(assetName)
  if (!internalId) {
    console.log(`[frameio webhook] Asset "${assetName}" — no internal_id found, ignoring`)
    return NextResponse.json({ skipped: true, reason: 'no internal_id in filename' })
  }

  // 7. Look up the project
  const supabase = createServiceClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, status, current_version, internal_id')
    .eq('internal_id', internalId)
    .single()

  if (!project) {
    console.log(`[frameio webhook] No project found for internal_id "${internalId}"`)
    return NextResponse.json({ skipped: true, reason: `project "${internalId}" not found` })
  }

  // 8. Only act if the project is active or in_revision
  if (!['active', 'in_revision'].includes(project.status)) {
    console.log(`[frameio webhook] Project "${internalId}" is "${project.status}" — no action`)
    return NextResponse.json({
      skipped: true,
      reason: `project status is '${project.status}', not active/in_revision`,
    })
  }

  // 9. Find the current version row
  const { data: version } = await supabase
    .from('versions')
    .select('id')
    .eq('project_id', project.id)
    .eq('version_number', project.current_version)
    .single()

  if (!version) {
    console.error(`[frameio webhook] No version row for project "${internalId}" V${project.current_version}`)
    return NextResponse.json({ error: 'version row not found' }, { status: 500 })
  }

  const today = new Date().toISOString().split('T')[0]

  // 10. Stamp done_date on the version
  const { error: versionError } = await supabase
    .from('versions')
    .update({ done_date: today })
    .eq('id', version.id)

  if (versionError) {
    console.error('[frameio webhook] version update error:', versionError)
    return NextResponse.json({ error: versionError.message }, { status: 500 })
  }

  // 11. Move project → in_client_review
  const { error: projectError } = await supabase
    .from('projects')
    .update({
      status: 'in_client_review',
      previous_status: project.status,
    })
    .eq('id', project.id)

  if (projectError) {
    console.error('[frameio webhook] project update error:', projectError)
    return NextResponse.json({ error: projectError.message }, { status: 500 })
  }

  console.log(`[frameio webhook] ✓ "${internalId}" moved to in_client_review (V${project.current_version}, done ${today})`)

  return NextResponse.json({
    success: true,
    internalId,
    projectId: project.id,
    version: project.current_version,
    doneDate: today,
  })
}
