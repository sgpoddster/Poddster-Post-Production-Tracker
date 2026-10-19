import { createSign } from 'crypto'

export const DRIVES = {
  client_raw:      { id: '0AMwW0RURekMfUk9PVA', name: 'Poddster Client raw files' },
  post_production: { id: '0AOgf3l3lzd1vUk9PVA', name: 'Poddster PP files' },
} as const
export type DriveType = keyof typeof DRIVES

export async function getDriveToken(): Promise<string> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud:  'https://oauth2.googleapis.com/token',
    iat:  now,
    exp:  now + 3600,
  })).toString('base64url')
  const sigInput = `${header}.${payload}`
  const sign = createSign('RSA-SHA256')
  sign.update(sigInput)
  const jwt = `${sigInput}.${sign.sign(sa.private_key, 'base64url')}`
  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error(`Token error: ${JSON.stringify(json)}`)
  return json.access_token as string
}

type DriveFile = {
  id: string
  name: string
  mimeType: string
  size?: string
  createdTime?: string
  parents?: string[]
}

export async function listAllFilesInDrive(token: string, driveId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      corpora:                 'drive',
      driveId,
      includeItemsFromAllDrives: 'true',
      supportsAllDrives:       'true',
      pageSize:                '1000',
      fields:                  'nextPageToken,files(id,name,mimeType,size,createdTime,parents)',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) throw new Error(`Drive list error: ${res.status} ${await res.text()}`)
    const json = await res.json()
    files.push(...(json.files ?? []))
    pageToken = json.nextPageToken
  } while (pageToken)

  return files
}

export type ClientFolderStat = {
  folder_id:        string
  folder_name:      string
  client_code:      string | null
  size_bytes:       number
  file_count:       number
  created_at_drive: string | null
}

export function aggregateByClientFolder(
  files: DriveFile[],
  driveRootId: string
): ClientFolderStat[] {
  // Build parent→children index
  const childrenOf = new Map<string, string[]>()
  const fileById   = new Map<string, DriveFile>()

  for (const f of files) {
    fileById.set(f.id, f)
    for (const p of f.parents ?? []) {
      if (!childrenOf.has(p)) childrenOf.set(p, [])
      childrenOf.get(p)!.push(f.id)
    }
  }

  // Client folders = direct children of drive root
  const clientFolderIds = (childrenOf.get(driveRootId) ?? []).filter(id => {
    const f = fileById.get(id)
    return f?.mimeType === 'application/vnd.google-apps.folder'
  })

  const stats: ClientFolderStat[] = []

  for (const cfId of clientFolderIds) {
    const cf = fileById.get(cfId)
    if (!cf) continue

    // Recursively sum all file sizes under this client folder
    let sizeBytes = 0
    let fileCount = 0
    const queue = [cfId]
    while (queue.length) {
      const current = queue.pop()!
      for (const childId of childrenOf.get(current) ?? []) {
        const child = fileById.get(childId)
        if (!child) continue
        if (child.mimeType === 'application/vnd.google-apps.folder') {
          queue.push(childId)
        } else {
          sizeBytes += parseInt(child.size ?? '0', 10)
          fileCount++
        }
      }
    }

    // Parse client code from folder name: "Name (CODE)"
    const codeMatch = cf.name.match(/\(([^)]+)\)\s*$/)
    const clientCode = codeMatch ? codeMatch[1] : null

    stats.push({
      folder_id:        cfId,
      folder_name:      cf.name,
      client_code:      clientCode,
      size_bytes:       sizeBytes,
      file_count:       fileCount,
      created_at_drive: cf.createdTime ?? null,
    })
  }

  return stats
}

export type ShootFolderStat = {
  folder_id:        string
  folder_name:      string
  client_folder_id: string
  client_name:      string
  client_code:      string | null
  year:             string | null
  size_bytes:       number
  file_count:       number
  created_at_drive: string | null
}

// Extracts shoot folders (Root → Client → Year → Shoot) from the same file list.
// Reuses the same childrenOf/fileById maps already built in aggregateByClientFolder,
// so this should be called with the same files array.
export function extractShootFolders(
  files: DriveFile[],
  driveRootId: string
): ShootFolderStat[] {
  const childrenOf = new Map<string, string[]>()
  const fileById   = new Map<string, DriveFile>()

  for (const f of files) {
    fileById.set(f.id, f)
    for (const p of f.parents ?? []) {
      if (!childrenOf.has(p)) childrenOf.set(p, [])
      childrenOf.get(p)!.push(f.id)
    }
  }

  const shoots: ShootFolderStat[] = []

  const isFolder = (id: string) =>
    fileById.get(id)?.mimeType === 'application/vnd.google-apps.folder'

  // Walk: root → client → year → shoot
  for (const clientId of childrenOf.get(driveRootId) ?? []) {
    if (!isFolder(clientId)) continue
    const clientFile = fileById.get(clientId)!
    const codeMatch  = clientFile.name.match(/\(([^)]+)\)\s*$/)
    const clientCode = codeMatch ? codeMatch[1] : null

    for (const yearId of childrenOf.get(clientId) ?? []) {
      if (!isFolder(yearId)) continue
      const yearFile = fileById.get(yearId)!
      const year     = yearFile.name.match(/^\d{4}$/) ? yearFile.name : null

      for (const shootId of childrenOf.get(yearId) ?? []) {
        if (!isFolder(shootId)) continue
        const shootFile = fileById.get(shootId)!

        // Sum direct + recursive file sizes under this shoot folder
        let sizeBytes = 0
        let fileCount = 0
        const queue = [shootId]
        while (queue.length) {
          const cur = queue.pop()!
          for (const childId of childrenOf.get(cur) ?? []) {
            const child = fileById.get(childId)
            if (!child) continue
            if (child.mimeType === 'application/vnd.google-apps.folder') {
              queue.push(childId)
            } else {
              sizeBytes += parseInt(child.size ?? '0', 10)
              fileCount++
            }
          }
        }

        shoots.push({
          folder_id:        shootId,
          folder_name:      shootFile.name,
          client_folder_id: clientId,
          client_name:      clientFile.name,
          client_code:      clientCode,
          year,
          size_bytes:       sizeBytes,
          file_count:       fileCount,
          created_at_drive: shootFile.createdTime ?? null,
        })
      }
    }
  }

  return shoots
}

export async function trashDriveFolder(token: string, folderId: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}/trash?supportsAllDrives=true`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Trash failed: ${res.status} ${await res.text()}`)
}
