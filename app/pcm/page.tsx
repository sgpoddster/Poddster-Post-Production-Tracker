import { createServiceClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserProfile } from '@/lib/auth'
import PCMDashboard from './PCMDashboard'

export default async function PCMPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getUserProfile()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const serviceClient = createServiceClient()

  const [{ data: recordings }, { data: studioStats }, { data: events }] = await Promise.all([
    serviceClient
      .from('pcm_recordings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
    serviceClient
      .from('pcm_studio_stats')
      .select('*'),
    // Upload events for the last 7 days — enough for the rolling-24h sum and the
    // per-day history bars. Google's limit is a sliding window, not a calendar day.
    serviceClient
      .from('pcm_upload_events')
      .select('id, uploaded_at, bytes, studio, recording')
      .gte('uploaded_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('uploaded_at', { ascending: false }),
  ])

  return (
    <PCMDashboard
      initialRecordings={recordings ?? []}
      initialStudioStats={studioStats ?? []}
      initialEvents={events ?? []}
    />
  )
}
