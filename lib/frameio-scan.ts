// Frame.io storage scan — lists all projects with storage totals,
// and the session folders (top-level children) of each project.

import { createServiceClient } from '@/lib/supabase/server'

const ADOBE_CLIENT_ID = '73aff1fed325400292f5abc97ee331b8'
const ADOBE_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3'
const ACCOUNT_ID      = 'c385b04f-c1b3-496b-93fd-70388b468756'
const WORKSPACE_ID    = '35d53c79-6d1e-42a3-aae2-7aabf1260e48'

async function getAccessToken(): Promise<string> {
  const clientSecret = process.env.ADOBE_CLIENT_SECRET
  if (!clientSecret) throw new Error('ADOBE_CLIENT_SECRET not set')

  const supabase = createServiceClient()
  const { data: stored } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'adobe_refresh_token')
    .single()
  const refreshToken = stored?.value ?? process.env.FRAMEIO_REFRESH_TOKEN
  if (!refreshToken) throw new Error('No refresh token available')

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
  if (!json.access_token) throw new Error('Failed to get Adobe access token')

  if (json.refresh_token) {
    await supabase.from('app_config').upsert(
      { key: 'adobe_refresh_token', value: json.refresh_token, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  }

  return json.access_token as string
}

async function frameGet(url: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Frame.io GET ${res.status} at ${url}`)
  return res.json()
}

export interface FrameioProjectStat {
  project_id:         string
  project_name:       string
  storage_bytes:      number
  root_folder_id:     string | null
  updated_at_frameio: string | null
  created_at_frameio: string | null
}

export interface FrameioSessionStat {
  folder_id:          string
  project_id:         string
  folder_name:        string
  created_at_frameio: string | null
}

export async function scanFrameio(): Promise<{
  projects:  FrameioProjectStat[]
  sessions:  FrameioSessionStat[]
}> {
  const token    = await getAccessToken()
  const projects: FrameioProjectStat[] = []
  const sessions: FrameioSessionStat[] = []

  // 1. List all projects (paginated)
  let projUrl: string | null =
    `https://api.frame.io/v4/accounts/${ACCOUNT_ID}/workspaces/${WORKSPACE_ID}/projects?page_size=50`
  while (projUrl) {
    const json  = await frameGet(projUrl, token)
    const items = (json.data as Record<string, unknown>[]) ?? []
    for (const p of items) {
      projects.push({
        project_id:         p.id as string,
        project_name:       (p.name as string) ?? '',
        storage_bytes:      (p.storage as number) ?? 0,
        root_folder_id:     (p.root_folder_id ?? p.root_asset_id) as string | null,
        updated_at_frameio: (p.updated_at as string) ?? null,
        created_at_frameio: (p.created_at as string) ?? null,
      })
    }
    const links = json.links as Record<string, unknown> | undefined
    const next  = links?.next as string | undefined
    projUrl = next ? (next.startsWith('http') ? next : `https://api.frame.io${next}`) : null
  }

  // 2. For each project, list top-level session folders
  for (const proj of projects) {
    if (!proj.root_folder_id) continue
    let childUrl: string | null =
      `https://api.frame.io/v4/accounts/${ACCOUNT_ID}/folders/${proj.root_folder_id}/children?page_size=100`
    while (childUrl) {
      let json: Record<string, unknown>
      try {
        json = await frameGet(childUrl, token)
      } catch {
        break
      }
      const items = (json.data as Record<string, unknown>[]) ?? []
      for (const item of items) {
        if (item.type !== 'folder') continue
        sessions.push({
          folder_id:          item.id as string,
          project_id:         proj.project_id,
          folder_name:        (item.name as string) ?? '',
          created_at_frameio: (item.inserted_at ?? item.created_at) as string | null,
        })
      }
      const links   = json.links as Record<string, unknown> | undefined
      const next    = links?.next as string | undefined
      childUrl = next ? (next.startsWith('http') ? next : `https://api.frame.io${next}`) : null
    }
  }

  return { projects, sessions }
}
