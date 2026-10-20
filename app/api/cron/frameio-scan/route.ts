import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { scanFrameio } from '@/lib/frameio-scan'

export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('authorization')
  if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase  = createServiceClient()
  const scannedAt = new Date().toISOString()

  const { projects, sessions } = await scanFrameio()

  if (projects.length > 0) {
    const { error } = await supabase.from('frameio_scan_projects').upsert(
      projects.map(p => ({ ...p, last_scanned_at: scannedAt })),
      { onConflict: 'project_id' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const projectIds = projects.map(p => p.project_id)
  if (projectIds.length > 0) {
    await supabase.from('frameio_scan_projects').delete()
      .not('project_id', 'in', `(${projectIds.join(',')})`)
  }

  if (sessions.length > 0) {
    const { error } = await supabase.from('frameio_scan_sessions').upsert(
      sessions.map(s => ({ ...s, last_scanned_at: scannedAt })),
      { onConflict: 'folder_id' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const sessionIds = sessions.map(s => s.folder_id)
  if (sessionIds.length > 0) {
    await supabase.from('frameio_scan_sessions').delete()
      .not('folder_id', 'in', `(${sessionIds.join(',')})`)
  }

  return NextResponse.json({ ok: true, scanned_at: scannedAt, projects: projects.length, sessions: sessions.length })
}
