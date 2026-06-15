import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { versionId, frameioLink } = await req.json()
  if (!versionId) {
    return NextResponse.json({ error: 'versionId required' }, { status: 400 })
  }

  // Verify the version belongs to this project
  const { data: ver } = await supabase
    .from('versions')
    .select('id')
    .eq('id', versionId)
    .eq('project_id', params.id)
    .single()

  if (!ver) return NextResponse.json({ error: 'Version not found' }, { status: 404 })

  const { error } = await supabase
    .from('versions')
    .update({ frameio_link: frameioLink ?? null })
    .eq('id', versionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
