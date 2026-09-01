/**
 * One-shot seed: inserts the live studio_config row.
 * Run AFTER creating the table via the SQL in supabase/studio_config.sql.
 * Admin-only. Hit GET /api/admin/migrate-studio-config once, then this file can be deleted.
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const LIVE_CONFIG = {
  rooms: [
    { id: 'S1', label: 'Studio 1', sets: ['Exec', 'Nest'] },
    { id: 'S2', label: 'Studio 2', sets: ['Iris', 'Club'] },
    { id: 'S3', label: 'Studio 3', sets: ['Nova'] },
    { id: 'S4', label: 'Studio 4', sets: ['Core', 'Cove'] },
  ],
  exclusions: [{ rooms: ['S3', 'S4'], gapMinutes: 30 }],
  buffers: { beforeMinutes: 30, afterMinutes: 30 },
  operators: {
    names: ['Josiah', 'Syafiq', 'Sufi'],
    leave: [
      { date: '2026-10-16', operator: 'Sufi' },
      { date: '2026-10-21', operator: 'Syafiq' },
      { date: '2026-10-22', operator: 'Syafiq' },
      { date: '2026-10-23', operator: 'Syafiq' },
      { date: '2026-10-26', operator: 'Syafiq' },
      { date: '2026-10-27', operator: 'Syafiq' },
      { date: '2026-10-28', operator: 'Syafiq' },
      { date: '2026-10-29', operator: 'Sufi' },
    ],
  },
  hours: { open: '10:00', close: '18:00', days: [1, 2, 3, 4, 5] },
  slotMinutes: 30,
}

export async function GET() {
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { error } = await supabase
    .from('studio_config')
    .upsert({ name: 'Poddster Live', config: LIVE_CONFIG, is_live: true }, { onConflict: 'name' })

  if (error) {
    return NextResponse.json({
      ok: false,
      error: error.message,
      hint: 'Run supabase/studio_config.sql in the Supabase dashboard SQL editor first, then retry.',
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: 'Live config seeded. You can delete this route.' })
}
