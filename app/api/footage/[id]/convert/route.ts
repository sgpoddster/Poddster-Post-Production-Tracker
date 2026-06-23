import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'
import { waitUntil } from '@vercel/functions'

function extractFolderId(url: string): string | null {
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  return m?.[1] ?? null
}

// POST /api/footage/[id]/convert — trigger Cloud Run 1080p conversion (admin only)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const { data: delivery, error: fetchErr } = await supabase
    .from('footage_deliveries')
    .select('*')
    .eq('id', params.id)
    .single()

  if (fetchErr || !delivery) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!delivery.drive_link) {
    return NextResponse.json({ error: 'No Drive link saved yet' }, { status: 400 })
  }

  if (delivery.conversion_status === 'processing') {
    return NextResponse.json({ error: 'Conversion already in progress' }, { status: 409 })
  }

  const sessionFolderId = extractFolderId(delivery.drive_link)
  if (!sessionFolderId) {
    return NextResponse.json({ error: 'Could not extract folder ID from Drive link' }, { status: 400 })
  }

  const cloudRunUrl = process.env.MP4_CONVERTOR_URL
  const cloudRunToken = process.env.MP4_CONVERTOR_TOKEN
  if (!cloudRunUrl || !cloudRunToken) {
    return NextResponse.json({ error: 'MP4_CONVERTOR_URL or MP4_CONVERTOR_TOKEN not configured' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://poddster-post-production-tracker.vercel.app'
  const callbackUrl = `${appUrl}/api/footage/convert-callback`

  // Mark as processing immediately
  await supabase
    .from('footage_deliveries')
    .update({ conversion_status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', params.id)

  // Fire-and-forget: Cloud Run does the heavy work and POSTs the callback when done
  waitUntil(
    fetch(cloudRunUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token:             cloudRunToken,
        session_folder_id: sessionFolderId,
        delivery_id:       params.id,
        callback_url:      callbackUrl,
      }),
    })
      .then(r => console.log(`[convert] Cloud Run responded: ${r.status}`))
      .catch(e => {
        console.error('[convert] Cloud Run request failed:', e)
        // Reset status so user can retry
        return supabase
          .from('footage_deliveries')
          .update({ conversion_status: 'error', updated_at: new Date().toISOString() })
          .eq('id', params.id)
      })
  )

  return NextResponse.json({ success: true, status: 'processing' }, { status: 202 })
}
