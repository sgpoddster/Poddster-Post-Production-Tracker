import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CONFIG_KEY = 'drive_total'

function authenticate(request: Request) {
  const secret = request.headers.get('x-pcm-secret')
  return secret && secret === process.env.PCM_SECRET
}

// GET /api/pcm/drive-stats — returns cached drive total from last rclone size run
export async function GET(request: Request) {
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('pcm_config')
    .select('value, updated_at')
    .eq('key', CONFIG_KEY)
    .single()

  if (error || !data) {
    return NextResponse.json({ total_bytes: null, total_objects: null, updated_at: null })
  }

  return NextResponse.json({
    total_bytes:   data.value.total_bytes   ?? null,
    total_objects: data.value.total_objects ?? null,
    updated_at:    data.updated_at,
  })
}

// POST /api/pcm/drive-stats  { total_bytes: N, total_objects: N }
// Called by discover.py (once per day) after running rclone size.
export async function POST(request: Request) {
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { total_bytes, total_objects } = body
  if (typeof total_bytes !== 'number' || typeof total_objects !== 'number') {
    return NextResponse.json({ error: 'total_bytes and total_objects (numbers) required' }, { status: 400 })
  }

  const { error: dbError } = await supabase
    .from('pcm_config')
    .upsert(
      { key: CONFIG_KEY, value: { total_bytes, total_objects }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, total_bytes, total_objects })
}
