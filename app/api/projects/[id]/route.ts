import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'
import { addWorkDays, versionLabel, workDaysForVersion } from '@/lib/utils'
import { getHolidayDates } from '@/lib/holidays'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  // Whitelist of simple editable fields
  const allowed = [
    'client_name', 'client_code',
    'filming_date', 'filming_time', 'setup', 'seats', 'shoot_duration',
    'drive_link', 'services', 'addons',
    'assigned_editor', 'editor',
    'notes',
  ] as const

  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key] === '' ? null : body[key]
  }

  // Code always lives in the client name parentheses → derive it
  if (typeof updates.client_name === 'string') {
    const m = updates.client_name.match(/\(([^)]+)\)/)
    updates.client_code = m ? m[1].trim() : null
  }

  // ── Version change ──────────────────────────────────────────────────────────
  if ('current_version' in body) {
    const newV = Math.max(1, Math.min(10, Number(body.current_version) || 1))

    const { data: existing } = await supabase
      .from('projects')
      .select('current_version, status')
      .eq('id', params.id)
      .single()

    if (!existing) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    if (newV !== existing.current_version) {
      updates.current_version = newV

      // For projects actively being worked, reshape the version rows + status + deadline.
      // (pending_trigger projects just change their starting version; rows are created on trigger.)
      if (existing.status === 'active' || existing.status === 'in_revision') {
        // V1 = First Cut (active, 5 working days); V2+ = Revision (in_revision, 3 working days)
        updates.status = newV === 1 ? 'active' : 'in_revision'
        const holidays = await getHolidayDates()
        const dueStr = addWorkDays(new Date(), workDaysForVersion(newV), holidays)
          .toISOString().split('T')[0]

        const { data: rows } = await supabase
          .from('versions')
          .select('version_number')
          .eq('project_id', params.id)
        const have = new Set((rows ?? []).map(r => r.version_number))

        // Empty placeholders for any earlier versions that don't exist yet
        const toInsert: Record<string, unknown>[] = []
        for (let n = 1; n < newV; n++) {
          if (!have.has(n)) toInsert.push({ project_id: params.id, version_number: n, label: versionLabel(n) })
        }
        // The new current version — create or refresh its due date
        if (have.has(newV)) {
          await supabase.from('versions')
            .update({ due_date: dueStr, done_date: null, label: versionLabel(newV) })
            .eq('project_id', params.id).eq('version_number', newV)
        } else {
          toInsert.push({ project_id: params.id, version_number: newV, label: versionLabel(newV), due_date: dueStr })
        }
        if (toInsert.length) await supabase.from('versions').insert(toInsert)

        // Drop any versions above the new current (clean downgrade)
        await supabase.from('versions').delete().eq('project_id', params.id).gt('version_number', newV)
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
