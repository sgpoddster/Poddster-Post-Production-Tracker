// Frame.io v4 folder creation utility.
// Each client is a separate Frame.io Project in the workspace.
// Finds (or creates) the client project, then creates the shoot folder inside it.

import { buildFolderName } from './utils'
import { createServiceClient } from '@/lib/supabase/server'

const ADOBE_CLIENT_ID = '73aff1fed325400292f5abc97ee331b8'
const ADOBE_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3'
const ACCOUNT_ID      = 'c385b04f-c1b3-496b-93fd-70388b468756'
const WORKSPACE_ID    = '35d53c79-6d1e-42a3-aae2-7aabf1260e48'

async function getAccessToken(): Promise<string> {
  const clientSecret = process.env.ADOBE_CLIENT_SECRET
  if (!clientSecret) throw new Error('ADOBE_CLIENT_SECRET not set')

  // Adobe IMS issues a new refresh token on every exchange (rotating tokens).
  // Read the current token from app_config so we always use the latest one,
  // then write the new one back after a successful exchange.
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

// Find the Frame.io project whose name matches clientName (paginated).
async function findProjectByName(
  name: string,
  token: string
): Promise<{ id: string; root_folder_id: string } | null> {
  let url: string | null =
    `https://api.frame.io/v4/accounts/${ACCOUNT_ID}/workspaces/${WORKSPACE_ID}/projects?page_size=50`
  while (url) {
    const json = await frameGet(url, token)
    const items = (json.data as Record<string, unknown>[]) ?? []
    for (const item of items) {
      if ((item.name as string) === name) {
        return {
          id:             item.id as string,
          root_folder_id: (item.root_folder_id ?? item.root_asset_id) as string,
        }
      }
    }
    const links = json.links as Record<string, unknown> | undefined
    const next  = links?.next as string | undefined
    url = next ? (next.startsWith('http') ? next : `https://api.frame.io${next}`) : null
  }
  return null
}

// Create a new Frame.io project in the workspace for a new client.
async function createProject(
  name: string,
  token: string
): Promise<{ id: string; root_folder_id: string }> {
  const res = await fetch(
    `https://api.frame.io/v4/accounts/${ACCOUNT_ID}/workspaces/${WORKSPACE_ID}/projects`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ data: { name } }),
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Frame.io project POST ${res.status}: ${text.slice(0, 300)}`)
  }
  const json = await res.json() as Record<string, unknown>
  const item = (json.data ?? json) as Record<string, unknown>
  return {
    id:             item.id as string,
    root_folder_id: (item.root_folder_id ?? item.root_asset_id) as string,
  }
}

// Check whether a folder with the given name already exists inside parentFolderId.
async function findChildFolderByName(
  parentFolderId: string,
  name: string,
  token: string
): Promise<{ id: string } | null> {
  let url: string | null =
    `https://api.frame.io/v4/accounts/${ACCOUNT_ID}/folders/${parentFolderId}/children?page_size=100`
  while (url) {
    const json = await frameGet(url, token)
    const items = (json.data as Record<string, unknown>[]) ?? []
    for (const item of items) {
      if ((item.name as string) === name && item.type === 'folder') {
        return { id: item.id as string }
      }
    }
    const links = json.links as Record<string, unknown> | undefined
    const next  = links?.next as string | undefined
    url = next ? (next.startsWith('http') ? next : `https://api.frame.io${next}`) : null
  }
  return null
}

/**
 * Deletes a Frame.io shoot folder by its URL.
 * Parses the folder ID from the next.frame.io URL and calls DELETE.
 * Returns true on success, false on any failure (non-fatal).
 */
export async function deleteFrameIoFolder(folderUrl: string): Promise<boolean> {
  // URL formats:
  //   https://next.frame.io/project/{projectId}/view/{folderId}  (API-constructed)
  //   https://next.frame.io/project/{projectId}/{folderId}        (browser URL)
  // In both cases the folder ID is the last UUID segment.
  const match = folderUrl.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i)
  if (!match) {
    console.warn('[frameio-folders] deleteFrameIoFolder: could not parse folder ID from URL', folderUrl)
    return false
  }
  const folderId = match[1]
  console.log(`[frameio-folders] deleting folder ${folderId}…`)
  try {
    const token = await getAccessToken()
    const res = await fetch(
      `https://api.frame.io/v4/accounts/${ACCOUNT_ID}/folders/${folderId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) {
      const text = await res.text()
      console.error(`[frameio-folders] DELETE ${res.status}: ${text.slice(0, 200)}`)
      return false
    }
    console.log(`[frameio-folders] ✓ deleted folder ${folderId}`)
    return true
  } catch (e) {
    console.error('[frameio-folders] delete error:', e)
    return false
  }
}

/**
 * Finds an existing shoot folder in Frame.io without creating anything.
 * Returns the folder URL if found, null if the project or folder doesn't exist.
 */
export async function findFrameIoShootFolder({
  clientName,
  jobId,
  filmingDate,
  filmingTime,
}: {
  clientName:  string | null
  jobId:       string
  filmingDate: string | null
  filmingTime: string | null
}): Promise<string | null> {
  if (!clientName) return null
  const folderName = buildFolderName(jobId, filmingDate, filmingTime)
  try {
    const token = await getAccessToken()
    const project = await findProjectByName(clientName, token)
    if (!project) return null
    const folder = await findChildFolderByName(project.root_folder_id, folderName, token)
    if (!folder) return null
    return `https://next.frame.io/project/${project.id}/view/${folder.id}`
  } catch (e) {
    console.error('[frameio-folders] findFrameIoShootFolder error:', e)
    return null
  }
}

/**
 * Finds (or creates) the client's Frame.io project, then creates (or finds)
 * the shoot folder inside its root. Returns the Frame.io URL for the shoot
 * folder, or null on any failure (caller treats this as non-fatal).
 */
export async function createFrameIoShootFolder({
  clientName,
  jobId,
  filmingDate,
  filmingTime,
}: {
  clientName:  string | null
  jobId:       string
  filmingDate: string | null
  filmingTime: string | null
}): Promise<string | null> {
  if (!clientName) return null

  const folderName = buildFolderName(jobId, filmingDate, filmingTime)

  console.log(`[frameio-folders] starting — client="${clientName}" folder="${folderName}"`)
  try {
    console.log('[frameio-folders] getting access token…')
    const token = await getAccessToken()
    console.log('[frameio-folders] token ok')

    // Step 1: find the client's Frame.io project, creating it if it doesn't exist
    console.log(`[frameio-folders] searching for project "${clientName}"…`)
    let project = await findProjectByName(clientName, token)
    if (!project) {
      console.log(`[frameio-folders] no project found — creating "${clientName}"…`)
      project = await createProject(clientName, token)
      console.log(`[frameio-folders] ✓ created project ${project.id}, root=${project.root_folder_id}`)
    } else {
      console.log(`[frameio-folders] found project ${project.id}, root=${project.root_folder_id}`)
    }

    // Step 2: check if shoot folder already exists (idempotent re-triggers)
    console.log(`[frameio-folders] checking for existing folder "${folderName}"…`)
    const existing = await findChildFolderByName(project.root_folder_id, folderName, token)
    if (existing) {
      console.log(`[frameio-folders] folder already exists: "${folderName}"`)
      return `https://next.frame.io/project/${project.id}/view/${existing.id}`
    }

    // Step 3: create the shoot folder inside the project root.
    // v4 endpoint: POST /v4/accounts/{id}/folders/{parentId}/folders
    // Payload wraps name inside { data: { name } }.
    console.log(`[frameio-folders] creating folder "${folderName}"…`)
    const createRes = await fetch(
      `https://api.frame.io/v4/accounts/${ACCOUNT_ID}/folders/${project.root_folder_id}/folders`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ data: { name: folderName } }),
      }
    )
    if (!createRes.ok) {
      const text = await createRes.text()
      throw new Error(`Frame.io folder POST ${createRes.status}: ${text.slice(0, 300)}`)
    }
    const created = await createRes.json() as Record<string, unknown>
    const item    = (created.data ?? created) as Record<string, unknown>
    const url     = `https://next.frame.io/project/${project.id}/view/${item.id as string}`
    console.log(`[frameio-folders] ✓ created "${folderName}" → ${url}`)
    return url
  } catch (e) {
    console.error('[frameio-folders] error:', e)
    return null
  }
}
