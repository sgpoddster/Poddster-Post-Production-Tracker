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

  // Initial data load — client component handles live updates from here
  const serviceClient = createServiceClient()
  const { data: recordings } = await serviceClient
    .from('pcm_recordings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  return <PCMDashboard initialRecordings={recordings ?? []} />
}
