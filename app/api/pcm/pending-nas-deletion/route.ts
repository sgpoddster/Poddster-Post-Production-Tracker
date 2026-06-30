import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const NAS_RETENTION_DAYS = 10

export async function GET(request: Request) {
  const secret = request.headers.get('x-pcm-secret')
  if (!secret || secret !== process.env.PCM_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - NAS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('pcm_recordings')
    .select('studio, recording, nas_path')
    .eq('state', 'archived')
    .not('nas_path', 'is', null)
    .is('nas_deleted_at', null)
    .lt('upload_completed_at', cutoff)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
