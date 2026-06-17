// Frame.io v4 folder creation utility.
// Finds the client's top-level folder by name, then creates a shoot folder inside it.
// Auth reuses the same Adobe IMS refresh-token flow as the webhook and backfill.

import { buildFolderName } from './utils'

const ADOBE_CLIENT_ID = '73aff1fed325400292f5abc97ee331b8'
const ADOBE_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3'
const ACCOUNT_ID      = 'c385b04f-c1b3-496b-93fd-70388b468756'

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
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Frame.io POST ${res.status} at ${url}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// Scan all children of a folder (paginated), return the first whose name matches.
async function findChildByName(
  folderId: string,
  name: string,
  token: string
): Promise<{ id: string; project_id: string } | null> {
  let url: string | null = `https://api.frame.io/v4/accounts/${ACCOUNT_ID}/folders/${folderId}/children?page_size=100`
  while (url) {
    const json = await frameGet(url, token)
    const items = (json.data as Record<string, unknown>[]) ?? []
    for (const item of items) {
      if ((item.name as string) === name && item.type === 'folder') {
        return { id: item.id as string, project_id: item.project_id as string }
      }
    }
    const links = json.links as Record<string, unknown> | undefined
    const next = links?.next as string | undefined
    url = next ? (next.startsWith('http') ? next : `https://api.frame.io${next}`) : null
  }
  return null
}

// Create a folder inside parentFolderId, return its id + project_id.
async function createChildFolder(
  parentFolderId: string,
  name: string,
  token: string
): Promise<{ id: string; project_id: string }> {
  const json = await framePost(
    `https://api.frame.io/v4/accounts/${ACCOUNT_ID}/folders/${parentFolderId}/children`,
    token,
    { name, type: 'folder' }
  )
  const item = (json.data ?? json) as Record<string, unknown>
  return { id: item.id as string, project_id: item.project_id as string }
}

/**
 * Finds the client folder by name in the root folder, then creates (or finds)
 * the shoot folder inside it. Returns the Frame.io player URL for the folder,
 * or null if anything fails (caller treats this as non-fatal).
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
  const rootFolderId = process.env.FRAMEIO_ROOT_FOLDER_ID
  if (!rootFolderId) {
    console.warn('[frameio-folders] FRAMEIO_ROOT_FOLDER_ID not set — skipping')
    return null
  }
  if (!clientName) return null

  const folderName = buildFolderName(jobId, filmingDate, filmingTime)

  try {
    const token = await getAccessToken()

    // Step 1: find the client's top-level folder
    const clientFolder = await findChildByName(rootFolderId, clientName, token)
    if (!clientFolder) {
      console.warn(`[frameio-folders] client folder "${clientName}" not found under root`)
      return null
    }

    // Step 2: check if the shoot folder already exists (idempotent)
    const existing = await findChildByName(clientFolder.id, folderName, token)
    if (existing) {
      console.log(`[frameio-folders] folder already exists: "${folderName}"`)
      return `https://next.frame.io/project/${existing.project_id}/view/${existing.id}`
    }

    // Step 3: create it
    const created = await createChildFolder(clientFolder.id, folderName, token)
    const url = `https://next.frame.io/project/${created.project_id}/view/${created.id}`
    console.log(`[frameio-folders] created "${folderName}" → ${url}`)
    return url
  } catch (e) {
    console.error('[frameio-folders] error:', e)
    return null
  }
}
