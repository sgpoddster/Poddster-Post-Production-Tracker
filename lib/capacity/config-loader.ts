import { createClient } from '@supabase/supabase-js'
import { PODDSTER_CONFIG, type StudioConfig } from './capacity-engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Returns the live StudioConfig from the database.
 * Falls back to the hardcoded PODDSTER_CONFIG if no live row exists yet.
 */
export async function getLiveConfig(): Promise<StudioConfig> {
  const { data } = await supabase
    .from('studio_config')
    .select('config')
    .eq('is_live', true)
    .single()

  if (data?.config) return data.config as StudioConfig
  return PODDSTER_CONFIG
}
