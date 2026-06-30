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

  const sgtDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [{ data: recordings }, { data: studioStats }, { data: quotaRows }] = await Promise.all([
    serviceClient
      .from('pcm_recordings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
    serviceClient
      .from('pcm_studio_stats')
      .select('*'),
    serviceClient
      .from('pcm_upload_quota')
      .select('*')
      .gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .order('date', { ascending: false }),
  ])

  return (
    <PCMDashboard
      initialRecordings={recordings ?? []}
      initialStudioStats={studioStats ?? []}
      initialQuotaRows={quotaRows ?? []}
      todayDate={sgtDate}
    />
  )
}
