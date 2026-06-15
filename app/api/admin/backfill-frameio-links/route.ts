import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'

const ADOBE_CLIENT_ID = '73aff1fed325400292f5abc97ee331b8'
const ADOBE_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3'
const ACCOUNT_ID   = 'c385b04f-c1b3-496b-93fd-70388b468756'
const WORKSPACE_ID = '35d53c79-6d1e-42a3-aae2-7aabf1260e48'

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
// version is null when not found in the name — caller falls back to any matching version
function parseFilename(name: string): { internalId: string; version: number | null } | null {
  const token = name.trim().split(/\s+/)[0]
  if (!/^[A-F][A-F0-9]{4}(E\d*|H\d+)$/i.test(token)) return null
  const vMatch = name.match(/[-\s]V(\d+)/i)
  return { internalId: token.toUpperCase(), version: vMatch ? parseInt(vMatch[1]) : null }
}

// Scan a folder up to maxDepth levels.
// Carries projectId so we can construct the Frame.io player URL directly.
async function scanFolder(
  folderId: string, token: string, depth: number, maxDepth: number, projectId: string,
  files: Array<{ id: string; name: string; playerUrl: string }>
): Promise<void> {
  if (depth > maxDepth) return
  let url: string | null = `https://api.frame.io/v4/accounts/${ACCOUNT_ID}/folders/${folderId}/children`
  while (url) {
    let json: Record<string, unknown>
    try { json = await frameGet(url, token) } catch { break }
    const items = (json.data as Record<string, unknown>[]) ?? []
    for (const item of items) {
      const type = item.type as string
      const name = (item.name as string) ?? ''
      if (type === 'file') {
        const fileId = item.id as string
        files.push({ id: fileId, name, playerUrl: `https://app.frame.io/projects/${projectId}/files/${fileId}` })
      } else if (type === 'version_stack') {
        // Use stack name for internal_id matching; head_version.id for the URL
        const headVersion = item.head_version as Record<string, unknown> | undefined
        const headId = (headVersion?.id as string) ?? (item.id as string)
        files.push({ id: headId, name, playerUrl: `https://app.frame.io/projects/${projectId}/files/${headId}` })
      } else if (type === 'folder' && depth < maxDepth) {
        await scanFolder(item.id as string, token, depth + 1, maxDepth, projectId, files)
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

  // Build two lookups:
  // 1. exact: "INTERNALID_V6" → versionId  (when version is in the filename)
  // 2. byId:  "INTERNALID"    → versionId  (fallback when filename has no version suffix)
  const lookupExact = new Map<string, string>()
  const lookupById  = new Map<string, string>()
  for (const v of versions) {
    const projRaw = v.projects
    const proj = (Array.isArray(projRaw) ? projRaw[0] : projRaw) as { internal_id: string } | null
    if (proj?.internal_id) {
      const cleanId = proj.internal_id.trim()
      lookupExact.set(`${cleanId}_V${v.version_number}`, v.id)
      // Keep only the highest version per internal_id as the fallback
      if (!lookupById.has(cleanId)) lookupById.set(cleanId, v.id)
    }
  }

  // Scan Frame.io
  const token = await getAccessToken()

  // List all projects in the workspace
  const projectsJson = await frameGet(
    `https://api.frame.io/v4/accounts/${ACCOUNT_ID}/workspaces/${WORKSPACE_ID}/projects?page_size=100`,
    token
  )
  const projects = (projectsJson.data as Record<string, unknown>[]) ?? []

  const allFiles: Array<{ id: string; name: string; playerUrl: string }> = []
  const projectDebug: Array<{ name: string; id: string; rootFolderId: string | null }> = []

  for (const proj of projects) {
    const rootFolderId = (proj.root_folder_id ?? proj.root_asset_id) as string | undefined
    projectDebug.push({ name: proj.name as string, id: proj.id as string, rootFolderId: rootFolderId ?? null })
    if (!rootFolderId) continue
    await scanFolder(rootFolderId, token, 0, 3, proj.id as string, allFiles)
  }

  // All filenames that matched the internal_id regex (for debugging)
  const parsedFiles = allFiles
    .map(f => ({ name: f.name, parsed: parseFilename(f.name) }))
    .filter(f => f.parsed !== null)
  const sampleFiles = allFiles.slice(0, 20).map(f => f.name)
  const lookupKeys = Array.from(lookupExact.keys())

  // Match files to version rows and update
  let updated = 0
  const results: Array<{ internalId: string; version: number | null; link: string }> = []

  for (const { name, playerUrl } of allFiles) {
    const parsed = parseFilename(name)
    if (!parsed) continue
    // Try exact version match first, then fall back to any unlinked version for that internal_id
    const versionId = parsed.version != null
      ? (lookupExact.get(`${parsed.internalId}_V${parsed.version}`) ?? lookupById.get(parsed.internalId))
      : lookupById.get(parsed.internalId)
    if (!versionId) continue

    await svc.from('versions').update({ frameio_link: playerUrl }).eq('id', versionId)
    results.push({ internalId: parsed.internalId, version: parsed.version, link: playerUrl })
    // Remove from both maps to prevent double-update
    if (parsed.version != null) lookupExact.delete(`${parsed.internalId}_V${parsed.version}`)
    lookupById.delete(parsed.internalId)
    updated++
  }

    return NextResponse.json({ updated, results, debug: { projects: projectDebug, totalFiles: allFiles.length, sampleFiles, parsedFiles, lookupKeys } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
