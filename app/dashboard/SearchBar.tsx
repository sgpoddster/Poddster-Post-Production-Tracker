'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useCallback, useTransition } from 'react'

export function SearchBar({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim()
    startTransition(() => {
      router.push(value ? `${pathname}?q=${encodeURIComponent(value)}` : pathname)
    })
  }, [router, pathname])

  return (
    <div className="relative">
      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
      </svg>
      <input
        type="search"
        placeholder="Search…"
        defaultValue={defaultValue}
        onChange={handleChange}
        className={`bg-white/[0.05] border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/25 w-36 sm:w-48 transition-opacity ${isPending ? 'opacity-50' : ''}`}
      />
    </div>
  )
}
