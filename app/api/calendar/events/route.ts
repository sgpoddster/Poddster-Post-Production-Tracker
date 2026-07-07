import { NextRequest, NextResponse } from 'next/server'
import { createSign } from 'crypto'
import { createClient } from '@/lib/supabase/server'

const CALENDAR_IDS = [
  'singapore@poddster.com',
  'c_099180ae8058ae26042744b7d7b498279e6395bc1e597962b430313eb194aaaf@group.calendar.google.com',
  'c_86fc0b239e875e6f748bf85a4df556be4cdd1721e5c3567b27354d60d25c9c40@group.calendar.google.com',
]

async function getServiceAccountToken(): Promise<{ token: string; email: string } | { error: string; email?: string }> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!saJson) return { error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' }

  const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
  const now     = Math.floor(Date.now() / 1000)
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  })).toString('base64url')

  const sigInput = `${header}.${payload}`
  const sign     = createSign('RSA-SHA256')
  sign.update(sigInput)
  const jwt = `${sigInput}.${sign.sign(sa.private_key, 'base64url')}`

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const json = await res.json()
  if (!json.access_token) return { error: 'Failed to get service account token', email: sa.client_email }
  return { token: json.access_token, email: sa.client_email }
}

export async function GET(req: NextRequest) {
  // Must be a signed-in user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params  = new URL(req.url).searchParams
  const timeMin = params.get('timeMin')
  const timeMax = params.get('timeMax')
  if (!timeMin || !timeMax) return NextResponse.json({ error: 'timeMin and timeMax required' }, { status: 400 })

  const tokenResult = await getServiceAccountToken()
  if ('error' in tokenResult) {
    return NextResponse.json({
      error:       tokenResult.error,
      setupNeeded: true,
      ...(tokenResult.email ? { serviceAccountEmail: tokenResult.email } : {}),
    }, { status: 503 })
  }
  const { token, email: serviceAccountEmail } = tokenResult

  const baseParams = {
    singleEvents: 'true',
    orderBy:      'startTime',
    timeMin,
    timeMax,
    maxResults:   '2500',
  }

  const results: object[] = []
  const errors: string[]  = []

  for (const calId of CALENDAR_IDS) {
    try {
      let pageToken: string | undefined
      let guard = 0
      do {
        const qp = new URLSearchParams(baseParams)
        if (pageToken) qp.set('pageToken', pageToken)

        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${qp}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )

        if (res.status === 403 || res.status === 404) {
          errors.push(`Calendar ${calId}: ${res.status} — share it with ${serviceAccountEmail}`)
          break
        }
        if (!res.ok) { errors.push(`Calendar ${calId}: ${res.status}`); break }

        const json = await res.json()
        results.push(...(json.items ?? []))
        pageToken = json.nextPageToken
      } while (pageToken && ++guard < 10)
    } catch (e) {
      errors.push(`Calendar ${calId}: ${String(e)}`)
    }
  }

  return NextResponse.json({ events: results, errors, serviceAccountEmail })
}
