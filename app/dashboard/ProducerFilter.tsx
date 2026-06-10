'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition, useState, useRef, useEffect } from 'react'

interface Editor {
  email: string
  display_name: string | null
}

export function ProducerFilter({ editors, selected }: { editors: Editor[]; selected: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const toggle = (email: string) => {
    const next = selected.includes(email)
      ? selected.filter(e => e !== email)
      : [...selected, email]
    const params = new URLSearchParams(searchParams.toString())
    if (next.length) {
      params.set('editors', next.join(','))
    } else {
      params.delete('editors')
    }
    startTransition(() => {
      router.push(`${pathname}${params.toString() ? '?' + params.toString() : ''}`)
    })
  }

  const clearAll = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('editors')
    startTransition(() => {
      router.push(`${pathname}${params.toString() ? '?' + params.toString() : ''}`)
    })
    setOpen(false)
  }

  const label = selected.length === 0
    ? 'All producers'
    : selected.length === 1
      ? (editors.find(e => e.email === selected[0])?.display_name || selected[0].split('@')[0])
      : `${selected.length} producers`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          selected.length > 0
            ? 'bg-th/10 border-th/20 text-th'
            : 'bg-th/[0.04] border-th/10 text-th/50 hover:text-th/70 hover:border-th/15'
        } ${isPending ? 'opacity-50' : ''}`}
      >
        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {label}
        <svg className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[200px] rounded-lg border border-th/10 bg-[var(--bg-float)] shadow-xl overflow-hidden">
          {selected.length > 0 && (
            <button
              onClick={clearAll}
              className="w-full text-left px-3 py-2 text-xs text-th/40 hover:text-th/60 hover:bg-th/[0.04] border-b border-th/[0.06] transition-colors"
            >
              Clear selection
            </button>
          )}
          {editors.map(e => {
            const name = e.display_name || e.email.split('@')[0]
            const checked = selected.includes(e.email)
            return (
              <button
                key={e.email}
                onClick={() => toggle(e.email)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-th/[0.06] transition-colors text-left"
              >
                <span className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                  checked ? 'bg-th/90 border-th/90' : 'border-th/20'
                }`}>
                  {checked && (
                    <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className={checked ? 'text-th' : 'text-th/60'}>{name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
