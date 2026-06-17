// Frame.io v4 folder creation utility.
// Each client is a separate Frame.io Project in the workspace.
// Finds the matching project by name, then creates a shoot folder in its root.

import { buildFolderName } from './utils'

const ADOBE_CLIENT_ID = '73aff1fed325400292f5abc97ee331b8'
const ADOBE_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3'
const ACCOUNT_ID      = 'c385b04f-c1b3-496b-93fd-70388b468756'
const WORKSPACE_ID    = '35d53c79-6d1e-42a3-aae2-7aabf1260e48'

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
  if (!res.ok) throw new Error(`Frame.io GET ${res.status} at ${url}`)
  return res.json()
}

async function framePost(url: string, token: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Frame.io POST ${res.status} at ${url}: ${text.slice(0, 200)}`)
  }
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
 * Finds the client's Frame.io project by name, then creates (or finds) the
 * shoot folder inside its root. Returns the Frame.io URL for the folder, or
 * null on any failure (caller treats this as non-fatal).
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

    // Step 1: find the client's Frame.io project by name
    console.log(`[frameio-folders] searching for project "${clientName}"…`)
    const project = await findProjectByName(clientName, token)
    if (!project) {
      console.warn(`[frameio-folders] no project named "${clientName}" in workspace`)
      return null
    }
    console.log(`[frameio-folders] found project ${project.id}, root=${project.root_folder_id}`)

    // Step 2: check if shoot folder already exists (idempotent re-triggers)
    console.log(`[frameio-folders] checking for existing folder "${folderName}"…`)
    const existing = await findChildFolderByName(project.root_folder_id, folderName, token)
    if (existing) {
      console.log(`[frameio-folders] folder already exists: "${folderName}"`)
      return `https://next.frame.io/project/${project.id}/view/${existing.id}`
    }

    // Step 3: create the folder via Frame.io v2 API.
    // v4 has no public POST route for folder creation. v2 works fine for writes
    // and uses the same folder/asset IDs, so the resulting ID is valid for v4 URLs.
    // FRAMEIO_REFRESH_TOKEN holds the sk_live_ v2 service token.
    console.log(`[frameio-folders] creating folder "${folderName}" via v2 API…`)
    const v2Token = process.env.FRAMEIO_REFRESH_TOKEN
    if (!v2Token) throw new Error('FRAMEIO_REFRESH_TOKEN not set')
    const v2Res = await fetch(
      `https://api.frame.io/v2/assets/${project.root_folder_id}/children`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${v2Token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'folder', name: folderName }),
      }
    )
    if (!v2Res.ok) {
      const text = await v2Res.text()
      throw new Error(`Frame.io v2 POST ${v2Res.status}: ${text.slice(0, 200)}`)
    }
    const item = await v2Res.json() as Record<string, unknown>
    const url  = `https://next.frame.io/project/${project.id}/view/${item.id as string}`
    console.log(`[frameio-folders] ✓ created "${folderName}" → ${url}`)
    return url
  } catch (e) {
    console.error('[frameio-folders] error:', e)
    return null
  }
}
