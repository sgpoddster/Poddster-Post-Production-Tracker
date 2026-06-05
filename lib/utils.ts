// Format a YYYY-MM-DD date string to "7th May 2026" (no weekday)
export function formatShortOrdinalDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDate()
  const ord = [11,12,13].includes(day) ? 'th'
    : day % 10 === 1 ? 'st'
    : day % 10 === 2 ? 'nd'
    : day % 10 === 3 ? 'rd' : 'th'
  const month = d.toLocaleDateString('en-GB', { month: 'long' })
  return `${day}${ord} ${month} ${d.getFullYear()}`
}

// Parse a filming_time string like "10:00 - 11:00" → "10am" or "2:30pm"
export function formatFilmingTimeShort(filmingTime: string | null): string {
  if (!filmingTime) return ''
  // Take just the start time (before ' - ' or end of string)
  const start = filmingTime.split(/\s*[-–]\s*/)[0].trim()
  const [hStr, mStr] = start.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr ?? '0', 10)
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}${String(m).padStart(2, '0')}${suffix}`
}

// Build the Frame.io-ready output filename for a project
// Format: "{internal_id} {time} {date} - V{version}"
// e.g. "E82F2E 2pm 7th May 2026 - V1"
export function buildOutputFilename(
  internalId: string,
  filmingDate: string | null,
  filmingTime: string | null,
  versionNumber: number
): string {
  const datePart  = formatShortOrdinalDate(filmingDate)
  const timePart  = formatFilmingTimeShort(filmingTime)
  const dateTime  = [timePart, datePart].filter(Boolean).join(' ')
  return `${internalId}${dateTime ? ' ' + dateTime : ''} - V${versionNumber}`
}

// Format a YYYY-MM-DD date string to "Tuesday 7th May 2026"
export function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDate()
  const ord = [11,12,13].includes(day) ? 'th'
    : day % 10 === 1 ? 'st'
    : day % 10 === 2 ? 'nd'
    : day % 10 === 3 ? 'rd' : 'th'
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const month   = d.toLocaleDateString('en-GB', { month: 'long' })
  return `${weekday} ${day}${ord} ${month} ${d.getFullYear()}`
}

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
// Add N working days, skipping weekends and any supplied public-holiday dates
// (a Set of 'YYYY-MM-DD' strings).
export function addWorkDays(date: Date, days: number, holidays?: Set<string>): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    const iso = result.toISOString().split('T')[0]
    if (dow !== 0 && dow !== 6 && !holidays?.has(iso)) added++
  }
  return result
}

// Version label from number
export function versionLabel(n: number): string {
  return n === 1 ? 'First Cut' : `V${n}`
}

// Format the assignee for display: "Producer", or "Producer (Editor)" when
// a different editor is assigned. nameMap maps email → display name.
export function formatAssignee(
  producerEmail: string | null,
  editorEmail: string | null,
  nameMap: Record<string, string>,
): string {
  const producer = producerEmail ? (nameMap[producerEmail] ?? producerEmail) : '—'
  if (!editorEmail || editorEmail === producerEmail) return producer
  const editor = nameMap[editorEmail] ?? editorEmail
  return `${producer} (${editor})`
}

// Working days from submitted date per version
// V1 = 5 days, V2+ = 3 days
export function workDaysForVersion(versionNumber: number): number {
  return versionNumber === 1 ? 5 : 3
}
