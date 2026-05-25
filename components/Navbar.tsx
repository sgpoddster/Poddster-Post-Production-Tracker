import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from './SignOutButton'

export async function Navbar() {
  let userEmail: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    userEmail = user?.email ?? null
  } catch {
    // Not logged in — Navbar still renders without user info
  }

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-gray-900 text-sm tracking-tight">Poddster Post</span>
          {userEmail && (
            <>
              <Link
                href="/dashboard"
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/queue"
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                My Queue
              </Link>
            </>
          )}
        </div>
        {userEmail && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 hidden sm:block">{userEmail}</span>
            <SignOutButton />
          </div>
        )}
      </div>
    </nav>
  )
}
