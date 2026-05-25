import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addWorkDays, versionLabel, workDaysForVersion } from '@/lib/utils'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params

  // Move project to active
  const { data: project, error: updateError } = await supabase
    .from('projects')
    .update({ status: 'active', current_version: 1 })
    .eq('id', id)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Create V1 (First Cut) version row with a due date 5 working days from today
  const today = new Date()
  const dueDate = addWorkDays(today, workDaysForVersion(1))
  const dueDateStr = dueDate.toISOString().split('T')[0]

  const { error: versionError } = await supabase
    .from('versions')
    .insert({
      project_id:     id,
      version_number: 1,
      label:          versionLabel(1),
      due_date:       dueDateStr,
    })

  if (versionError) {
    console.error('Version insert error:', versionError)
    // Non-fatal — project is already active
  }

  return NextResponse.json({ success: true, project })
}
