// Format a YYYY-MM-DD date string to "28 Apr 2026"
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Format a YYYY-MM-DD date string to "Mon 28 Apr"
export function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Add N working days to a date (skips weekends — no public holidays for now)
export function addWorkDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return result
}

// Version label from number
export function versionLabel(n: number): string {
  return n === 1 ? 'First Cut' : `V${n}`
}

// Working days from submitted date per version
// V1 = 5 days, V2+ = 3 days
export function workDaysForVersion(versionNumber: number): number {
  return versionNumber === 1 ? 5 : 3
}
