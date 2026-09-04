import { createClient } from '@supabase/supabase-js'
import { PODDSTER_CONFIG, type StudioConfig } from './capacity-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function getLiveConfig(): Promise<StudioConfig> {
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: configRow }, leaveResult] = await Promise.all([
    supabase.from('studio_config').select('config').eq('is_live', true).single(),
    supabase.from('operator_leave').select('date, operator').gte('date', today),
  ])
  const leaveRows = leaveResult.error ? [] : (leaveResult.data ?? [])

  const base: StudioConfig = configRow?.config
    ? (configRow.config as StudioConfig)
    : PODDSTER_CONFIG

  const fromDB = leaveRows.map(r => ({
    date:     r.date     as string,
    operator: r.operator as string,
  }))

  // Merge DB leave on top of config leave, deduplicating by date|operator
  const existing = new Set(base.operators.leave.map(l => `${l.date}|${l.operator}`))
  const merged = [
    ...base.operators.leave,
    ...fromDB.filter(l => !existing.has(`${l.date}|${l.operator}`)),
  ]

  return { ...base, operators: { ...base.operators, leave: merged } }
}
