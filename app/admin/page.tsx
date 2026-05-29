import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserProfile } from '@/lib/auth'
import RoleToggle from './RoleToggle'
import ClientManager from './ClientManager'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getUserProfile()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: users }, { data: clients }] = await Promise.all([
    supabase.from('user_profiles').select('*').order('email'),
    supabase.from('clients').select('*').order('name'),
  ])

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-12">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Admin</h1>
        <p className="text-sm text-white/40 mt-1">Manage team and clients</p>
      </div>

      {/* Users */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">Team</h2>
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

      {/* Clients */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">Clients</h2>
        <ClientManager initialClients={clients ?? []} />
      </section>
    </main>
  )
}
