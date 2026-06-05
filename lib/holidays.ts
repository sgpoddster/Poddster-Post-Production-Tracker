import { createServiceClient } from '@/lib/supabase/server'

// Set of closed dates ('YYYY-MM-DD') the studio observes as public holidays.
// Used by deadline calculations to skip them like weekends.
export async function getHolidayDates(): Promise<Set<string>> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.from('holidays').select('date')
    return new Set((data ?? []).map(h => h.date as string))
  } catch {
    return new Set()
  }
}
