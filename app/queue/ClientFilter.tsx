'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition, useState, useRef, useEffect } from 'react'

export function ClientFilter({ clients, selected }: { clients: string[]; selected: string[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const push = (next: string[]) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.length) params.set('client', next.join(','))
    else params.delete('client')
    startTransition(() => {
      router.push(`${pathname}${params.toString() ? '?' + params.toString() : ''}`)
    })
  }

  const toggle = (client: string) =>
    push(selected.includes(client) ? selected.filter(c => c !== client) : [...selected, client])

  const clearAll = () => { push([]); setOpen(false) }

  const filtered = q.trim()
    ? clients.filter(c => c.toLowerCase().includes(q.trim().toLowerCase()))
    : clients

  const label = selected.length === 0
    ? 'All clients'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} clients`

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
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span className="max-w-[160px] truncate">{label}</span>
        <svg className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-[240px] rounded-lg border border-th/10 bg-[var(--bg-float)] shadow-xl overflow-hidden">
          <div className="p-2 border-b border-th/[0.06]">
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search clients…"
              className="w-full bg-brand-surface2 border border-th/10 rounded px-2.5 py-1.5 text-xs text-th placeholder-th/25 focus:outline-none focus:border-th/25"
            />
          </div>
          {selected.length > 0 && (
            <button
              onClick={clearAll}
              className="w-full text-left px-3 py-2 text-xs text-th/40 hover:text-th/60 hover:bg-th/[0.04] border-b border-th/[0.06] transition-colors"
            >
              Clear selection
            </button>
          )}
          <div className="max-h-64 overflow-y-auto">
            {filtered.map(c => {
              const checked = selected.includes(c)
              return (
                <button
                  key={c}
                  onClick={() => toggle(c)}
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
                  <span className={`truncate ${checked ? 'text-th' : 'text-th/60'}`}>{c}</span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-th/25">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
