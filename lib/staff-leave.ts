import { createSign } from 'crypto'

export interface LeaveEntry {
  name: string
  title: string
  startDate: string
  endDate: string
}

export interface StaffLeaveData {
  today: LeaveEntry[]
  upcoming: LeaveEntry[]
}

const SGPRODUCTION_CALENDAR_ID = 'c_afed12b95d84dca4b4b5d24d982c93e13f70a86002206af3cf943f053200e1ac@group.calendar.google.com'

async function getServiceAccountToken(): Promise<string | null> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!saJson) return null
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url')
  const sigInput = `${header}.${payload}`
  const sign = createSign('RSA-SHA256')
  sign.update(sigInput)
  const jwt = `${sigInput}.${sign.sign(sa.private_key, 'base64url')}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const json = await res.json()
  return json.access_token ?? null
}

function addWorkingDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return result
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

type CalendarEvent = {
  summary?: string
  start?: { date?: string }
  end?: { date?: string }
  attendees?: Array<{ email?: string; displayName?: string; self?: boolean; organizer?: boolean }>
}

export async function fetchStaffLeave(
  editorsByEmail: Record<string, string> = {}
): Promise<StaffLeaveData> {
  const token = await getServiceAccountToken()
  if (!token) return { today: [], upcoming: [] }

  const now = new Date()
  const todayStr = toDateStr(now)
  const endDate = addWorkingDays(now, 5)
  endDate.setDate(endDate.getDate() + 3)
  const endStr = toDateStr(endDate)

  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: new Date(todayStr + 'T00:00:00Z').toISOString(),
    timeMax: new Date(endStr + 'T23:59:59Z').toISOString(),
    maxResults: '100',
  })

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(SGPRODUCTION_CALENDAR_ID)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 900 } },
  )

  if (!res.ok) return { today: [], upcoming: [] }

  const json = await res.json()
  const items: CalendarEvent[] = json.items ?? []

  const workingDays: Set<string> = new Set()
  const cursor = new Date(now)
  cursor.setDate(cursor.getDate() + 1)
  while (workingDays.size < 5) {
    const dow = cursor.getDay()
    if (dow !== 0 && dow !== 6) workingDays.add(toDateStr(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  function resolveName(item: CalendarEvent): string | null {
    // Prefer attendee email matched against known editors
    const attendees = (item.attendees ?? []).filter(a => !a.organizer && !a.self)
    for (const a of attendees) {
      if (a.email && editorsByEmail[a.email.toLowerCase()]) {
        return editorsByEmail[a.email.toLowerCase()]
      }
    }
    // Fall back to attendee displayName
    const first = attendees[0]
    if (first?.displayName) return first.displayName
    if (first?.email) return first.email
    // Last resort: parse title after colon
    if (item.summary) {
      const colonIdx = item.summary.indexOf(':')
      if (colonIdx !== -1) return item.summary.slice(colonIdx + 1).trim()
      return item.summary.trim()
    }
    return null
  }

  const todayEntries: LeaveEntry[] = []
  const upcomingEntries: LeaveEntry[] = []
  const seenUpcoming = new Set<string>()

  for (const item of items) {
    if (!item.start?.date) continue
    const name = resolveName(item)
    if (!name) continue

    const startStr = item.start.date
    const endDateRaw = item.end?.date ?? startStr
    const endExclusive = new Date(endDateRaw)
    endExclusive.setDate(endExclusive.getDate() - 1)
    const endStr = toDateStr(endExclusive)

    const entry: LeaveEntry = { name, title: item.summary ?? '', startDate: startStr, endDate: endStr }

    if (startStr <= todayStr && todayStr <= endStr) {
      todayEntries.push(entry)
    } else if ([...workingDays].some(d => startStr <= d && d <= endStr)) {
      const key = `${name}::${startStr}`
      if (!seenUpcoming.has(key)) {
        seenUpcoming.add(key)
        upcomingEntries.push(entry)
      }
    }
  }

  return { today: todayEntries, upcoming: upcomingEntries }
}
