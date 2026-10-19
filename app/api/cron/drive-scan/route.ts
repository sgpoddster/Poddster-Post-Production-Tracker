import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  getDriveToken,
  listAllFilesInDrive,
  aggregateByClientFolder,
  DRIVES,
  DriveType,
} from '@/lib/drive-scan'

// Daily cron: scan both Shared Drives and upsert folder stats into drive_scan_folders.
// Auth: Vercel CRON_SECRET header (automatic when called by Vercel cron).
export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('authorization')
  if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const token = await getDriveToken()
  const scannedAt = new Date().toISOString()
  const summary: Record<string, number> = {}

  for (const [driveType, drive] of Object.entries(DRIVES) as [DriveType, typeof DRIVES[DriveType]][]) {
    const files = await listAllFilesInDrive(token, drive.id)
    const stats = aggregateByClientFolder(files, drive.id)

    const rows = stats.map(s => ({
      drive_type:       driveType,
      folder_id:        s.folder_id,
      folder_name:      s.folder_name,
      client_code:      s.client_code,
      size_bytes:       s.size_bytes,
      file_count:       s.file_count,
      created_at_drive: s.created_at_drive,
      last_scanned_at:  scannedAt,
    }))

    if (rows.length > 0) {
      const { error } = await supabase
        .from('drive_scan_folders')
        .upsert(rows, { onConflict: 'drive_type,folder_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Remove stale rows for folders deleted from Drive
    const currentIds = stats.map(s => s.folder_id)
    if (currentIds.length > 0) {
      await supabase
        .from('drive_scan_folders')
        .delete()
        .eq('drive_type', driveType)
        .not('folder_id', 'in', `(${currentIds.map(id => `"${id}"`).join(',')})`)
    }

    summary[driveType] = stats.length
  }

  return NextResponse.json({ ok: true, scanned_at: scannedAt, folders: summary })
}
