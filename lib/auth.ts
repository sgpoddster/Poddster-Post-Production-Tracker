import { createClient } from '@/lib/supabase/server'

export type UserRole = 'admin' | 'producer'

export interface UserProfile {
  id: string
  email: string
  display_name: string | null
  role: UserRole
}

/**
 * Get the current user's profile + role.
 * Returns null if not logged in.
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Auto-create profile if missing (first sign-in before trigger fired)
  if (!profile) {
    const { data: created } = await supabase
      .from('user_profiles')
      .insert({ id: user.id, email: user.email ?? '', display_name: user.user_metadata?.full_name ?? null })
      .select()
      .single()
    return created ?? null
  }

  return profile
}

export async function isAdmin(): Promise<boolean> {
  const profile = await getUserProfile()
  return profile?.role === 'admin'
}
