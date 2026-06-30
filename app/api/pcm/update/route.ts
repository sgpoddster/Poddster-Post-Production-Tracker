import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Uses service role so it can write without a user session.
// The NAS authenticates with a shared secret in the PCM_SECRET env var.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  // Verify shared secret
  const secret = request.headers.get('x-pcm-secret')
  if (!secret || secret !== process.env.PCM_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { studio, recording, state, file_count, total_bytes, error, nas_path, drive_url, retry_count } = body

  if (!studio || !recording || !state) {
    return NextResponse.json({ error: 'studio, recording, and state are required' }, { status: 400 })
  }

  // Build the update payload — only include timestamp for the relevant state transition
  const now = new Date().toISOString()
  const timestamps: Record<string, string> = {}
  if (state === 'discovered')    timestamps.discovered_at     = now
  if (state === 'copying')       timestamps.copy_started_at   = now
  if (state === 'copy_complete') timestamps.copy_completed_at = now
  if (state === 'uploading')     timestamps.upload_started_at = now
  if (state === 'archived')      timestamps.upload_completed_at = now

  const payload = {
    studio,
    recording,
    state,
    ...(file_count   !== undefined && { file_count }),
    ...(total_bytes  !== undefined && { total_bytes }),
    ...(error        !== undefined && { error }),
    ...(nas_path     !== undefined && { nas_path }),
    ...(drive_url    !== undefined && { drive_url }),
    ...(retry_count  !== undefined && { retry_count }),
    ...timestamps,
  }

  const { error: dbError } = await supabase
    .from('pcm_recordings')
    .upsert(payload, { onConflict: 'studio,recording' })

  if (dbError) {
    console.error('PCM update error:', dbError)
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
