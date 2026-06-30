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

  const [{ data: recordings }, { data: studioStats }] = await Promise.all([
    serviceClient
      .from('pcm_recordings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
    serviceClient
      .from('pcm_studio_stats')
      .select('*'),
  ])

  return (
    <PCMDashboard
      initialRecordings={recordings ?? []}
      initialStudioStats={studioStats ?? []}
    />
  )
}
