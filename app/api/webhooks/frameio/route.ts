import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Frame.io v4 webhook — no signature verification needed (matches GAS implementation).
// Payload only contains resource.id — we fetch the filename from the Frame.io API.

async function fetchFileName(accountId: string, fileId: string): Promise<string> {
  const token = process.env.FRAMEIO_API_TOKEN
  if (!token) { console.warn('[frameio] FRAMEIO_API_TOKEN not set'); return '' }
  try {
    const res = await fetch(
      `https://api.frame.io/v4/accounts/${accountId}/files/${fileId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) { console.warn('[frameio] file fetch status:', res.status); return '' }
    const json = await res.json()
    // v4 wraps response in data: {}
    const file = json.data ?? json
    return (file.name as string) ?? ''
  } catch (e) {
    console.error('[frameio] file fetch error:', e)
    return ''
  }
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

  // Only handle file.ready
  const eventType = getAny(payload, ['type', 'event'])
  console.log('[frameio] event type:', eventType)
  if (eventType !== 'file.ready') {
    return NextResponse.json({ skipped: true, reason: `event '${eventType}' not handled` })
  }

  // file.ready payload only contains resource.id — fetch name from Frame.io API
  const accountId = getAny(payload, ['account.id'])
  const fileId    = getAny(payload, ['resource.id'])
  console.log('[frameio] accountId:', accountId, 'fileId:', fileId)

  if (!accountId || !fileId) {
    return NextResponse.json({ skipped: true, reason: 'missing account.id or resource.id' })
  }

  const fileName = await fetchFileName(accountId, fileId)
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
