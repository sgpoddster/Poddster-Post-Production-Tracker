import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'
import { fetchStaffLeave, getServiceAccountTokenDebug } from '@/lib/staff-leave'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const profile = await getUserProfile()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const token = await getServiceAccountTokenDebug()
  if (!token) return NextResponse.json({ error: 'no token' })

  const calListRes = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50',
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const calList = await calListRes.json()

  const result = await fetchStaffLeave()
  return NextResponse.json({ calendars: calList.items?.map((c: {id:string;summary:string}) => ({ id: c.id, name: c.summary })), leave: result })
}
