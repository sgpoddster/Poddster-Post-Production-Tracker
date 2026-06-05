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
      <div className="max-w-7xl mx-auto px-4 sm:px-6">

        {/* Main row */}
        <div className="h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 sm:gap-3 shrink-0">
            <img src="/logo.png" alt="Poddster" className="h-6 sm:h-7 w-auto" />
            <span className="text-white/20 font-light text-lg hidden sm:block">|</span>
            <img src="/logo-post2.png" alt="Post Production" className="h-5 sm:h-7 w-auto brightness-0 invert hidden sm:block" />
          </Link>

          {/* Nav links — hidden on mobile, shown on sm+ */}
          {userEmail && (
            <div className="hidden sm:flex items-center gap-6">
              <Link href="/dashboard" className="text-sm text-white/50 hover:text-white transition-colors">Dashboard</Link>
              <Link href="/queue"     className="text-sm text-white/50 hover:text-white transition-colors">Queue</Link>
              {isAdmin && (
                <Link href="/admin"   className="text-sm text-white/50 hover:text-white transition-colors">Admin</Link>
              )}
            </div>
          )}

          {/* Right side */}
          {userEmail && (
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <span className="text-xs text-white/30 hidden md:block">{userEmail}</span>
              {isAdmin && (
                <span className="text-xs bg-brand-red/20 text-brand-red px-2 py-0.5 rounded font-medium">
                  Admin
                </span>
              )}
              <SignOutButton />
            </div>
          )}
        </div>

        {/* Mobile nav row — shown only on mobile */}
        {userEmail && (
          <div className="sm:hidden flex items-center gap-5 pb-2.5 border-t border-white/[0.04] pt-2">
            <Link href="/dashboard" className="text-sm text-white/50 hover:text-white transition-colors">Dashboard</Link>
            <Link href="/queue"     className="text-sm text-white/50 hover:text-white transition-colors">Queue</Link>
            {isAdmin && (
              <Link href="/admin"   className="text-sm text-white/50 hover:text-white transition-colors">Admin</Link>
            )}
          </div>
        )}

      </div>
    </nav>
  )
}
