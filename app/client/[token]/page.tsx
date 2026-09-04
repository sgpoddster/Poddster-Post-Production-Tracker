import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ClientPortalUI from './ClientPortalUI'

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServiceClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, first_name')
    .eq('portal_token', token)
    .single()

  if (!client) notFound()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, job_id, type, highlight_number, status, on_hold, current_version, filming_date, filming_time, versions(*)')
    .eq('client_name', client.name)
    .neq('status', 'cancelled')
    .order('filming_date', { ascending: false })

  return (
    <ClientPortalUI
      firstName={client.first_name ?? null}
      projects={projects ?? []}
    />
  )
}
