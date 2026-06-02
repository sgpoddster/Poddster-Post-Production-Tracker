import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Frame.io v4 webhook — no signature verification needed (matches GAS implementation).
// Authentication: Adobe IMS OAuth — exchange refresh token for access token, then call v4 API.

const ADOBE_CLIENT_ID = '73aff1fed325400292f5abc97ee331b8'
const ADOBE_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3'

async function getAdobeAccessToken(): Promise<string> {
  const clientSecret = process.env.ADOBE_CLIENT_SECRET
  const refreshToken = process.env.FRAMEIO_REFRESH_TOKEN
  if (!clientSecret || !refreshToken) {
    throw new Error('ADOBE_CLIENT_SECRET or FRAMEIO_REFRESH_TOKEN not set')
  }
  const res = await fetch(ADOBE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     ADOBE_CLIENT_ID,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Adobe token exchange failed: ${res.status} — ${text}`)
  }
  const json = await res.json()
  if (!json.access_token) throw new Error('No access_token in Adobe IMS response')
  return json.access_token as string
}

async function fetchFile(accountId: string, fileId: string, include = 'metadata'): Promise<Record<string, unknown> | null> {
  try {
    const accessToken = await getAdobeAccessToken()
    const qs = include ? `?include=${include}` : ''
    const res = await fetch(
      `https://api.frame.io/v4/accounts/${accountId}/files/${fileId}${qs}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) { console.warn('[frameio] file fetch status:', res.status); return null }
    const json = await res.json()
    return (json.data ?? json) as Record<string, unknown>
  } catch (e) {
    console.error('[frameio] file fetch error:', e)
    return null
  }
}

// TEMP inspector — GET /api/webhooks/frameio?file=<id>&include=metadata
// Lets us pull any file's full object on demand (e.g. one already set to Approved).
const TEMP_ACCOUNT_ID = 'c385b04f-c1b3-496b-93fd-70388b468756'
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const fileId  = url.searchParams.get('file')
  const include = url.searchParams.get('include') ?? 'metadata'
  if (!fileId) return NextResponse.json({ error: 'pass ?file=<id>' }, { status: 400 })
  const file = await fetchFile(TEMP_ACCOUNT_ID, fileId, include)
  return NextResponse.json(file ?? { error: 'fetch failed' })
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((cur: unknown, key) => {
    return cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[key] : undefined
  }, obj)
}

function getAny(obj: Record<string, unknown>, paths: string[]): string {
  for (const p of paths) {
    const v = getPath(obj, p)
    if (v !== undefined && v !== null && v !== '') return String(v)
  }
  return ''
}

// Extract the internal_id from a Frame.io file name.
// Format: "{internal_id} {time} {date} - V{n}"
// e.g.  "F8C0AH1 230pm 7th May 2026 - V2"
function extractInternalId(name: string): string | null {
  const token = name.trim().split(/\s+/)[0]
  if (/^[A-F][A-F0-9]{4}(E\d*|H\d+)$/i.test(token)) return token.toUpperCase()
  return null
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  console.log('[frameio] body:', rawBody.slice(0, 400))

  let payloadRaw: Record<string, unknown>
  try {
    payloadRaw = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Unwrap data envelope: Frame.io v4 wraps the event in { data: { ... } }
  const payload = (payloadRaw.data && typeof payloadRaw.data === 'object')
    ? payloadRaw.data as Record<string, unknown>
    : payloadRaw

  const eventType = getAny(payload, ['type', 'event'])
  console.log('[frameio] event type:', eventType)

  const accountId = getAny(payload, ['account.id'])
  const fileId    = getAny(payload, ['resource.id'])
  console.log('[frameio] accountId:', accountId, 'fileId:', fileId)

  if (!accountId || !fileId) {
    return NextResponse.json({ skipped: true, reason: 'missing account.id or resource.id' })
  }

  // Fetch the full file object once (we need the name; also lets us inspect status fields)
  const file = await fetchFile(accountId, fileId)

  // TEMP INSPECTION: dump the full file object so we can see the status field shape.
  // Remove once the Approved→Complete automation is built.
  console.log('[frameio] FULL FILE OBJECT:', JSON.stringify(file, null, 2))

  // Only the file.ready event drives the "delivered → client review" automation
  if (eventType !== 'file.ready') {
    return NextResponse.json({ inspected: true, event: eventType })
  }

  const fileName = (file?.name as string) ?? ''
  console.log('[frameio] file name:', fileName)

  if (!fileName) {
    return NextResponse.json({ skipped: true, reason: 'could not fetch file name from Frame.io API' })
  }

  const internalId = extractInternalId(fileName)
  if (!internalId) {
    console.log(`[frameio] "${fileName}" — no internal_id, ignoring`)
    return NextResponse.json({ skipped: true, reason: 'no internal_id in filename' })
  }

  const supabase = createServiceClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, status, current_version, internal_id')
    .eq('internal_id', internalId)
    .single()

  if (!project) {
    console.log(`[frameio] No project for "${internalId}"`)
    return NextResponse.json({ skipped: true, reason: `project "${internalId}" not found` })
  }

  if (!['active', 'in_revision'].includes(project.status)) {
    console.log(`[frameio] "${internalId}" is "${project.status}" — no action`)
    return NextResponse.json({ skipped: true, reason: `status is '${project.status}'` })
  }

  const { data: version } = await supabase
    .from('versions')
    .select('id')
    .eq('project_id', project.id)
    .eq('version_number', project.current_version)
    .single()

  if (!version) {
    return NextResponse.json({ error: 'version row not found' }, { status: 500 })
  }

  const today = new Date().toISOString().split('T')[0]

  await supabase.from('versions').update({ done_date: today }).eq('id', version.id)
  await supabase.from('projects').update({
    status: 'in_client_review',
    previous_status: project.status,
  }).eq('id', project.id)

  console.log(`[frameio] ✓ "${internalId}" → in_client_review (V${project.current_version})`)

  return NextResponse.json({ success: true, internalId, version: project.current_version })
}
