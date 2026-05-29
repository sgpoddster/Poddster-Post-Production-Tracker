import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/auth'
import SignOutButton from './SignOutButton'

export async function Navbar() {
  let userEmail: string | null = null
  let isAdmin = false

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    userEmail = user?.email ?? null
    if (userEmail) {
      const profile = await getUserProfile()
      isAdmin = profile?.role === 'admin'
    }
  } catch {
    // Not logged in
  }

  return (
    <nav className="bg-brand-surface border-b border-brand-surface2 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <img src="/logo.png" alt="Poddster" className="h-7 w-auto" />
            <span className="text-white/20 font-light text-lg">|</span>
            <img src="/logo-post2.png" alt="Post Production" className="h-7 w-auto brightness-0 invert" />
          </Link>
          {userEmail && (
            <>
              <Link href="/dashboard"
                className="text-sm text-white/50 hover:text-white transition-colors">
                Dashboard
              </Link>
              <Link href="/queue"
                className="text-sm text-white/50 hover:text-white transition-colors">
                Queue
              </Link>
              {isAdmin && (
                <Link href="/admin"
                  className="text-sm text-white/50 hover:text-white transition-colors">
                  Admin
                </Link>
              )}
            </>
          )}
        </div>
        {userEmail && (
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/30 hidden sm:block">{userEmail}</span>
            {isAdmin && (
              <span className="text-xs bg-brand-red/20 text-brand-red px-2 py-0.5 rounded font-medium">
                Admin
              </span>
            )}
            <SignOutButton />
          </div>
        )}
      </div>
    </nav>
  )
}
