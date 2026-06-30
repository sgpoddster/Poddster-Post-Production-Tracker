import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const QUOTA_LIMIT_BYTES = 750_000_000_000 // 750 GB Google Drive daily limit

function authenticate(request: Request) {
  const secret = request.headers.get('x-pcm-secret')
  return secret && secret === process.env.PCM_SECRET
}

// GET /api/pcm/quota?date=YYYY-MM-DD
// Returns today's usage and remaining quota.
export async function GET(request: Request) {
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  if (!date) {
    return NextResponse.json({ error: 'date required' }, { status: 400 })
  }

  const { data } = await supabase
    .from('pcm_upload_quota')
    .select('bytes_uploaded, updated_at')
    .eq('date', date)
    .maybeSingle()

  const bytes_uploaded = data?.bytes_uploaded ?? 0
  return NextResponse.json({
    date,
    bytes_uploaded,
    limit_bytes:     QUOTA_LIMIT_BYTES,
    remaining_bytes: Math.max(0, QUOTA_LIMIT_BYTES - bytes_uploaded),
  })
}

// POST /api/pcm/quota  { date: "YYYY-MM-DD", bytes_add: N }
// Atomically increments the quota counter for the given date.
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

  const { date, bytes_add } = body
  if (!date || typeof bytes_add !== 'number') {
    return NextResponse.json({ error: 'date and bytes_add required' }, { status: 400 })
  }

  // Fetch current value then upsert — single NAS writer so race conditions are negligible
  const { data: existing } = await supabase
    .from('pcm_upload_quota')
    .select('bytes_uploaded')
    .eq('date', date)
    .maybeSingle()

  const current      = existing?.bytes_uploaded ?? 0
  const new_total    = current + (bytes_add as number)
  const { error: dbError } = await supabase
    .from('pcm_upload_quota')
    .upsert({ date, bytes_uploaded: new_total, updated_at: new Date().toISOString() })

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({
    date,
    bytes_uploaded:  new_total,
    limit_bytes:     QUOTA_LIMIT_BYTES,
    remaining_bytes: Math.max(0, QUOTA_LIMIT_BYTES - new_total),
  })
}
