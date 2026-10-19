import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  getDriveToken,
  listAllFilesInDrive,
  aggregateByClientFolder,
  extractShootFolders,
  DRIVES,
  DriveType,
} from '@/lib/drive-scan'

// Daily cron: scan both Shared Drives and upsert folder stats.
// Auth: Vercel CRON_SECRET header (automatic when called by Vercel cron).
export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('authorization')
  if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const token = await getDriveToken()
  const scannedAt = new Date().toISOString()
  const summary: Record<string, { clients: number; shoots: number }> = {}

  for (const [driveType, drive] of Object.entries(DRIVES) as [DriveType, typeof DRIVES[DriveType]][]) {
    const files       = await listAllFilesInDrive(token, drive.id)
    const clientStats = aggregateByClientFolder(files, drive.id)
    const shootStats  = extractShootFolders(files, drive.id)

    const clientRows = clientStats.map(s => ({
      drive_type:       driveType,
      folder_id:        s.folder_id,
      folder_name:      s.folder_name,
      client_code:      s.client_code,
      size_bytes:       s.size_bytes,
      file_count:       s.file_count,
      created_at_drive: s.created_at_drive,
      last_scanned_at:  scannedAt,
    }))
    if (clientRows.length > 0) {
      const { error } = await supabase.from('drive_scan_folders').upsert(clientRows, { onConflict: 'drive_type,folder_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const clientIds = clientStats.map(s => s.folder_id)
    if (clientIds.length > 0) {
      await supabase.from('drive_scan_folders').delete().eq('drive_type', driveType)
        .not('folder_id', 'in', `(${clientIds.map(id => `"${id}"`).join(',')})`)
    }

    const shootRows = shootStats.map(s => ({
      drive_type:       driveType,
      folder_id:        s.folder_id,
      folder_name:      s.folder_name,
      client_folder_id: s.client_folder_id,
      client_name:      s.client_name,
      client_code:      s.client_code,
      year:             s.year,
      size_bytes:       s.size_bytes,
      file_count:       s.file_count,
      created_at_drive: s.created_at_drive,
      last_scanned_at:  scannedAt,
    }))
    if (shootRows.length > 0) {
      const { error } = await supabase.from('drive_scan_shoots').upsert(shootRows, { onConflict: 'drive_type,folder_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const shootIds = shootStats.map(s => s.folder_id)
    if (shootIds.length > 0) {
      await supabase.from('drive_scan_shoots').delete().eq('drive_type', driveType)
        .not('folder_id', 'in', `(${shootIds.map(id => `"${id}"`).join(',')})`)
    }

    summary[driveType] = { clients: clientStats.length, shoots: shootStats.length }
  }

  return NextResponse.json({ ok: true, scanned_at: scannedAt, summary })
}
