import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Lightweight progress-only update — does not change state or set timestamps.
// Called every ~10s during active copying/uploading to push live stats.
export async function POST(request: Request) {
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

  const { studio, recording, bytes_transferred, transfer_speed, eta_seconds } = body

  if (!studio || !recording) {
    return NextResponse.json({ error: 'studio and recording are required' }, { status: 400 })
  }

  const { error: dbError } = await supabase
    .from('pcm_recordings')
    .update({
      ...(bytes_transferred !== undefined && { bytes_transferred }),
      ...(transfer_speed    !== undefined && { transfer_speed }),
      ...(eta_seconds       !== undefined && { eta_seconds }),
    })
    .eq('studio', studio)
    .eq('recording', recording)

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
