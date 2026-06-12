import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServiceClient()

  // Deterministic by calendar day so everyone sees the same fact each day.
  // Cycles through all 1002 facts (id 1–1002) using day-of-year offset.
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000)
  const factId = (dayOfYear % 1002) + 1

  const { data, error } = await supabase
    .from('fun_facts')
    .select('id, fact')
    .eq('id', factId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'No fact found' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, fact: data.fact })
}
