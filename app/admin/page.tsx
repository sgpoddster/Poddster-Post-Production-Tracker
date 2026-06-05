import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserProfile } from '@/lib/auth'
import RoleToggle from './RoleToggle'
import ClientManager from './ClientManager'
import HolidayManager from './HolidayManager'

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: { tab?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getUserProfile()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const tab = ['clients', 'holidays'].includes(searchParams?.tab ?? '')
    ? (searchParams!.tab as 'clients' | 'holidays')
    : 'team'

  const svc = createServiceClient()
  const [{ data: users }, { data: clients }, { data: holidays }] = await Promise.all([
    supabase.from('user_profiles').select('*').order('display_name'),
    supabase.from('clients').select('*, portal_token').order('name'),
    svc.from('holidays').select('*').order('date'),
  ])

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Admin</h1>
        <p className="text-sm text-white/40 mt-1">Manage team and clients</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06]">
        <TabLink href="/admin" active={tab === 'team'}>
          Team
          <span className="ml-1.5 text-white/25 text-xs">{(users ?? []).length}</span>
        </TabLink>
        <TabLink href="/admin?tab=clients" active={tab === 'clients'}>
          Clients
          <span className="ml-1.5 text-white/25 text-xs">{(clients ?? []).length}</span>
        </TabLink>
        <TabLink href="/admin?tab=holidays" active={tab === 'holidays'}>
          Closed Days
          <span className="ml-1.5 text-white/25 text-xs">{(holidays ?? []).length}</span>
        </TabLink>
      </div>

      {/* Team tab */}
      {tab === 'team' && (
        <section className="space-y-4">
          <div className="rounded-lg border border-white/[0.06] bg-brand-surface overflow-hidden divide-y divide-white/[0.06]">
            {(users ?? []).map(u => (
              <div key={u.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-white">{u.display_name || u.email}</p>
                  {u.display_name && <p className="text-xs text-white/35 mt-0.5">{u.email}</p>}
                </div>
                <RoleToggle userId={u.id} currentRole={u.role} isSelf={u.id === user.id} />
              </div>
            ))}
            {(users ?? []).length === 0 && (
              <p className="px-5 py-4 text-sm text-white/25">No users found.</p>
            )}
          </div>
        </section>
      )}

      {/* Clients tab */}
      {tab === 'clients' && (
        <section className="space-y-4">
          <ClientManager initialClients={clients ?? []} />
        </section>
      )}

      {/* Closed days (public holidays) tab */}
      {tab === 'holidays' && (
        <section className="space-y-4">
          <HolidayManager initial={holidays ?? []} />
        </section>
      )}

    </main>
  )
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-brand-red text-white'
          : 'border-transparent text-white/40 hover:text-white/70'
      }`}
    >
      {children}
    </a>
  )
}
