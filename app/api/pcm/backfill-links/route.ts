import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Returns archived recordings with no drive_url so the NAS backfill script
// can look up the Drive folder via rclone and POST the URL back via /api/pcm/update.
export async function GET(request: Request) {
  const secret = request.headers.get('x-pcm-secret')
  if (!secret || secret !== process.env.PCM_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('pcm_recordings')
    .select('studio, recording, drive_folder')
    .eq('state', 'archived')
    .is('drive_url', null)
    .order('upload_completed_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ recordings: data ?? [] })
}
