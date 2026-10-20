import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'
import { getDriveToken, trashDriveFolder } from '@/lib/drive-scan'

// POST /api/admin/drive/trash  { folder_id, admin_password }
export async function POST(req: Request) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { folder_id, admin_password } = await req.json()
  if (!folder_id) return NextResponse.json({ error: 'folder_id required' }, { status: 400 })

  const adminPass = process.env.ADMIN_TRASH_PASSWORD
  if (!adminPass) {
    return NextResponse.json({ error: 'ADMIN_TRASH_PASSWORD not set in environment' }, { status: 403 })
  }
  if (admin_password.trim() !== adminPass.trim()) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 403 })
  }

  const token = await getDriveToken()
  await trashDriveFolder(token, folder_id)

  // Remove from scan table so it disappears from the UI immediately
  const supabase = createServiceClient()
  await supabase.from('drive_scan_folders').delete().eq('folder_id', folder_id)

  return NextResponse.json({ ok: true })
}
