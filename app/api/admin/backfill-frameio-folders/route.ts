import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createFrameIoShootFolder } from '@/lib/frameio-folders'
import { getUserProfile } from '@/lib/auth'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  // Admin only
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()

  // Fetch all projects missing a folder link that have enough data to create one
  const { data: projects, error } = await service
    .from('projects')
    .select('id, job_id, client_name, filming_date, filming_time')
    .is('frameio_folder_link', null)
    .not('client_name', 'is', null)
    .not('job_id', 'is', null)
    .in('status', ['pending_trigger', 'active', 'in_revision'])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { job_id: string; client_name: string; result: 'saved' | 'skipped' | 'error'; url?: string }[] = []

  // Deduplicate by job_id — all rows for the same booking share a folder
  const seen = new Set<string>()
  for (const p of projects ?? []) {
    if (seen.has(p.job_id)) continue
    seen.add(p.job_id)

    try {
      const folderUrl = await createFrameIoShootFolder({
        clientName:  p.client_name,
        jobId:       p.job_id,
        filmingDate: p.filming_date,
        filmingTime: p.filming_time,
      })

      if (folderUrl) {
        await service
          .from('projects')
          .update({ frameio_folder_link: folderUrl })
          .eq('job_id', p.job_id)
        results.push({ job_id: p.job_id, client_name: p.client_name, result: 'saved', url: folderUrl })
      } else {
        results.push({ job_id: p.job_id, client_name: p.client_name, result: 'skipped' })
      }
    } catch (e) {
      results.push({ job_id: p.job_id, client_name: p.client_name, result: 'error' })
      console.error(`[backfill-frameio-folders] ${p.job_id}:`, e)
    }
  }

  const saved   = results.filter(r => r.result === 'saved').length
  const skipped = results.filter(r => r.result === 'skipped').length
  const errors  = results.filter(r => r.result === 'error').length

  return NextResponse.json({ ok: true, total: seen.size, saved, skipped, errors, results })
}
