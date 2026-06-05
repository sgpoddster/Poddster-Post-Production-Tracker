import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { addWorkDays, versionLabel, workDaysForVersion } from '@/lib/utils'
import { getHolidayDates } from '@/lib/holidays'

// Frame.io v4 webhook.
// Authentication: Adobe IMS OAuth — exchange refresh token for access token, then call v4 API.
//
// Events handled:
//   file.ready             → a delivered cut finished transcoding → move project to Client Review
//   metadata.value.updated → the built-in "Status" field changed → if Approved, mark Complete
//   (file.updated is also accepted as a fallback signal for status changes)

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
// Format: "{internal_id} {time} {date} - V{n}"  e.g. "F8C0AH1 230pm 7th May 2026 - V2"
function extractInternalId(name: string): string | null {
  const token = name.trim().split(/\s+/)[0]
  if (/^[A-F][A-F0-9]{4}(E\d*|H\d+)$/i.test(token)) return token.toUpperCase()
  return null
}

interface MetaField {
  field_definition_name?: string
  value?: unknown
}

// Read the built-in "Status" select field's display name (Needs Review / In Progress / Approved).
function extractStatus(file: Record<string, unknown> | null): string | null {
  const metadata = file?.metadata
  if (!Array.isArray(metadata)) return null
  const statusField = (metadata as MetaField[]).find(m => m.field_definition_name === 'Status')
  if (!statusField) return null
  const value = statusField.value
  if (Array.isArray(value) && value.length > 0) {
    const opt = value[0] as { display_name?: string }
    return opt.display_name ?? null
  }
  return null
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  let payloadRaw: Record<string, unknown>
  try {
    payloadRaw = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Frame.io v4 wraps the event in { data: { ... } }
  const payload = (payloadRaw.data && typeof payloadRaw.data === 'object')
    ? payloadRaw.data as Record<string, unknown>
    : payloadRaw

  const eventType = getAny(payload, ['type', 'event'])
  const accountId = getAny(payload, ['account.id'])
  const fileId    = getAny(payload, ['resource.id'])
  console.log('[frameio] event:', eventType, 'file:', fileId)

  if (!accountId || !fileId) {
    return NextResponse.json({ skipped: true, reason: 'missing account.id or resource.id' })
  }

  const STATUS_EVENTS = ['metadata.value.updated', 'file.updated']
  if (eventType !== 'file.ready' && !STATUS_EVENTS.includes(eventType)) {
    return NextResponse.json({ skipped: true, reason: `event '${eventType}' not handled` })
  }

  const file = await fetchFile(accountId, fileId)
  const fileName = (file?.name as string) ?? ''
  if (!fileName) {
    return NextResponse.json({ skipped: true, reason: 'could not fetch file from Frame.io API' })
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

  const today = new Date().toISOString().split('T')[0]

  // ── file.ready: delivered cut → Client Review ─────────────────────────────
  if (eventType === 'file.ready') {
    if (!['active', 'in_revision'].includes(project.status)) {
      console.log(`[frameio] "${internalId}" is "${project.status}" — no file.ready action`)
      return NextResponse.json({ skipped: true, reason: `status is '${project.status}'` })
    }

    const { data: version } = await supabase
      .from('versions')
      .select('id')
      .eq('project_id', project.id)
      .eq('version_number', project.current_version)
      .single()

    if (version) {
      await supabase.from('versions').update({ done_date: today }).eq('id', version.id)
    }
    await supabase.from('projects').update({
      status: 'in_client_review',
      previous_status: project.status,
      review_chase_stage: 0,
    }).eq('id', project.id)

    console.log(`[frameio] ✓ "${internalId}" → in_client_review (V${project.current_version})`)
    return NextResponse.json({ success: true, action: 'in_client_review', internalId })
  }

  // ── status change ─────────────────────────────────────────────────────────
  const status = extractStatus(file)
  console.log(`[frameio] "${internalId}" status field = ${status ?? '(none)'}`)

  // Approved → Complete (from any active state; skip if already closed)
  if (status === 'Approved') {
    if (['complete', 'cancelled'].includes(project.status)) {
      return NextResponse.json({ skipped: true, reason: `already '${project.status}'` })
    }
    await supabase.from('projects').update({
      status: 'complete',
      previous_status: project.status,
    }).eq('id', project.id)
    console.log(`[frameio] ✓ "${internalId}" Approved → complete`)
    return NextResponse.json({ success: true, action: 'complete', internalId })
  }

  // Needs Review → client wants changes → start the next revision.
  // Guard: only when currently in Client Review, so repeated events don't double-bump.
  if (status === 'Needs Review') {
    if (project.status !== 'in_client_review') {
      return NextResponse.json({ skipped: true, reason: `not in client review (is '${project.status}')` })
    }
    const nextVersion = project.current_version + 1
    const holidays = await getHolidayDates()
    const dueDate = addWorkDays(new Date(), workDaysForVersion(nextVersion), holidays)
    const dueDateStr = dueDate.toISOString().split('T')[0]

    await supabase.from('versions').insert({
      project_id:     project.id,
      version_number: nextVersion,
      label:          versionLabel(nextVersion),
      due_date:       dueDateStr,
    })
    await supabase.from('projects').update({
      status: 'in_revision',
      current_version: nextVersion,
      previous_status: project.status,
    }).eq('id', project.id)

    console.log(`[frameio] ✓ "${internalId}" Needs Review → in_revision (V${nextVersion})`)
    return NextResponse.json({ success: true, action: 'start_revision', internalId, newVersion: nextVersion })
  }

  return NextResponse.json({ skipped: true, reason: `status '${status}' not actionable` })
}
