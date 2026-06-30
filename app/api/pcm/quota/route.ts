import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const QUOTA_LIMIT_BYTES = 750_000_000_000 // 750 GB Google Drive rolling-24h limit
const WINDOW_MS = 24 * 60 * 60 * 1000

function authenticate(request: Request) {
  const secret = request.headers.get('x-pcm-secret')
  return secret && secret === process.env.PCM_SECRET
}

// GET /api/pcm/quota
// Sums bytes uploaded in the trailing 24h (Google's limit is a rolling window,
// not a calendar day). Also returns when the oldest in-window upload ages out.
export async function GET(request: Request) {
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = new Date(Date.now() - WINDOW_MS).toISOString()
  const { data, error } = await supabase
    .from('pcm_upload_events')
    .select('uploaded_at, bytes')
    .gte('uploaded_at', since)
    .order('uploaded_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = data ?? []
  const bytes_uploaded = rows.reduce((sum, r) => sum + Number(r.bytes), 0)
  // The oldest upload still inside the window frees its bytes 24h after it landed.
  const oldest = rows[0]?.uploaded_at
  const frees_at = oldest
    ? new Date(new Date(oldest).getTime() + WINDOW_MS).toISOString()
    : null

  return NextResponse.json({
    bytes_uploaded,
    limit_bytes:     QUOTA_LIMIT_BYTES,
    remaining_bytes: Math.max(0, QUOTA_LIMIT_BYTES - bytes_uploaded),
    window_hours:    24,
    frees_at,
  })
}

// POST /api/pcm/quota  { bytes_add: N, studio?, recording? }
// Records one upload event. bytes_add is the ACTUAL bytes sent to Drive.
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

  const { bytes_add, studio, recording } = body
  if (typeof bytes_add !== 'number' || bytes_add <= 0) {
    return NextResponse.json({ error: 'bytes_add (positive number) required' }, { status: 400 })
  }

  const { error: dbError } = await supabase
    .from('pcm_upload_events')
    .insert({
      bytes:     bytes_add,
      studio:    typeof studio === 'string' ? studio : null,
      recording: typeof recording === 'string' ? recording : null,
    })

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // Return the updated rolling-24h total.
  const since = new Date(Date.now() - WINDOW_MS).toISOString()
  const { data } = await supabase
    .from('pcm_upload_events')
    .select('bytes')
    .gte('uploaded_at', since)

  const bytes_uploaded = (data ?? []).reduce((sum, r) => sum + Number(r.bytes), 0)
  return NextResponse.json({
    bytes_uploaded,
    limit_bytes:     QUOTA_LIMIT_BYTES,
    remaining_bytes: Math.max(0, QUOTA_LIMIT_BYTES - bytes_uploaded),
  })
}
