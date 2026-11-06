import { createSign } from 'crypto'

// Moving a Drive folder to the bin: Google keeps it for 30 days, then deletes it
// permanently — which matches the "deleted in 30 days" wording in client emails.

// Shared-drive roots of the client folder hierarchy (Root → Client → … → Session).
// A folder sitting directly under one of these is a whole client folder — never trash it.
const DRIVE_ROOTS = ['0AOgf3l3lzd1vUk9PVA', '0AMwW0RURekMfUk9PVA']

export async function getDriveToken(): Promise<string | null> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!saJson) return null

  const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
  const now     = Math.floor(Date.now() / 1000)
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  })).toString('base64url')

  const sigInput  = `${header}.${payload}`
  const sign      = createSign('RSA-SHA256')
  sign.update(sigInput)
  const jwt = `${sigInput}.${sign.sign(sa.private_key, 'base64url')}`

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const json = await res.json()
  return json.access_token ?? null
}

export function extractFolderId(url: string | null): string | null {
  if (!url) return null
  return url.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] ?? null
}

export async function trashFolder(folderId: string, token: string): Promise<boolean> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true`,
    {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ trashed: true }),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    console.error(`[drive-trash] trash failed for ${folderId}: ${res.status} ${text.slice(0, 200)}`)
    return false
  }
  return true
}

// True if the folder is a shared-drive root or a top-level client folder.
export async function isClientLevelFolder(folderId: string, token: string): Promise<boolean> {
  if (DRIVE_ROOTS.includes(folderId)) return true
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?fields=parents&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return true   // can't verify → treat as unsafe
  const { parents = [] } = await res.json() as { parents?: string[] }
  return parents.length === 0 || parents.some(p => DRIVE_ROOTS.includes(p))
}
