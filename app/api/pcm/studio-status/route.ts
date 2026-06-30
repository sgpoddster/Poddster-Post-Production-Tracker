import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

  const { studio, used_bytes, free_bytes, total_bytes, ssd_root } = body

  if (!studio) {
    return NextResponse.json({ error: 'studio is required' }, { status: 400 })
  }

  const { error: dbError } = await supabase
    .from('pcm_studio_stats')
    .upsert(
      { studio, used_bytes, free_bytes, total_bytes, ssd_root, updated_at: new Date().toISOString() },
      { onConflict: 'studio' }
    )

  if (dbError) {
    console.error('PCM studio-status error:', dbError)
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
