import { NextResponse } from 'next/server'
import { createSign } from 'crypto'

const ROOT_FOLDERS = {
  client_raw: '0AOgf3l3lzd1vUk9PVA',
  post_production: '0AMwW0RURekMfUk9PVA',
}

async function getDriveToken(): Promise<string | null> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!saJson) return null
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url')
  const sigInput = `${header}.${payload}`
  const sign = createSign('RSA-SHA256')
  sign.update(sigInput)
  const jwt = `${sigInput}.${sign.sign(sa.private_key, 'base64url')}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const json = await res.json()
  return json.access_token ?? null
}

export async function GET() {
  const token = await getDriveToken()
  if (!token) return NextResponse.json({ error: 'No service account JSON' })

  const results: Record<string, unknown> = {}

  // List accessible Shared Drives
  try {
    const drivesRes = await fetch(
      'https://www.googleapis.com/drive/v3/drives?pageSize=20&fields=drives(id,name)',
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const drivesJson = await drivesRes.json()
    results['accessible_shared_drives'] = { status: drivesRes.status, drives: drivesJson.drives }
  } catch (e) {
    results['accessible_shared_drives'] = { error: String(e) }
  }

  for (const [label, folderId] of Object.entries(ROOT_FOLDERS)) {
    try {
      // Try with supportsAllDrives=true for Shared Drive compatibility
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,driveId&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const json = await res.json()
      results[label] = { status: res.status, ...json }

      if (res.ok) {
        const listRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name,mimeType)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const listJson = await listRes.json()
        results[`${label}_children`] = { status: listRes.status, sample: listJson.files?.slice(0, 5) }
      }
    } catch (e) {
      results[label] = { error: String(e) }
    }
  }

  return NextResponse.json(results)
}
