import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'

const ADOBE_CLIENT_ID = '73aff1fed325400292f5abc97ee331b8'
const ADOBE_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3'
const ACCOUNT_ID = 'c385b04f-c1b3-496b-93fd-70388b468756'

async function getAccessToken(): Promise<string> {
  const res = await fetch(ADOBE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     ADOBE_CLIENT_ID,
      client_secret: process.env.ADOBE_CLIENT_SECRET!,
      refresh_token: process.env.FRAMEIO_REFRESH_TOKEN!,
    }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error('Failed to get Adobe access token')
  return json.access_token as string
}

async function frameGet(url: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const text = await res.text()
  if (!res.ok) throw new Error(`Frame.io ${res.status} at ${url}: ${text.slice(0, 200)}`)
  if (!text) return {}
  return JSON.parse(text)
}

// Parse filename like "A3F2BH1 230pm 7th May 2026 - V2.mp4"
function parseFilename(name: string): { internalId: string; version: number } | null {
  const token = name.trim().split(/\s+/)[0]
  if (!/^[A-F][A-F0-9]{4}(E\d*|H\d+)$/i.test(token)) return null
  const vMatch = name.match(/[-\s]V(\d+)/i)
  return { internalId: token.toUpperCase(), version: vMatch ? parseInt(vMatch[1]) : 1 }
}

function getLink(file: Record<string, unknown>): string {
  const paths = ['_links.player.href', 'links.player.href', 'player_url', 'review_url', 'review_link']
  for (const p of paths) {
    const v = p.split('.').reduce((o: unknown, k) => o && typeof o === 'object' ? (o as Record<string,unknown>)[k] : undefined, file)
    if (v && typeof v === 'string') return v
  }
  return ''
}

// Scan a folder up to maxDepth levels, returning all files found
async function scanFolder(
  folderId: string, token: string, depth: number, maxDepth: number,
  files: Array<{ id: string; name: string; file: Record<string, unknown> }>
): Promise<void> {
  if (depth > maxDepth) return
  let url: string | null = `https://api.frame.io/v4/accounts/${ACCOUNT_ID}/folders/${folderId}/children`
  while (url) {
    let json: Record<string, unknown>
    try { json = await frameGet(url, token) } catch { break }
    const items = (json.data as Record<string, unknown>[]) ?? []
    for (const item of items) {
      const type = item.type as string
      if (type === 'file') {
        files.push({ id: item.id as string, name: (item.name as string) ?? '', file: item })
      } else if (type === 'folder' && depth < maxDepth) {
        await scanFolder(item.id as string, token, depth + 1, maxDepth, files)
      }
    }
    const links = json.links as Record<string, unknown> | undefined
    const next = links?.next as string | undefined
    url = next ? (next.startsWith('http') ? next : `https://api.frame.io${next}`) : null
  }
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {

  const svc = createServiceClient()

  // Get all versions that are delivered but have no Frame.io link
  const { data: versions, error: vErr } = await svc
    .from('versions')
    .select('id, version_number, project_id, projects(internal_id)')
    .not('done_date', 'is', null)
    .is('frameio_link', null)

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })
  if (!versions || versions.length === 0) {
    return NextResponse.json({ updated: 0, message: 'Nothing to backfill' })
  }

  // Build lookup: "INTERNALID_V2" → versionId
  const lookup = new Map<string, string>()
  for (const v of versions) {
    const projRaw = v.projects
    const proj = (Array.isArray(projRaw) ? projRaw[0] : projRaw) as { internal_id: string } | null
    if (proj?.internal_id) {
      lookup.set(`${proj.internal_id}_V${v.version_number}`, v.id)
    }
  }

  // Scan Frame.io
  const token = await getAccessToken()

  // List all projects
  const projectsJson = await frameGet(
    `https://api.frame.io/v4/accounts/${ACCOUNT_ID}/projects?page_size=100`,
    token
  )
  const projects = (projectsJson.data as Record<string, unknown>[]) ?? []

  const allFiles: Array<{ id: string; name: string; file: Record<string, unknown> }> = []
  for (const proj of projects) {
    const rootFolderId = proj.root_folder_id as string | undefined
    if (!rootFolderId) continue
    await scanFolder(rootFolderId, token, 0, 3, allFiles)
  }

  // Match files to version rows and update
  let updated = 0
  const results: Array<{ internalId: string; version: number; link: string }> = []

  for (const { name, id: fileId, file } of allFiles) {
    const parsed = parseFilename(name)
    if (!parsed) continue
    const key = `${parsed.internalId}_V${parsed.version}`
    const versionId = lookup.get(key)
    if (!versionId) continue

    // Try to get link from file object; if not present, fetch full file record
    let link = getLink(file)
    if (!link) {
      try {
        const full = await frameGet(
          `https://api.frame.io/v4/accounts/${ACCOUNT_ID}/files/${fileId}`,
          token
        )
        link = getLink((full.data ?? full) as Record<string, unknown>)
      } catch { /* skip */ }
    }
    if (!link) continue

    await svc.from('versions').update({ frameio_link: link }).eq('id', versionId)
    results.push({ internalId: parsed.internalId, version: parsed.version, link })
    lookup.delete(key) // prevent double-update
    updated++
  }

    return NextResponse.json({ updated, results })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
